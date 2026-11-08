/* Дешёвый браузерный драйвер: Chrome DevTools Protocol без зависимостей.
   Заменяет BrowserMCP: один запуск = целая серия действий, на выходе только короткий JSON.

   Подготовка (один раз): профиль C:\ChromeCDP и ярлык «Chrome (автоматизация)».
     & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
       --remote-debugging-port=9222 --user-data-dir="C:\ChromeCDP"
   Chrome 136+ игнорирует порт отладки на основном профиле (защита куки),
   поэтому нужен отдельный user-data-dir. Сессия Kwork в этом профиле уже есть.

   Запуск:  node scripts/cdp.mjs <plan.json>
            node scripts/cdp.mjs --tabs
   Порт: env CDP_PORT, по умолчанию 9222.

   План — JSON:
   {
     "port": 9222,
     "use": "kwork.ru",            // подстрока URL существующей вкладки (опционально)
     "steps": [
       { "goto": "https://kwork.ru/projects?c=41", "wait": 2500 },
       { "eval": "document.title" },
       { "focus": "#editor-title" },
       { "type": "Внесу правки на сайт" },
       { "hotkey": "Control+a" },
       { "key": "Enter" },
       { "click": "button.kw-button--green", "wait": 3000 },
       { "shot": "docs/tmp/1.png" },
       { "wait": 500 }
     ]
   }
   Шаги: goto, wait, eval, click, focus, type, key, hotkey, shot, scroll, text, html.
   Результат каждого eval печатается строкой, обрезается до 900 символов. */
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PORT = Number(process.env.CDP_PORT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = (port) => `http://127.0.0.1:${port}`;

const clip = (v, n = 900) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + `…[+${s.length - n}]` : String(s);
};

async function targets(port) {
  const r = await fetch(`${base(port)}/json/list`);
  return r.json();
}

async function openTab(port, url) {
  try {
    const r = await fetch(`${base(port)}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (r.ok) return r.json();
  } catch (_e) { /* старые версии Chrome — POST */ }
  const r2 = await fetch(`${base(port)}/json/new?${encodeURIComponent(url)}`);
  return r2.json();
}

class Session {
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
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    return new Session(ws);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text || 'eval failed');
    }
    return r.result ? r.result.value : undefined;
  }
  async point(selector) {
    const raw = await this.eval(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      e.scrollIntoView({ block: 'center', inline: 'center' });
      const b = e.getBoundingClientRect();
      return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height });
    })()`);
    return raw ? JSON.parse(raw) : null;
  }
  async click(selector) {
    const p = await this.point(selector);
    if (!p) throw new Error(`нет элемента: ${selector}`);
    const pt = { x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pt });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pt });
    return { x: pt.x, y: pt.y };
  }
  async type(text) {
    await this.send('Input.insertText', { text });
    return text.length;
  }
  async key(spec) {
    const map = {
      Enter: { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
      Tab: { code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9 },
      Escape: { code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 },
      Backspace: { code: 'Backspace', key: 'Backspace', windowsVirtualKeyCode: 8 },
      ArrowDown: { code: 'ArrowDown', key: 'ArrowDown', windowsVirtualKeyCode: 40 },
      ArrowUp: { code: 'ArrowUp', key: 'ArrowUp', windowsVirtualKeyCode: 38 }
    };
    const k = map[spec];
    if (!k) throw new Error(`неизвестная клавиша: ${spec}`);
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code: k.code, key: k.key, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
    return spec;
  }
  async hotkey(spec) {
    const [mod, key] = spec.split('+');
    const keyMap = { a: { code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65 }, c: { code: 'KeyC', key: 'c', windowsVirtualKeyCode: 67 }, v: { code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 } };
    if (mod !== 'Control' || !keyMap[key]) throw new Error(`только Control+a/c/v: ${spec}`);
    const k = keyMap[key];
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, ...k });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, code: k.code, key: k.key, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
    return spec;
  }
  close() { try { this.ws.close(); } catch (_e) {} }
}

function readPlan() {
  const arg = process.argv[2];
  if (!arg) throw new Error('укажи путь к plan.json');
  const plan = JSON.parse(readFileSync(arg, 'utf8'));
  return plan;
}

async function main() {
  if (process.argv[2] === '--tabs') {
    const port = PORT || 9222;
    const list = await targets(port);
    console.log(list.filter((t) => t.type === 'page').map((t) => `${t.url}`).join('\n'));
    return;
  }

  const plan = readPlan();
  const port = plan.port || PORT || 9222;

  let tab;
  const list = await targets(port);
  const pages = list.filter((t) => t.type === 'page');
  if (plan.use) tab = pages.find((t) => t.url.includes(plan.use));
  if (!tab) tab = pages[0];
  if (!tab) tab = await openTab(port, 'about:blank');

  const s = await Session.connect(tab.webSocketDebuggerUrl);
  await s.send('Page.enable');
  await s.send('Runtime.enable');

  for (const step of plan.steps || []) {
    try {
      if (step.goto) {
        await s.send('Page.navigate', { url: step.goto });
      } else if (step.eval !== undefined) {
        const v = await s.eval(step.eval);
        console.log('· ' + clip(v));
      } else if (step.text !== undefined) {
        const t = await s.eval('document.body.innerText');
        const i = step.text ? String(t).indexOf(step.text) : 0;
        console.log('· ' + clip(i >= 0 ? String(t).slice(i, i + (step.len || 600)) : ''));
        continue;
      } else if (step.html !== undefined) {
        console.log('· ' + clip(await s.eval('document.documentElement.outerHTML')));
      } else if (step.click) {
        const p = await s.click(step.click);
        console.log(`· click ${step.click} @${p.x},${p.y}`);
      } else if (step.focus) {
        await s.eval(`(() => { const e = document.querySelector(${JSON.stringify(step.focus)}); if (!e) throw new Error('нет элемента'); e.focus(); })()`);
        console.log(`· focus ${step.focus}`);
      } else if (step.type !== undefined) {
        console.log(`· type ${await s.type(step.type)} симв.`);
      } else if (step.key) {
        console.log(`· key ${await s.key(step.key)}`);
      } else if (step.hotkey) {
        console.log(`· hotkey ${await s.hotkey(step.hotkey)}`);
      } else if (step.scroll !== undefined) {
        await s.eval(`window.scrollTo(0, ${Number(step.scroll) || 0})`);
      } else if (step.shot) {
        const out = resolve(step.shot);
        await mkdir(dirname(out), { recursive: true });
        if (step.w || step.h) {
          await s.send('Emulation.setDeviceMetricsOverride', {
            width: step.w || 1280, height: step.h || 1000,
            deviceScaleFactor: step.dsf || 1, mobile: !!step.mobile
          });
        }
        const shot = await s.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
        await writeFile(out, Buffer.from(shot.data, 'base64'));
        console.log(`· shot ${out}`);
        if (step.w || step.h) await s.send('Emulation.clearDeviceMetricsOverride');
      }
      if (step.wait) await sleep(step.wait);
    } catch (e) {
      console.log(`✗ ${clip(e.message, 300)}`);
      if (step.stopOnError) break;
    }
  }

  console.log(`· url ${(await s.eval('location.href').catch(() => '?'))}`);
  s.close();
}

main().catch((e) => {
  console.error('✗ ' + e.message);
  process.exit(1);
});
