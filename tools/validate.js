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
const MATCH_KEYS = ['name', 'nameRegex', 'enchantments', 'customName', 'customNameRegex', 'lore', 'loreRegex', 'potionId', 'effects'];
const blacklist = j.blacklist;
if (blacklist !== undefined) {
  if (!Array.isArray(blacklist)) problems.push('blacklist 必须是数组');
  else {
    if (blacklist.length && !j.trash) problems.push('blacklist 非空但缺少 trash 投掷方向');
    blacklist.forEach((m, i) => {
      if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.keys(m).length) {
        problems.push(`blacklist[${i}] 不是有效的 Match object`);
        return;
      }
      for (const k of Object.keys(m)) if (!MATCH_KEYS.includes(k)) problems.push(`blacklist[${i}].${k} 是未知字段`);
      if (!MATCH_KEYS.some(k => k in m)) problems.push(`blacklist[${i}] 缺少匹配条件`);
      for (const [a, b] of [['name', 'nameRegex'], ['customName', 'customNameRegex'], ['lore', 'loreRegex']]) {
        if (a in m && b in m) problems.push(`blacklist[${i}] ${a} 与 ${b} 互斥`);
      }
    });
  }
}

// 特殊点位（bot 新格式：base 站位；trash/minecart 仅 yaw/pitch）
const ROOT_KEYS = ['items', 'blacklist', 'home', 'trash', 'base', 'minecart', 'button', 'ready', 'readyButton'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const hasNums = (o, fields) => fields.every(f => typeof o[f] === 'number' && Number.isFinite(o[f]));
for (const k of Object.keys(j)) if (!ROOT_KEYS.includes(k)) problems.push(`未知根字段: ${k}`);
if (j.collector !== undefined) problems.push('旧版 collector 字段存在；应为 base');

function checkSpecial(key, required, fields, optional) {
  if (j[key] === undefined) {
    if (required) problems.push(`缺少特殊点位: ${key}`);
    return;
  }
  const p = j[key];
  if (!isObj(p)) { problems.push(`${key} 必须是 object`); return; }
  for (const f of Object.keys(p)) {
    if (!fields.includes(f) && !(optional || []).includes(f)) problems.push(`${key}.${f} 不是允许字段`);
  }
  if (!hasNums(p, fields)) problems.push(`${key} 需要数字字段: ${fields.join('/')}`);
}
checkSpecial('base', true, ['x', 'y', 'z', 'yaw', 'pitch'], ['label', 'area', 'side']);
checkSpecial('home', false, ['x', 'y', 'z', 'yaw', 'pitch'], ['label', 'area', 'side']);
checkSpecial('trash', false, ['yaw', 'pitch'], ['label']);
checkSpecial('minecart', false, ['yaw', 'pitch'], ['label']);
checkSpecial('button', false, ['x', 'y', 'z'], ['label']);
checkSpecial('readyButton', false, ['x', 'y', 'z'], ['label']);
if (j.ready !== undefined) {
  const p = j.ready;
  if (!isObj(p)) problems.push('ready 必须是 object');
  else {
    for (const f of Object.keys(p)) if (!['x', 'y', 'z', 'yaw', 'pitch', 'label'].includes(f)) problems.push(`ready.${f} 不是允许字段`);
    if (!hasNums(p, ['x', 'y', 'z'])) problems.push('ready 需要数字字段: x/y/z');
    for (const f of ['yaw', 'pitch']) {
      if (p[f] !== undefined && (typeof p[f] !== 'number' || !Number.isFinite(p[f]))) problems.push(`ready.${f} 必须是数字`);
    }
  }
}

if (isObj(j.base) && isObj(j.button) && hasNums(j.base, ['x', 'y', 'z']) && hasNums(j.button, ['x', 'y', 'z'])) {
  const bh = Math.hypot(j.button.x - j.base.x, j.button.z - j.base.z);
  const bv = Math.abs(j.button.y - j.base.y);
  if (bh > 3 || bv > 2) problems.push(`button 距 base 过远: ${bh.toFixed(2)}/${bv.toFixed(2)}`);
}
if (isObj(j.ready) && isObj(j.readyButton) && hasNums(j.ready, ['x', 'z']) && hasNums(j.readyButton, ['x', 'z'])) {
  const rr = Math.hypot(j.ready.x - j.readyButton.x, j.ready.z - j.readyButton.z);
  if (rr > 4.5) problems.push(`ready 与 readyButton 距离 ${rr.toFixed(2)} > 4.5`);
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
