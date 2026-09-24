'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const api = require('../api/rpc')._private;

test('Vercel frontend uses the server RPC instead of the removed demo adapter', function () {
  const scripts = fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-vercel.js'), 'utf8');
  assert.match(scripts, /fetch\('\/api\/rpc'/);
  assert.doesNotMatch(build, /demo-api/);
  assert.equal(fs.existsSync(path.join(root, 'vercel', 'demo-api.js')), false);
});

test('MongoDB search text is escaped before becoming a regular expression', function () {
  assert.equal(api.escapeRegex('report.*[2026]'), 'report\\.\\*\\[2026\\]');
});

test('generated business ids include the requested prefix', function () {
  assert.match(api.id('ACT'), /^ACT-[A-Z0-9]+$/);
});
