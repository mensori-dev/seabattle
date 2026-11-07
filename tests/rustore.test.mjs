import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js', 'rustore.js'), 'utf8');

function load(extra) {
  const timers = [];
  const sandbox = {
    console: console,
    setTimeout(fn, ms) {
      timers.push({ fn: fn, ms: ms });
      return timers.length;
    },
    clearTimeout() {}
  };
  sandbox.window = sandbox;
  Object.assign(sandbox, extra || {});
  vm.runInNewContext(source, sandbox, { filename: 'js/rustore.js' });
  return { platform: sandbox.RuStorePlatform, init: sandbox.onRuStoreReady, sandbox, timers };
}

function fakeBridge(overrides) {
  const calls = [];
  const bridge = {
    showRewarded: function () {
      calls.push('rewarded');
      return Promise.resolve(true);
    },
    showInterstitial: function () {
      calls.push('interstitial');
      return Promise.resolve(true);
    },
    purchase: function (id) {
      calls.push('purchase:' + id);
      return Promise.resolve(true);
    },
    restore: function () {
      calls.push('restore');
      return Promise.resolve(true);
    },
    products: function () {
      return [
        { id: 'remove_ads', title: 'Убрать рекламу', price: 149, currency: 'RUB' },
        { id: 'support_99', title: 'Поддержать проект', price: 99, currency: 'RUB' }
      ];
    }
  };
  return Object.assign(bridge, overrides || {}, { calls: calls });
}

