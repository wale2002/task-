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
  Utilities: { getUuid: () => 'id' },
  Session: { getActiveUser: () => ({ getEmail: () => '' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
});

vm.runInContext(fs.readFileSync(path.join(root, 'Config.js'), 'utf8'), context, { filename: 'Config.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'Security.js'), 'utf8'), context, { filename: 'Security.js' });
const run = (code) => vm.runInContext(code, context);

test('employee and HOD department scope is constrained', () => {
  assert.equal(run("canSeeDepartment_({role:'EMPLOYEE',departmentId:'dep_a'}, 'dep_a')"), true);
  assert.equal(run("canSeeDepartment_({role:'EMPLOYEE',departmentId:'dep_a'}, 'dep_b')"), false);
  assert.equal(run("canManageDepartment_({role:'HOD',departmentId:'dep_a'}, 'dep_a')"), true);
  assert.equal(run("canManageDepartment_({role:'HOD',departmentId:'dep_a'}, 'dep_b')"), false);
});

test('executive and admin can manage organization departments', () => {
  assert.equal(run("canManageDepartment_({role:'EXECUTIVE',departmentId:''}, 'dep_b')"), true);
  assert.equal(run("canManageDepartment_({role:'ADMIN',departmentId:''}, 'dep_b')"), true);
});
