'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const lines = clean.split('\n');
  const rows = [];
  for (const line of lines) {
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}
function readCsv(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = rows[0];
  return rows.slice(1).filter(r => r.some(x => x !== '')).map(r => {
    const o = {}; head.forEach((h, i) => o[h] = r[i] ?? ''); return o;
  });
}

const points = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'points', 'itemsorter-points.json'), 'utf8'));
const slotRows = readCsv(path.join(ROOT, 'data', 'partition_new.csv'));
const slotByPoint = new Map();
for (const r of slotRows) slotByPoint.set(`${r.point_x},${r.point_y},${r.point_z}`, r);

const nameCn = new Map();
for (const r of readCsv('C:/Projects/blacktower/papers/序号-工作表1.csv')) {
  if (r['Minecraft ID']) nameCn.set(r['Minecraft ID'], r['中文译名'] || '');
}
const html = fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8');
const nl = String.fromCharCode(10);
const texStart = html.indexOf('const TEX = ');
const texLine = html.slice(texStart, html.indexOf(nl, texStart));
const TEX = texLine ? JSON.parse(texLine.slice('const TEX = '.length).replace(/;\s*$/, '')) : {};
const hasTex = id => !!(TEX[id] && (TEX[id].item || TEX[id].block));

const groups = new Map();
for (const r of points.items) {
  const p = r.point;
  const key = `${p.x},${p.y},${p.z},${p.yaw},${p.pitch}`;
  if (!groups.has(key)) groups.set(key, { p, rules: [] });
  groups.get(key).rules.push(r);
}

function itemOf(m) {
  if (m.name) return m.name.replace(/^minecraft:/, '');
  if (m.enchantments) return 'enchanted_book';
  if (m.effects || m.potionId !== undefined) return 'potion';
  return '';
}
function typeOf(rules) {
  if (rules.some(r => r.match.enchantments)) return 'enchant';
  if (rules.some(r => r.match.effects || r.match.potionId !== undefined)) return 'potion';
  return 'item';
}

const units = [...groups.values()].map(g => {
  const p = g.p;
  const s = slotByPoint.get(`${p.x},${p.y},${p.z}`) || {};
  const items = [...new Set(g.rules.map(r => itemOf(r.match)).filter(Boolean))];
  return {
    area: p.area || s.area || '',
    side: p.side || s.side || '',
    slot: s.slot ? Number(s.slot) : 0,
    label: p.label || '',
    type: typeOf(g.rules),
    icon: items.find(hasTex) || '',
    items,
    ruleCount: g.rules.length,
  };
}).sort((a, b) =>
  `${a.area}${a.side}`.localeCompare(`${b.area}${b.side}`) || a.slot - b.slot);

const merged = units.filter(u => u.items.length > 1);
const itemMerged = merged.filter(u => u.type === 'item');
const potionMerged = merged.filter(u => u.type === 'potion');
const enchant = units.filter(u => u.type === 'enchant');
const single = units.filter(u => u.items.length === 1 && u.type !== 'enchant');

const cn = id => nameCn.get(id) || id;
const mapShort = u => {
  const chars = Array.from(cn(u.items[0] || '').trim()).slice(0, 4);
  return chars.slice(0, 2).join('') + (chars.length > 2 ? '/' + chars.slice(2).join('') : '');
};

const byArea = {};
for (const u of merged) {
  byArea[u.area] = byArea[u.area] || { units: 0, items: 0 };
  byArea[u.area].units++;
  byArea[u.area].items += u.items.length;
}

const md = [];
md.push('# 合并编组报告');
md.push('');
md.push('日期：2026-11-22（v3）。合并编组 = 同一个点位/存储单元内包含 2 种及以上物品 ID。');
md.push('');
md.push('- 地图图标取组内第一个有材质的物品；组内都没有材质时，取第一个物品名前四位，按每行两个字缩小展示。');
md.push('- 附魔书单元为“1 种物品 + 多等级规则”，不按物品合并统计；药水效果单元包含普通/喷溅/滞留/药箭 4 种形态，计入合并。');
md.push('');
md.push('## 汇总');
md.push('');
md.push('| 项 | 数量 |');
md.push('|---|---:|');
md.push(`| 存储单元总数 | ${units.length} |`);
md.push(`| 合并编组单元 | ${merged.length} |`);
md.push(`| 其中：物品合并 | ${itemMerged.length} |`);
md.push(`| 其中：药水形态合并 | ${potionMerged.length} |`);
md.push(`| 未合并单物品单元 | ${single.length} |`);
md.push(`| 附魔书单元（多等级，不计合并） | ${enchant.length} |`);
md.push(`| 合并单元物品条目数（含药水形态重复） | ${merged.reduce((n, u) => n + u.items.length, 0)} |`);
md.push(`| 合并单元涉及的唯一物品 ID 数 | ${new Set(merged.flatMap(u => u.items)).size} |`);
md.push('');
md.push('| 区 | 合并单元 | 物品条目 |');
md.push('|---|---:|---:|');
for (const a of 'ABCDEFGH') {
  const v = byArea[a] || { units: 0, items: 0 };
  md.push(`| ${a} | ${v.units} | ${v.items} |`);
}
md.push('');

function section(title, list) {
  md.push(`## ${title}（${list.length}）`);
  md.push('');
  let cur = '';
  for (const u of list) {
    const key = `${u.area}-${u.side}`;
    if (key !== cur) {
      cur = key;
      md.push(`### ${key}`);
      md.push('');
    }
    md.push(`**${u.area}-${u.side} #${u.slot} ${u.label}**（${u.items.length} 项，${u.ruleCount} 条规则）`);
    if (u.icon) md.push(`地图图标：${cn(u.icon)}（${u.icon}）`);
    else md.push(`名称展示：${mapShort(u)}`);
    md.push('');
    md.push(u.items.map(id => `${cn(id)}（${id}）`).join('、'));
    md.push('');
  }
}

section('一、物品合并编组', itemMerged);
section('二、药水形态合并', potionMerged);

md.push('## 三、未合并说明');
md.push('');
md.push(`- 单物品单元 ${single.length} 个：仅 1 种物品 ID，无合并标识。`);
md.push(`- 附魔书单元 ${enchant.length} 个：每格 1 种物品（附魔书），按 43 个附魔 + 1 个兜底分开，属于等级规则拆分，不是物品合并。`);
md.push('');

fs.writeFileSync(path.join(ROOT, 'docs', '合并编组报告.md'), md.join('\n'), 'utf8');

const header = ['area', 'side', 'slot', 'type', 'unit', 'merged_count', 'icon_id', 'icon_cn', 'map_display', 'item_ids', 'item_cn', 'rule_count'];
const rows = merged.map(u => [
  u.area, u.side, u.slot, u.type, u.label, u.items.length, u.icon, u.icon ? cn(u.icon) : '',
  u.icon ? cn(u.icon) : mapShort(u),
  u.items.join('|'), u.items.map(cn).join('|'), u.ruleCount,
]);
const csv = [header, ...rows].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs', '合并编组报告.csv'), csv, 'utf8');

console.log('units', units.length, 'merged', merged.length, 'item', itemMerged.length, 'potion', potionMerged.length, 'single', single.length, 'enchant', enchant.length);
console.log('wrote 合并编组报告.md / .csv');
