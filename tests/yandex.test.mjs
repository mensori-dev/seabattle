/* ============================================================
   js/yandex.js: автоопределение языка и обязательные вызовы SDK.
   Гоняем файл в vm с фейковым window/document, без браузера.
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../js/yandex.js', import.meta.url));

async function load(code = null) {
  const calls = { ready: 0, gameplayStart: 0, gameplayStop: 0, events: [] };
  const html = { lang: '', attrs: {} };
  const document = {
    documentElement: {
      set lang(value) { html.lang = value; },
      get lang() { return html.lang; },
      setAttribute: (name, value) => { html.attrs[name] = value; }
    },
    addEventListener: () => {},
    hidden: false
  };

  const sdk = {
    environment: { i18n: { lang: code } },
    features: {
      LoadingAPI: { ready: () => { calls.ready += 1; } },
      GameplayAPI: {
        start: () => { calls.gameplayStart += 1; },
        stop: () => { calls.gameplayStop += 1; }
      }
    },
    on: (name) => { calls.events.push(name); },
    adv: {}
  };

  const window = {
    YaGames: { init: () => Promise.resolve(sdk) }
  };

  const context = vm.createContext({ window, document, console, Promise, JSON });
  vm.runInContext(await readFile(SOURCE, 'utf8'), context);
  // init() вызывается при загрузке файла: даём микротаскам дойти до конца.
  await new Promise((resolve) => setImmediate(resolve));
  return { window, document, html, calls, sdk };
}

test('язык платформы читается на старте и для ru помечается как поддерживаемый', async () => {
  const { window, html } = await load('ru');
  assert.equal(window.YandexGame.lang(), 'ru');
  assert.equal(html.lang, 'ru');
  assert.equal(html.attrs['data-lang'], 'ru');
  assert.equal(html.attrs['data-lang-supported'], '1');
});

test('неподдерживаемый язык не ломает игру: остаётся русский интерфейс', async () => {
  const { window, html } = await load('tr');
  assert.equal(window.YandexGame.lang(), 'tr');
  assert.equal(html.lang, 'ru');
  assert.equal(html.attrs['data-lang'], 'tr');
  assert.equal(html.attrs['data-lang-supported'], '0');
});

test('LoadingAPI.ready() ждёт инициализации SDK и вызывается один раз', async () => {
  const { window, calls } = await load('ru');
  window.YandexGame.ready();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.ready, 1);
});

test('GameplayAPI размечен старт и конец боя', async () => {
  const { window, calls } = await load('ru');
  window.YandexGame.gameplayStart();
  window.YandexGame.gameplayStop();
  assert.equal(calls.gameplayStart, 1);
  assert.equal(calls.gameplayStop, 1);
  assert.deepEqual(calls.events, ['game_api_pause', 'game_api_resume']);
});

test('без SDK игра работает и не падает', async () => {
  const html = { lang: '', attrs: {} };
  const document = {
    documentElement: {
      set lang(value) { html.lang = value; },
      get lang() { return html.lang; },
      setAttribute: (name, value) => { html.attrs[name] = value; }
    },
    addEventListener: () => {},
    hidden: false
  };
  const window = {};
  const context = vm.createContext({ window, document, console, Promise, JSON });
  vm.runInContext(await readFile(SOURCE, 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.YandexGame.available(), false);
  assert.equal(await window.YandexGame.showInterstitial(), false);
  assert.equal(window.Online.available(), false);
});
