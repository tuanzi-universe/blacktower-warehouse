'use strict';
const fs = require('fs');
const path = require('path');
const { EXCLUDED } = require('./families');

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

const oldRows = readCsv(path.join(ROOT, 'data', 'item_map-v2.csv'));
const oldMap = new Map();
for (const r of oldRows) {
  if (!oldMap.has(r.item_id)) oldMap.set(r.item_id, r.area + '-' + r.side);
}

const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const obtainable = items.filter(i => !EXCLUDED.has(i) && !i.endsWith('_spawn_egg'));
const nameCn = new Map();
for (const r of readCsv('C:/Projects/blacktower/papers/序号-工作表1.csv')) {
  if (r['Minecraft ID']) nameCn.set(r['Minecraft ID'], r['中文译名'] || '');
}

const mapRows = readCsv(path.join(ROOT, 'data', 'item_map.csv'));
const newMap = new Map();
for (const r of mapRows) {
  if (!newMap.has(r.item_id)) newMap.set(r.item_id, []);
  newMap.get(r.item_id).push(r);
}

const out = [];
const SPECIAL_SET = new Set(['enchanted_book', 'potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']);
let added = 0, moved = 0, same = 0, special = 0, custom = 0;
for (const item of obtainable) {
  const old = oldMap.get(item) || '';
  const rows = newMap.get(item) || [];
  const units = [...new Set(rows.map(r => r.area + '-' + r.side + ' ' + r.unit_id))];
  const customRow = rows.find(r => r.match_type === 'customName');
  let change;
  if (SPECIAL_SET.has(item)) {
    change = '属性单元'; special++;
  } else if (customRow) {
    change = '自定义名新增'; custom++;
  } else if (!old) {
    change = '新增上架'; added++;
  } else if (units.some(u => u.startsWith(old))) {
    change = '同区调整'; same++;
  } else {
    change = '重新归位'; moved++;
  }
  const cn = customRow ? `${customRow.name_cn}（${nameCn.get(item) || item}）` : (nameCn.get(item) || '');
  out.push({ item, cn, old, units: units.join(' | '), change });
}
// v3 移除物：v2 有收纳、v3 不再收录的物品
const removedItems = [...oldMap.keys()].filter(i => !obtainable.includes(i) && !SPECIAL_SET.has(i));

const header = ['item_id', '中文名', '旧区-侧', '新区-侧 单元', '变化'];
const csv = [header, ...out.map(r => [r.item, r.cn, r.old, r.units, r.change])]
  .map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(','))
  .join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs', '改进物品清单.csv'), csv, 'utf8');

const byChange = {};
for (const r of out) byChange[r.change] = (byChange[r.change] || 0) + 1;

const unitMeta = new Map();
for (const r of readCsv(path.join(ROOT, 'data', 'storage_units.csv'))) {
  unitMeta.set(r.unit_id, { area: r.area, side: r.side, slot: Number(r.slot), cn: r.unit_cn, type: r.entry_type });
}
function groupsFor(rows) {
  const g = new Map();
  for (const r of rows) {
    const first = r.units.split(' | ')[0];
    const [loc, uid] = first.split(' ');
    const meta = unitMeta.get(uid);
    const key = loc + ' ' + uid;
    if (!g.has(key)) g.set(key, { loc, uid, meta, items: [] });
    g.get(key).items.push(r);
  }
  return [...g.values()].sort((a, b) => {
    const aa = a.meta ? `${a.meta.area}${a.meta.side}` : a.loc;
    const bb = b.meta ? `${b.meta.area}${b.meta.side}` : b.loc;
    return aa.localeCompare(bb) || (a.meta?.slot || 99) - (b.meta?.slot || 99);
  });
}
function rowLine(r, g) {
  const nm = r.cn || r.item;
  const dest = g.meta ? `${g.loc} ${g.meta.cn}` : `${g.loc} ${g.uid}`;
  return `${nm}（${r.old} → ${dest}）`;
}
function groupTitle(g) {
  const m = g.meta;
  const slot = m ? String(m.slot).padStart(2, '0') : '';
  const cn = m ? m.cn : g.uid;
  return `### ${g.loc} ${slot} ${cn}（${g.items.length}）`;
}
function section(title, rows, withOld = false) {
  const lines = [`## ${title}（${rows.length}）`, ''];
  for (const g of groupsFor(rows)) {
    lines.push(groupTitle(g));
    lines.push(g.items.map(r => withOld ? rowLine(r, g) : (r.cn || r.item)).join('、'));
    lines.push('');
  }
  return lines.join('\n');
}

const enchantUnits = [...unitMeta.entries()].filter(([, m]) => m.type === 'enchant');
const potionUnits = [...unitMeta.entries()].filter(([, m]) => m.type === 'potion');
const md = [];
md.push('# 改进物品清单');
md.push('');
md.push('日期：2026-11-22（v3；2026-11-27 追加龙泪）。基线 = 冻结 v2（`data/item_map-v2.csv`）；按新位置分组，完整逐项含旧区/侧见 `改进物品清单.csv`。');
md.push('');
md.push('## 汇总');
md.push('');
md.push('| 类型 | 数量 |');
md.push('|---|---:|');
md.push(`| 新增上架（v2 无此物品） | ${byChange['新增上架'] || 0} |`);
md.push(`| 重新归位（区/侧变化） | ${byChange['重新归位'] || 0} |`);
md.push(`| 同区调整（同区/侧内换单元） | ${byChange['同区调整'] || 0} |`);
md.push(`| 自定义名新增（同 ID 按 customName 分流） | ${byChange['自定义名新增'] || 0} |`);
md.push(`| 属性单元（附魔书/药水 5 类物品，展开 84 格） | ${byChange['属性单元'] || 0} |`);
md.push(`| 合计 | ${out.length} |`);
md.push('');
md.push('v2 收纳物品 ' + oldMap.size + ' 项；v3 可获取 ' + obtainable.length + ' 项。');
md.push('');
md.push(section('1. 新增上架', out.filter(r => r.change === '新增上架')));
md.push(section('2. 重新归位', out.filter(r => r.change === '重新归位'), true));
md.push(section('3. 同区调整', out.filter(r => r.change === '同区调整')));
md.push(section('4. 自定义名新增', out.filter(r => r.change === '自定义名新增')));
md.push('## 5. 属性单元');
md.push('');
md.push(`### 附魔书（${enchantUnits.length} 格）`);
md.push(enchantUnits.map(([id, m]) => `${String(m.slot).padStart(2, '0')} ${m.cn}`).join('、'));
md.push('');
md.push(`### 药水（${potionUnits.length} 格）`);
md.push(potionUnits.map(([id, m]) => `${String(m.slot).padStart(2, '0')} ${m.cn}`).join('、'));
md.push('');
md.push('## 6. 移除物');
md.push('');
md.push(removedItems.length
  ? removedItems.map(i => `- ${nameCn.get(i) || i}（${i}）：不再收纳，分拣进入 trash。`).join('\n')
  : '无。');
md.push('');
fs.writeFileSync(path.join(ROOT, 'docs', '改进物品清单.md'), md.join('\n'), 'utf8');

console.log('obtainable', obtainable.length, byChange);
console.log('old unique non-air', oldMap.size);
console.log('wrote 改进物品清单.md / .csv');
