// Собирает версию для GamePush (VK Games, OK Games и другие площадки):
// dist/gamepush + архив dist/seabattle-gamepush-<версия>.zip
//
// Отличия от основной игры:
//   • нет PWA: manifest, service worker, иконки установки и подсказки Safari;
//   • локальные шрифты, никаких Google Fonts;
//   • онлайн вырезан: в VK/OK — только одиночная игра с ботом;
//   • подключён js/gamepush.js и официальный загрузчик SDK GamePush.
//
// Ключи проекта берутся из переменных окружения GAMEPUSH_PROJECT_ID,
// GAMEPUSH_PUBLIC_TOKEN или из gamepush.config.json в корне (файл в .gitignore).
// Для локальной проверки без площадки: npm run gamepush -- --demo
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'gamepush');
const noZip = process.argv.includes('--no-zip');
const demo = process.argv.includes('--demo');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function must(ok, message) {
  if (!ok) throw new Error('сборка GamePush: ' + message);
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

function configFromFile() {
  const file = path.join(root, 'gamepush.config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error('сборка GamePush: не читается gamepush.config.json — ' + e.message);
  }
}

function credentials() {
  if (demo) return null;
  const file = configFromFile();
  const projectId = String(process.env.GAMEPUSH_PROJECT_ID || file.projectId || '');
  const publicToken = String(process.env.GAMEPUSH_PUBLIC_TOKEN || file.publicToken || '');
  must(/^[A-Za-z0-9_-]+$/.test(projectId),
    'нет projectId. Создай игру в panel.gamepush.com и заполни gamepush.config.json');
  must(/^[A-Za-z0-9_-]+$/.test(publicToken),
    'нет publicToken. Возьми его в панели GamePush → Настройки проекта');
  return { projectId: projectId, publicToken: publicToken };
}

/* Официальный загрузчик GamePush: пробует зеркала и вызывает window.onGPInit. */
function sdkSnippet(creds) {
  const mirrors = 'aHR0cHM6Ly9ncy5lcG9uZXNoLmNvbS9zZGsvZ2FtZS1zY29yZS5qcyxodHRwczovL3MzLmdhbWVwdXNoLmNvbS9maWxlcy9ncy9zZGsvZ2FtZS1zY29yZS5qcyxodHRwczovL3MzLWV1LmdhbWVwdXNoLmNvbS9zZGsvZ2FtZS1zY29yZS5qcyxodHRwczovL2dhbWVwdXNoLmNvbS9zZGsvZ2FtZS1zY29yZS5qcw==';
  const query = '?projectId=' + encodeURIComponent(creds.projectId) +
    '&publicToken=' + encodeURIComponent(creds.publicToken) +
    '&callback=onGPInit';
  return [
    '  <script>',
    '    ((s,c,o,r,e)=>{var f=0,t={},p=0,m=r.length,w=[],j=u=>{if(f||t[u])return;f=1;t[u]=1;var d=c.createElement(o);d.async=1;d.src=u+e;d.onerror=()=>{f=0;n()};var a=c.getElementsByTagName(o)[0];a.parentNode.insertBefore(d,a)},n=()=>{for(var k=0;k<w.length;k++)if(!t[w[k]])return j(w[k])},q=()=>{++p>=m&&!f&&n()};r.forEach(u=>s.fetch(u,{method:"HEAD"}).then(x=>{x&&x.ok?(w.push(u),j(u)):q()}).catch(q));s.setTimeout(()=>{f||n()},5000)})(window,document,"script",atob("' + mirrors + '").split(","),"' + query + '");',
    '  </script>'
  ].join('\n');
}

/* ---------------- index.html ---------------- */
function buildHtml(creds) {
  let s = read('index.html');

  // PWA-теги и подсказка установки на iPhone в iframe VK/OK не нужны
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
  if (!s.includes('assets/fonts/fonts.css')) {
    s = s.replace(styleTag,
      '  <link rel="stylesheet" href="assets/fonts/fonts.css">\n' + styleTag);
  }

  // подсказка «добавить на домашний экран» относится к PWA, а не к VK/OK
  s = cut(s, '        <!-- подсказка только для Safari', '        <a class="privacy-link"', 'подсказка установки на iPhone');

  // онлайн-комнат в VK/OK нет — убираем кнопку, экран и все упоминания
  s = s.replace(/[ \t]*<button class="btn btn-ghost btn-big btn-online"[\s\S]*?<\/button>\s*\n/, '');
  must(!s.includes('id="btn-online"'), 'осталась кнопка онлайна');
  s = cut(s, '      <!-- ================= ОНЛАЙН', '<!-- ================= РАССТАНОВКА', 'экран онлайна');
  must(!s.includes('screen-online'), 'остался экран онлайна');

  s = s.replace(
    '11 медалей за победы, точность, онлайн, адмиральский флот и испытание дня',
    '10 медалей за победы, точность, адмиральский флот и испытание дня');
  must(s.includes('10 медалей'), 'не поправил текст про достижения');
  s = s.replace('id="ach-count">0 / 11<', 'id="ach-count">0 / 10<');
  must(s.includes('id="ach-count">0 / 10<'), 'не поправил счётчик достижений');
  s = s.replace('— против бота и в онлайн-комнате', '— против бота');
  must(!s.includes('в онлайн-комнате'), 'в правилах остался онлайн');

  // вместо онлайн-клиента — адаптер платформы и загрузчик SDK
  const onlineScript = '  <script src="js/online.js"></script>';
  must(s.includes(onlineScript), 'не нашёл подключение js/online.js');
  const sdk = creds
    ? '  <!-- GamePush SDK -->\n' + sdkSnippet(creds)
    : '  <!-- GamePush SDK: демо-сборка без projectId/publicToken -->';
  s = s.replace(onlineScript,
    '  <script src="js/gamepush.js"></script>\n' + sdk);

  must(s.includes('js/gamepush.js'), 'не подключил js/gamepush.js');
  must(!s.includes('js/online.js'), 'остался онлайн-клиент');
  must(!s.includes('rel="manifest"'), 'остался manifest');
  must(!s.includes('apple-mobile-web-app'), 'остались apple-mobile-web-app-теги');
  must(s.includes('privacy-link'), 'потерялась ссылка на политику конфиденциальности');
  return s;
}

/* ---------------- js/app.js ---------------- */
function buildApp() {
  let s = read('js/app.js');

  // в архиве GamePush нет sw.js — регистрация только шумит в консоли
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

  // онлайн-достижение в одиночной сборке недостижимо
  s = s.replace(/[ \t]*\{ id: 'online', icon: '[^']*',[^\n]*\n/, '');
  must(!s.includes("id: 'online'"), 'осталось достижение за онлайн');

  must(s.includes('window.GamePlatform'), 'в app.js нет хуков GamePlatform');
  return s;
}

/* ---------------- сборка ---------------- */
const creds = credentials();
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

write('index.html', buildHtml(creds));
fs.copyFileSync(path.join(root, 'style.css'), path.join(out, 'style.css'));
fs.copyFileSync(path.join(root, 'privacy.html'), path.join(out, 'privacy.html'));
fs.mkdirSync(path.join(out, 'js'), { recursive: true });
for (const file of ['engine.js', 'music.js', 'gamepush.js']) {
  fs.copyFileSync(path.join(root, 'js', file), path.join(out, 'js', file));
}
write('js/app.js', buildApp());

// ассеты: иконки вкладки/политики и локальные шрифты
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const file of ['favicon-32.png', 'apple-touch-icon.png']) {
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
if (creds) {
  must(html.includes('projectId=' + encodeURIComponent(creds.projectId)),
    'в index.html не попал projectId');
}

console.log('Сборка GamePush готова →', out);
console.log('  режим:', creds ? 'с SDK проекта ' + creds.projectId : 'демо без SDK');
console.log('  файлов:', shipped.length, '· распаковано:', (unpacked / 1024).toFixed(0), 'КБ');

/* ---------------- архив ---------------- */
/* Compress-Archive в Windows пишет пути с обратными слэшами, а хостинг
   GamePush распаковывает архив на Linux. Поэтому zip собираем сами. */
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
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const packed = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
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
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
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
  const zip = path.join(root, 'dist', 'seabattle-gamepush-' + version + '.zip');
  for (const file of fs.readdirSync(path.join(root, 'dist'))) {
    if (/^seabattle-gamepush-.+\.zip$/i.test(file) && file !== path.basename(zip)) {
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
if (creds) {
  console.log('Дальше: panel.gamepush.com → Хостинг игр → загрузить архив.');
  console.log('Проверь VK/OK: рекламу, паузу, вход игрока и одиночный бой.');
} else {
  console.log('Демо-сборка: SDK не подключён. Для площадок заполни gamepush.config.json.');
}
