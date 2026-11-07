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

const MODIFIERS = [
  'extra-ship', 'airstrike-only', 'single-deck-fleet', 'fog',
  'smoke', 'storm-refund', 'few-ships',
  'boss-double-turn', 'boss-aa', 'boss-smoke', 'boss-airstrike'
];

test('кампания: ровно 12 миссий, по 4 в каждом акте', () => {
  assert.equal(E.CAMPAIGN.length, 12);
  assert.deepEqual([...E.CAMPAIGN.map((m) => m.id)], Array.from({ length: 12 }, (_, i) => i + 1));
  for (const act of [1, 2, 3]) {
    assert.equal(E.CAMPAIGN.filter((m) => m.act === act).length, 4, `акт ${act}`);
  }
  assert.equal(new Set(E.CAMPAIGN.map((m) => m.title)).size, 12, 'названия уникальны');
});

test('кампания: у каждой миссии валидный размер, флот и бот', () => {
  for (const mission of E.CAMPAIGN) {
    assert.ok([8, 10, 12].includes(mission.size), `size миссии ${mission.id}`);
    assert.ok(['classic', 'admiral'].includes(mission.fleet), `fleet миссии ${mission.id}`);
    assert.ok(E.fleetFor(mission.size, mission.fleet), `пресет флота миссии ${mission.id}`);
    assert.ok(['easy', 'normal', 'hard'].includes(mission.bot), `bot миссии ${mission.id}`);
    assert.ok(Array.isArray(mission.mods), `mods миссии ${mission.id}`);
    assert.equal(mission.stars, 5, `максимум звёзд миссии ${mission.id}`);
  }
});

test('кампания: ровно три босса, у каждого не меньше двух фаз', () => {
  const bosses = E.CAMPAIGN.filter((m) => m.boss);
  assert.equal(bosses.length, 3);
  assert.deepEqual([...bosses.map((m) => m.id)], [4, 8, 12]);
  assert.deepEqual([...bosses.map((m) => m.boss.name)], [
    'Старый Пират', 'Адмирал Гроза', 'Ледяной Король'
  ]);
  for (const mission of bosses) {
    assert.ok(Array.isArray(mission.boss.phases));
    assert.ok(mission.boss.phases.length >= 2, `фазы босса ${mission.boss.name}`);
    for (const phase of mission.boss.phases) {
      assert.equal(typeof phase.at, 'number');
      assert.ok(phase.at >= 0 && phase.at <= 100);
      assert.ok(Array.isArray(phase.mods) && phase.mods.length > 0);
    }
  }
});

test('кампания: обычные миссии идут без босса', () => {
  for (const mission of E.CAMPAIGN) {
    if ([4, 8, 12].includes(mission.id)) continue;
    assert.equal(mission.boss, null, `миссия ${mission.id}`);
  }
});

test('кампания: неизвестный id возвращает null', () => {
  for (const id of [0, 13, -1, 'нет', null, undefined, {}, []]) {
    assert.equal(E.campaignById(id), null, String(id));
  }
  assert.equal(E.campaignById(1), E.CAMPAIGN[0]);
  assert.equal(E.campaignById('12'), E.CAMPAIGN[11]);
});

test('кампания: победа без потерь даёт 5 звёзд', () => {
  assert.equal(E.campaignStars({ lostShips: 0, shots: 20 }), 5);
  assert.equal(E.campaignStars({ lostShips: [], shots: [] }), 5);
  assert.equal(E.campaignStars({ won: true, lostShips: 0, shots: 17 }), 5);
});

test('кампания: победа с потерями даёт 3 звезды', () => {
  assert.equal(E.campaignStars({ lostShips: 1, shots: 20 }), 3);
  assert.equal(E.campaignStars({ lostShips: 4, shots: 40 }), 3);
  assert.equal(E.campaignStars({ won: true, lostShips: 2, shots: 25 }), 3);
});

test('кампания: поражение даёт 0 звёзд', () => {
  assert.equal(E.campaignStars({ won: false, lostShips: 10, shots: 30 }), 0);
  assert.equal(E.campaignStars({ result: 'loss', lostShips: 10, shots: 30 }), 0);
  assert.equal(E.campaignStars({ lostShips: null, shots: 30 }), 0);
  assert.equal(E.campaignStars({ lostShips: 4, shots: { won: false } }), 0);
  assert.equal(E.campaignStars({}), 0);
});

test('кампания: первая миссия открыта всегда', () => {
  for (const progress of [undefined, null, {}, [], { completed: [] }]) {
    assert.equal(E.campaignUnlocked(progress, 1), true);
  }
  assert.equal(E.campaignUnlocked({}, 0), false);
  assert.equal(E.campaignUnlocked({}, 13), false);
});

test('кампания: вторая миссия открыта только после первой', () => {
  assert.equal(E.campaignUnlocked({}, 2), false);
  assert.equal(E.campaignUnlocked({ completed: [2] }, 2), false);
  assert.equal(E.campaignUnlocked({ completed: [1] }, 2), true);
  assert.equal(E.campaignUnlocked({ 1: true }, 2), true);
  assert.equal(E.campaignUnlocked({ completed: { 1: { stars: 3 } } }, 2), true);
  assert.equal(E.campaignUnlocked({ missions: { 1: { stars: 3 } } }, 2), true);
  assert.equal(E.campaignUnlocked({ stars: { 1: 5 } }, 2), true);
});

test('кампания: третья миссия требует именно вторую', () => {
  assert.equal(E.campaignUnlocked({ completed: [1] }, 3), false);
  assert.equal(E.campaignUnlocked({ completed: [2] }, 3), true);
  assert.equal(E.campaignUnlocked({ completed: [1, 3] }, 3), false);
  assert.equal(E.campaignUnlocked({ completed: [1, 2] }, 3), true);
});

test('кампания: модификаторы только из разрешённого списка', () => {
  assert.deepEqual([...E.CAMPAIGN_MODIFIERS], MODIFIERS);
  const allowed = new Set(MODIFIERS);
  for (const mission of E.CAMPAIGN) {
    for (const mod of mission.mods) {
      assert.ok(allowed.has(mod), `миссия ${mission.id}: ${mod}`);
    }
    if (mission.boss) {
      for (const phase of mission.boss.phases) {
        for (const mod of phase.mods) {
          assert.ok(allowed.has(mod), `босс ${mission.boss.name}: ${mod}`);
        }
      }
    }
  }
});
