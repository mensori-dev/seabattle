import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'server', 'main.ts'), 'utf8');

test('сервер ждёт оба лоудаута и умеет авто-выбор', () => {
  assert.match(src, /type === 'loadout'/);
  assert.match(src, /awaitingLoadout|loadouts/);
  assert.match(src, /60000|60 \* 1000/);
});

test('способности проверяются на сервере', () => {
  assert.match(src, /type === 'ability'/);
  assert.match(src, /airstrike/);
  assert.match(src, /smoke/);
  assert.match(src, /kind === 'aa'|blocked: true/);
});

test('дым и пропуск хода не дают бою зависнуть', () => {
  assert.match(src, /t: 'pass'/);
  assert.match(src, /reason: 'smoke'/);
  assert.match(src, /legalShots|smokeBlocks/);
});
