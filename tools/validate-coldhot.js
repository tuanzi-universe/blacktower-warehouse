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
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const head = rows[0];
  return rows.slice(1).filter(r => r.some(x => x !== '')).map(r => {
    const o = {}; head.forEach((h, i) => o[h] = r[i] ?? ''); return o;
  });
}

const problems = [];
function fail(msg) { problems.push(msg); }
function assert(ok, msg) { if (!ok) fail(msg); }
function sorted(arr) { return [...arr].sort(); }
function eqSet(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }
function diffSet(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return { onlyA: a.filter(x => !sb.has(x)), onlyB: b.filter(x => !sa.has(x)) };
}
function itemNames(rules) {
  return [...new Set(rules.map(r => (r.match.name || '').replace(/^minecraft:/, '')).filter(Boolean))];
}

// ---------- 数据 ----------
const htmlData = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'template', 'html-data.json'), 'utf8'));
const slotByPoint = new Map();
const slotDist = new Map();
const CX = 5231.5, CZ = -37712.5;
for (const s of htmlData.slots) {
  slotByPoint.set(`${s[5]},${s[7]}`, { area: s[0], side: s[1], slot: s[2] });
  slotDist.set(`${s[0]}-${s[1]}-${s[2]}`, Math.hypot(s[3] - CX, s[4] - CZ));
}

const units = readCsv('data/storage_units.csv').map(r => ({
  id: r.unit_id, area: r.area, side: r.side, slot: Number(r.slot),
  type: r.entry_type, cn: r.unit_cn, group: r.group_cn, items: [],
}));
const unitById = new Map(units.map(u => [u.id, u]));

const itemRows = readCsv('data/item_map.csv');
const itemsByUnit = new Map();
for (const r of itemRows) {
  if (r.entry_type !== 'item') continue;
  if (!itemsByUnit.has(r.unit_id)) itemsByUnit.set(r.unit_id, []);
  const list = itemsByUnit.get(r.unit_id);
  if (!list.includes(r.item_id)) list.push(r.item_id);
}
for (const u of units) u.items = itemsByUnit.get(u.id) || [];

const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'points', 'itemsorter-points-v1.json'), 'utf8'));
const v1ByPoint = new Map();
for (const r of v1.items) {
  const p = r.point;
  const key = `${p.x},${p.z}`;
  if (!v1ByPoint.has(key)) {
    const slot = slotByPoint.get(key);
    assert(!!slot, `v1 点位不在 880 货位中: ${key}`);
    v1ByPoint.set(key, {
      label: p.label, area: slot ? slot.area : '', side: slot ? slot.side : '',
      slot: slot ? Number(slot.slot) : 0, rules: [],
    });
  }
  v1ByPoint.get(key).rules.push(r);
}
const v1Units = [...v1ByPoint.values()].sort((a, b) =>
  `${a.area}${a.side}`.localeCompare(`${b.area}${b.side}`) || a.slot - b.slot);
const v1LabelMap = new Map();
for (const u of v1Units) {
  assert(!v1LabelMap.has(u.label), `v1 单元名重复: ${u.label}`);
  v1LabelMap.set(u.label, u);
}
const v2LabelMap = new Map();
for (const u of units) {
  assert(!v2LabelMap.has(u.cn), `v2 单元名重复: ${u.cn}`);
  v2LabelMap.set(u.cn, u);
}

function labelsOfV1(area, side) {
  return v1Units.filter(u => u.area === area && u.side === side).map(u => u.label);
}
function labelsOfV2(area, side) {
  return units.filter(u => u.area === area && u.side === side)
    .sort((a, b) => a.slot - b.slot).map(u => u.cn);
}

