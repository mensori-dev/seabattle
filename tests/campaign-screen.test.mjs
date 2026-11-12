import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const app = read('js/app.js');
const css = read('style.css');
const sw = read('sw.js');

test('в меню есть карточка кампании, а на экране — шапка и карта', () => {
  assert.match(html, /id="btn-campaign"/);
  assert.match(html, /id="btn-campaign"[\s\S]{0,220}🗺️/);
  assert.match(html, /id="screen-campaign"/);
  assert.match(html, /id="campaign-map"/);
  assert.match(html, /id="btn-campaign-back"/);
  assert.match(html, /id="campaign-act-title"/);
  assert.match(html, /id="campaign-stars"/);
});

test('showScreen знает экран campaign и сразу рендерит карту', () => {
  assert.match(app, /menu:\s*1,\s*campaign:\s*1/);
  assert.match(app, /if \(name === 'campaign'\) renderCampaign\(\)/);
  assert.match(app, /showScreen\('campaign'\)/);
});

test('карта рисует три акта и по четыре миссии из Engine.CAMPAIGN', () => {
  assert.match(app, /\[1, 2, 3\]\.forEach/);
  assert.match(app, /missions\.filter\(\(m\) => m\.act === act\)/);
  assert.match(app, /campaign-act/);
  assert.match(app, /campaign-missions/);
  assert.match(app, /campaignActName/);
  assert.match(app, /Акт I · Туман/);
  assert.match(app, /Акт II · Шторм/);
  assert.match(app, /Акт III · Ледяной флот/);
});

test('босс отмечается бейджем БОСС', () => {
  assert.match(app, /mission\.boss/);
  assert.match(app, /campaign-boss/);
  assert.match(app, /'БОСС'/);
});

test('недоступные миссии блокируются через campaignUnlocked', () => {
  assert.match(app, /Engine\.campaignUnlocked\(progress, mission\.id\)/);
  assert.match(app, /card\.disabled = true/);
  assert.match(app, /classList\.add\('is-locked'\)/);
  assert.match(css, /\.campaign-mission\.is-locked/);
  assert.match(app, /'Миссия ' \+ mission\.id \+ ': закрыта'/);
});

test('звёзды читаются из профиля и показываются как звёзды/максимум', () => {
  assert.match(app, /campaign: \{\s*completed: \[\], stars: \{\}, lastId: 1,/);
  assert.match(app, /campaign: normalizeCampaign\(p\.campaign\)/);
  assert.match(app, /function normalizeCampaign/);
  assert.match(app, /state\.profile\.campaign/);
  assert.match(app, /\(p\.stars \|\| \{\}\)\[id\]/);
  assert.match(app, /mission\.stars \|\| 5/);
  assert.match(app, /i <= stars \? ' is-on' : ''/);
  assert.match(app, /stars \+ ' \/ ' \+ maxStars/);
  assert.match(app, /seabattle\.profile\.v2/);
});

test('клик по открытой миссии запоминает её и запускает миссию', () => {
  assert.match(app, /state\.profile\.campaign\.lastId = mission\.id/);
  assert.match(app, /saveProfile\(\)/);
  assert.match(app, /startCampaignMission\(id\)/);
  assert.doesNotMatch(app, /Миссия ' \+ id \+ ': скоро/);
  assert.match(app, /openCampaign\(\)/);
  assert.match(app, /btn-campaign-back/);
});

test('кнопка кампании ведёт к последней открытой миссии', () => {
  assert.match(app, /function openCampaign\(\)/);
  assert.match(app, /\[data-mission="' \+ \(p\.lastId \|\| 1\) \+ '"\]/);
  assert.match(app, /scrollIntoView/);
  assert.match(app, /prefers-reduced-motion: reduce/);
});

test('PWA-кэш поднят до sb-v45 в sw.js и app.js', () => {
  assert.match(sw, /const VERSION = 'sb-v45'/);
  assert.match(app, /const SW_VERSION = 'sb-v45'/);
  assert.match(read('tests/rustore.test.mjs'), /sb-v45/);
});

test('карта адаптивна, тач-цели крупные и уважают reduced-motion', () => {
  assert.match(css, /\.screen-campaign/);
  assert.match(css, /\.campaign-missions\{[^}]*grid-template-columns:repeat\(2/);
  assert.match(css, /@media \(max-width:560px\)\{[\s\S]*?\.campaign-missions\{grid-template-columns:1fr\}/);
  assert.match(css, /@media \(max-width:380px\)/);
  assert.match(css, /\.campaign-mission\{[\s\S]*?min-height:104px/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.campaign-mission\{transition:none\}/);
});

test('кампания запускает бой через startCampaignMission, движок на месте', () => {
  assert.match(app, /function startCampaignMission\(id, daily\)/);
  assert.match(app, /startMatch\(true\)/);
  const engineStart = fs.statSync(path.join(root, 'js', 'engine.js')).mtimeMs;
  assert.ok(engineStart > 0);
});
