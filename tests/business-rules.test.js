'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  Date,
  JSON,
  Number,
  String,
  Array,
  Object,
  RegExp,
  Math,
  Utilities: {
    getUuid: () => '00000000-0000-0000-0000-000000000000',
    formatDate: (date, timezone, format) => {
      if (format === 'Z') return '+0000';
      if (format === 'yyyy-MM-dd') return date.toISOString().slice(0, 10);
      return date.toISOString();
    },
  },
});

vm.runInContext(fs.readFileSync(path.join(root, 'Config.js'), 'utf8'), context, { filename: 'Config.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'Rules.js'), 'utf8'), context, { filename: 'Rules.js' });
const run = (code) => vm.runInContext(code, context);

test('action state machine allows intended transitions only', () => {
  assert.equal(run("transitionAllowed_('ASSIGNED','ACKNOWLEDGED')"), true);
  assert.equal(run("transitionAllowed_('COMPLETED','VERIFIED')"), true);
  assert.equal(run("transitionAllowed_('VERIFIED','IN_PROGRESS')"), false);
  assert.equal(run("transitionAllowed_('ASSIGNED','VERIFIED')"), false);
});

test('required and typed values are validated', () => {
  assert.match(run("validateFieldValue_({field_type:'TEXT',field_name:'Summary',required:true,validation_json:'{}'}, '')"), /required/);
  assert.match(run("validateFieldValue_({field_type:'PERCENTAGE',field_name:'Progress',required:false,validation_json:'{}'}, 120)"), /between 0 and 100/);
  assert.equal(run("validateFieldValue_({field_type:'URL',field_name:'Evidence',required:false,validation_json:'{}'}, 'https://example.com')"), '');
});

test('notification keys are deterministic and recipient-specific', () => {
  const first = run("notificationEventKey_('ACTION','act_1','OVERDUE','LEVEL_1','USER@EXAMPLE.COM')");
  const second = run("notificationEventKey_('ACTION','act_1','OVERDUE','LEVEL_1','user@example.com')");
  const third = run("notificationEventKey_('ACTION','act_1','OVERDUE','LEVEL_2','user@example.com')");
  assert.equal(first, second);
  assert.notEqual(first, third);
});

test('escalation stage advances with overdue age', () => {
  assert.equal(run("escalationStage_('2026-01-10T00:00:00.000Z', new Date('2026-01-09T23:00:00.000Z'), 72, 168)"), '');
  assert.equal(run("escalationStage_('2026-01-10T00:00:00.000Z', new Date('2026-01-11T00:00:00.000Z'), 72, 168)"), 'LEVEL_1');
  assert.equal(run("escalationStage_('2026-01-10T00:00:00.000Z', new Date('2026-01-18T00:00:00.000Z'), 72, 168)"), 'LEVEL_3');
});

test('template fields reject duplicate names and invalid dropdowns', () => {
  assert.throws(() => run("validateTemplateFields_([{fieldName:'Status',fieldType:'TEXT'},{fieldName:'status',fieldType:'TEXT'}])"), /unique/);
  assert.throws(() => run("validateTemplateFields_([{fieldName:'Region',fieldType:'DROPDOWN',options:[]}])"), /options/);
});
