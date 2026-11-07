import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(read('js/engine.js'), sandbox, { filename: 'js/engine.js' });
const E = sandbox.window.Engine;

const html = read('index.html');
const app = read('js/app.js');
const css = read('style.css');

test('движок экспортирует функции ежедневной миссии', () => {
  for (const name of ['campaignDaily', 'campaignDailyReward', 'campaignDailyStreak']) {
    assert.equal(typeof E[name], 'function', name);
  }
});

test('campaignDaily детерминирован по дате и имеет нужную форму', () => {
  const a = E.campaignDaily('2026-11-07');
  const b = E.campaignDaily('2026-11-07');
  assert.deepEqual(Object.keys(a).sort(), ['id', 'mods', 'seed']);
  assert.deepEqual({ ...a }, { ...b });
  assert.ok(E.campaignById(a.id));
  assert.ok(Array.isArray(a.mods));
  assert.ok(Number.isInteger(a.seed));
});

test('campaignDaily меняет миссию от даты и выбирает из пройденных', () => {
  const ids = new Set();
  for (let i = 1; i <= 40; i += 1) {
    ids.add(E.campaignDaily('2026-02-' + String(i).padStart(2, '0')).id);
  }
  assert.ok(ids.size > 1, 'разные даты должны давать разные миссии');

  const progress = { completed: [1, 2], stars: { 1: 3, 2: 5 } };
  for (let i = 1; i <= 40; i += 1) {
    const daily = E.campaignDaily('2026-03-' + String(i).padStart(2, '0'), progress);
    assert.ok([1, 2].includes(daily.id), 'миссия должна быть из пройденных');
  }
});

test('campaignDailyReward даёт 30 и не даёт повторно в тот же день', () => {
  assert.equal(E.campaignDailyReward('2026-11-07'), 30);
  assert.equal(E.campaignDailyReward('2026-11-07', {
    campaign: { daily: { rewardDate: '2026-11-07' } }
  }), 0);
  assert.equal(E.campaignDailyReward('2026-11-07', {
    campaign: { daily: { rewardDate: '2026-11-06' } }
  }), 30);
});

test('campaignDailyStreak считает серию и обрывает её после пропуска', () => {
  const today = { campaign: { daily: { date: '2026-11-07', streak: 4 } } };
  const yesterday = { campaign: { daily: { date: '2026-11-06', streak: 4 } } };
  const stale = { campaign: { daily: { date: '2026-11-05', streak: 4 } } };
  assert.equal(E.campaignDailyStreak(today, '2026-11-07'), 4);
  assert.equal(E.campaignDailyStreak(yesterday, '2026-11-07'), 4);
  assert.equal(E.campaignDailyStreak(stale, '2026-11-07'), 0);
  assert.equal(E.campaignDailyStreak({}, '2026-11-07'), 0);
});

test('профиль хранит поля миссии дня и не меняет ключ localStorage', () => {
  assert.match(app, /daily: \{ date: '', streak: 0, tokens: 0, rewardDate: '', milestones: \{\} \}/);
  assert.match(app, /function normalizeCampaignDaily/);
  assert.match(app, /daily: normalizeCampaignDaily\(src\.daily\)/);
  assert.match(app, /seabattle\.profile\.v2/);
});

test('на экране кампании есть карточка миссии дня', () => {
  assert.match(html, /id="campaign-daily"/);
  assert.match(html, /id="campaign-daily-title"/);
  assert.match(html, /id="campaign-daily-mods"/);
  assert.match(html, /id="campaign-daily-reward"/);
  assert.match(html, /id="campaign-daily-streak"/);
  assert.match(html, /id="campaign-daily-token"/);
  assert.match(html, /id="btn-campaign-daily"/);
});

test('карточка показывает условия, награду, серию и жетоны', () => {
  assert.match(app, /function renderCampaignDaily/);
  assert.match(app, /Engine\.campaignDaily\(dayKey\(\), state\.profile\.campaign\)/);
  assert.match(app, /campaignModsText\(daily\.mods\)/);
  assert.match(app, /\+30 ELO · 🎫 1 жетон/);
  assert.match(app, /Серия: ' \+ streak \+ ' дн\./);
  assert.match(app, /'🎫 ' \+ \(saved\.tokens \|\| 0\)/);
  assert.match(app, /renderCampaignDaily\(\)/);
});

test('запуск идёт через startCampaignMission с флагом daily', () => {
  assert.match(app, /function startCampaignDaily/);
  assert.match(app, /startCampaignMission\(daily\.id, true\)/);
  assert.match(app, /function startCampaignMission\(id, daily\)/);
  assert.match(app, /daily: !!daily/);
  assert.match(app, /if \(!daily\) state\.profile\.campaign\.lastId = mission\.id/);
  assert.match(app, /btn-campaign-daily/);
});

test('награда начисляется один раз и только за daily-миссию', () => {
  assert.match(app, /function claimCampaignDaily/);
  assert.match(app, /if \(d\.date === today\)/);
  assert.match(app, /const reward = Engine\.campaignDailyReward\(today, p\)/);
  assert.match(app, /p\.rating = Math\.round\(Number\(p\.rating\) \|\| 0\) \+ reward/);
  assert.match(app, /p\.best = Math\.max\(Number\(p\.best\) \|\| 0, p\.rating\)/);
  assert.match(app, /if \(c\.daily\) daily = claimCampaignDaily\(\)/);
  assert.match(app, /\[3, 7, 14\]\.forEach/);
  assert.match(app, /d\.tokens = \(d\.tokens \|\| 0\) \+ 1/);
});

test('обычная кампания остаётся без рейтинга', () => {
  assert.match(app, /if \(state\.campaign\) return false/);
  assert.match(app, /if \(c\.daily\) daily = claimCampaignDaily\(\)/);
  assert.doesNotMatch(app, /state\.profile\.campaign[\s\S]{0,80}p\.rating \+=/);
});

test('PWA-кэш поднят до sb-v43, карточка адаптивна', () => {
  assert.match(read('sw.js'), /const VERSION = 'sb-v43'/);
  assert.match(app, /const SW_VERSION = 'sb-v43'/);
  assert.match(css, /\.campaign-daily\{/);
  assert.match(css, /\.campaign-daily-btn\{[^}]*min-height:40px/);
  assert.match(css, /@media \(max-width:560px\)\{[\s\S]*?\.campaign-daily-btn\{width:100%;margin-left:0\}/);
});