// ---------- 总量 / 每侧 ----------
const expectSide = {
  'A-L': 25, 'A-R': 31, 'B-L': 52, 'B-R': 37, 'C-L': 21, 'C-R': 29,
  'D-L': 44, 'D-R': 31, 'E-L': 26, 'E-R': 33, 'F-L': 51, 'F-R': 49,
  'G-L': 45, 'G-R': 54, 'H-L': 29, 'H-R': 24,
};
const sideCount = {};
for (const u of units) {
  const k = `${u.area}-${u.side}`;
  sideCount[k] = (sideCount[k] || 0) + 1;
}
for (const [k, n] of Object.entries(expectSide)) {
  assert((sideCount[k] || 0) === n, `${k} 单元 ${sideCount[k] || 0}，应为 ${n}`);
}
assert(units.length === 581, `单元总数 ${units.length}，应为 581`);
assert(units.filter(u => u.type === 'item').length === 497, `物品单元 ${units.filter(u => u.type === 'item').length}，应为 497`);
assert(units.filter(u => u.type === 'enchant').length === 44, '附魔单元应为 44');
assert(units.filter(u => u.type === 'potion').length === 40, '药水单元应为 40');
const slotRows = readCsv('data/partition_new.csv');
assert(slotRows.length === 880, `partition_new 行数 ${slotRows.length}，应为 880`);
assert(slotRows.filter(r => r.unit_id).length === 581, 'partition_new 占用格应为 581');

// ---------- 热/冷归属 ----------
const isHotId = id => id.startsWith('MIN:') || id.startsWith('RED:') || id.startsWith('TERRAIN:');
const isHot = u => isHotId(u.id) || (u.area === 'G' && u.id !== 'RAW:bowl');
const hotUnits = units.filter(isHot);
const coldUnits = units.filter(u => !isHot(u));
assert(hotUnits.length === 197, `热单元 ${hotUnits.length}，应为 197`);
assert(hotUnits.filter(u => u.id.startsWith('MIN:')).length === 25, '矿物热单元应为 25');
assert(hotUnits.filter(u => u.id.startsWith('RED:')).length === 21, '红石热单元应为 21');
assert(hotUnits.filter(u => u.id.startsWith('TERRAIN:')).length === 53, '地形热单元应为 53');
assert(hotUnits.filter(u => u.area === 'G').length === 98, 'G 区热单元应为 98');

for (const u of hotUnits) {
  assert(['A', 'C', 'E', 'G'].includes(u.area), `热单元不在正向热区: ${u.id} ${u.area}-${u.side}`);
  if (u.id.startsWith('MIN:')) assert(u.area === 'A' && u.side === 'L', `矿物应在 A-L: ${u.id}`);
  if (u.id.startsWith('RED:')) assert(u.area === 'C' && u.side === 'L', `红石应在 C-L: ${u.id}`);
  if (u.id.startsWith('TERRAIN:')) assert(u.area === 'E', `地形应在 E: ${u.id}`);
}
for (const u of units) {
  if (isHot(u)) continue;
  const inHotArea = ['A', 'C', 'E', 'G'].includes(u.area);
  const allowedAux = (u.area === 'A' && u.side === 'R') ||
    (u.area === 'C' && u.side === 'R') ||
    (u.area === 'E' && u.side === 'R' && u.id.startsWith('BUILD:light_')) ||
    (u.area === 'E' && u.side === 'L' && u.id === 'RAW:snowball') ||
    (u.area === 'G' && u.side === 'R' && u.id === 'RAW:bowl');
  assert(!inHotArea || allowedAux, `非热单元进入热区: ${u.id} ${u.area}-${u.side}`);
  if (u.area === 'E' && u.side === 'R' && u.id.startsWith('BUILD:light_')) {
    assert(u.slot >= 25 && u.slot <= 29, `E-R 光源位置错误: ${u.id} ${u.slot}`);
  }
  if (u.id === 'RAW:snowball') assert(u.area === 'E' && u.side === 'L' && u.slot === 21, `雪球应在 E-L 21: ${u.area}-${u.side}-${u.slot}`);
  if (u.id === 'RAW:bowl') assert(u.area === 'G' && u.side === 'R' && u.slot === 10, `碗应在 G-R 10: ${u.area}-${u.side}-${u.slot}`);
}

