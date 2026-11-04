import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'yandex');

// сборка детерминированная и быстрая: собираем один раз на весь файл
execFileSync(process.execPath, [path.join(root, 'scripts', 'build-yandex.mjs')], { cwd: root });

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(out, 'js', 'app.js'), 'utf8');

/* Читает имена файлов из центрального каталога zip. */
function zipNames(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'в архиве нет EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(offset), 0x02014b50, 'битый заголовок в архиве');
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

test('Яндекс Игры: страница без внешних ресурсов и PWA', () => {
  assert.match(html, /<script src="\/sdk\.js"><\/script>/);
  assert.match(html, /js\/yandex\.js/);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  assert.doesNotMatch(html, /manifest/);
  assert.doesNotMatch(html, /js\/online\.js/);
  assert.doesNotMatch(html, /screen-online/);
  assert.doesNotMatch(html, /ios-install/);
  assert.doesNotMatch(html, /(src|href)=["']https?:/);
  assert.match(html, /js\/music\.js/);
});

test('Яндекс Игры: музыка в сборке и архиве', () => {
  assert.ok(fs.existsSync(path.join(out, 'js', 'music.js')), 'нет js/music.js');
  assert.doesNotMatch(app, /assets\/music/);
});

test('Яндекс Игры: локальные шрифты подключены', () => {
  assert.match(html, /assets\/fonts\/fonts\.css/);
  for (const file of ['nunito-cyrillic.woff2', 'nunito-latin.woff2', 'rubik-cyrillic.woff2', 'rubik-latin.woff2']) {
    assert.ok(fs.existsSync(path.join(out, 'assets', 'fonts', file)), 'нет шрифта ' + file);
  }
});

test('Яндекс Игры: онлайн вырезан из кода', () => {
  assert.doesNotMatch(app, /serviceWorker/);
  assert.doesNotMatch(app, /\$\('#btn-online'\)/);
  assert.doesNotMatch(app, /id: 'online'/);
  assert.ok(!fs.existsSync(path.join(out, 'js', 'online.js')), 'онлайн-клиент попал в сборку');
});

test('Яндекс Игры: хуки платформы на месте', () => {
  assert.match(app, /window\.YandexGame/);
  assert.match(app, /YG\.ready\(\)/);
  assert.match(app, /YG\.gameplayStart\(\)/);
  assert.match(app, /YG\.gameplayStop\(\)/);
  assert.match(app, /showRewarded\(\)/);
  assert.match(app, /showInterstitialBetweenMatches/);
  assert.match(html, /id="btn-bonus"/);
});

test('Яндекс Игры: index.html лежит в корне, имена файлов без пробелов', () => {
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [path.relative(out, full)];
  });
  for (const rel of walk(out)) {
    assert.doesNotMatch(rel, /\s/, 'пробел в имени файла: ' + rel);
    assert.match(rel, /^[\x20-\x7E]+$/, 'не-ASCII символ в имени файла: ' + rel);
  }
});

test('Яндекс Игры: zip с прямыми слэшами и index.html в корне', () => {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const zip = path.join(root, 'dist', 'seabattle-yandex-' + version + '.zip');
  assert.ok(fs.existsSync(zip), 'архив не собрался');

  const names = zipNames(fs.readFileSync(zip));
  assert.ok(names.includes('index.html'));
  assert.ok(names.includes('js/yandex.js'));
  assert.ok(!names.includes('js/online.js'));
  for (const name of names) {
    assert.doesNotMatch(name, /\\/, 'обратный слэш в архиве: ' + name);
    assert.doesNotMatch(name, /\s/, 'пробел в имени файла: ' + name);
  }
});
