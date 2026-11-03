/* ============================================================
   Скриншоты для магазинов: 1080×1920.
   Запускает Chrome/Edge в headless-режиме с мобильной эмуляцией,
   проходит по экранам и сохраняет PNG в docs/screenshots/.

   Требует запущенные:
     npm run dev      # http://localhost:5173
     npm run server   # http://127.0.0.1:8000 (для экрана онлайна)

   Запуск:  npm run shots
   ============================================================ */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173/index.html';
const WS = 'ws://127.0.0.1:8000/ws';
const OUT = 'docs/screenshots';
const PORT = 9333;
const W = 540;       // CSS-ширина телефона
const H = 960;       // CSS-высота
const DSF = 2;       // 540×960 × 2 = 1080×1920

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

function findBrowser() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('Не найден Chrome/Edge. Укажи CHROME_PATH.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  return res.json();
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Ошибка в странице');
    }
    return res.result ? res.result.value : null;
  }

  async waitFor(expression, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await this.evaluate(`!!(${expression})`)) return true;
      } catch (_e) { /* страница ещё грузится */ }
      await sleep(80);
    }
    throw new Error('Не дождались: ' + expression);
  }

  async shot(name) {
    const res = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const path = join(OUT, name);
    await writeFile(path, Buffer.from(res.data, 'base64'));
    console.log('  ✓', path);
    return path;
  }
}

