/* ============================================================
   Промоматериалы для Яндекс Игр → yandex-promo/

   Делает всё, что просит консоль при загрузке игры:
     icon-512.png              512×512, из assets/icon-512.png
     cover-800x470.png         обложка (нарисована, не скриншот)
     hero-1560x520.png         картинка для страницы игры
     screens/mobile-*.png      1080×1920, реальный геймплей
     screens/desktop-*.png     1600×900, реальный геймплей
     video/seabattle-16x9.mp4  горизонтальное видео, обязательное поле
     video/seabattle-9x16.mp4  вертикальное видео, необязательное
     seabattle-yandex-*.zip    архив самой игры для загрузки в консоль
     README.md, TEXTS.md       инструкция и тексты полей черновика

   Как делается видео: headless Chrome снимает screencast кадры, затем
   перерисовывает их на canvas и пишет MP4 (H.264) через MediaRecorder.
   ffmpeg не нужен. Битрейт держим ниже 400 кбит/с — лимит платформы.

   Запуск:            npm run yandex:promo
   Без видео:         npm run yandex:promo -- --no-video
   Без пересборки:    npm run yandex:promo -- --no-build
   ============================================================ */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { chooseShot } from './promo-picker.mjs';

const ROOT = resolve('dist/yandex');
const OUT = resolve('yandex-promo');
const SCREENS = join(OUT, 'screens');
const VIDEO = join(OUT, 'video');
const DOCS = resolve('docs/yandex-promo');
const FRAMES = join(OUT, '.frames');
const PORT = Number(process.env.PROMO_PORT) || 5176;
const DEBUG_PORT = Number(process.env.PROMO_DEBUG_PORT) || 9336;
const BASE = `http://127.0.0.1:${PORT}`;

const NO_VIDEO = process.argv.includes('--no-video');
const NO_BUILD = process.argv.includes('--no-build');

const MOBILE = { w: 540, h: 960, dsf: 2 };       // ×2 = 1080×1920
const DESKTOP = { w: 800, h: 450, dsf: 2 };      // ×2 = 1600×900
const VIDEO_LANDSCAPE = { w: 1280, h: 720 };
const VIDEO_PORTRAIT = { w: 720, h: 1280 };
const VIDEO_SECONDS = 16;
const VIDEO_BPS = 380000;                        // лимит платформы — 400 кбит/с

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('Не найден Chrome/Edge. Укажи CHROME_PATH.');
}

/* ---------- мини-сервер: игра, обложка, кадры видео ---------- */

function serveFile(res, file, type) {
  return readFile(file)
    .then((buf) => {
      res.writeHead(200, {
        'Content-Type': type || MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    });
}

function startServer() {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, BASE).pathname);
    } catch {
      res.writeHead(400);
      return res.end('bad request');
    }

    if (pathname === '/' || pathname === '/index.html') {
      return serveFile(res, join(ROOT, 'index.html'));
    }
    if (pathname === '/__cover') {
      const url = new URL(req.url, BASE);
      const w = Number(url.searchParams.get('w')) || 800;
      const h = Number(url.searchParams.get('h')) || 470;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(coverHtml(w, h));
    }
    if (pathname === '/__rec') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(recorderHtml());
    }
    if (pathname === '/__icon.png') {
      return serveFile(res, resolve('assets/icon-512.png'), 'image/png');
    }
    if (pathname.startsWith('/__frames/')) {
      const name = pathname.slice('/__frames/'.length);
      if (!/^[\w.-]+$/.test(name)) {
        res.writeHead(403);
        return res.end('forbidden');
      }
      return serveFile(res, join(FRAMES, name), 'image/jpeg');
    }

    const file = resolve(ROOT, '.' + pathname);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    return serveFile(res, file);
  });

  return new Promise((resolvePromise) => {
    server.listen(PORT, '127.0.0.1', () => resolvePromise(server));
  });
}

