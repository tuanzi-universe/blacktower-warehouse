'use strict';
const fs = require('fs');
const path = require('path');
const { EXCLUDED } = require('./families');

const ROOT = path.resolve(__dirname, '..');
const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'points', 'itemsorter-points.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const obtainable = items.filter(i => !EXCLUDED.has(i) && !i.endsWith('_spawn_egg'));
const all = new Set(items);
const rules = j.items;

const problems = [];
const nameOnly = new Map();
const customNamed = new Map();
const special = { enchanted_book: 0, potion: 0, splash_potion: 0, lingering_potion: 0, tipped_arrow: 0 };
for (const r of rules) {
  const m = r.match;
  const name = (m.name || '').replace(/^minecraft:/, '');
  if (!m.name) { problems.push('rule without name: ' + JSON.stringify(m)); continue; }
  if (m.enchantments) {
    if (name !== 'enchanted_book') problems.push('enchant rule on non-book: ' + name);
    special.enchanted_book++;
  } else if (m.effects) {
    if (!['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow'].includes(name)) problems.push('effect rule on non-potion: ' + name);
    special[name]++;
  } else if (m.potionId !== undefined) {
    if (!['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow'].includes(name)) problems.push('potionId rule on non-potion: ' + name);
    special[name]++;
  } else if (m.customName || m.customNameRegex) {
    if (customNamed.has(name)) problems.push('duplicate customName rule: ' + name);
    customNamed.set(name, r);
  } else {
    if (special[name] !== undefined) special[name]++;
    if (nameOnly.has(name)) problems.push('duplicate name-only rule: ' + name);
    nameOnly.set(name, r);
  }
}

// 自定义名称规则：必须有同名通用兜底，且排在其前面
for (const [name, r] of customNamed) {
  if (!all.has(name)) problems.push('customName rule for unknown item: ' + name);
  const generic = nameOnly.get(name);
  if (!generic) problems.push('customName rule without generic fallback: ' + name);
  else if (rules.indexOf(r) > rules.indexOf(generic)) problems.push('customName rule after generic name rule: ' + name);
}

for (const item of obtainable) {
  if (item === 'enchanted_book') {
    if (!special.enchanted_book) problems.push('missing enchanted_book rules');
    continue;
  }
  if (['potion', 'splash_potion', 'lingering_potion'].includes(item)) {
    if (!special[item]) problems.push('missing potion rules: ' + item);
    continue;
  }
  if (item === 'tipped_arrow') {
    if (!special.tipped_arrow) problems.push('missing tipped_arrow rule');
    continue;
  }
  if (!nameOnly.has(item)) problems.push('unmapped obtainable item: ' + item);
}
for (const name of nameOnly.keys()) {
  if (!all.has(name)) problems.push('rule for unknown item: ' + name);
  if (EXCLUDED.has(name) || name.endsWith('_spawn_egg')) problems.push('rule for excluded item: ' + name);
}

// 点位/货位一致性
const rows = fs.readFileSync(path.join(ROOT, 'data', 'partition_new.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
const slotPoints = new Map();
for (const r of rows) slotPoints.set(`${r[13]},${r[14]},${r[15]}`, r);
for (const r of rules) {
  const p = r.point;
  const key = `${p.x},${p.y},${p.z}`;
  const row = slotPoints.get(key);
  if (!row) problems.push(`point not in partition_new: ${key}`);
  else if (row[0] !== p.area || row[1] !== p.side) problems.push(`point area/side mismatch: ${key}`);
}
const pointSet = new Set(rules.map(r => `${r.point.x},${r.point.y},${r.point.z},${r.point.yaw},${r.point.pitch}`));
const units = pointSet.size;

// 每侧单元数
const sideCount = {};
for (const r of rules) {
  const k = (r.point.area || '') + '-' + (r.point.side || '');
  if (!sideCount[k]) sideCount[k] = new Set();
  sideCount[k].add(`${r.point.x},${r.point.y},${r.point.z},${r.point.yaw},${r.point.pitch}`);
}
for (const [k, set] of Object.entries(sideCount)) {
  if (k === 'minecart-') continue;
  if (/^[A-H]-[LR]$/.test(k) && set.size > 55) problems.push(`${k} units ${set.size} > 55`);
}

// 黑名单
const blacklist = j.blacklist;
if (blacklist !== undefined) {
  if (!Array.isArray(blacklist)) problems.push('blacklist 必须是数组');
  else {
    if (blacklist.length && !j.trash) problems.push('blacklist 非空但缺少 trash 点位');
    blacklist.forEach((m, i) => {
      if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.keys(m).length) {
        problems.push(`blacklist[${i}] 不是有效的 Match object`);
      }
    });
  }
}

console.log('rules', rules.length, 'units', units, 'obtainable', obtainable.length, 'blacklist', Array.isArray(blacklist) ? blacklist.length : 0);
console.log('special rule counts', special);
console.log('normal name rules', nameOnly.size);
console.log('side unit counts', Object.fromEntries(Object.entries(sideCount).map(([k, v]) => [k, v.size]).filter(([k]) => /^[A-H]/.test(k))));
if (problems.length) {
  console.log('PROBLEMS', problems.length);
  console.log(problems.slice(0, 50).join('\n'));
  process.exit(1);
}
console.log('validation passed');
