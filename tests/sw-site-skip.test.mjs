import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swSource = readFileSync(path.join(root, 'sw.js'), 'utf8');
const app = readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function loadServiceWorker() {
  const puts = [];
  const matches = [];
  const listeners = {};
  const cache = { put: (key) => { puts.push(key); return Promise.resolve(); } };
  const caches = {
    open: () => Promise.resolve(cache),
    match: (req) => { matches.push(typeof req === 'string' ? req : req.url); return Promise.resolve(undefined); },
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true)
  };

  const sandbox = {
    URL,
    Promise,
    Response,
    caches,
    fetch: (req) => Promise.resolve(new Response('ok', { status: 200 })),
    location: { origin: 'https://example.test' },
    addEventListener: (type, handler) => { listeners[type] = handler; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    console
  };
  sandbox.self = sandbox;
  createContext(sandbox);
  runInContext(swSource, sandbox);

  return { listeners, puts, matches, sandbox };
}

function navigation(url) {
  let responded = null;
  return {
    event: {
      request: { method: 'GET', mode: 'navigate', url },
      respondWith: (promise) => { responded = promise; }
    },
    get responded() { return responded; }
  };
}

test('service worker and app shell share one cache version', () => {
  const swVersion = /const VERSION = '([^']+)'/.exec(swSource);
  const appVersion = /const SW_VERSION = '([^']+)'/.exec(app);
  assert.ok(swVersion, 'sw.js must declare VERSION');
  assert.ok(appVersion, 'js/app.js must declare SW_VERSION');
  assert.match(swVersion[1], /^sb-v\d+$/);
  assert.equal(swVersion[1], appVersion[1]);
});

test('the landing page is not part of the offline game cache', () => {
  const core = /const CORE = \[([\s\S]*?)\];/.exec(swSource);
  assert.ok(core, 'sw.js must declare CORE');
  assert.doesNotMatch(core[1], /site\//);
});

test('navigating to a regular page does not overwrite the game shell', async () => {
  const sw = loadServiceWorker();
  const nav = navigation('https://example.test/seabattle/privacy.html');
  sw.listeners.fetch(nav.event);
  await nav.responded;
  assert.deepEqual(sw.puts, [], 'privacy.html must not be cached as index.html');
});

test('navigating to the game caches it as the offline shell', async () => {
  const sw = loadServiceWorker();
  const nav = navigation('https://example.test/seabattle/');
  sw.listeners.fetch(nav.event);
  await nav.responded;
  assert.ok(sw.puts.includes('./index.html'), 'the game navigation must refresh the shell');
});

test('the landing page is left to the network', () => {
  const sw = loadServiceWorker();
  const nav = navigation('https://example.test/seabattle/site/');
  sw.listeners.fetch(nav.event);
  assert.equal(nav.responded, null, '/site/ must not be handled by the game service worker');
});

test('offline navigation falls back to the requested page, then the shell', async () => {
  const sw = loadServiceWorker();
  sw.sandbox.fetch = () => Promise.reject(new Error('offline'));
  const privacyResponse = new Response('privacy');
  sw.sandbox.caches.match = (req) => {
    sw.matches.push(typeof req === 'string' ? req : req.url);
    const url = typeof req === 'string' ? req : req.url;
    return Promise.resolve(url.includes('privacy.html') ? privacyResponse : undefined);
  };

  const nav = navigation('https://example.test/seabattle/privacy.html');
  sw.listeners.fetch(nav.event);
  const response = await nav.responded;
  assert.equal(await response.text(), 'privacy');
  assert.ok(sw.matches.some((u) => u.includes('privacy.html')));
});
