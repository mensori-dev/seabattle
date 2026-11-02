// Собирает папку www/ для Capacitor: только нужные для игры файлы,
// без тестов, скриптов и node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');

const FILES = ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'privacy.html'];
const DIRS = ['js', 'assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of FILES) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) throw new Error(`нет файла: ${file}`);
  fs.copyFileSync(src, path.join(out, file));
}

for (const dir of DIRS) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) throw new Error(`нет папки: ${dir}`);
  fs.cpSync(src, path.join(out, dir), {
    recursive: true,
    // заставки apple-touch-startup-image нужны только Safari на iPhone
    filter: (p) => !(dir === 'assets' && p.includes(`${path.sep}splash`))
  });
}

console.log('www готова →', out);
