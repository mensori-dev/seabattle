import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('js/app.js');
const rustore = read('js/rustore.js');
const html = read('index.html');

function loadPlatform(extra) {
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
  vm.runInNewContext(rustore, sandbox, { filename: 'js/rustore.js' });
  return { platform: sandbox.RuStorePlatform, timers: timers };
}

test('Магазин: оверлей, карточка входа и три секции', () => {
  assert.match(html, /id="btn-shop"[^>]*type="button"/);
  assert.match(html, /id="modal-shop"[^>]*hidden[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="btn-shop-close"/);
  assert.match(html, /id="btn-shop-done"/);
  assert.match(html, /Убрать рекламу/);
  assert.match(html, /Поддержать проект/);
  assert.match(html, />Скоро</);
});

test('Магазин: remove_ads 149 ₽ и support_99 99 ₽, обе кнопки выключены до SDK', () => {
  assert.match(html, /id="shop-buy-remove-ads"[^>]*data-product="remove_ads"[^>]*disabled[^>]*>149 ₽/);
  assert.match(html, /id="shop-buy-support"[^>]*data-product="support_99"[^>]*disabled[^>]*>99 ₽/);
  assert.match(html, /Покупки доступны только в RuStore/);
  assert.match(app, /removeBtn\.disabled = !available/);
  assert.match(app, /supportBtn\.disabled = !available/);
});

test('Магазин: косметика «Скоро» без цены и покупки', () => {
  const cards = html.match(/<div class="shop-soon">[\s\S]*?<\/div>/g) || [];
  assert.ok(cards.length >= 2 && cards.length <= 3, 'нужно 2–3 карточки косметики');
  for (const card of cards) {
    assert.match(card, /🔒/);
    assert.match(card, /в разработке/);
    assert.doesNotMatch(card, /data-product/);
    assert.doesNotMatch(card, /\d+\s*₽/);
    assert.doesNotMatch(card, /<button/);
  }
});

test('Магазин: покупки идут только через RuStorePlatform.purchase(id)', () => {
  const owners = Array.from(app.matchAll(/([\w.$]+)\.purchase\(/g), (m) => m[1]);
  assert.ok(owners.length > 0, 'в app.js нет вызова purchase');
  for (const owner of owners) {
    assert.ok(owner === 'RU' || owner === 'RuStorePlatform', 'лишний платёжный путь: ' + owner);
  }
  assert.match(app, /RU\.purchase\(productId\)/);
  assert.doesNotMatch(app, /GamePlatform\.purchase|YandexGame\.purchase/);
  assert.doesNotMatch(app, /window\.open\([^)]*purchase/i);
});

test('Магазин: без SDK покупка не запускается и показывает честную подпись', () => {
  assert.match(app, /if \(!RU \|\| !RU\.available\(\)\) \{\s*toast\('Покупки доступны только в RuStore'/);
  assert.match(html, /id="shop-note"[^>]*>Покупки доступны только в RuStore/);
  assert.match(app, /note\.hidden = available/);
});

test('Магазин: remove_ads сохраняется, выключает рекламу и прячет rewarded', () => {
  assert.match(app, /state\.profile\.removeAds = true/);
  assert.match(app, /RU\.setAdsEnabled\(false\)/);
  assert.match(app, /function applyRemoveAds\(\) \{\s*if \(!RU\) return;/);
  const fn = app.slice(app.indexOf('function applyRemoveAds('), app.indexOf('function restorePurchases('));
  assert.match(fn, /btn-bonus/);
  assert.match(fn, /btn-ad-bonus/);
  assert.match(fn, /hidden = true/);
  assert.match(app, /if \(RU && p\.removeAds\) \{ done\(\); return; \}/);
  assert.match(app, /if \(RU && state\.profile\.removeAds\) return;/);
});

test('Магазин: restore вызывается при старте и поднимает removeAds', () => {
  const fn = app.slice(app.indexOf('function restorePurchases('), app.indexOf('function updateRuStoreButtons('));
  assert.match(fn, /RU\.restore\(\)/);
  assert.match(fn, /state\.profile\.removeAds = true/);
  assert.match(fn, /applyRemoveAds\(\)/);
  assert.match(app, /RU\.whenReady\(\)\.then\(function \(sdk\)/);
  assert.match(app, /restorePurchases\(\)/);
});

test('RuStore: setAdsEnabled/adsEnabled без моста и с мостом', () => {
  const none = loadPlatform();
  assert.equal(none.platform.adsEnabled(), true);
  assert.equal(none.platform.setAdsEnabled(false), false);
  assert.equal(none.platform.adsEnabled(), false);

  const calls = [];
  let state = true;
  const live = loadPlatform({
    RuStoreBridge: {
      setAdsEnabled: (on) => { calls.push(on); state = on; },
      adsEnabled: () => state
    }
  });
  assert.equal(live.platform.adsEnabled(), true);
  assert.equal(live.platform.setAdsEnabled(false), true);
  assert.deepEqual(calls, [false]);
  assert.equal(live.platform.adsEnabled(), false);

  const noMethod = loadPlatform({ RuStoreBridge: { adsEnabled: () => true } });
  assert.equal(noMethod.platform.setAdsEnabled(false), false);
  assert.equal(noMethod.platform.adsEnabled(), true);

  const boom = loadPlatform({
    RuStoreBridge: { setAdsEnabled: () => { throw new Error('нет'); } }
  });
  assert.equal(boom.platform.setAdsEnabled(false), false);
});

test('Документ RuStore: честная монетизация без pay-to-win', () => {
  const doc = read('docs/rustore.md');
  // Рекламного SDK у RuStore нет: реклама только на Яндекс Играх и в VK/OK,
  // витрина «Убрать рекламу» скрыта, покупки идут через RuStore Pay SDK.
  assert.match(doc, /Содержит рекламу \| Нет/);
  assert.match(doc, /Встроенные покупки \| Да/);
  assert.match(doc, /RuStore Pay SDK/);
  assert.match(doc, /## Монетизация/);
  assert.match(doc, /remove_ads`? — 149 ₽/);
  assert.match(doc, /support_99`? — 99 ₽/);
  assert.match(doc, /rewarded/i);
  assert.match(doc, /interstitial/i);
  assert.match(doc, /в разработке/);
  assert.match(doc, /pay-to-win/i);
  assert.match(doc, /ELO, способности и преимущества[^.]*не продаются/i);
});

test('SEO витрины: sitemap, canonical, og:locale и JSON-LD', () => {
  const sitemap = read('site/sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/mensori-dev\.github\.io\/seabattle\/site\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/mensori-dev\.github\.io\/seabattle\/site\/studio\.html<\/loc>/);
  assert.equal(fs.existsSync(path.join(root, 'robots.txt')), false, 'robots.txt в корне не нужен');

  const site = read('site/index.html');
  assert.match(site, /<link rel="canonical" href="https:\/\/mensori-dev\.github\.io\/seabattle\/site\/">/);
  assert.match(site, /property="og:locale" content="ru_RU"/);
  const gameLd = site.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(gameLd, 'нет JSON-LD на витрине');
  const game = JSON.parse(gameLd[1]);
  assert.equal(game['@type'], 'VideoGame');
  assert.equal(game.url, 'https://mensori-dev.github.io/seabattle/site/');

  const studio = read('site/studio.html');
  assert.match(studio, /<link rel="canonical" href="https:\/\/mensori-dev\.github\.io\/seabattle\/site\/studio\.html">/);
  assert.match(studio, /property="og:locale" content="ru_RU"/);
  const studioLd = studio.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(studioLd, 'нет JSON-LD на странице студии');
  const service = JSON.parse(studioLd[1]);
  assert.equal(service['@type'], 'ProfessionalService');
  assert.equal(service.url, 'https://mensori-dev.github.io/seabattle/site/studio.html');
});

test('Сборки площадок вырезают карточку и оверлей магазина', () => {
  for (const file of ['scripts/build-yandex.mjs', 'scripts/build-gamepush.mjs']) {
    const src = read(file);
    assert.match(src, /rustore-shop-button/);
    assert.match(src, /rustore-shop-start/);
    assert.match(src, /must\(!s\.includes\('id="btn-shop"'\)/);
    assert.match(src, /must\(!s\.includes\('id="modal-shop"'\)/);
  }
});