/* ---------- CDP ---------- */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      const list = this.handlers.get(msg.method);
      if (list) list.forEach((fn) => fn(msg.params));
    };
  }

  on(method, fn) {
    const list = this.handlers.get(method) || [];
    list.push(fn);
    this.handlers.set(method, list);
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
      const details = res.exceptionDetails.exception && res.exceptionDetails.exception.description;
      throw new Error(details || res.exceptionDetails.text || 'Ошибка в странице');
    }
    return res.result ? res.result.value : null;
  }

  async waitFor(expression, timeout = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await this.evaluate(`!!(${expression})`)) return true;
      } catch (_e) { /* страница ещё грузится */ }
      await sleep(80);
    }
    throw new Error('Не дождались: ' + expression);
  }

  async shot(file, clip) {
    const params = { format: 'png', fromSurface: true };
    if (clip) params.clip = { ...clip, scale: 1 };
    const res = await this.send('Page.captureScreenshot', params);
    await writeFile(file, Buffer.from(res.data, 'base64'));
    const { size } = await stat(file);
    console.log('  ✓', file.replace(OUT + '\\', ''), (size / 1024).toFixed(0) + ' КБ');
    return file;
  }
}

async function openTab(profileDir, url, viewport, opts = {}) {
  const target = await (await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURI(url)}`,
    { method: 'PUT' }
  )).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    ws.onopen = resolvePromise;
    ws.onerror = reject;
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.w,
    height: viewport.h,
    deviceScaleFactor: viewport.dsf || 1,
    mobile: !!viewport.mobile
  });
  if (opts.reducedMotion) {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
  }
  return cdp;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* Профиль для скриншотов: живой рейтинг, достижения, история боёв. */
function profileScript(rating, motion = 'off') {
  return `(() => {
    const p = {
      name: 'Капитан Шторм',
      rating: ${rating}, best: 1608,
      games: 47, wins: 31, losses: 16, streak: 3,
      muted: true, volume: 0.7, motion: '${motion}', bubbles: true,
      theme: 'dark', difficulty: 'easy', fleet: 'classic',
      daily: { date: '${todayKey()}', streak: 4 },
      achievements: {
        first_win: 1, win10: 1, first_blood: 1, rank1500: 1, admiral: 1
      },
      stats: { shots: 642, hits: 389 },
      history: [
        { name: 'Адмирал Кальмар', rating: 1490, delta: 12, win: true, ts: Date.now() },
        { name: 'Штурман Компас', rating: 1442, delta: -8, win: false, ts: Date.now() - 600000 },
        { name: 'Боцман Борщ', rating: 1380, delta: 15, win: true, ts: Date.now() - 1200000 }
      ]
    };
    localStorage.setItem('seabattle.profile.v2', JSON.stringify(p));
    return true;
  })()`;
}

/* Один и тот же «мозг» для скриншотов и видео — вероятностный прицел
   из scripts/promo-picker.mjs: он добивает раненые корабли и стреляет
   туда, где помещается больше всего вариантов. Против лёгкого бота
   выигрывает почти всегда, поэтому скриншот результата стабильно
   показывает «Победа!». */
const PICKER_JS = `
  const chooseShot = ${chooseShot.toString()};
  const FLEET_SIZES = (() => {
    try {
      const p = JSON.parse(localStorage.getItem('seabattle.profile.v2')) || {};
      if (window.Engine) return Engine.FLEETS[p.fleet] || Engine.FLEET;
    } catch (e) { /* профиля ещё нет */ }
    return [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  })();

  function pickCell(board) {
    const cells = Array.from(board.querySelectorAll('.cell'));
    const n = Math.round(Math.sqrt(cells.length));
    const grid = Array.from({ length: n }, () => new Array(n).fill(0));
    const lookup = new Map();
    for (const c of cells) {
      const x = Number(c.dataset.x);
      const y = Number(c.dataset.y);
      const cls = c.className;
      grid[y][x] = /sunk/.test(cls) ? 3 : /hit/.test(cls) ? 2 : /miss/.test(cls) ? 1 : 0;
      lookup.set(y * n + x, c);
    }
    const pick = chooseShot(grid, FLEET_SIZES);
    return pick ? lookup.get(pick.y * n + pick.x) : null;
  }
`;

/* Автоигра: кликает по полю противника, пока не кончится лимит или бой.
   Клик, который игра не приняла (шла анимация), не считается выстрелом. */
function autoPlay(cdp, { maxShots = 200, delay = 420, seconds = 0, untilOverlay = true }) {
  const deadline = seconds ? `Date.now() + ${Math.round(seconds * 1000)}` : 'Infinity';
  return cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ${PICKER_JS}
    const board = document.querySelector('#board-enemy');
    const overlay = document.querySelector('#overlay');
    const deadline = ${deadline};
    let shots = 0;
    let why = 'limit';
    for (let guard = 0; guard < ${maxShots * 80} && shots < ${maxShots} && Date.now() < deadline; guard++) {
      if (${untilOverlay} && overlay && !overlay.hidden) { why = 'overlay'; break; }
      if (!board.classList.contains('is-yours')) { await sleep(80); continue; }
      const cell = pickCell(board);
      if (!cell) { why = 'nocell'; break; }
      const x = cell.dataset.x;
      const y = cell.dataset.y;
      cell.click();
      /* Ждём именно этот выстрел: игра может проигнорировать клик во время анимации. */
      let done = false;
      for (let w = 0; w < 10; w++) {
        await sleep(100);
        if (overlay && !overlay.hidden) { why = 'overlay'; break; }
        const same = board.querySelector('.cell[data-x="' + x + '"][data-y="' + y + '"]');
        if (same && /hit|miss|sunk/.test(same.className)) { done = true; break; }
      }
      if (why === 'overlay') break;
      if (!done) { await sleep(120); continue; }
      shots += 1;
      await sleep(${delay});
    }
    return {
      shots, why,
      you: document.querySelector('#you-fleet').textContent,
      foe: document.querySelector('#foe-fleet').textContent
    };
  })()`);
}