// ---------- H-L：基础方块 + 变体 groupby ----------
const BASE = [
  ['BUILD:base_bricks', '红砖块', 'bricks'],
  ['BUILD:base_packed_mud', '压实泥', 'packed_mud'],
  ['BUILD:base_sandstone', '砂岩', 'sandstone'],
  ['BUILD:base_red_sandstone', '红砂岩', 'red_sandstone'],
  ['BUILD:base_nether_bricks', '下界砖块', 'nether_bricks'],
  ['BUILD:base_red_nether_bricks', '红色下界砖块', 'red_nether_bricks'],
  ['BUILD:base_prismarine', '海晶石', 'prismarine'],
  ['BUILD:base_dark_prismarine', '暗海晶石', 'dark_prismarine'],
  ['BUILD:base_sea_lantern', '海晶灯', 'sea_lantern'],
  ['BUILD:base_purpur', '紫珀块', 'purpur_block'],
  ['BUILD:base_quartz', '石英块', 'quartz_block'],
  ['BUILD:base_resin', '树脂块', 'resin_block'],
  ['BUILD:base_gilded_blackstone', '镶金黑石', 'gilded_blackstone'],
];
const GROUPS = [
  ['BUILD:v_tile', '瓦', 2, /_tiles$/],
  ['BUILD:v_stairs', '楼梯', 43, /_stairs$/],
  ['BUILD:v_slab', '台阶', 46, /_slab$/],
  ['BUILD:v_chiseled', '雕纹', 12, /^chiseled_/],
  ['BUILD:v_polished', '磨制', 10, /^polished_/],
  ['BUILD:v_cut', '切制', 2, /^cut_/],
  ['BUILD:v_smooth', '平滑', 5, /^smooth_/],
  ['BUILD:v_cracked', '裂纹', 4, /^cracked_/],
  ['BUILD:v_mossy', '苔石砖', 1, /^mossy_stone_bricks$/],
  ['BUILD:v_pillar', '柱', 2, /_pillar$/],
  ['BUILD:v_infested', '蛀蚀', 7, /^infested_/],
  ['BUILD:v_brick', '砖', 11, /_bricks?$/],
];
const WALLS = [['BUILD:wall', '墙', 32], ['BUILD:fence', '栅栏', 14], ['BUILD:fence_gate', '栅栏门', 13]];

