#!/usr/bin/env node
/* ============================================================
   Релиз «Морского боя»: сайт-витрина + GitHub Releases + OneDrive.

     npm run release            # план, ничего не меняет
     npm run release -- --yes   # публикация

   Что делает с --yes:
   1. пишет site/version.json (версия, дата, 3 пункта из RELEASE_NOTES);
   2. создаёт/обновляет релиз v<версия> на GitHub и заливает APK/AAB/IPA;
   3. обновляет OneDrive и удаляет оттуда артефакты старых версий.

   Пуш сайта остаётся за человеком: скрипт только готовит файлы.
   ============================================================ */
import { readFile, writeFile, mkdir, copyFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'mensori-dev/seabattle';
const ONEDRIVE = process.env.ONEDRIVE_DIR || path.join(os.homedir(), 'OneDrive');

/** Первые `limit` пунктов списка из RELEASE_NOTES, склеенные в одну строку. */
export function pickNotes(markdown, limit = 3) {
  const out = [];
  let current = null;

  const flush = () => {
    if (current === null) return false;
    out.push(current);
    current = null;
    return out.length >= limit;
  };

  for (const raw of String(markdown).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (flush()) break;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (flush()) break;
      current = line.replace(/^\s*[-*]\s+/, '');
    } else if (current !== null) {
      current += ' ' + line.trim();
    }
  }
  if (current !== null && out.length < limit) out.push(current);

  return out.slice(0, limit).map(cleanNote);
}

