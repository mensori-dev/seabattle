import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'server', 'main.ts'), 'utf8');

test('сервер принимает конфиг комнаты и отдаёт его клиентам', () => {
  assert.match(src, /interface BattleConfig/);
  assert.match(src, /normalizeConfig/);
  assert.match(src, /t: 'room'[^}]*config/);
  assert.match(src, /t: 'begin'[^}]*config/);
});

test('валидация флота идёт по размеру и пресету комнаты', () => {
  assert.match(src, /buildBoard\([^)]*config/);
  assert.match(src, /config\.size/);
  assert.match(src, /config\.fleet/);
  assert.doesNotMatch(src, /const SIZE = 10;/);
});

test('топ побед считается только для классических комнат', () => {
  assert.match(src, /isClassicRoom|config\.size === 10 && config\.fleet === 'classic' && !config\.tactics/);
});
