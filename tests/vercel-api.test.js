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

test('MongoDB action state machine rejects skipped workflow steps', function () {
  assert.equal(api.transitionAllowed('ASSIGNED', 'ACKNOWLEDGED'), true);
  assert.equal(api.transitionAllowed('COMPLETED', 'VERIFIED'), true);
  assert.equal(api.transitionAllowed('ASSIGNED', 'VERIFIED'), false);
  assert.equal(api.transitionAllowed('VERIFIED', 'IN_PROGRESS'), false);
});

test('action UI includes source traceability, evidence, rework, and comments', function () {
  const scripts = fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8');
  assert.match(scripts, /Source report/);
  assert.match(scripts, /Evidence is required before completion/);
  assert.match(scripts, /Return for rework/);
  assert.match(scripts, /addActionComment/);
});

test('dashboard does not substitute hard-coded demo totals', function () {
  const source = fs.readFileSync(path.join(root, 'api', 'rpc.js'), 'utf8');
  assert.doesNotMatch(source, /obligationCount \|\| 18/);
  assert.doesNotMatch(source, /submitted \|\| 14/);
  assert.match(source, /MISSING_REPORT/);
});

test('Apps Script notification worker requires protected bridge configuration', function () {
  const worker = fs.readFileSync(path.join(root, 'MongoNotificationWorker.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'api', 'notification-worker.js'), 'utf8');
  assert.match(worker, /MONGODB_NOTIFICATION_SECRET/);
  assert.match(worker, /MailApp\.sendEmail/);
  assert.match(bridge, /timingSafeEqual/);
});
