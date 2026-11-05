import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js', 'gamepush.js'), 'utf8');

function load() {
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
  vm.runInNewContext(source, sandbox, { filename: 'js/gamepush.js' });
  return { platform: sandbox.GamePlatform, init: sandbox.onGPInit, sandbox, timers };
}

function fakeGp(overrides) {
  const calls = [];
  const handlers = {};
  const gp = {
    language: 'ru',
    player: { ready: Promise.resolve() },
    ads: {
      isFullscreenAvailable: true,
      isRewardedAvailable: true,
      showFullscreen: () => {
        calls.push('fullscreen');
        return Promise.resolve(true);
      },
      showRewardedVideo: () => {
        calls.push('rewarded');
        return Promise.resolve(true);
      }
    },
    on: (name, fn) => { handlers[name] = fn; },
    gameStart: () => calls.push('gameStart'),
    gameplayStart: () => calls.push('gameplayStart'),
    gameplayStop: () => calls.push('gameplayStop'),
    isPaused: false
  };
  return Object.assign(gp, overrides || {}, { calls: calls, handlers: handlers });
}

test('GamePush: до инициализации площадка недоступна', async () => {
  const { platform } = load();
  assert.equal(platform.available(), false);
  assert.equal(platform.lang(), 'ru');
  assert.deepEqual(Array.from(platform.languages()), ['ru', 'en']);
});

test('GamePush: onGPInit ждёт player.ready и вызывает gameStart', async () => {
  const { platform, init } = load();
  const gp = fakeGp();
  platform.ready();
  init(gp);
  const sdk = await platform.whenReady();
  assert.equal(sdk, gp);
  assert.equal(platform.available(), true);
  assert.equal(gp.calls.filter((x) => x === 'gameStart').length, 1);
});

test('GamePush: пауза гасит геймплей, resume возвращает', async () => {
  const { platform, init } = load();
  const gp = fakeGp();
  init(gp);
  await platform.whenReady();
  let pauses = 0;
  let resumes = 0;
  platform.onPause(() => { pauses += 1; });
  platform.onResume(() => { resumes += 1; });
  platform.gameplayStart();
  gp.handlers.pause();
  assert.equal(platform.isPaused(), true);
  assert.equal(pauses, 1);
  assert.deepEqual(gp.calls, ['gameplayStart', 'gameplayStop']);
  gp.handlers.resume();
  assert.equal(platform.isPaused(), false);
  assert.equal(resumes, 1);
  assert.deepEqual(gp.calls, ['gameplayStart', 'gameplayStop', 'gameplayStart']);
});

test('GamePush: реклама возвращает результат площадки', async () => {
  const { platform, init } = load();
  const gp = fakeGp();
  init(gp);
  await platform.whenReady();
  assert.equal(await platform.showInterstitial(), true);
  assert.equal(await platform.showRewarded(), true);
  assert.deepEqual(gp.calls, ['fullscreen', 'rewarded']);
});

test('GamePush: недоступную рекламу не запрашиваем', async () => {
  const { platform, init } = load();
  const gp = fakeGp({
    ads: {
      isFullscreenAvailable: false,
      isRewardedAvailable: false,
      showFullscreen: () => { throw new Error('нельзя'); },
      showRewardedVideo: () => { throw new Error('нельзя'); }
    }
  });
  init(gp);
  await platform.whenReady();
  assert.equal(await platform.showInterstitial(), false);
  assert.equal(await platform.showRewarded(), false);
});

test('GamePush: rewarded без успеха не начисляется', async () => {
  const { platform, init } = load();
  const gp = fakeGp({
    ads: {
      isFullscreenAvailable: true,
      isRewardedAvailable: true,
      showFullscreen: () => Promise.resolve(true),
      showRewardedVideo: () => Promise.resolve(undefined)
    }
  });
  init(gp);
  await platform.whenReady();
  assert.equal(await platform.showRewarded(), false);
});

test('GamePush: без SDK игра работает через таймаут', async () => {
  const { platform, timers } = load();
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(await platform.whenReady(), null);
  assert.equal(await platform.showInterstitial(), false);
  assert.equal(await platform.showRewarded(), false);
});

test('GamePush: поздний SDK после таймаута всё равно получает gameStart', async () => {
  const { platform, init, timers } = load();
  platform.ready();
  timers[0].fn();
  assert.equal(await platform.whenReady(), null);
  const gp = fakeGp();
  init(gp);
  await gp.player.ready;
  await Promise.resolve();
  assert.equal(platform.available(), true);
  assert.equal(gp.calls.filter((x) => x === 'gameStart').length, 1);
});

test('GamePush: повторный ready не дублирует gameStart', async () => {
  const { platform, init } = load();
  const gp = fakeGp();
  platform.ready();
  platform.ready();
  init(gp);
  await platform.whenReady();
  assert.equal(gp.calls.filter((x) => x === 'gameStart').length, 1);
});
