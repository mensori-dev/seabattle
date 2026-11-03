import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
const app = readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('service worker and app shell share version sb-v17', () => {
  assert.match(sw, /const VERSION = 'sb-v17';/);
  assert.match(app, /const SW_VERSION = 'sb-v17';/);
});

test('service worker skips /site/ before caching navigation', () => {
  const skip = sw.indexOf("url.pathname.includes('/site/')");
  const navigation = sw.indexOf("req.mode === 'navigate'");
  assert.ok(skip > -1, 'sw.js must return early for /site/ paths');
  assert.ok(navigation > -1, 'sw.js must handle navigation requests');
  assert.ok(skip < navigation, 'the /site/ skip must run before the navigation cache');
});
