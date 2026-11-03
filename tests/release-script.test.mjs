import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNotes, buildVersion, isStaleEntry, checkNotes } from '../scripts/release.mjs';

const NOTES = `Версия 1.3.0 — «Морская арена».

**Что нового:**
- 🎁 Ежедневный бонус: первая победа за день даёт +15…+40 к рейтингу.
- 🏅 11 достижений: первая победа, снайпер, десять побед,
  адмиральский флот и другие.
- 🏆 «Кубок моря»: три боя подряд без поражения.
- 🎨 Настройки фона и анимаций.
`;

test('pickNotes joins wrapped bullets and stops at three', () => {
  const notes = pickNotes(NOTES);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^🎁 Ежедневный бонус/);
  assert.match(notes[1], /десять побед, адмиральский флот и другие\.$/);
  assert.match(notes[2], /^🏆 «Кубок моря»/);
});

test('pickNotes strips inline markdown', () => {
  const notes = pickNotes('- **Жирный** пункт с `кодом`');
  assert.deepEqual(notes, ['Жирный пункт с кодом']);
});

test('buildVersion keeps the date when the version did not change', () => {
  const previous = { version: '1.3.0', date: '2026-11-01', notes: ['старое'] };
  const next = buildVersion({ version: '1.3.0', date: '2026-11-03', notes: ['новое'], previous });
  assert.deepEqual(next, { version: '1.3.0', date: '2026-11-01', notes: ['новое'] });
});

test('buildVersion uses the new date for a new version', () => {
  const previous = { version: '1.3.0', date: '2026-11-01', notes: ['старое'] };
  const next = buildVersion({ version: '1.4.0', date: '2026-12-01', notes: ['новое'], previous });
  assert.deepEqual(next, { version: '1.4.0', date: '2026-12-01', notes: ['новое'] });
});

test('isStaleEntry keeps only the current version in OneDrive', () => {
  assert.equal(isStaleEntry('seabattle-1.2.0.apk', '1.3.0'), true);
  assert.equal(isStaleEntry('seabattle-1.2.0-release.apk', '1.3.0'), true);
  assert.equal(isStaleEntry('seabattle-1.2.0-unsigned.ipa', '1.3.0'), true);
  assert.equal(isStaleEntry('seabattle-1.2.0-RELEASE_NOTES.md', '1.3.0'), true);
  assert.equal(isStaleEntry('seabattle-1.2.0', '1.3.0'), true);
  assert.equal(isStaleEntry('seabattle-rustore-1.2.0', '1.3.0'), true);
  assert.equal(isStaleEntry('seabattle-1.3.0.apk', '1.3.0'), false);
  assert.equal(isStaleEntry('seabattle-1.3.0-unsigned.ipa', '1.3.0'), false);
  assert.equal(isStaleEntry('seabattle-rustore-1.3.0', '1.3.0'), false);
  assert.equal(isStaleEntry('seabattle-debug.apk', '1.3.0'), false);
  assert.equal(isStaleEntry('seabattle-1.2.0-заметки.docx', '1.3.0'), false);
  assert.equal(isStaleEntry('README.md', '1.3.0'), false);
});

test('checkNotes refuses an empty changelog', () => {
  assert.throws(() => checkNotes('1.3.0', 'Версия 1.3.0\n\nТолько текст, без списка.'), /списк|пункт/i);
});

test('checkNotes catches notes from another version', () => {
  assert.throws(() => checkNotes('1.4.0', 'Версия 1.3.0 — тест\n- Пункт один\n- Пункт два'), /1\.3\.0/);
});

test('checkNotes returns the notes for the matching version', () => {
  const notes = checkNotes('1.3.0', 'Версия 1.3.0 — тест\n\n- Первый\n- Второй\n');
  assert.deepEqual(notes, ['Первый', 'Второй']);
});
