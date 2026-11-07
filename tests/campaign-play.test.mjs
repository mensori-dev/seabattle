import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function loadEngine() {
  const sandbox = { window: {} };
  vm.runInNewContext(read('js/engine.js'), sandbox);
  return sandbox.window.Engine;
}

const E = loadEngine();
const app = read('js/app.js');
const html = read('index.html');
const css = read('style.css');

test('движок отдаёт помощников кампании', () => {
  for (const name of [
    'campaignHasMod', 'campaignPlayerFleet', 'campaignBotFleet', 'campaignLoadout',
    'campaignBotLoadout', 'campaignBossPhase', 'campaignBossMods', 'campaignHasBossMod',
    'campaignFogCells', 'campaignStormRefund', 'campaignNextId', 'campaignRecord'
  ]) {
    assert.equal(typeof E[name], 'function', name);
  }
});

test('миссия задаёт размер, флот и уровень бота', () => {
  const m = E.campaignById(7);
  assert.equal(m.size, 12);
  assert.equal(m.fleet, 'classic');
  assert.equal(m.bot, 'hard');
  assert.match(app, /size: campaign\.mission\.size/);
  assert.match(app, /fleet: campaign\.mission\.fleet/);
  assert.match(app, /botLevel: mission\.bot/);
});

test('модификаторы меняют флот игрока', () => {
  const usual = E.campaignPlayerFleet(E.campaignById(1));
  assert.equal(usual.length, E.fleetFor(8, 'classic').length);

  const single = E.campaignPlayerFleet(E.campaignById(5));
  assert.ok(single.length > 0);
  assert.ok(single.every((n) => n === 1));

  const few = E.campaignPlayerFleet(E.campaignById(10));
  assert.deepEqual([...few], [3, 2, 1]);
});

test('extra-ship добавляет боту корабль', () => {
  const mission = E.campaignById(2);
  const base = E.fleetFor(mission.size, mission.fleet);
  const fleet = E.campaignBotFleet(mission);
  assert.equal(fleet.length, base.length + 1);
  assert.equal(fleet[fleet.length - 1], 1);
});

test('лоадаут миссии ограничивает способности', () => {
  assert.deepEqual([...E.campaignLoadout(E.campaignById(3), ['airstrike', 'smoke'])], ['airstrike']);

  const smoky = E.campaignLoadout(E.campaignById(7), ['airstrike', 'aa']);
  assert.ok(smoky.includes('smoke'));
  assert.ok(smoky.length <= 2);

  const king = E.campaignById(12);
  const early = E.campaignBotLoadout(king, 1);
  assert.ok(early.includes('smoke'));
  assert.ok(early.includes('aa'));
  assert.ok(!early.includes('airstrike'));
  const boss = E.campaignBotLoadout(king, 2);
  assert.ok(boss.includes('smoke'));
  assert.ok(boss.includes('airstrike'));
  assert.ok(boss.includes('aa'));
});

test('фазы босса считаются по доле оставшихся кораблей', () => {
  const pirate = E.campaignById(4);
  assert.equal(E.campaignBossPhase(pirate, 10, 10), 1);
  assert.equal(E.campaignBossPhase(pirate, 5, 10), 2);

  const king = E.campaignById(12);
  assert.equal(E.campaignBossPhase(king, 70, 100), 1);
  assert.equal(E.campaignBossPhase(king, 60, 100), 2);
  assert.equal(E.campaignBossPhase(king, 30, 100), 3);

  assert.ok(E.campaignHasBossMod(pirate, 'boss-double-turn', 1));
  assert.ok(E.campaignHasBossMod(E.campaignById(8), 'boss-airstrike', 2));
  const phase3 = E.campaignBossMods(king, 3);
  assert.ok(phase3.includes('boss-double-turn'));
  assert.ok(phase3.includes('boss-aa'));
});

test('туман выбирает пять уникальных клеток поля', () => {
  const cells = E.campaignFogCells({ size: 8 }, 5);
  assert.equal(cells.length, 5);
  const keys = new Set(cells.map((c) => c.x + ',' + c.y));
  assert.equal(keys.size, 5);
  cells.forEach((c) => {
    assert.ok(c.x >= 0 && c.x < 8);
    assert.ok(c.y >= 0 && c.y < 8);
  });
});

test('шторм возвращает ход только каждый пятый промах', () => {
  const storm = E.campaignById(9);
  assert.equal(E.campaignStormRefund(storm, 4), false);
  assert.equal(E.campaignStormRefund(storm, 5), true);
  assert.equal(E.campaignStormRefund(storm, 6), false);
  assert.equal(E.campaignStormRefund(E.campaignById(1), 5), false);
});

test('прогресс кампании только растёт и не трогает рейтинг', () => {
  const first = E.campaignRecord({ completed: [], stars: {} }, 1, {
    won: true, lostShips: 2, shots: 20
  });
  assert.deepEqual([...first.completed], [1]);
  assert.equal(first.stars[1], 3);

  const better = E.campaignRecord(first, 1, { won: true, lostShips: 0, shots: 15 });
  assert.equal(better.stars[1], 5);

  const worse = E.campaignRecord(better, 1, { won: true, lostShips: 3, shots: 30 });
  assert.equal(worse.stars[1], 5, 'звёзды не уменьшаются');

  const loss = E.campaignRecord(better, 2, { won: false, lostShips: 4, shots: 10 });
  assert.deepEqual([...loss.completed], [1]);
  assert.equal(loss.stars[2], undefined);

  const next = E.campaignRecord(better, 2, { won: true, lostShips: 0, shots: 12 });
  assert.deepEqual([...next.completed], [1, 2]);
  assert.equal(E.campaignUnlocked(next, 3), true);
  assert.doesNotMatch(app, /state\.profile\.rating\s*[+\-]?=.*campaign/i);
});

