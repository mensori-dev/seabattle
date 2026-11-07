/* Один кадр визитки mensoridev: десктоп и мобильный.
   Запуск: node scripts/shot-kwork-site.mjs [url]
   Требует локальный сервер: npm run dev (или PORT=5200 node scripts/serve.mjs) */
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:5200/site/services/index.html';
const OUT = 'docs/kwork';
const PORT = 9345;
const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean).find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (_e) { /* ещё не поднялся */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools не отвечает');
}

const wsUrl = await run();
async function run() {
  await mkdir(OUT, { recursive: true });
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(tmpdir(), 'sb-shot-' + Date.now())}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const ws = new WebSocket(await connect());
  await new Promise((r) => { ws.onopen = r; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const shots = [
    { name: 'services-desktop.png', width: 1280, height: 1000, mobile: false, dsf: 1 },
    { name: 'services-mobile.png', width: 390, height: 844, mobile: true, dsf: 2 }
  ];

  for (const s of shots) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: s.width, height: s.height, deviceScaleFactor: s.dsf, mobile: s.mobile
    });
    await send('Page.navigate', { url: URL_ });
    await sleep(1200);
    const metrics = await send('Runtime.evaluate', {
      expression: `JSON.stringify({cw:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth,h:document.body.scrollHeight})`,
      returnByValue: true
    });
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(join(OUT, s.name), Buffer.from(shot.data, 'base64'));
    console.log(s.name, metrics.result.value);
  }

  ws.close();
  proc.kill();
  return 'done';
}