/* Заполняем онлайн-рейтинг через настоящие матчи: гость сдаётся. */
function seedLeaderboard(pairs) {
  return Promise.all(pairs.map(([hostName, guestName]) => new Promise((resolve) => {
    let host = null;
    let guest = null;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      try { if (host) host.close(); } catch (_e) { /* ignore */ }
      try { if (guest) guest.close(); } catch (_e) { /* ignore */ }
      resolve();
    };
    const timer = setTimeout(done, 5000);
    try {
      host = new WebSocket(WS);
    } catch (_e) {
      clearTimeout(timer);
      return done();
    }
    host.onerror = () => { clearTimeout(timer); done(); };
    host.onopen = () => host.send(JSON.stringify({ t: 'create', name: hostName, rating: 1200 }));
    host.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (_e) { return; }
      if (msg.t !== 'room') return;
      const code = String(msg.code);
      guest = new WebSocket(WS);
      guest.onerror = () => { clearTimeout(timer); done(); };
      guest.onopen = () => guest.send(JSON.stringify({ t: 'join', code, name: guestName, rating: 1100 }));
      guest.onmessage = (ev2) => {
        let g = null;
        try { g = JSON.parse(ev2.data); } catch (_e) { return; }
        if (g.t !== 'start') return;
        guest.send(JSON.stringify({ t: 'surrender' }));
        clearTimeout(timer);
        setTimeout(done, 300);
      };
    };
  })));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const profileDir = join(tmpdir(), 'seabattle-shots-' + Date.now());
  const browser = spawn(findBrowser(), [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-gpu',
    `--window-size=${W * DSF},${H * DSF}`
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    let version = null;
    for (let i = 0; i < 100 && !version; i++) {
      try {
        version = await httpJson(`http://127.0.0.1:${PORT}/json/version`);
      } catch (_e) {
        await sleep(100);
      }
    }
    if (!version) throw new Error('Chrome не запустился');

    // заполняем рейтинг до открытия страницы
    console.log('Заполняю онлайн-рейтинг…');
    await seedLeaderboard([
      ['Адмирал Акула', 'Боцман Борщ'],
      ['Адмирал Акула', 'Юнга Шпрот'],
      ['Капитан Шторм', 'Матрос Тюлень'],
      ['Боцман Бублик', 'Юнга Карась']
    ]);

    const target = await httpJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    cdp = new Cdp(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: DSF, mobile: true
    });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });

    console.log('Открываю игру…');
    await cdp.send('Page.navigate', { url: APP + '?shots=' + Date.now() });
    await cdp.waitFor(`document.readyState === 'complete' && document.querySelector('#btn-play')`);

    const today = new Date();
    const key = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    const yesterday = new Date(Date.now() - 86400000);

    await cdp.evaluate(`(() => {
      const p = {
        name: 'Капитан Шторм',
        rating: 1524, best: 1608,
        games: 47, wins: 31, losses: 16, streak: 3,
        muted: false, volume: 0.7, motion: 'off', bubbles: true,
        theme: 'dark', difficulty: 'normal', fleet: 'admiral',
        daily: { date: '${key}', streak: 4 },
        achievements: {
          first_win: 1, win10: 1, first_blood: 1, online: 1, rank1500: 1, admiral: 1
        },
        stats: { shots: 642, hits: 389 },
        history: [
          { name: 'Адмирал Кальмар', rating: 1490, delta: 12, win: true, ts: Date.now() },
          { name: 'Штурман Компас', rating: 1442, delta: -8, win: false, ts: Date.now() - 600000 },
          { name: 'Боцман Борщ', rating: 1380, delta: 15, win: true, ts: Date.now() - 1200000 }
        ]
      };
      localStorage.setItem('seabattle.profile.v2', JSON.stringify(p));
      return '${yesterday.getTime()}';
    })()`);

    await cdp.send('Page.navigate', { url: APP + '?shots=' + Date.now() });
    await cdp.waitFor(`document.readyState === 'complete' && document.querySelector('#btn-play')`);
    await sleep(500);

    console.log('Снимаю экраны:');
    await cdp.shot('01-menu.png');

    // расстановка (адмиральский флот)
    await cdp.evaluate(`document.querySelector('#btn-play').click()`);
    await cdp.waitFor(`document.querySelector('#screen-place').classList.contains('is-active')`);
    await cdp.evaluate(`document.querySelector('#btn-random').click()`);
    await sleep(450);
    await cdp.shot('02-placement.png');

    // бой: несколько выстрелов по шахматным клеткам
    await cdp.evaluate(`document.querySelector('#btn-ready').click()`);
    await cdp.waitFor(`document.querySelector('#screen-battle').classList.contains('is-active')`);
    await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const cells = [...document.querySelectorAll('#board-enemy .cell')]
        .filter((c) => (Number(c.dataset.x) + Number(c.dataset.y)) % 2 === 0);
      let shots = 0;
      for (let guard = 0; guard < 300 && shots < 7; guard++) {
        if (!document.querySelector('#board-enemy').classList.contains('is-yours')) {
          await sleep(120);
          continue;
        }
        const free = cells.filter((c) => !/hit|miss|sunk/.test(c.className));
        if (!free.length) break;
        free[shotIndex(free, shots)].click();
        shots += 1;
        await sleep(480);
      }
      function shotIndex(list, i) { return i % list.length; }
      await sleep(900);
      return shots;
    })()`);
    await sleep(1600);
    await cdp.shot('03-battle.png');

    // правила
    await cdp.evaluate(`document.querySelector('#btn-back').click()`);
    await cdp.waitFor(`document.querySelector('#screen-menu').classList.contains('is-active')`);
    await cdp.evaluate(`document.querySelector('#btn-rules').click()`);
    await sleep(550);
    await cdp.shot('04-rules.png');
    await cdp.evaluate(`document.querySelector('#btn-rules-close').click()`);
    await sleep(450);

    // достижения
    await cdp.evaluate(`document.querySelector('#btn-achievements').click()`);
    await sleep(550);
    await cdp.shot('05-achievements.png');
    await cdp.evaluate(`document.querySelector('#btn-ach-close').click()`);
    await sleep(450);

    // онлайн + рейтинг
    await cdp.evaluate(`document.querySelector('#btn-online').click()`);
    await cdp.waitFor(`document.querySelector('#screen-online').classList.contains('is-active')`);
    await sleep(1800);
    await cdp.shot('06-online.png');

    console.log('\nГотово. Скриншоты в', OUT);
  } finally {
    try { if (cdp) cdp.ws.close(); } catch (_e) { /* ignore */ }
    try { browser.kill(); } catch (_e) { /* ignore */ }
    await sleep(300);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('\nОшибка:', err.message);
  process.exitCode = 1;
});
