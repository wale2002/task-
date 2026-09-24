'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const serverFiles = fs.readdirSync(root).filter((name) => name.endsWith('.js'));
for (const name of serverFiles) {
  new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name });
}
for (const name of fs.readdirSync(path.join(root, 'api')).filter((entry) => entry.endsWith('.js'))) {
  new vm.Script(fs.readFileSync(path.join(root, 'api', name), 'utf8'), { filename: `api/${name}` });
}

const html = fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8');
new vm.Script(html, { filename: 'Scripts.html' });
JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
console.log(`Syntax OK: ${serverFiles.length} server files, client script, and manifest.`);
