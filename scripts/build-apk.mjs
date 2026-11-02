// Собирает APK/AAB для раздачи и магазинов: www → cap sync → gradle → dist/
//
//   node scripts/build-apk.mjs           # подписанный release APK + AAB
//   node scripts/build-apk.mjs --apk     # только APK (быстрее)
//   node scripts/build-apk.mjs --debug   # debug APK для локальных проверок
//
// Важно: раздавать друзьям можно только release-сборку. Debug-APK подписан
// другим ключом и не ставится поверх release-версии (Android откажет).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const distDir = path.join(root, 'dist');
const args = process.argv.slice(2);
const debug = args.includes('--debug');
const apkOnly = args.includes('--apk');

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

function run(cmd, args, cwd, useShell) {
  console.log(`\n→ ${cmd} ${args.join(' ')}`);
  const shell = typeof useShell === 'boolean' ? useShell : process.platform === 'win32';
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env, shell });
  if (res.status !== 0) {
    console.error(`\n✖ команда завершилась с кодом ${res.status}`);
    process.exit(res.status || 1);
  }
}

function gradleValue(name) {
  const file = path.join(androidDir, 'app', 'build.gradle');
  const text = fs.readFileSync(file, 'utf8');
  const m = name === 'versionName'
    ? text.match(/versionName\s+["']([^"']+)["']/)
    : text.match(new RegExp(name + '\\s+(\\d+)'));
  return m ? m[1] : '0.0.0';
}

function copy(from, to) {
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(from, to);
  const mb = (fs.statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(`✔ ${to} (${mb} МБ)`);
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

run(process.execPath, [path.join(root, 'scripts', 'build-www.mjs')], root, false);
run('npx', ['cap', 'sync', 'android'], root);

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

if (debug) {
  run(gradlew, ['assembleDebug'], androidDir);
  const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error('APK не найден после сборки: ' + apk);
  copy(apk, path.join(distDir, 'seabattle-debug.apk'));
  console.log('\n⚠ Debug-APK не ставится поверх release-версии — только для локальных тестов.');
  process.exit(0);
}

if (!fs.existsSync(path.join(androidDir, 'keystore.properties'))) {
  throw new Error('Нет android/keystore.properties — release-сборка не подпишется');
}

run(gradlew, apkOnly ? ['assembleRelease'] : ['assembleRelease', 'bundleRelease'], androidDir);

const version = gradleValue('versionName');
const code = gradleValue('versionCode');
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const aab = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

console.log(`\nВерсия ${version} (versionCode ${code}), подпись — release keystore.`);
if (!fs.existsSync(apk)) throw new Error('APK не найден после сборки: ' + apk);
copy(apk, path.join(distDir, `seabattle-${version}-release.apk`));
if (!apkOnly) {
  if (!fs.existsSync(aab)) throw new Error('AAB не найден после сборки: ' + aab);
  copy(aab, path.join(distDir, `seabattle-${version}-release.aab`));
}
