import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8'), sandbox);
const E = sandbox.window.Engine;

test('испытание дня детерминировано и меняется по датам', () => {
  const a = E.dailyChallenge('2026-11-05');
  const b = E.dailyChallenge('2026-11-05');
  assert.equal(a.id, b.id);
  const week = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    '2026-11-09', '2026-11-10', '2026-11-11'].map((d) => E.dailyChallenge(d).id);
  assert.ok(new Set(week).size >= 5, 'за неделю встречаются разные пресеты');
});

test('каждый пресет дня валиден для своего поля', () => {
  for (const p of E.DAILY_PRESETS) {
    assert.ok([8, 10, 12].includes(p.config.size));
    assert.ok(['classic', 'admiral'].includes(p.config.fleet));
    assert.equal(typeof p.config.tactics, 'boolean');
    assert.ok(E.fleetFor(p.config.size, p.config.fleet), p.id);
  }
});

test('испытание дня хранит конфиг в цепочке, а не в настройках бота', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(app, /dailyChallenge/);
  assert.match(app, /startCup/);
  assert.match(app, /config: Object\.assign\(\{\}, day\.config\)/);
  assert.match(app, /state\.cupMatch && state\.cup && state\.cup\.config/);
  assert.doesNotMatch(app, /state\.profile\.botConfig = Object\.assign\(\{\}, day\.config\)/);
});
