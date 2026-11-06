/* GamePush: альбомное видео 1920×1080, ≤20 с, без полос.
   Сборка dist/gamepush должна быть демо-сборкой без SDK. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'dist', 'gamepush');
const outDir = path.join(root, 'dist', 'gamepush-video-landscape');
const shotsDir = path.join(outDir, 'shots');
const framesDir = path.join(outDir, 'frames');
const PORT = 9337;
const W = 960;
const H = 540;
const DSF = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const list = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].filter(Boolean);
  for (const p of list) if (fs.existsSync(p)) return p;
  throw new Error('Не найден Chrome/Edge. Задай CHROME_PATH.');
}

function serve(dir) {
  const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2'
  };
  const server = http.createServer((req, res) => {
    let name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (name === '/') name = '/index.html';
    const file = path.normalize(path.join(dir, name));
    if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
    return r.result.value;
  }
  async waitText(text, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(`document.body.innerText.includes(${JSON.stringify(text)})`)) return;
      await sleep(120);
    }
    throw new Error('Не дождался текста: ' + text);
  }
  async waitFor(expression, label, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(`!!(${expression})`)) return;
      await sleep(120);
    }
    throw new Error('Не дождался: ' + label);
  }
}

async function pageTarget(port, url) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (page) return page;
    } catch (_e) { /* ещё не поднялся */ }
    await sleep(150);
  }
  throw new Error('Chrome не открыл страницу');
}

