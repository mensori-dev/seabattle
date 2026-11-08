/**
 * Ловец заказов на бирже Kwork.
 *
 * Раз в 30 минут открывает список проектов в CDP-Chrome, вытаскивает id и
 * заголовки, сравнивает с уже виденными и печатает только новые.
 * Работает через scripts/cdp.mjs — без зависимостей.
 *
 * Запуск вручную:  node scripts/kwork-watch.mjs
 * Состояние:      %LOCALAPPDATA%\Temp\opencode\kwork-seen.json
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = "C:\\ChromeCDP";
const PORT = 9222;
const STATE = join(tmpdir(), "opencode", "kwork-seen.json");
const PLAN = join(tmpdir(), "opencode", "kwork-watch-plan.json");
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\//, "");

const SEARCH_URL = process.env.KWORK_URL || "https://kwork.ru/projects?c=41";

async function portUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureChrome() {
  if (await portUp()) return true;
  spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "https://kwork.ru/projects?c=41",
  ], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await portUp()) return true;
  }
  return false;
}

function scrape() {
  const plan = {
    steps: [
      { goto: SEARCH_URL, wait: 5000 },
      {
        eval:
          "(()=>{var out=[],seen={};document.querySelectorAll('a[href]').forEach(function(a){" +
          "var h=a.getAttribute('href')||'';if(h.indexOf('/projects/')!==0)return;" +
          "var id=h.slice(h.lastIndexOf('/')+1);if(id.length<6||id.length>8||isNaN(Number(id)))return;" +
          "if(seen[id])return;seen[id]=1;" +
          "var t=(a.innerText||'').trim().replace(/\\s+/g,' ').slice(0,80);" +
          "out.push([id,t])});return JSON.stringify(out)})()",
      },
    ],
  };
  writeFileSync(PLAN, JSON.stringify(plan), "utf8");
  const out = execFileSync(process.execPath, ["scripts/cdp.mjs", PLAN], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000,
  });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("· ["));
  if (!line) return [];
  try {
    return JSON.parse(line.slice(2));
  } catch {
    return [];
  }
}

const main = async () => {
  if (!(await ensureChrome())) {
    console.error("CDP-Chrome не поднялся на порту", PORT);
    process.exit(1);
  }
  const items = scrape();
  if (!items.length) {
    console.error("Пусто: список не распарсился (возможно, разлогин).");
    process.exit(2);
  }
  const state = existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, "utf8"))
    : { seen: [] };
  const seen = new Set(state.seen);
  const fresh = items.filter(([id]) => !seen.has(id));
  items.forEach(([id]) => seen.add(id));
  writeFileSync(
    STATE,
    JSON.stringify({ seen: [...seen].slice(-3000), updated: new Date().toISOString() }),
    "utf8",
  );
  if (!fresh.length) {
    console.log(new Date().toLocaleString("ru-RU"), "новых нет, всего в списке", items.length);
    return;
  }
  console.log(`НОВЫЕ ПРОЕКТЫ (${fresh.length}):`);
  fresh.forEach(([id, t]) => console.log(`https://kwork.ru/projects/${id}/view | ${t}`));
};

main();
