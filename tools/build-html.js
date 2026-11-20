'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'template', 'html-data.json'), 'utf8'));
let html = fs.readFileSync(path.join(__dirname, 'template', 'html-template.html'), 'utf8');

function inject(src, name, value) {
  const marker = `__${name}__`;
  if (!src.includes(marker)) throw new Error('模板缺少占位符 ' + marker);
  return src.replace(marker, () => JSON.stringify(value));
}

html = inject(html, 'SLOTS', data.slots);
html = inject(html, 'TEX', data.tex);
html = inject(html, 'ITEM_CN', data.itemCn);
html = inject(html, 'AREAS', data.areas);
fs.writeFileSync(path.join(ROOT, 'viewer', 'index.html'), html, 'utf8');
console.log('wrote viewer/index.html', html.length, 'bytes');