async function capture(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

const profile = {
  name: 'Капитан Шторм', rating: 1524, games: 87, wins: 56, losses: 31,
  best: 1631, streak: 4, history: [],
  muted: true, volume: 0, music: false, musicVolume: 0, musicTrack: 'pirate',
  motion: 'on', bubbles: true, theme: 'dark', difficulty: 'normal',
  fleet: 'admiral', botConfig: { size: 10, fleet: 'admiral', tactics: true },
  lobby: { size: 10, fleet: 'admiral', tactics: true },
  loadout: ['airstrike', 'smoke'], daily: { date: '', streak: 0 },
  achievements: {}, stats: { shots: 1234, hits: 678 },
  onlineWins: 0, onlineGames: 0, cup: null, cupReward: '', adMatches: 0, lastAdAt: 0, adBonusDate: ''
};

async function passPrepare(cdp, shotsDir) {
  await cdp.waitFor(
    'document.querySelector("#screen-prepare.is-active") || document.querySelector("#screen-battle.is-active")',
    'подготовка или бой'
  );
  const inPrepare = await cdp.eval('!!document.querySelector("#screen-prepare.is-active")');
  if (!inPrepare) return;

  const cards = await cdp.eval(
    `[...document.querySelectorAll('.prep-card')].map((c) => ({ id: c.dataset.ability, on: c.classList.contains('is-on') }))`
  );
  const wanted = (id) => id === 'airstrike' || id === 'smoke';
  // Сначала снимаем лишние карточки, потом добираем нужные: иначе третий
  // выбор может сбросить один из уже выбранных.
  for (const card of cards) {
    if (!wanted(card.id) && card.on) {
      await cdp.eval(`document.querySelector('.prep-card[data-ability="${card.id}"]').click()`);
      await sleep(120);
    }
  }
  for (const card of cards) {
    if (wanted(card.id) && !card.on) {
      await cdp.eval(`document.querySelector('.prep-card[data-ability="${card.id}"]').click()`);
      await sleep(120);
    }
  }
  await sleep(250);
  await capture(cdp, path.join(shotsDir, '03-prepare-1200x600.png'));
  await cdp.eval(`document.querySelector('#btn-prep-go').click()`);
  await cdp.waitFor('document.querySelector("#screen-battle.is-active")', 'экран боя');
}

async function main() {
  if (!fs.existsSync(path.join(appDir, 'index.html'))) throw new Error('Нет dist/gamepush. Сначала npm run gamepush:demo -- --no-zip');
  for (const d of [outDir, shotsDir, framesDir]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }

  const server = await serve(appDir);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-vk-'));
  const chrome = spawn(findChrome(), [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    '--hide-scrollbars', '--disable-gpu', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    `--window-size=${W},${H}`, url
  ], { stdio: 'ignore' });

  try {
    const page = await pageTarget(PORT, url);
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: DSF, mobile: false
    });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });

    await cdp.eval(`localStorage.setItem('seabattle.profile.v2', ${JSON.stringify(JSON.stringify(profile))})`);
    await cdp.send('Page.reload');
    await cdp.waitText('В БОЙ');
    await sleep(700);
    await capture(cdp, path.join(shotsDir, '01-menu-1200x600.png'));

    await cdp.eval(`document.querySelector('#btn-setup').click(); document.querySelector('#btn-setup-go').click()`);
    await cdp.waitText('Расставь флот');
    await sleep(500);
    await cdp.eval(`document.querySelector('#btn-random').click()`);
    await sleep(600);
    await capture(cdp, path.join(shotsDir, '02-placement-1200x600.png'));

    await cdp.eval(`document.querySelector('#btn-ready').click()`);
    await passPrepare(cdp, shotsDir);
    await sleep(900);
    await capture(cdp, path.join(shotsDir, '04-battle-1200x600.png'));

    for (const [x, y] of [[4, 4], [4, 5], [5, 4], [5, 5], [6, 6], [6, 7]]) {
      await cdp.eval(`(() => { const c=[...document.querySelectorAll('#board-enemy .cell')].find(c=>c.dataset.x==='${x}'&&c.dataset.y==='${y}'); if(c) c.click(); })()`);
      await sleep(1250);
    }
    await capture(cdp, path.join(shotsDir, '05-battle-shots-1200x600.png'));

    await cdp.eval(`window.scrollTo(0,0)`);
    await cdp.eval(`document.querySelector('#btn-rules') && document.querySelector('#btn-rules').click()`);
    await sleep(600);
    const overlay = await cdp.eval(`!!document.querySelector('#overlay:not([hidden])')`);
    if (overlay) {
      await capture(cdp, path.join(shotsDir, '06-rules-1200x600.png'));
      await cdp.eval(`document.querySelector('#overlay .overlay-close') && document.querySelector('#overlay .overlay-close').click()`);
      await sleep(300);
    }

    /* Видео: тот же путь, но с записью кадров. */
    await cdp.send('Page.reload');
    await cdp.waitText('В БОЙ');
    await sleep(1200);
    const started = Date.now();
    let frames = 0;
    let recording = true;
    const rec = (async () => {
      while (recording) {
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
        frames += 1;
        fs.writeFileSync(path.join(framesDir, 'frame-' + String(frames).padStart(5, '0') + '.jpg'), Buffer.from(r.data, 'base64'));
        await sleep(60);
      }
    })();

    await sleep(1600);
    await cdp.eval(`document.querySelector('#btn-setup').click(); document.querySelector('#btn-setup-go').click()`);
    await sleep(2200);
    await cdp.eval(`document.querySelector('#btn-random').click()`);
    await sleep(2200);
    await cdp.eval(`document.querySelector('#btn-ready').click()`);
    await passPrepare(cdp, shotsDir);
    await sleep(900);
    for (const [x, y] of [[3, 3], [4, 3], [4, 4], [5, 4], [5, 5], [6, 5], [6, 6]]) {
      await cdp.eval(`(() => { const c=[...document.querySelectorAll('#board-enemy .cell')].find(c=>c.dataset.x==='${x}'&&c.dataset.y==='${y}'); if(c) c.click(); })()`);
      await sleep(1400);
    }
    recording = false;
    await rec;
    const seconds = (Date.now() - started) / 1000;
    const fps = Math.max(6, Math.min(15, frames / seconds));
    console.log(`Видео: ${frames} кадров за ${seconds.toFixed(1)} с, ${fps.toFixed(1)} fps`);

    const ffmpeg = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
    const mp4 = path.join(outDir, 'video-landscape-1920x1080.mp4');
    execFileSync(ffmpeg, [
      '-y', '-framerate', fps.toFixed(2), '-i', path.join(framesDir, 'frame-%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an', mp4
    ], { stdio: 'inherit' });
    console.log('Готово:', mp4);
  } finally {
    // Сначала гасим всё дерево процессов Chrome, иначе Windows не даст
    // удалить временный профиль и ошибка очистки замаскирует основную.
    try { chrome.kill(); } catch (_e) { /* ignore */ }
    if (process.platform === 'win32' && chrome.pid) {
      try { execFileSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_e) { /* ignore */ }
    }
    try { server.close(); } catch (_e) { /* ignore */ }
    await sleep(600);
    try {
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      console.warn('Не удалось удалить временный профиль:', e.message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
