// Скачивает Nunito и Rubik с Google Fonts в assets/fonts, чтобы сборка для
// Яндекс Игр не тянула сторонний CDN (это запрещено правилами платформы).
// Запускать вручную: node scripts/fetch-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'fonts');

const FAMILIES = [
  { family: 'Nunito', query: 'Nunito:wght@600..900', slug: 'nunito' },
  { family: 'Rubik', query: 'Rubik:wght@600..900', slug: 'rubik' }
];
const SUBSETS = ['cyrillic', 'latin'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

/* Разбирает CSS Google Fonts: блок @font-face с комментарием-подмножеством. */
function parseCss(css) {
  const faces = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]+)}/g;
  let m;
  while ((m = re.exec(css))) {
    const subset = m[1];
    const body = m[2];
    const url = (body.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    const weight = (body.match(/font-weight:\s*([^;]+);/) || [])[1];
    if (url) faces.push({ subset: subset, url: url, weight: (weight || '400').trim() });
  }
  return faces;
}

fs.mkdirSync(outDir, { recursive: true });

const cssParts = [];
const manifest = [];

for (const fam of FAMILIES) {
  const css = await (await get(`https://fonts.googleapis.com/css2?family=${fam.query}&display=swap`)).text();
  const faces = parseCss(css).filter((f) => SUBSETS.includes(f.subset));
  if (!faces.length) throw new Error(`не нашёл @font-face для ${fam.family}`);

  for (const face of faces) {
    const file = `${fam.slug}-${face.subset}.woff2`;
    const buf = Buffer.from(await (await get(face.url)).arrayBuffer());
    fs.writeFileSync(path.join(outDir, file), buf);
    manifest.push({ file: file, bytes: buf.length });
    cssParts.push(
      `/* ${fam.family} ${face.subset} */\n` +
      `@font-face{font-family:'${fam.family}';font-style:normal;font-weight:${face.weight};` +
      `font-display:swap;src:url('${file}') format('woff2');` +
      `unicode-range:${face.subset === 'cyrillic'
        ? 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'
        : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'};}`
    );
  }
}

const header =
  '/* Локальные шрифты для сборки Яндекс Игр. Nunito и Rubik — SIL Open Font License 1.1.\n' +
  '   Перегенерировать: node scripts/fetch-fonts.mjs */\n';
fs.writeFileSync(path.join(outDir, 'fonts.css'), header + cssParts.join('\n') + '\n');

fs.writeFileSync(path.join(outDir, 'OFL.txt'), [
  'Nunito — Copyright 2011 The Nunito Project Authors (https://github.com/googlefonts/nunito)',
  'Rubik — Copyright 2015 The Rubik Project Authors (https://github.com/googlefonts/rubik)',
  '',
  'Licensed under the SIL Open Font License, Version 1.1.',
  'Полный текст лицензии: https://openfontlicense.org/open-font-license-official-text/',
  ''
].join('\n'));

for (const item of manifest) console.log(item.file, Math.round(item.bytes / 1024) + ' КБ');
console.log('шрифты готовы →', outDir);
