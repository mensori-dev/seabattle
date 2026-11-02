// Собирает debug APK одной командой: www → cap sync → gradle → dist/
// Использование: node scripts/build-apk.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const distDir = path.join(root, 'dist');

function firstExisting(paths) {
  return paths.find((p) => p && fs.existsSync(p)) || null;
}

function findJdk() {
  const fromEnv = process.env.JAVA_HOME;
  const bases = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft'];
  const found = [];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      if (/jdk-?21/i.test(name)) found.push(path.join(base, name));
    }
  }
  if (fromEnv && /jdk-?21|jdk-?2[2-9]/i.test(fromEnv)) found.unshift(fromEnv);
  return found[0] || fromEnv || null;
}

function findSdk() {
  return firstExisting([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'C:\\Android\\sdk']);
}

function run(cmd, args, cwd) {
  console.log(`\n→ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error(`\n✖ команда завершилась с кодом ${res.status}`);
    process.exit(res.status || 1);
  }
}

const jdk = findJdk();
const sdk = findSdk();
if (!jdk) throw new Error('Не найден JDK 21. Установи: winget install EclipseAdoptium.Temurin.21.JDK');
if (!sdk) throw new Error('Не найден Android SDK. Установи cmdline-tools и пакеты platform 36 / build-tools 36');

process.env.JAVA_HOME = jdk;
process.env.ANDROID_HOME = sdk;
process.env.ANDROID_SDK_ROOT = sdk;
process.env.Path = [
  path.join(jdk, 'bin'),
  path.join(sdk, 'platform-tools'),
  process.env.Path || ''
].join(path.delimiter);

console.log('JDK:', jdk);
console.log('SDK:', sdk);

run(process.execPath, [path.join(root, 'scripts', 'build-www.mjs')], root);
run('npx', ['cap', 'sync', 'android'], root);

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], androidDir);

const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(apk)) throw new Error('APK не найден после сборки: ' + apk);

fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, 'seabattle-debug.apk');
fs.copyFileSync(apk, out);
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ Готово: ${out} (${mb} МБ)`);