for (const [id, cn, item] of BASE) {
  const u = unitById.get(id);
  assert(!!u, `缺少基础方块单元 ${id}`);
  if (!u) continue;
  assert(u.area === 'H' && u.side === 'L', `${id} 应在 H-L`);
  assert(u.cn === cn, `${id} 名称 ${u.cn}，应为 ${cn}`);
  assert(eqSet(u.items, [item]), `${id} 应只含 ${item}，实际 ${u.items.join(',')}`);
}
const groupItemTotal = GROUPS.reduce((n, g) => n + g[2], 0);
assert(groupItemTotal === 145, `变体组物品总数 ${groupItemTotal}，应为 145`);
for (const [id, cn, n, re] of GROUPS) {
  const u = unitById.get(id);
  assert(!!u, `缺少变体组 ${id}`);
  if (!u) continue;
  assert(u.area === 'H' && u.side === 'L', `${id} 应在 H-L`);
  assert(u.cn === cn, `${id} 名称 ${u.cn}，应为 ${cn}`);
  assert(u.items.length === n, `${id} 物品 ${u.items.length}，应为 ${n}`);
  const bad = u.items.filter(i => !re.test(i));
  assert(bad.length === 0, `${id} 含不符合 ${re} 的物品: ${bad.join(',')}`);
}
for (const [id, cn, n] of WALLS) {
  const u = unitById.get(id);
  assert(!!u, `缺少变体单元 ${id}`);
  if (!u) continue;
  assert(u.cn === cn && u.items.length === n, `${id} 应为 ${cn} ${n} 件`);
}
const hLBaseLabels = [];
for (const cn of BASE.map(x => x[1])) {
  hLBaseLabels.push(cn);
  if (cn === '树脂块') hLBaseLabels.push('树脂');
}
const expectedHL = [...hLBaseLabels, ...GROUPS.map(x => x[1]), ...WALLS.map(x => x[1])];
{
  const actual = labelsOfV2('H', 'L');
  const d = diffSet(expectedHL, actual);
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `H-L 顺序不符；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
}
const hlItems = units.filter(u => u.area === 'H' && u.side === 'L').flatMap(u => u.items);
assert(hlItems.length === 218, `H-L 物品 ${hlItems.length}，应为 218（158 建材 + 59 变体 + 树脂）`);
assert(new Set(hlItems).size === hlItems.length, 'H-L 存在重复物品');

// ---------- 船/门/活板门 ----------
const boat = unitById.get('WOODWORK:boat_door');
assert(!!boat, '缺少船/门/活板门单元');
if (boat) {
  assert(boat.area === 'H' && boat.side === 'R', '船/门/活板门应在 H-R');
  assert(boat.cn === '船/门/活板门', `船/门/活板门名称错误: ${boat.cn}`);
  assert(boat.items.length === 48, `船/门/活板门 ${boat.items.length} 件，应为 48`);
  assert(boat.items.filter(i => /_boat$/.test(i)).length === 20, '普通/箱船应为 20');
  assert(boat.items.filter(i => /_raft$/.test(i)).length === 2, '竹筏应为 2');
  assert(boat.items.filter(i => /_door$/.test(i)).length === 13, '木门应为 13');
  assert(boat.items.filter(i => /_trapdoor$/.test(i)).length === 13, '木活板门应为 13');
  const metal = boat.items.filter(i => /^(iron_|copper_|waxed_)/.test(i));
  assert(metal.length === 0, `船/门单元不应含金属门: ${metal.join(',')}`);
}

// ---------- 顺序 ----------
const bedLabels = units.filter(u => ['COLOR:bed', 'COLOR:banner', 'COLOR:candle'].includes(u.id))
  .sort((a, b) => a.slot - b.slot).map(u => u.cn);
const hR = labelsOfV1('H', 'R');
const oldWoodwork = hR.slice(0, 13);
const oldBuilding = hR.slice(13, 36);
const newWoodwork = oldWoodwork.map(l => l.replace('（台阶/楼梯/门窗/船）', '（台阶/楼梯/告示牌/展示架）'));
const miscLabels = hR.slice(41, 47);
const potLabels = hR.slice(50, 52);
const expectedH_R = [...newWoodwork, '纸', '书', ...miscLabels, ...potLabels, '船/门/活板门'];
const expectedB_L = [...labelsOfV1('E', 'L'), ...bedLabels];
const expectedB_R = labelsOfV1('E', 'R');
const lightLabels = units.filter(u => u.id.startsWith('BUILD:light_'))
  .sort((a, b) => a.slot - b.slot).map(u => u.cn);
const terrainLabels = labelsOfV1('H', 'L');
// E 区主题分组（v1 H-L 标签序）：0–7 泥土系，8–12 石头/圆石/深板岩，13–16 苔藓，17 黏土，
// 18–19 沙砾，20–22 沙，23–24 雪，25–27 冰，28–29 滴水石，30–34 安山岩~方解石，
// 35–41 下界（玄武岩~灵魂土），42 末地石，43–44 黑曜石，45–46 海绵，47–50 硫黄/朱砂，51–52 疣块。
// E-L = 土 0–7+黏土 17 → 沙 20–22 → 砂 18–19 → 苔藓 13–16 → 雪 23–24+雪球 → 冰 25–27 → 海绵 45–46；
// E-R = 石(8–12,28–34) → 下界石类(35–41,51–52) → 末地石 42 → 黑曜石 43–44 → 光源 5 → 硫黄/朱砂 47–50。
const expectedE_L = [
  ...terrainLabels.slice(0, 8), terrainLabels[17],
  ...terrainLabels.slice(20, 23),
  ...terrainLabels.slice(18, 20),
  ...terrainLabels.slice(13, 17),
  ...terrainLabels.slice(23, 25), '雪球',
  ...terrainLabels.slice(25, 28),
  ...terrainLabels.slice(45, 47),
];
const expectedE_R = [
  ...terrainLabels.slice(8, 13),
  ...terrainLabels.slice(30, 35),
  ...terrainLabels.slice(28, 30),
  ...terrainLabels.slice(35, 42),
  ...terrainLabels.slice(51, 53),
  ...terrainLabels.slice(42, 43),
  ...terrainLabels.slice(43, 45),
  ...lightLabels,
  ...terrainLabels.slice(47, 51),
];
const rawMoveLabels = ['树脂', '纸', '书', '碗', '玻璃瓶', '雪球'];
const expectedA_R = labelsOfV1('A', 'R').filter(l => !rawMoveLabels.includes(l));
const fLV1 = labelsOfV1('F', 'L');
const expectedF_L = [...fLV1.slice(0, 30), '玻璃瓶', ...fLV1.slice(30)];
const gRV1 = labelsOfV1('G', 'R');
const stewIdx = gRV1.indexOf('谜之炖菜');
const expectedG_R = [...gRV1.slice(0, stewIdx + 1), '碗', ...gRV1.slice(stewIdx + 1)];

const orderChecks = [
  ['A-L', labelsOfV1('A', 'L'), labelsOfV2('A', 'L')],
  ['A-R', expectedA_R, labelsOfV2('A', 'R')],
  ['B-L', expectedB_L, labelsOfV2('B', 'L')],
  ['B-R', expectedB_R, labelsOfV2('B', 'R')],
  ['C-L', labelsOfV1('C', 'L'), labelsOfV2('C', 'L')],
  ['C-R', labelsOfV1('C', 'R'), labelsOfV2('C', 'R')],
  ['D-L', labelsOfV1('D', 'L'), labelsOfV2('D', 'L')],
  ['D-R', labelsOfV1('D', 'R'), labelsOfV2('D', 'R')],
  ['E-L', expectedE_L, labelsOfV2('E', 'L')],
  ['E-R', expectedE_R, labelsOfV2('E', 'R')],
  ['F-L', expectedF_L, labelsOfV2('F', 'L')],
  ['F-R', labelsOfV1('F', 'R'), labelsOfV2('F', 'R')],
  ['G-L', labelsOfV1('G', 'L'), labelsOfV2('G', 'L')],
  ['G-R', expectedG_R, labelsOfV2('G', 'R')],
  ['H-L', expectedHL, labelsOfV2('H', 'L')],
  ['H-R', expectedH_R, labelsOfV2('H', 'R')],
];
for (const [name, expected, actual] of orderChecks) {
  const d = diffSet(expected, actual);
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `${name} 顺序不符；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
}