test('запуск миссии выставляет state.campaign и стартует бой без рейтинга', () => {
  assert.match(app, /function startCampaignMission\(id\)/);
  assert.match(app, /Engine\.campaignUnlocked\(state\.profile\.campaign, mission\.id\)/);
  assert.match(app, /state\.campaign = \{/);
  assert.match(app, /playerFleet: Engine\.campaignPlayerFleet\(mission\)/);
  assert.match(app, /botFleet: Engine\.campaignBotFleet\(mission\)/);
  assert.match(app, /loadout: Engine\.campaignLoadout\(mission, state\.loadout\)/);
  assert.match(app, /state\.profile\.campaign\.lastId = mission\.id/);
  assert.match(app, /startMatch\(true\)/);
  assert.match(app, /function isRatedBattle\(\)[\s\S]{0,160}if \(state\.campaign\) return false;/);
  assert.match(app, /if \(state\.campaign && state\.campaign\.playerFleet\) return state\.campaign\.playerFleet\.slice\(\)/);
});

test('бой кампании использует флоты и лоадауты миссии', () => {
  assert.match(app, /campaign \? campaign\.botFleet : fleetSizes\(\)/);
  assert.match(app, /campaign \? campaign\.loadout : state\.loadout/);
  assert.match(app, /campaign \? campaign\.botLoadout : botLoadout\(\)/);
  assert.match(app, /Engine\.campaignFogCells\(state\.enemyBoard, 5\)/);
  assert.match(app, /paintCampaignFog\(\)/);
  assert.match(app, /updateCampaignPhaseBar\(\)/);
});

test('модификаторы реально влияют на ход боя', () => {
  assert.match(app, /Engine\.campaignStormRefund\(state\.campaign\.mission, state\.matchStats\.misses\)/);
  assert.match(app, /state\.locked = false;\s*state\.playerTurn = true;\s*setTurn\(true\);\s*return;/);
  assert.match(app, /Engine\.campaignHasBossMod\(state\.campaign\.mission, 'boss-double-turn', state\.campaign\.phase\)/);
  assert.match(app, /Engine\.campaignHasBossMod\(\s*state\.campaign\.mission, 'boss-aa', state\.campaign\.phase\)/);
  assert.match(app, /ПВО босса сбило авиаудар/);
  assert.match(app, /clearCampaignFog\(x, y\)/);
  assert.match(app, /updateCampaignPhase\(\)/);
  assert.match(app, /'👑 ' \+ c\.mission\.boss\.name \+ ': фаза ' \+ next/);
});

test('победа пишет прогресс, поражение — нет; рейтинг не меняется', () => {
  assert.match(app, /if \(state\.campaign\) \{/);
  assert.match(app, /Engine\.campaignRecord\(state\.profile\.campaign, c\.id/);
  assert.match(app, /nextId = Engine\.campaignNextId\(c\.id\)/);
  assert.match(app, /if \(playerWon\) \{[\s\S]{0,180}campaignRecord/);
  assert.match(app, /showResult\(playerWon, Math\.round\(p\.rating\), Math\.round\(p\.rating\), 0, reason/);
  assert.match(app, /rated: false/);
  assert.match(app, /campaign: \{[\s\S]{0,220}nextId: nextId/);
});

test('результат кампании показывает звёзды и три кнопки', () => {
  assert.match(html, /id="campaign-result"/);
  assert.match(html, /id="campaign-result-stars"/);
  assert.match(html, /id="campaign-result-label"/);
  assert.match(html, /id="campaign-result-actions"/);
  assert.match(html, /id="btn-campaign-next"[^>]*>Дальше/);
  assert.match(html, /id="btn-campaign-retry"[^>]*>Повторить/);
  assert.match(html, /id="btn-campaign-map"[^>]*>К карте/);
  assert.match(app, /campaignActions\.hidden = !campaign/);
  assert.match(app, /campaignBox\.hidden = !campaign/);
  assert.match(app, /campaign\.stars \+ ' из 5 звёзд'/);
  assert.match(app, /Миссия пройдена: /);
});

test('полоса фаз босса и туман есть в разметке и стилях', () => {
  assert.match(html, /id="campaign-phase"/);
  assert.match(html, /id="campaign-phase-name"/);
  assert.match(html, /id="campaign-phase-label"/);
  assert.match(html, /data-phase="1"/);
  assert.match(html, /data-phase="2"/);
  assert.match(html, /data-phase="3"/);
  assert.match(css, /\.cell\.is-fog/);
  assert.match(css, /\.campaign-phase-track span\.is-on/);
  assert.match(css, /\.campaign-result-star\.is-on/);
  assert.match(css, /\.campaign-result-actions\{flex-wrap:wrap\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.campaign-result-star/);
});

test('PWA-кэш поднят до sb-v42', () => {
  assert.match(read('sw.js'), /const VERSION = 'sb-v42'/);
  assert.match(app, /const SW_VERSION = 'sb-v42'/);
});