test('RuStore: только классический IIFE, без ES-модулей', () => {
  assert.doesNotMatch(source, /^\s*(import|export)\s/m);
  assert.match(source, /\(function \(global\)/);
});

test('RuStore: до подключения SDK всё недоступно', async () => {
  const { platform, timers } = load();
  assert.equal(platform.available(), false);
  assert.deepEqual(Array.from(platform.products()), []);

  const ready = platform.whenReady();
  const timer = timers.find((t) => t.ms === 8000);
  assert.ok(timer, 'нет таймаута готовности моста');
  timer.fn();
  assert.equal(await ready, null);

  assert.equal(await platform.showRewarded(), false);
  assert.equal(await platform.showInterstitial(), false);
  assert.equal(await platform.purchase('remove_ads'), false);
  assert.equal(await platform.restore(), false);
});

test('RuStore: мост, внедрённый до загрузки, подхватывается сразу', async () => {
  const bridge = fakeBridge();
  const { platform } = load({ RuStoreBridge: bridge });
  assert.equal(platform.available(), true);
  assert.equal(await platform.whenReady(), bridge);
  assert.deepEqual(Array.from(platform.products()).map((p) => p.id), ['remove_ads', 'support_99']);
});

test('RuStore: поздний мост приходит через onRuStoreReady', async () => {
  const { platform, init } = load();
  const bridge = fakeBridge();
  init(bridge);
  assert.equal(platform.available(), true);
  assert.equal(await platform.whenReady(), bridge);
  assert.equal(await platform.showRewarded(), true);
});

test('RuStore: действия возвращают результат моста', async () => {
  const { platform, init } = load();
  const bridge = fakeBridge();
  init(bridge);
  await platform.whenReady();

  assert.equal(await platform.showInterstitial(), true);
  assert.equal(await platform.showRewarded(), true);
  assert.equal(await platform.purchase('remove_ads'), true);
  assert.equal(await platform.restore(), true);
  assert.deepEqual(bridge.calls, ['interstitial', 'rewarded', 'purchase:remove_ads', 'restore']);
});

test('RuStore: неуспех и пустой id не считаются покупкой', async () => {
  const { platform, init } = load();
  const bridge = fakeBridge({
    showRewarded: () => Promise.resolve(undefined),
    showInterstitial: () => Promise.resolve(false),
    purchase: () => Promise.resolve(undefined),
    restore: () => Promise.resolve(false)
  });
  init(bridge);
  await platform.whenReady();

  assert.equal(await platform.showRewarded(), false);
  assert.equal(await platform.showInterstitial(), false);
  assert.equal(await platform.purchase('remove_ads'), false);
  assert.equal(await platform.purchase(''), false);
  assert.equal(await platform.purchase(null), false);
  assert.equal(await platform.restore(), false);
});

test('RuStore: пустой id не доходит до моста', async () => {
  const { platform, init } = load();
  const bridge = fakeBridge();
  init(bridge);
  await platform.whenReady();
  assert.equal(await platform.purchase(''), false);
  assert.deepEqual(bridge.calls, []);
});

test('RuStore: одновременный rewarded не запускается дважды', async () => {
  const { platform, init, timers } = load();
  const bridge = fakeBridge({
    showRewarded: () => new Promise(() => {})
  });
  init(bridge);
  await platform.whenReady();

  const first = platform.showRewarded();
  assert.equal(await platform.showRewarded(), false);
  const timer = timers.find((t) => t.ms === 20000);
  assert.ok(timer, 'нет таймаута рекламы');
  timer.fn();
  assert.equal(await first, false);
});

test('RuStore: зависший мост не блокирует игру', async () => {
  const { platform, init, timers } = load();
  const bridge = fakeBridge({
    showInterstitial: () => new Promise(() => {}),
    purchase: () => new Promise(() => {})
  });
  init(bridge);
  await platform.whenReady();

  const interstitial = platform.showInterstitial();
  const purchase = platform.purchase('support_99');
  for (const timer of timers.filter((t) => t.ms === 20000)) timer.fn();
  assert.equal(await interstitial, false);
  assert.equal(await purchase, false);
});

test('RuStore: ошибки моста не роняют игру', async () => {
  const boom = () => { throw new Error('нет моста'); };
  const { platform } = load({
    RuStoreBridge: {
      showRewarded: boom,
      showInterstitial: boom,
      purchase: boom,
      restore: boom,
      products: boom
    }
  });
  await platform.whenReady();

  assert.deepEqual(Array.from(platform.products()), []);
  assert.equal(await platform.showRewarded(), false);
  assert.equal(await platform.showInterstitial(), false);
  assert.equal(await platform.purchase('remove_ads'), false);
  assert.equal(await platform.restore(), false);
});

test('RuStore: кнопки скрыты, скрипт подключён до app.js и лежит в PWA-кэше', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="btn-remove-ads"[^>]*hidden/);
  assert.match(html, /id="btn-support"[^>]*hidden/);

  const rustore = html.indexOf('js/rustore.js');
  const app = html.indexOf('js/app.js');
  assert.ok(rustore >= 0, 'js/rustore.js не подключён');
  assert.ok(app > rustore, 'rustore.js должен идти до app.js');

  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /\.\/js\/rustore\.js/);
  assert.match(sw, /const VERSION = 'sb-v41'/);

  const js = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(js, /window\.RuStorePlatform/);
  assert.match(js, /wireRuStore\(\)/);
  assert.match(js, /const SW_VERSION = 'sb-v41'/);
});

test('RuStore: политика и документ описывают рекламу, покупки и запрет pay-to-win', () => {
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.match(privacy, /Реклама и покупки в RuStore/);
  assert.match(privacy, /данные банковской карты/);
  assert.match(privacy, /не влияют на ELO/);

  const doc = fs.readFileSync(path.join(root, 'docs', 'rustore-monetization.md'), 'utf8');
  assert.match(doc, /remove_ads/);
  assert.match(doc, /support_99/);
  assert.match(doc, /Что нельзя продавать/i);
  assert.match(doc, /pay-to-win/i);
  assert.match(doc, /window\.RuStoreBridge/);
});

test('RuStore: сборки для площадок вырезают скрипт и кнопки', () => {
  for (const file of ['scripts/build-yandex.mjs', 'scripts/build-gamepush.mjs']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    // Замена должна быть терпима к CRLF и обязана падать, если не сработала.
    assert.match(src, /s\.replace\(\/\[ \\t\]\*<script src="js\\\/rustore\\\.js"><\\\/script>\\r\?\\n\//);
    assert.match(src, /must\(!s\.includes\('js\/rustore\.js'\)/);
    assert.match(src, /must\(!s\.includes\('id="' \+ id \+ '"'\)/);
  }
});