function cleanNote(text) {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** version.json: дата не дёргается при повторном прогоне той же версии. */
export function buildVersion({ version, date, notes, previous }) {
  const keepDate = previous && previous.version === version && previous.date;
  return { version, date: keepDate ? previous.date : date, notes };
}

/**
 * Имя в OneDrive относится к прошлой версии?
 * Трогаем только известные артефакты: `seabattle-<v>.apk`,
 * `…-unsigned.ipa`, `…-RELEASE_NOTES.md`, папки `seabattle-<v>` и
 * `seabattle-rustore-<v>`. Посторонние файлы рядом не удаляем.
 */
export function isStaleEntry(name, version) {
  const match = /^seabattle-(?:rustore-)?(\d+\.\d+\.\d+)(?:\.apk|-release\.apk|-release\.aab|-unsigned\.ipa|-RELEASE_NOTES\.md)?$/.exec(name);
  if (!match) return false;
  return match[1] !== version;
}

/** Пункты для сайта + защита от пустого или чужого changelog. */
export function checkNotes(version, markdown) {
  const notes = pickNotes(markdown);
  if (!notes.length) {
    throw new Error('в dist/RELEASE_NOTES.md нет списка «- …» — нечего показывать на сайте');
  }
  const title = /Версия\s+([\d.]+)/.exec(String(markdown).split(/\r?\n/)[0] || '');
  if (title && title[1] !== version) {
    throw new Error(`RELEASE_NOTES.md описывает версию ${title[1]}, а в package.json ${version}`);
  }
  return notes;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function kb(bytes) {
  return `${Math.round(bytes / 1024)} КБ`;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (_e) {
    return fallback;
  }
}

async function copyArtifact(src, dir, name) {
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, name);
  await copyFile(src, dest);
  return dest;
}

function gh(args, options = {}) {
  return spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', ...options });
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} завершился с кодом ${res.status}`);
  }
}

async function main() {
  const yes = process.argv.includes('--yes');

  const pkg = await readJson(path.join(ROOT, 'package.json'), {});
  const version = pkg.version;
  if (!version) throw new Error('в package.json нет version');

  const dist = path.join(ROOT, 'dist');
  const files = {
    apk: path.join(dist, `seabattle-${version}-release.apk`),
    aab: path.join(dist, `seabattle-${version}-release.aab`),
    ipa: path.join(dist, `seabattle-${version}-unsigned.ipa`),
    notes: path.join(dist, 'RELEASE_NOTES.md')
  };

  const notesMarkdown = existsSync(files.notes)
    ? await readFile(files.notes, 'utf8')
    : '';
  let notes = pickNotes(notesMarkdown);
  if (yes) notes = checkNotes(version, notesMarkdown);

  const versionFile = path.join(ROOT, 'site', 'version.json');
  const previous = await readJson(versionFile);
  const nextVersion = buildVersion({ version, date: today(), notes, previous });

  const oneDriveEntries = existsSync(ONEDRIVE)
    ? (await readdir(ONEDRIVE)).filter((name) => name.startsWith('seabattle'))
    : [];
  const stale = oneDriveEntries.filter((name) => isStaleEntry(name, version)).sort();

  const missing = Object.entries(files)
    .filter(([, file]) => !existsSync(file))
    .map(([key]) => key);

  console.log(`Релиз v${version}`);
  console.log(`  APK:  ${files.apk}`);
  console.log(`  AAB:  ${files.aab}`);
  console.log(`  IPA:  ${files.ipa}`);
  console.log(`  notes: ${files.notes} (${notes.length} пункта для сайта)`);
  for (const note of notes) console.log(`    • ${note}`);
  console.log(`  site/version.json → ${JSON.stringify(nextVersion)}`);
  console.log(`  GitHub: ${REPO} релиз v${version}`);
  console.log(`  OneDrive: ${ONEDRIVE}`);
  if (stale.length) console.log(`  Удалить старое: ${stale.join(', ')}`);
  if (missing.length) console.log(`  Не хватает: ${missing.join(', ')}`);

  if (!yes) {
    console.log('\nЭто план. Для публикации: npm run release -- --yes');
    return;
  }

  if (missing.length) {
    throw new Error(`нет файлов релиза: ${missing.join(', ')} — сначала собери APK/AAB/IPA`);
  }

  const auth = gh(['auth', 'status']);
  if (auth.error) {
    throw new Error(`не удалось запустить gh: ${auth.error.message} — установи GitHub CLI`);
  }
  if (auth.status !== 0) {
    throw new Error('gh не авторизован: выполни gh auth login');
  }

  const assets = [files.apk, files.aab, files.ipa];
  const view = gh(['release', 'view', `v${version}`, '--repo', REPO]);
  if (view.status !== 0) {
    console.log(`→ создаю релиз v${version}`);
    run('gh', [
      'release', 'create', `v${version}`,
      '--repo', REPO,
      '--title', `v${version}`,
      '--notes-file', files.notes,
      ...assets
    ]);
  } else {
    console.log(`→ релиз v${version} уже есть, обновляю`);
    run('gh', ['release', 'edit', `v${version}`, '--repo', REPO, '--notes-file', files.notes]);
    run('gh', ['release', 'upload', `v${version}`, '--repo', REPO, '--clobber', ...assets]);
  }

  // version.json пишем только после успешного релиза: иначе сайт сошлётся
  // на файлы, которых на GitHub ещё нет
  await writeFile(versionFile, JSON.stringify(nextVersion, null, 2) + '\n', 'utf8');
  console.log(`\n✓ site/version.json обновлён`);

  if (!existsSync(ONEDRIVE)) {
    console.warn(`\n! Нет папки OneDrive: ${ONEDRIVE} — пропускаю копирование`);
  } else {
    const pack = path.join(ONEDRIVE, `seabattle-${version}`);
    await copyArtifact(files.apk, ONEDRIVE, `seabattle-${version}.apk`);
    await copyArtifact(files.ipa, ONEDRIVE, `seabattle-${version}-unsigned.ipa`);
    await copyArtifact(files.notes, ONEDRIVE, `seabattle-${version}-RELEASE_NOTES.md`);
    await copyArtifact(files.apk, pack, `seabattle-${version}.apk`);
    await copyArtifact(files.ipa, pack, `seabattle-${version}-unsigned.ipa`);
    await copyArtifact(files.notes, pack, 'RELEASE_NOTES.md');

    const rustore = path.join(ONEDRIVE, `seabattle-rustore-${version}`);
    if (!existsSync(rustore)) {
      console.warn(`! Нет папки ${rustore} — собери набор для RuStore вручную`);
    }

    for (const name of stale) {
      await rm(path.join(ONEDRIVE, name), { recursive: true, force: true });
      console.log(`✓ удалено из OneDrive: ${name}`);
    }
    console.log(`✓ OneDrive: seabattle-${version}.apk (${kb((await stat(files.apk)).size)}) и остальное`);
  }

  console.log('\nДальше: проверь site/version.json, закоммить и запушь сайт.');
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`\n✗ ${error.message}`);
    process.exit(1);
  });
}
