'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const template = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'Styles.html'), 'utf8');
const scripts = fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8');

const html = template
  .replace('<?!= include(\'Styles\'); ?>', function () { return styles; })
  .replace('<?= appName ?>', 'Accountability Hub')
  .replace(
    '<script><?!= include(\'Scripts\'); ?></script>',
    function () { return `<script>${scripts}</script>`; },
  );

for (const [index, match] of Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).entries()) {
  new vm.Script(match[1], { filename: `dist-inline-${index + 1}.js` });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), html);
console.log('Built dist/index.html for Vercel.');
