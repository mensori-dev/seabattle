import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('в расстановке есть редактор корабля', () => {
  const html = read('index.html');
  assert.match(html, /id="ship-editor"/);
  for (const act of ['left', 'right', 'delete', 'close']) {
    assert.match(html, new RegExp('data-act="' + act + '"'));
  }
});

test('app.js использует движок для выбора и поворота', () => {
  const app = read('js/app.js');
  assert.match(app, /Engine\.shipAt/);
  assert.match(app, /Engine\.rotateShip/);
  assert.match(app, /function openShipEditor/);
  assert.match(app, /function closeShipEditor/);
  assert.match(app, /function placementLocked/);
  assert.match(app, /is-fleet-sent/);
});

test('CSS затемняет поле и подсвечивает выбранный корабль', () => {
  const css = read('style.css');
  assert.match(css, /\.cell\.ship-selected/);
  assert.match(css, /\.screen-place\.is-ship-edit/);
  assert.match(css, /\.ship-editor-panel/);
});