// ---------- 重组校验：仅 H-L 建材 + 木构件船/门受影响 ----------
const EXTRACTED_RE = /_(wall|fence|fence_gate)$/;
const oldBuildingItems = sorted([...new Set(
  oldBuilding.flatMap(l => itemNames(v1LabelMap.get(l).rules)).filter(id => !EXTRACTED_RE.test(id)),
)]);
const newBuildingItems = sorted([...BASE, ...GROUPS].flatMap(([id]) => (itemsByUnit.get(id) || [])));
assert(eqSet(oldBuildingItems, newBuildingItems),
  `H-L 建材重组前后物品不一致；旧 ${oldBuildingItems.length}，新 ${newBuildingItems.length}`);

const boatItems = boat ? new Set(boat.items) : new Set();
const removedOld = new Set([...oldBuilding, ...oldWoodwork]);
let preserved = 0, woodworkOk = 0;
for (const old of v1Units) {
  const special = old.label.startsWith('附魔·') || old.label.startsWith('药水·');
  if (oldBuilding.includes(old.label)) {
    assert(!v2LabelMap.has(old.label), `已拆分的建材单元仍在: ${old.label}`);
    continue;
  }
  if (oldWoodwork.includes(old.label)) {
    const newLabel = old.label.replace('（台阶/楼梯/门窗/船）', '（台阶/楼梯/告示牌/展示架）');
    const nu = v2LabelMap.get(newLabel);
    assert(!!nu, `木构件改名后丢失: ${old.label} -> ${newLabel}`);
    if (!nu) continue;
    const expected = sorted(itemNames(old.rules).filter(i => !boatItems.has(i) && !EXTRACTED_RE.test(i)));
    const actual = sorted(nu.items);
    const d = diffSet(expected, actual);
    assert(d.onlyA.length === 0 && d.onlyB.length === 0,
      `木构件物品不符: ${old.label}；缺少 [${d.onlyA.join(',')}]，多出 [${d.onlyB.join(',')}]`);
    woodworkOk++;
    continue;
  }
  const nu = v2LabelMap.get(old.label);
  assert(!!nu, `v1 单元丢失: ${old.label}`);
  if (!nu) continue;
  if (special) {
    assert(nu.type === 'enchant' || nu.type === 'potion', `特殊单元类型变化: ${old.label}`);
    preserved++;
    continue;
  }
  assert(nu.type === 'item', `普通单元类型变化: ${old.label}`);
  const oldItems = sorted(itemNames(old.rules));
  const actual = sorted(nu.items);
  const d = diffSet(oldItems, actual);
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `单元物品集合变化: ${old.label}；缺少 [${d.onlyA.join(',')}]，多出 [${d.onlyB.join(',')}]`);
  preserved++;
}
assert(woodworkOk === 13, `木构件校验 ${woodworkOk}，应为 13`);

