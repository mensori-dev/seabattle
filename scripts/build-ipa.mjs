// Собирает IPA в GitHub Actions (macOS) и складывает его в dist/ и OneDrive.
//
//   npm run ios:ipa
//
// Нужен установленный и авторизованный GitHub CLI (`gh auth status`).
// Сборка без подписи Apple: файл ставится через AltStore/Sideloadly,
// для обычной установки нужен Apple Developer Account и подпись.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const workflow = 'ios-ipa.yml';
const artifact = 'seabattle-ipa';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    ...opts
  });
}

function must(res, what, hint) {
  if (!res || res.status !== 0) {
    if (res && res.stdout) process.stderr.write(res.stdout);
    if (res && res.stderr) process.stderr.write(res.stderr);
    const code = res ? res.status : '?';
    throw new Error(`${what}: код ${code}${hint ? '\n' + hint : ''}`);
  }
  return res;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const which = run('gh', ['--version']);
if (which.error || which.status !== 0) {
  throw new Error('GitHub CLI не найден. Установи gh и выполни: gh auth login');
}
const auth = run('gh', ['auth', 'status']);
if (auth.status !== 0) {
  throw new Error('GitHub CLI не авторизован. Выполни: gh auth login');
}

// Workflow запускается на удалённый main, поэтому и сравнивать нужно с ним.
const branch = must(run('git', ['branch', '--show-current']), 'git branch').stdout.trim();
if (branch !== 'main') {
  throw new Error(`Сейчас ветка "${branch}", а workflow собирает main. Переключись на main.`);
}
const dirty = must(run('git', ['status', '--porcelain']), 'git status').stdout.trim();
if (dirty) {
  throw new Error('В рабочем дереве есть незакоммиченные изменения — запушь их перед сборкой IPA.');
}
must(run('git', ['fetch', 'origin', 'main']), 'git fetch origin main');
const head = must(run('git', ['rev-parse', 'HEAD']), 'git rev-parse HEAD').stdout.trim();
const remote = must(run('git', ['rev-parse', 'origin/main']), 'git rev-parse origin/main').stdout.trim();
if (head !== remote) {
  throw new Error('HEAD не совпадает с origin/main — сначала сделай git push.');
}

const startedAt = Date.now();
console.log(`→ gh workflow run ${workflow}`);
must(run('gh', ['workflow', 'run', workflow, '--ref', 'main']), 'запуск workflow');

// macOS-раннеры иногда стоят в очереди: ждём до 5 минут появления запуска.
let ghRun = null;
for (let i = 0; i < 75 && !ghRun; i += 1) {
  await sleep(4000);
  const res = run('gh', [
    'run', 'list',
    '--workflow', workflow,
    '--limit', '10',
    '--json', 'databaseId,createdAt,headSha,status,conclusion,url'
  ]);
  if (res.status !== 0) continue;
  const runs = JSON.parse(res.stdout || '[]');
  ghRun = runs
    .filter((r) => r.headSha === head && Date.parse(r.createdAt) >= startedAt - 15000)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
}

if (!ghRun) throw new Error('Не нашёл запуск workflow за 5 минут. Проверь Actions на GitHub.');

console.log(`→ run ${ghRun.databaseId}: ${ghRun.url}`);
const watch = run('gh', ['run', 'watch', String(ghRun.databaseId), '--exit-status', '--interval', '10'], {
  stdio: 'inherit',
  encoding: 'utf8'
});
if (watch.status !== 0) {
  run('gh', ['run', 'view', String(ghRun.databaseId), '--log-failed'], { stdio: 'inherit' });
  throw new Error('Сборка IPA упала — смотри лог выше.');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seabattle-ipa-'));
try {
  console.log('→ gh run download');
  must(run('gh', ['run', 'download', String(ghRun.databaseId), '-n', artifact, '-D', tmp]), 'скачивание артефакта');

  const ipa = findIpa(tmp);
  if (!ipa) throw new Error('В артефакте нет .ipa');

  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const dest = path.join(root, 'dist', `seabattle-${version}-unsigned.ipa`);
  fs.copyFileSync(ipa, dest);

  const oneDriveDir = path.join(os.homedir(), 'OneDrive');
  const oneDrive = path.join(oneDriveDir, `seabattle-${version}-unsigned.ipa`);
  if (fs.existsSync(oneDriveDir)) {
    fs.copyFileSync(dest, oneDrive);
    console.log(`✔ OneDrive: ${oneDrive}`);
  }

  const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
  console.log(`✔ dist: ${dest} (${size} МБ)`);
  console.log('⚠ IPA без подписи Apple: установка через AltStore/Sideloadly, не напрямую.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function findIpa(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findIpa(full);
      if (found) return found;
    } else if (entry.name.toLowerCase().endsWith('.ipa')) {
      return full;
    }
  }
  return null;
}
