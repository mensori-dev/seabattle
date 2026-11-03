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

function gh(args, opts = {}) {
  return spawnSync('gh', args, {
    cwd: root,
    encoding: 'utf8',
    ...opts
  });
}

function must(res, what) {
  if (res.status !== 0) {
    if (res.stdout) process.stderr.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    throw new Error(`${what}: код ${res.status}`);
  }
  return res;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const auth = gh(['auth', 'status']);
if (auth.status !== 0) {
  throw new Error('GitHub CLI не авторизован. Выполни: gh auth login');
}

const head = must(gh(['rev-parse', 'HEAD']), 'git rev-parse').stdout.trim();
const startedAt = Date.now();

console.log(`→ gh workflow run ${workflow}`);
must(gh(['workflow', 'run', workflow, '--ref', 'main']), 'запуск workflow');

let run = null;
for (let i = 0; i < 30 && !run; i += 1) {
  await sleep(4000);
  const res = gh([
    'run', 'list',
    '--workflow', workflow,
    '--limit', '10',
    '--json', 'databaseId,createdAt,headSha,status,conclusion,url'
  ]);
  if (res.status !== 0) continue;
  const runs = JSON.parse(res.stdout || '[]');
  run = runs
    .filter((r) => r.headSha === head && Date.parse(r.createdAt) >= startedAt - 15000)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
}

if (!run) throw new Error('Не нашёл запуск workflow. Проверь Actions на GitHub.');

console.log(`→ run ${run.databaseId}: ${run.url}`);
const watch = gh(['run', 'watch', String(run.databaseId), '--exit-status', '--interval', '10'], {
  stdio: 'inherit',
  encoding: 'utf8'
});
if (watch.status !== 0) {
  gh(['run', 'view', String(run.databaseId), '--log-failed'], { stdio: 'inherit' });
  throw new Error('Сборка IPA упала — смотри лог выше.');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seabattle-ipa-'));
console.log('→ gh run download');
must(gh(['run', 'download', String(run.databaseId), '-n', artifact, '-D', tmp]), 'скачивание артефакта');

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
