// Собирает версию для Яндекс Игр: dist/yandex + архив dist/seabattle-yandex-<версия>.zip
//
// Отличия от основной игры:
//   • нет онлайна: js/online.js не копируется, вместо него js/yandex.js
//     (там же заглушка window.Online, чтобы старый код не падал);
//   • нет внешних ресурсов: шрифты лежат в assets/fonts, Google Fonts вырезан;
//   • нет PWA: manifest, service worker, иконки и подсказки установки;
//   • подключён SDK Яндекс Игр (/sdk.js), реклама, пауза и LoadingAPI.ready().
//
// Запуск: npm run yandex  |  node scripts/build-yandex.mjs --no-zip
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'yandex');
const noZip = process.argv.includes('--no-zip');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function must(ok, message) {
  if (!ok) throw new Error('сборка Яндекс Игр: ' + message);
}

/* Вырезает [start, end) и оставляет end на месте. */
function cut(text, start, end, what) {
  const a = text.indexOf(start);
  must(a >= 0, 'не нашёл начало блока «' + what + '»');
  const b = text.indexOf(end, a + start.length);
  must(b >= 0, 'не нашёл конец блока «' + what + '»');
  return text.slice(0, a) + text.slice(b);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, data) {
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
}

/* ---------------- index.html ---------------- */
function buildHtml() {
  let s = read('index.html');

  // внешние шрифты и PWA-теги не нужны
  s = s.split('\n').filter((line) => !(
    /fonts\.(googleapis|gstatic)\.com/.test(line) ||
    /rel="manifest"/.test(line) ||
    /apple-touch-(startup-image|icon)/.test(line) ||
    /apple-mobile-web-app/.test(line) ||
    /mobile-web-app-capable/.test(line) ||
    /заставки при запуске с домашнего экрана/.test(line)
  )).join('\n');

  must(!/fonts\.(googleapis|gstatic)\.com/.test(s), 'остались ссылки на Google Fonts');

  const styleTag = '  <link rel="stylesheet" href="style.css">';
  must(s.includes(styleTag), 'не нашёл подключение style.css');
  // в основной игре шрифты уже локальные — не дублируем подключение
  if (!s.includes('assets/fonts/fonts.css')) {
    s = s.replace(styleTag,
      '  <link rel="stylesheet" href="assets/fonts/fonts.css">\n' + styleTag);
  }

  // онлайн: кнопка, экран, ссылка на политику и подсказка установки
  s = cut(s, '        <!-- подсказка только для Safari', '        <a class="privacy-link"', 'подсказка установки на iPhone');
  s = s.replace(/[ \t]*<a class="privacy-link"[\s\S]*?<\/a>\s*\n/, '');
  must(!s.includes('privacy-link'), 'осталась ссылка на политику конфиденциальности');

  s = s.replace(/[ \t]*<button class="btn btn-ghost btn-big btn-online"[\s\S]*?<\/button>\s*\n/, '');
  must(!s.includes('id="btn-online"'), 'осталась кнопка онлайна');

  s = cut(s, '      <!-- ================= ОНЛАЙН', '<!-- ================= ПОДГОТОВКА К БОЮ', 'экран онлайна');
  must(!s.includes('screen-online'), 'остался экран онлайна');

  s = s.replace(
    '14 медалей за победы, точность, онлайн, адмиральский флот и испытание дня',
    '13 медалей за победы, точность, адмиральский флот и испытание дня');
  must(s.includes('13 медалей'), 'не поправил текст про достижения');
  // В сборке на одну медаль меньше: не мигаем чужим «0 / 14» до отрисовки.
  s = s.replace('id="ach-count">0 / 14<', 'id="ach-count">0 / 13<');
  must(s.includes('id="ach-count">0 / 13<'), 'не поправил счётчик достижений');

  // онлайн-комнат в сборке нет — не обещаем их в правилах
  s = s.replace('— против бота и в онлайн-комнате', '— против бота');
  must(!s.includes('в онлайн-комнате'), 'в правилах остался онлайн');

  const onlineScript = '  <script src="js/online.js"></script>';
  must(s.includes(onlineScript), 'не нашёл подключение js/online.js');
  s = s.replace(onlineScript,
    '  <!-- Yandex Games SDK -->\n  <script src="/sdk.js"></script>\n  <script src="js/yandex.js"></script>');

  // RuStore-платежи в Яндекс Играх не нужны: не тащим мёртвый скрипт и кнопки.
  // Перевод строки в рабочем файле — CRLF, поэтому режем регуляркой, а не "\n",
  // и обязательно проверяем результат: иначе вырезание провалится молча.
  s = s.replace(/[ \t]*<script src="js\/rustore\.js"><\/script>\r?\n/, '');
  must(!s.includes('js/rustore.js'), 'остался скрипт RuStore');
  for (const id of ['btn-remove-ads', 'btn-support']) {
    s = s.replace(new RegExp('[ \\t]*<button[^>]*id="' + id + '"[^>]*>[^\\n]*</button>\\r?\\n'), '');
    must(!s.includes('id="' + id + '"'), 'осталась кнопка RuStore: ' + id);
  }

  must(s.includes('/sdk.js'), 'не подключил SDK Яндекс Игр');
  must(s.includes('js/yandex.js'), 'не подключил js/yandex.js');
  must(!s.includes('manifest'), 'остался manifest');
  return s;
}