const extra = [...v2LabelMap.keys()].filter(l => !v1LabelMap.has(l)).sort();
const expectedExtra = sorted([
  ...BASE.map(x => x[1]), ...GROUPS.map(x => x[1]), ...WALLS.map(x => x[1]),
  ...newWoodwork, '船/门/活板门',
]);
assert(extra.length === 42, `新增单元 ${extra.length}，应为 42`);
assert(eqSet(extra, expectedExtra), `新增单元不符；缺少 [${expectedExtra.filter(x => !extra.includes(x)).join(',')}]，多出 [${extra.filter(x => !expectedExtra.includes(x)).join(',')}]`);

// ---------- 冷热距离 ----------
const distOf = u => slotDist.get(`${u.area}-${u.side}-${u.slot}`);
const stats = arr => {
  const ds = arr.map(distOf).sort((a, b) => a - b);
  return {
    n: ds.length,
    avg: ds.reduce((a, b) => a + b, 0) / ds.length,
    min: ds[0], max: ds[ds.length - 1],
  };
};
const hotStat = stats(hotUnits);
const coldAreaUnits = coldUnits.filter(u => ['B', 'D', 'F', 'H'].includes(u.area));
const auxUnits = coldUnits.filter(u => ['A', 'C', 'E', 'G'].includes(u.area));
assert(coldAreaUnits.length === 317, `冷区 B/D/F/H 单元 ${coldAreaUnits.length}，应为 317`);
assert(auxUnits.length === 67, `热区附属单元 ${auxUnits.length}，应为 67`);
assert(auxUnits.filter(u => u.area === 'A').length === 31, 'A-R 附属应为 31');
assert(auxUnits.filter(u => u.area === 'C').length === 29, 'C-R 附属应为 29');
assert(auxUnits.filter(u => u.area === 'E').length === 6, 'E 附属应为 6（光源 5 + 雪球）');
assert(auxUnits.filter(u => u.area === 'G').length === 1, 'G 附属应为 1（碗）');
const coldStat = stats(coldAreaUnits);

console.log('== 冷热库区校验 ==');
console.log(`单元 ${units.length}（物品 497 / 附魔 44 / 药水 40），规则 1830`);
console.log(`热区占用 ${hotUnits.length + auxUnits.length}：A ${sideCount['A-L'] + sideCount['A-R']}，C ${sideCount['C-L'] + sideCount['C-R']}，E ${sideCount['E-L'] + sideCount['E-R']}，G ${sideCount['G-L'] + sideCount['G-R']}；热单元 ${hotUnits.length}`);
console.log(`冷区 B/D/F/H ${coldAreaUnits.length}：B ${sideCount['B-L'] + sideCount['B-R']}，D ${sideCount['D-L'] + sideCount['D-R']}，F ${sideCount['F-L'] + sideCount['F-R']}，H ${sideCount['H-L'] + sideCount['H-R']}`);
console.log(`H-L：基础 ${BASE.length} + 变体组 ${GROUPS.length} + 墙/栅栏/门 ${WALLS.length}；船/门/活板门 ${boat ? boat.items.length : 0} 件`);
console.log(`热单元距离：平均 ${hotStat.avg.toFixed(2)}，最远 ${hotStat.max.toFixed(1)}`);
console.log(`冷区 B/D/F/H 距离：平均 ${coldStat.avg.toFixed(2)}，最远 ${coldStat.max.toFixed(1)}`);
console.log(`保留单元 ${preserved}，木构件 ${woodworkOk}，新增 ${extra.length}`);

if (problems.length) {
  console.log('PROBLEMS', problems.length);
  console.log(problems.slice(0, 40).join('\n'));
  process.exit(1);
}
console.log('cold/hot validation passed');