/* ---------- обложка и hero ---------- */

function coverHtml(w, h) {
  /* Всё в vh: 800×470 и 1560×520 масштабируются одной вёрсткой.
     Блок статистики появляется только на широком hero. */
  const ship = new Set([7, 13, 19, 21, 22, 31]);
  const hits = new Set([7, 13, 21]);
  const misses = new Set([0, 4, 9, 15, 20, 26, 28, 33]);
  const aim = 19;
  const cells = [];
  for (let i = 0; i < 36; i++) {
    let cls = 'cell';
    if (ship.has(i)) cls += ' ship';
    if (hits.has(i)) cls += ' hit';
    if (misses.has(i)) cls += ' miss';
    if (aim === i) cls += ' aim';
    cells.push(`<i class="${cls}"></i>`);
  }

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  @font-face{font-family:'Rubik';font-weight:600 900;font-display:block;src:url('/assets/fonts/rubik-cyrillic.woff2') format('woff2');
    unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;}
  @font-face{font-family:'Rubik';font-weight:600 900;font-display:block;src:url('/assets/fonts/rubik-latin.woff2') format('woff2');}
  @font-face{font-family:'Nunito';font-weight:600 900;font-display:block;src:url('/assets/fonts/nunito-cyrillic.woff2') format('woff2');
    unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;}
  @font-face{font-family:'Nunito';font-weight:600 900;font-display:block;src:url('/assets/fonts/nunito-latin.woff2') format('woff2');}

  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden}
  body{
    font-family:'Nunito',sans-serif;color:#e8f4ff;
    background:
      radial-gradient(90vh 90vh at 4% 0%, rgba(53,224,210,.24), transparent 60%),
      radial-gradient(80vh 80vh at 100% 100%, rgba(255,209,102,.16), transparent 58%),
      linear-gradient(155deg,#0b2947 0%,#04101f 58%,#020a14 100%);
    display:flex;align-items:center;justify-content:center;
    gap:4.5vh;padding:0 6vh;position:relative;overflow:hidden;
  }
  .wave{position:absolute;left:-10vh;right:-10vh;height:52vh;pointer-events:none}
  .wave.b{bottom:-30vh;opacity:.55}
  .wave.t{top:-34vh;transform:scaleY(-1);opacity:.3}

  .left{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2.3vh}
  .brand{display:flex;align-items:center;gap:2.4vh}
  .badge{width:15.5vh;height:15.5vh;border-radius:50%;overflow:hidden;flex:0 0 auto;
    box-shadow:0 0 0 .35vh rgba(53,224,210,.45), 0 0 4vh rgba(53,224,210,.35)}
  .badge img{width:100%;height:100%;display:block}
  .titles{display:flex;flex-direction:column;gap:.3vh}
  .top{font-family:'Rubik',sans-serif;font-weight:900;font-size:7.2vh;line-height:.96;letter-spacing:.05em;
    text-transform:uppercase;text-shadow:0 1.2vh 2.6vh rgba(0,0,0,.45);white-space:nowrap}
  .bottom{font-family:'Rubik',sans-serif;font-weight:900;font-size:8.6vh;line-height:.98;letter-spacing:.02em;
    text-transform:uppercase;white-space:nowrap;
    background:linear-gradient(180deg,#9df8ef 0%,#35e0d2 55%,#16a5b5 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 1.1vh 2.2vh rgba(3,20,34,.7))}
  .dash{color:#ffd166}
  .pill{display:inline-flex;align-items:center;gap:1.5vh;padding:1.2vh 2.4vh;
    border:.2vh solid rgba(53,224,210,.45);background:rgba(9,38,63,.6);
    font-weight:800;font-size:3.2vh;letter-spacing:.16em;text-transform:uppercase;color:#bfeee9}
  .pill i{width:1.1vh;height:1.1vh;background:#35e0d2;display:block;box-shadow:0 0 1.5vh #35e0d2}
  .feats{font-weight:800;font-size:3.1vh;line-height:1.35;color:#9fc3d8}
  .feats b{color:#ffd166}

  .board-col{position:relative;display:flex;flex-direction:column;align-items:center;gap:1.8vh}
  .board{display:grid;grid-template-columns:repeat(6,1fr);gap:.9vh;
    width:45vh;height:45vh;padding:1.5vh;flex:0 0 auto;
    background:linear-gradient(160deg,rgba(11,46,74,.95),rgba(4,18,32,.97));
    box-shadow:0 2.8vh 6vh rgba(0,0,0,.55), inset 0 0 0 .2vh rgba(120,200,255,.18)}
  .cell{position:relative;background:rgba(21,74,112,.5);box-shadow:inset 0 0 0 .15vh rgba(120,200,255,.1)}
  .cell.ship{background:linear-gradient(180deg,#d6ecf8,#9dc4dd);box-shadow:inset 0 0 0 .2vh rgba(255,255,255,.65)}
  .cell.hit{background:linear-gradient(180deg,#ff8a7d,#d24a3f)}
  .cell.hit::after{content:'';position:absolute;inset:27%;border-radius:50%;
    background:#fff2ef;box-shadow:0 0 1.8vh rgba(255,120,100,.85)}
  .cell.miss{background:rgba(15,52,82,.55)}
  .cell.miss::after{content:'';position:absolute;inset:39%;border-radius:50%;background:rgba(143,176,201,.8)}
  .cell.aim{outline:.45vh solid #ffd166;outline-offset:-.45vh}
  .cell.aim::before{content:'';position:absolute;inset:0;
    background:radial-gradient(circle at 50% 50%, rgba(255,209,102,.55), transparent 70%)}
  .cap{font-weight:900;font-size:2.9vh;letter-spacing:.14em;text-transform:uppercase;color:#9fc3d8;white-space:nowrap}

  .stats{display:none}
  .stat{display:flex;flex-direction:column;gap:.4vh;padding:1.5vh 2.2vh;min-width:15vh;
    background:rgba(9,38,63,.55);border-left:.35vh solid rgba(53,224,210,.55)}
  .stat b{font-family:'Rubik',sans-serif;font-weight:900;font-size:4.2vh;line-height:1}
  .stat span{font-weight:800;font-size:2.6vh;color:#8fb0c9;letter-spacing:.06em;text-transform:uppercase}

  @media (min-aspect-ratio: 2/1){
    .stats{display:flex;flex-direction:column;gap:1.5vh}
    .board{width:54vh;height:54vh}
  }
</style></head>
<body>
  <svg class="wave t" viewBox="0 0 1440 320" preserveAspectRatio="none">
    <path fill="#35e0d2" fill-opacity=".2" d="M0 192c120-64 240 32 360 32s240-96 360-96 240 64 360 64 240-64 360-64v192H0z"/>
  </svg>

  <div class="left">
    <div class="brand">
      <span class="badge"><img src="/__icon.png" alt=""></span>
      <div class="titles">
        <span class="top">Морской бой</span>
        <span class="bottom"><span class="dash">—</span> Морская арена</span>
      </div>
    </div>
    <span class="pill"><i></i> Бой с ботом</span>
    <span class="feats"><b>ELO-рейтинг</b> · 11 достижений<br>ранги от юнги до легенды</span>
  </div>

  <div class="stats">
    <div class="stat"><b>1524</b><span>рейтинг</span></div>
    <div class="stat"><b>31</b><span>победа</span></div>
    <div class="stat"><b>47</b><span>боёв</span></div>
  </div>

  <div class="board-col">
    <div class="board">${cells.join('')}</div>
    <span class="cap">Топи флот противника</span>
  </div>

  <svg class="wave b" viewBox="0 0 1440 320" preserveAspectRatio="none">
    <path fill="#35e0d2" fill-opacity=".22" d="M0 160c140 0 220 96 360 96s220-96 360-96 220 96 360 96 220-72 360-72v136H0z"/>
  </svg>
</body></html>`;
}

/* ---------- страница-кодировщик видео ---------- */

function recorderHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block;width:100vw;height:auto}</style>
</head><body>
<canvas id="c"></canvas>
<script>
window.startRecording = async function (manifest, bps) {
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const imgs = [];
  for (const item of manifest) {
    const img = new Image();
    img.src = item.url;
    await img.decode();
    imgs.push(img);
  }
  c.width = imgs[0].naturalWidth;
  c.height = imgs[0].naturalHeight;

  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, {
    mimeType: 'video/mp4;codecs=avc1.42E01E',
    videoBitsPerSecond: bps
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((done) => {
    rec.onstop = () => done(new Blob(chunks, { type: 'video/mp4' }));
  });

  ctx.drawImage(imgs[0], 0, 0);
  rec.start(250);
  const t0 = performance.now();
  const base = manifest[0].t;
  if (imgs.length === 1) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (let i = 1; i < imgs.length; i++) {
    const at = (manifest[i].t - base) * 1000;
    const wait = at - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ctx.drawImage(imgs[i], 0, 0);
  }
  await new Promise((r) => setTimeout(r, 500));
  rec.stop();
  const blob = await stopped;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return {
    size: bytes.length,
    mime: blob.type,
    duration: manifest[manifest.length - 1].t - base,
    b64: btoa(binary)
  };
};
</script></body></html>`;
}

/* ---------- скриншоты ---------- */

/* Доигрывает матч до победы: при поражении начинает новый бой (до attempts раз). */
async function playToWin(cdp, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const res = await autoPlay(cdp, { maxShots: 170, delay: 240 });
    await cdp.waitFor(`document.querySelector('#overlay') && !document.querySelector('#overlay').hidden`, 150000);
    await sleep(900);
    const title = await cdp.evaluate(`document.querySelector('#result-title').textContent`);
    console.log('  бой ' + i + ':', title.trim(), '· выстрелов', res.shots, '· флоты', res.you, '/', res.foe);
    if (/Победа/.test(title) || i === attempts) return title;

    await cdp.evaluate(`document.querySelector('#btn-again').click()`);
    await cdp.waitFor(`document.querySelector('#screen-place').classList.contains('is-active')`);
    await sleep(400);
    await cdp.evaluate(`document.querySelector('#btn-random').click()`);
    await sleep(500);
    await cdp.evaluate(`document.querySelector('#btn-ready').click()`);
    await cdp.waitFor(`document.querySelector('#screen-battle').classList.contains('is-active')`);
  }
  return '';
}

async function mobileScreens(profileDir) {
  const cdp = await openTab(profileDir, BASE + '/index.html', { ...MOBILE, mobile: true }, { reducedMotion: true });
  try {
    await cdp.waitFor(`document.readyState === 'complete' && document.querySelector('#btn-play')`);
    await cdp.evaluate(profileScript(1524));
    await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.waitFor(`document.querySelector('#rating-value').textContent === '1524'`);
    await sleep(700);

    console.log('Мобильные скриншоты 1080×1920:');

    await cdp.evaluate(`document.querySelector('#btn-setup').click(); document.querySelector('#btn-setup-go').click()`);
    await cdp.waitFor(`document.querySelector('#screen-place').classList.contains('is-active')`);
    await cdp.evaluate(`document.querySelector('#btn-random').click()`);
    await sleep(600);
    await cdp.shot(join(SCREENS, 'mobile-01-placement.png'));

    await cdp.evaluate(`document.querySelector('#btn-ready').click()`);
    await cdp.waitFor(`document.querySelector('#screen-battle').classList.contains('is-active')`);
    await autoPlay(cdp, { maxShots: 11, delay: 420, untilOverlay: false });
    await sleep(800);
    const mid = await cdp.evaluate(`({
      you: document.querySelector('#you-fleet').textContent,
      foe: document.querySelector('#foe-fleet').textContent,
      over: !document.querySelector('#overlay').hidden
    })`);
    console.log('  после 11 выстрелов:', mid.you, '/', mid.foe, mid.over ? '(бой окончен)' : '');
    await cdp.shot(join(SCREENS, 'mobile-02-battle.png'));

    /* Доигрываем до победы — на карточке красивее «Победа!», чем сдача.
       Проиграли — жмём «Ещё бой» и пробуем снова (бот на «Легко» слабый). */
    console.log('  доигрываю бой до победы…');
    const result = await playToWin(cdp, 3);
    await cdp.shot(join(SCREENS, 'mobile-03-result.png'));

    await cdp.evaluate(`document.querySelector('#btn-menu').click()`);
    await cdp.waitFor(`document.querySelector('#screen-menu').classList.contains('is-active')`);
    await sleep(3400); // даём уйти тосту о достижении
    await cdp.shot(join(SCREENS, 'mobile-04-menu.png'));

    await cdp.evaluate(`document.querySelector('#btn-achievements').click()`);
    await sleep(650);
    await cdp.shot(join(SCREENS, 'mobile-05-achievements.png'));
    await cdp.evaluate(`document.querySelector('#btn-ach-close').click()`);
    await sleep(450);

    await cdp.evaluate(`document.querySelector('#btn-rules').click()`);
    await sleep(650);
    await cdp.shot(join(SCREENS, 'mobile-06-rules.png'));
  } finally {
    cdp.ws.close();
  }
}

/* Десктоп: если экран выше 900 px, слегка уменьшаем масштаб страницы —
   иначе на скриншоте обрезаются нижние кнопки. */
async function fitDesktop(cdp) {
  await cdp.evaluate(`(() => {
    const doc = document.scrollingElement;
    window.scrollTo(0, 0);
    document.documentElement.style.zoom = '';
    const fit = Math.min(1, window.innerHeight / Math.max(doc.scrollHeight, 1));
    document.documentElement.style.zoom = fit < 0.97 ? fit.toFixed(3) : '';
    window.scrollTo(0, 0);
    return fit;
  })()`);
  await sleep(250);
  await cdp.evaluate(`window.scrollTo(0, 0)`);
}

async function desktopScreens(profileDir) {
  const cdp = await openTab(profileDir, BASE + '/index.html', { ...DESKTOP, mobile: false }, { reducedMotion: true });
  try {
    await cdp.waitFor(`document.readyState === 'complete' && document.querySelector('#btn-play')`);
    await cdp.evaluate(profileScript(1524));
    await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.waitFor(`document.querySelector('#rating-value').textContent === '1524'`);
    await sleep(900);

    console.log('Десктопные скриншоты 1600×900:');
    await fitDesktop(cdp);
    await cdp.shot(join(SCREENS, 'desktop-01-menu.png'));

    await cdp.evaluate(`document.querySelector('#btn-setup').click(); document.querySelector('#btn-setup-go').click()`);
    await cdp.waitFor(`document.querySelector('#screen-place').classList.contains('is-active')`);
    await cdp.evaluate(`document.querySelector('#btn-random').click()`);
    await sleep(500);
    await cdp.evaluate(`document.querySelector('#btn-ready').click()`);
    await cdp.waitFor(`document.querySelector('#screen-battle').classList.contains('is-active')`);
    await autoPlay(cdp, { maxShots: 12, delay: 400, untilOverlay: false });
    await sleep(900);
    await fitDesktop(cdp);
    await cdp.shot(join(SCREENS, 'desktop-02-battle.png'));
  } finally {
    cdp.ws.close();
  }
}

async function renderCovers(profileDir) {
  console.log('Обложка и hero:');
  for (const [w, h, file] of [[800, 470, 'cover-800x470.png'], [1560, 520, 'hero-1560x520.png']]) {
    const cdp = await openTab(profileDir, `${BASE}/__cover?w=${w}&h=${h}`, { w, h, dsf: 1 });
    try {
      await cdp.waitFor(`document.readyState === 'complete'`);
      await cdp.evaluate(`document.fonts.ready.then(() => true)`);
      await sleep(400);
      await cdp.shot(join(OUT, file), { x: 0, y: 0, width: w, height: h });
    } finally {
      cdp.ws.close();
    }
  }
}

/* ---------- видео ---------- */

async function recordVideo(profileDir, { w, h, mobile, file }) {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });

  const cdp = await openTab(profileDir, BASE + '/index.html', { w, h, dsf: 1, mobile });
  const frames = [];

  cdp.on('Page.screencastFrame', async (params) => {
    frames.push({ t: params.metadata.timestamp, data: params.data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
    } catch (_e) { /* вкладку уже закрыли */ }
  });

  try {
    await cdp.send('Page.bringToFront');
    await cdp.waitFor(`document.readyState === 'complete' && document.querySelector('#btn-play')`);
    await cdp.evaluate(profileScript(1524, 'on'));
    await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.waitFor(`document.querySelector('#rating-value').textContent === '1524'`);
    await sleep(500);

    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 88,
      maxWidth: w,
      maxHeight: h
    });

    await sleep(1400);
    await cdp.evaluate(`document.querySelector('#btn-setup').click(); document.querySelector('#btn-setup-go').click()`);
    await cdp.waitFor(`document.querySelector('#screen-place').classList.contains('is-active')`);
    await sleep(800);
    await cdp.evaluate(`document.querySelector('#btn-random').click()`);
    await sleep(1000);
    await cdp.evaluate(`document.querySelector('#btn-ready').click()`);
    await cdp.waitFor(`document.querySelector('#screen-battle').classList.contains('is-active')`);

    await autoPlay(cdp, { maxShots: 200, delay: 600, seconds: VIDEO_SECONDS });
    await sleep(900);
    await cdp.send('Page.stopScreencast');
    await sleep(300);
  } finally {
    cdp.ws.close();
  }

  if (frames.length < 2) throw new Error('Не удалось записать кадры видео');

  const manifest = [];
  for (let i = 0; i < frames.length; i++) {
    const name = `f${String(i).padStart(4, '0')}.jpg`;
    await writeFile(join(FRAMES, name), Buffer.from(frames[i].data, 'base64'));
    manifest.push({ url: `/__frames/${name}`, t: frames[i].t });
  }
  console.log(`  кадров: ${frames.length}, ${(frames[frames.length - 1].t - frames[0].t).toFixed(1)} с`);

  const rec = await openTab(profileDir, BASE + '/__rec', { w, h, dsf: 1 });
  let result;
  try {
    await rec.waitFor(`typeof window.startRecording === 'function'`);
    result = await rec.evaluate(`window.startRecording(${JSON.stringify(manifest)}, ${VIDEO_BPS})`);
  } finally {
    rec.ws.close();
  }
  if (!result || !result.size) throw new Error('MediaRecorder не отдал видео');

  await writeFile(file, Buffer.from(result.b64, 'base64'));
  const kbps = Math.round(result.size * 8 / Math.max(result.duration, 1) / 1000);
  console.log('  ✓', file.replace(OUT + '\\', ''), (result.size / 1024 / 1024).toFixed(2) + ' МБ',
    kbps + ' кбит/с, ' + result.duration.toFixed(1) + ' с');
  if (kbps > 400) console.warn('  ! битрейт выше 400 кбит/с — платформа может не принять');
  if (result.duration > 28) console.warn('  ! видео длиннее 28 с');

  await rm(FRAMES, { recursive: true, force: true });
}

/* ---------- сборка промо-папки ---------- */

async function main() {
  if (!existsSync(ROOT) || !NO_BUILD) {
    console.log('Собираю сборку для Яндекс Игр…');
    const build = spawnSync(process.execPath, ['scripts/build-yandex.mjs'], { stdio: 'inherit' });
    if (build.status !== 0) throw new Error('Сборка dist/yandex упала');
  }
  if (!existsSync(join(ROOT, 'index.html'))) throw new Error('Нет dist/yandex/index.html');

  await mkdir(SCREENS, { recursive: true });
  await mkdir(VIDEO, { recursive: true });

  const server = await startServer();
  const profileDir = join(tmpdir(), 'seabattle-promo-' + Date.now());
  const browser = spawn(findBrowser(), [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-gpu',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    `--window-size=${VIDEO_LANDSCAPE.w},${VIDEO_LANDSCAPE.h}`
  ], { stdio: 'ignore' });

  try {
    let version = null;
    for (let i = 0; i < 120 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      } catch (_e) {
        await sleep(100);
      }
    }
    if (!version) throw new Error('Chrome не запустился');

    await copyFile(resolve('assets/icon-512.png'), join(OUT, 'icon-512.png'));
    console.log('Иконка: icon-512.png (512×512)');

    await renderCovers(profileDir);
    await mobileScreens(profileDir);
    await desktopScreens(profileDir);

    if (!NO_VIDEO) {
      console.log('Записываю видео 16:9 (обязательное поле)…');
      await recordVideo(profileDir, { ...VIDEO_LANDSCAPE, mobile: false, file: join(VIDEO, 'seabattle-16x9.mp4') });
      console.log('Записываю видео 9:16 (необязательное)…');
      await recordVideo(profileDir, { ...VIDEO_PORTRAIT, mobile: true, file: join(VIDEO, 'seabattle-9x16.mp4') });
    }

    // документация: тексты полей и пошаговая инструкция
    if (existsSync(DOCS)) {
      for (const name of await readdir(DOCS)) {
        if (!name.endsWith('.md')) continue;
        await copyFile(join(DOCS, name), join(OUT, name));
      }
    }

    // архив игры — в ту же папку, чтобы всё для консоли лежало вместе
    const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
    const zipName = 'seabattle-yandex-' + pkg.version + '.zip';
    const zip = resolve('dist', zipName);
    if (existsSync(zip)) {
      for (const name of await readdir(OUT)) {
        if (/^seabattle-yandex-.*\.zip$/.test(name) && name !== zipName) {
          await rm(join(OUT, name), { force: true });
        }
      }
      await copyFile(zip, join(OUT, zipName));
      console.log('Архив игры: ' + zipName);
    } else {
      console.warn('! Нет ' + zip + ' — архив в промо-папку не попал');
    }

    console.log('\nГотово. Промоматериалы в', OUT);
    for (const name of await readdir(OUT)) {
      if (name === '.frames') continue;
      console.log('  ', name);
    }
  } finally {
    try { browser.kill(); } catch (_e) { /* ignore */ }
    server.close();
    await sleep(300);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('\nОшибка:', err.message);
  process.exitCode = 1;
});