/* ---------------- js/app.js ---------------- */
function buildApp() {
  let s = read('js/app.js');

  // в архиве Яндекса нет sw.js — регистрация только шумит в консоли
  s = cut(s,
    '  /* PWA: офлайн-режим и установка на домашний экран.',
    '\n})();',
    'service worker');
  must(!s.includes('serviceWorker'), 'осталась регистрация service worker');

  // экрана онлайна в разметке нет — его обработчики обращались бы к null
  s = cut(s,
    "    $('#btn-online').addEventListener('click', () => {",
    "    $('#btn-sound').addEventListener('click', () => {",
    'обработчики онлайна');
  must(!s.includes("$('#btn-online')"), 'остались обработчики онлайна');

  // онлайн-достижение в этой версии недостижимо
  s = s.replace(/[ \t]*\{ id: 'online', icon: '[^']*',[^\n]*\n/, '');
  must(!s.includes("id: 'online'"), 'осталось достижение за онлайн');

  must(s.includes('window.YandexGame'), 'в app.js нет хуков Яндекс Игр');
  return s;
}

/* ---------------- сборка ---------------- */
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

write('index.html', buildHtml());
fs.copyFileSync(path.join(root, 'style.css'), path.join(out, 'style.css'));
fs.mkdirSync(path.join(out, 'js'), { recursive: true });
fs.copyFileSync(path.join(root, 'js', 'engine.js'), path.join(out, 'js', 'engine.js'));
fs.copyFileSync(path.join(root, 'js', 'music.js'), path.join(out, 'js', 'music.js'));
write('js/app.js', buildApp());
fs.copyFileSync(path.join(root, 'js', 'yandex.js'), path.join(out, 'js', 'yandex.js'));

// ассеты: только иконка вкладки и локальные шрифты
const assets = ['favicon-32.png'];
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const file of assets) {
  fs.copyFileSync(path.join(root, 'assets', file), path.join(out, 'assets', file));
}
fs.cpSync(path.join(root, 'assets', 'fonts'), path.join(out, 'assets', 'fonts'), { recursive: true });

// то, без чего игру не примут: index.html в корне и никаких внешних ссылок
const shipped = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else shipped.push(full);
  }
})(out);

const unpacked = shipped.reduce((sum, file) => sum + fs.statSync(file).size, 0);
must(fs.existsSync(path.join(out, 'index.html')), 'в корне сборки нет index.html');
must(unpacked < 100 * 1024 * 1024, 'архив больше 100 МБ');
for (const file of shipped) {
  const rel = path.relative(out, file);
  must(!/[\s]/.test(rel), 'пробел в имени файла: ' + rel);
  must(!/[^\x20-\x7E]/.test(rel), 'не-ASCII символ в имени файла: ' + rel);
}

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
must(!/(src|href)=["']https?:/.test(html), 'в index.html остались внешние ссылки');

console.log('Сборка Яндекс Игр готова →', out);
console.log('  файлов:', shipped.length, '· распаковано:', (unpacked / 1024).toFixed(0), 'КБ');

/* ---------------- архив ---------------- */
/* Compress-Archive в Windows пишет пути с обратными слэшами, а сервер Яндекс Игр
   распаковывает архив на Linux. Поэтому zip собираем сами — с прямыми слэшами. */
const CRC_TABLE = (function () {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = fs.readFileSync(entry.file);
    // woff2 и png уже сжаты: deflate их только раздувает
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const packed = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // минимальная версия для распаковки
    local.writeUInt16LE(0x0800, 6);    // имена файлов в UTF-8
    local.writeUInt16LE(method, 8);    // 8 — deflate, 0 — без сжатия
    local.writeUInt16LE(0, 10);        // время
    local.writeUInt16LE(0x21, 12);     // дата: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);      // extra
    central.writeUInt16LE(0, 32);      // comment
    central.writeUInt16LE(0, 34);      // номер диска
    central.writeUInt16LE(0, 36);      // внутренние атрибуты
    central.writeUInt32LE(0, 38);      // внешние атрибуты
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(locals), centralBuf, end]);
}

if (!noZip) {
  const zip = path.join(root, 'dist', 'seabattle-yandex-' + version + '.zip');
  // Убираем архивы прошлых версий: в dist должен остаться только актуальный.
  for (const file of fs.readdirSync(path.join(root, 'dist'))) {
    if (/^seabattle-yandex-.+\.zip$/i.test(file) && file !== path.basename(zip)) {
      fs.rmSync(path.join(root, 'dist', file), { force: true });
    }
  }
  const entries = shipped
    .map((file) => ({ name: path.relative(out, file).split(path.sep).join('/'), file: file }))
    .sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(zip, makeZip(entries));
  const size = fs.statSync(zip).size;
  console.log('  архив:', path.relative(root, zip), '·', (size / 1024).toFixed(0), 'КБ');
}

console.log('');
console.log('Дальше: Консоль Яндекс Игр → Черновик → загрузить архив.');
console.log('Проверить в debug-панели: лоадер IT, реклама, пауза и звук на game_api_pause.');
