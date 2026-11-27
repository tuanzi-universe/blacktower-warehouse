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

// 当前工作版本（v3，来自 build 产物 CSV）
const units = readCsv('data/storage_units.csv').map(r => ({
  id: r.unit_id, area: r.area, side: r.side, slot: Number(r.slot),
  type: r.entry_type, cn: r.unit_cn, group: r.group_cn, items: [],
}));
const unitById = new Map(units.map(u => [u.id, u]));
const v3LabelMap = new Map();
for (const u of units) {
  assert(!v3LabelMap.has(u.cn), `v3 单元名重复: ${u.cn}`);
  v3LabelMap.set(u.cn, u);
}

const itemRows = readCsv('data/item_map.csv');
const itemsByUnit = new Map();
for (const r of itemRows) {
  if (r.entry_type !== 'item') continue;
  if (!itemsByUnit.has(r.unit_id)) itemsByUnit.set(r.unit_id, []);
  const list = itemsByUnit.get(r.unit_id);
  if (!list.includes(r.item_id)) list.push(r.item_id);
}
for (const u of units) u.items = itemsByUnit.get(u.id) || [];

// 冻结基线（v1 / v2，从 JSON 读取，任何 build 都不写它们）
function loadPointsVersion(file, tag) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const byPoint = new Map();
  for (const r of data.items) {
    const p = r.point;
    const key = `${p.x},${p.z}`;
    if (!byPoint.has(key)) {
      const slot = slotByPoint.get(key);
      assert(!!slot, `${tag} 点位不在 880 货位中: ${key}`);
      byPoint.set(key, {
        label: p.label, area: slot ? slot.area : '', side: slot ? slot.side : '',
        slot: slot ? Number(slot.slot) : 0, rules: [],
      });
    }
    byPoint.get(key).rules.push(r);
  }
  return [...byPoint.values()].sort((a, b) =>
    `${a.area}${a.side}`.localeCompare(`${b.area}${b.side}`) || a.slot - b.slot);
}
const v1Units = loadPointsVersion('data/points/itemsorter-points-v1.json', 'v1');
const v2fUnits = loadPointsVersion('data/points/itemsorter-points-v2.json', 'v2');
const v1LabelMap = new Map();
for (const u of v1Units) {
  assert(!v1LabelMap.has(u.label), `v1 单元名重复: ${u.label}`);
  v1LabelMap.set(u.label, u);
}
const v2fLabelMap = new Map();
for (const u of v2fUnits) {
  assert(!v2fLabelMap.has(u.label), `v2 单元名重复: ${u.label}`);
  v2fLabelMap.set(u.label, u);
}

function labelsOfV1(area, side) {
  return v1Units.filter(u => u.area === area && u.side === side).map(u => u.label);
}
function labelsOfV2f(area, side) {
  return v2fUnits.filter(u => u.area === area && u.side === side).map(u => u.label);
}
function labelsOfV3(area, side) {
  return units.filter(u => u.area === area && u.side === side)
    .sort((a, b) => a.slot - b.slot).map(u => u.cn);
}

// ---------- v3 总量 / 每侧 ----------
const expectSide = {
  'A-L': 32, 'A-R': 27, 'B-L': 48, 'B-R': 53, 'C-L': 21, 'C-R': 27,
  'D-L': 44, 'D-R': 55, 'E-L': 21, 'E-R': 20, 'F-L': 44, 'F-R': 33,
  'G-L': 51, 'G-R': 44, 'H-L': 50, 'H-R': 54,
};
const sideCount = {};
for (const u of units) {
  const k = `${u.area}-${u.side}`;
  sideCount[k] = (sideCount[k] || 0) + 1;
}
for (const [k, n] of Object.entries(expectSide)) {
  assert((sideCount[k] || 0) === n, `${k} 单元 ${sideCount[k] || 0}，应为 ${n}`);
}
assert(units.length === 624, `单元总数 ${units.length}，应为 624`);
assert(units.filter(u => u.type === 'item').length === 540, `物品单元 ${units.filter(u => u.type === 'item').length}，应为 540`);
assert(units.filter(u => u.type === 'enchant').length === 44, '附魔单元应为 44');
assert(units.filter(u => u.type === 'potion').length === 40, '药水单元应为 40');
const slotRows = readCsv('data/partition_new.csv');
assert(slotRows.length === 880, `partition_new 行数 ${slotRows.length}，应为 880`);
assert(slotRows.filter(r => r.unit_id).length === 624, 'partition_new 占用格应为 624');
// v2 冻结文件完整性
assert(v2fUnits.length === 581, `冻结 v2 单元 ${v2fUnits.length}，应为 581`);
assert(v1Units.length === 575, `冻结 v1 单元 ${v1Units.length}，应为 575`);
assert(!itemRows.some(r => r.item_id === 'chorus_plant'), '紫颂植株应被排除（item_map 无此行）');

// ---------- v3 热/冷归属 ----------
// 热通道 A/C/E/G：A-L 矿物、C-L 红石、E 药水、G 生物资源为热内容；A-R/C-R 为附属。
const HOT_SIDES = { A: ['L'], C: ['L'], E: ['L', 'R'], G: ['L', 'R'] };
const hotUnits = units.filter(u => (HOT_SIDES[u.area] || []).includes(u.side));
const auxUnits = units.filter(u => !hotUnits.includes(u) && ['A', 'C', 'E', 'G'].includes(u.area));
const coldAreaUnits = units.filter(u => ['B', 'D', 'F', 'H'].includes(u.area));
assert(hotUnits.length === 189, `热单元 ${hotUnits.length}，应为 189（矿物 32 + 红石 21 + 药水 41 + G 95）`);
assert(auxUnits.length === 54, `热区附属单元 ${auxUnits.length}，应为 54（A-R 27 + C-R 27，含船/门/活板门）`);
assert(coldAreaUnits.length === 381, `冷区 B/D/F/H 单元 ${coldAreaUnits.length}，应为 381`);
assert(hotUnits.filter(u => u.id.startsWith('MIN:')).length === 32, '矿物热单元应为 32');
assert(hotUnits.filter(u => u.id.startsWith('RED:')).length === 21, '红石热单元应为 21');
assert(hotUnits.filter(u => u.type === 'potion').length === 40, '热区药水单元应为 40');
assert(hotUnits.filter(u => u.area === 'G').length === 95, 'G 区热单元应为 95');
assert(hotUnits.every(u => ['A', 'C', 'E', 'G'].includes(u.area)), '热单元必须在正向热区');
assert(auxUnits.every(u => (u.area === 'A' && u.side === 'R') || (u.area === 'C' && u.side === 'R')),
  '热区附属只允许 A-R/C-R');
assert(!hotUnits.some(u => u.id.startsWith('TERRAIN:')), '地形不应在热区（已并入 H 区）');
{
  const terrainUnits = units.filter(u => u.id.startsWith('TERRAIN:'));
  assert(terrainUnits.length === 51, `地形拆单 ${terrainUnits.length}，应为 51`);
  assert(terrainUnits.every(u => u.area === 'H'), '地形拆单应全部在 H 区');
  const snowUnit = v3LabelMap.get('雪（含雪球）');
  assert(snowUnit && snowUnit.area === 'H' && snowUnit.side === 'L' && snowUnit.slot === 19 &&
    eqSet(sorted(snowUnit.items), ['snow', 'snowball']),
    `雪（含雪球）应在 H-L 19 且含 snow/snowball: ${snowUnit ? `${snowUnit.area}-${snowUnit.side}-${snowUnit.slot} ${snowUnit.items}` : '缺失'}`);
  const bowl = unitById.get('RAW:bowl');
  assert(bowl && bowl.area === 'G' && bowl.side === 'L' && bowl.slot === 10,
    `碗应在 G-L 10: ${bowl ? `${bowl.area}-${bowl.side}-${bowl.slot}` : '缺失'}`);
  const bottle = unitById.get('RAW:glass_bottle');
  assert(bottle && bottle.area === 'E' && bottle.side === 'L' && bottle.slot === 1,
    `玻璃瓶应在 E-L 1: ${bottle ? `${bottle.area}-${bottle.side}-${bottle.slot}` : '缺失'}`);
}

// ---------- v3 H 区（合并区）结构 ----------
// H-L：自然方块 25（黏土球/燧石插入；海绵含湿海绵、苔藓含覆地苔藓合并）+ 基础/变体 27。
const expectedHL = [
  '泥土', '砂土', '缠根泥土', '草方块', '菌丝体', '灰化土', '泥巴', '沾泥的红树根',
  '黏土', '黏土球', '沙子', '可疑的沙子', '红沙', '沙砾', '燧石', '可疑的沙砾',
  '苔藓（含覆地苔藓）', '苍白苔藓（含覆地苔藓）',
  '雪（含雪球）', '雪块', '冰', '浮冰', '蓝冰', '海绵（含湿海绵）',
  '红砖块', '红砖', '压实泥', '砂岩', '红砂岩', '下界砖块', '下界砖', '红色下界砖块',
  '海晶石', '暗海晶石', '紫珀块', '树脂块', '树脂', '镶金黑石',
  '瓦', '楼梯', '台阶', '雕纹', '切制', '平滑', '裂纹', '柱', '砖',
  '墙', '栅栏', '栅栏门',
];
assert(expectedHL.length === 50, `H-L 序列 ${expectedHL.length}，应为 50`);
{
  const actual = labelsOfV3('H', 'L');
  const d = diffSet(expectedHL, actual);
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `H-L 顺序不符；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
}

// H-R 主段：v2 E-R 原序 + 磨制紧跟本体 + 海晶灯入光源段。
const eRv2 = labelsOfV2f('E', 'R');
const insertAfterR = {
  '圆石': '平滑石头',
  '深板岩': '磨制深板岩', '安山岩': '磨制安山岩', '闪长岩': '磨制闪长岩',
  '花岗岩': '磨制花岗岩', '凝灰岩': '磨制凝灰岩', '玄武岩': '磨制玄武岩',
  '黑石': '磨制黑石', '磨制黑石': '磨制黑石砖',
  '菌光体': '海晶灯', '硫黄': '磨制硫黄', '朱砂': '磨制朱砂',
};
const expectedHRMain = [];
for (const l of eRv2) {
  let cur = l;
  expectedHRMain.push(cur);
  while (insertAfterR[cur]) { cur = insertAfterR[cur]; expectedHRMain.push(cur); }
}
const expectedHRTail = ['南瓜灯', '梯子', '铜系建材', '铁构件', '床', '旗帜', '旗帜图案', '蜡烛', '坐垫'];
const expectedHR = [...expectedHRMain, ...expectedHRTail];
assert(expectedHRMain.length === 45, `H-R 主段 ${expectedHRMain.length}，应为 45`);
assert(expectedHR.length === 54, `H-R 序列 ${expectedHR.length}，应为 54`);
{
  const actual = labelsOfV3('H', 'R');
  const d = diffSet(expectedHR, actual);
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `H-R 顺序不符；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
}
// 磨制紧跟本体
const v3ByCn = cn => v3LabelMap.get(cn);
const adj = (base, polished) => {
  const a = v3ByCn(base), b = v3ByCn(polished);
  assert(a && b && a.area === b.area && a.side === b.side && b.slot === a.slot + 1,
    `磨制应紧跟本体: ${base} -> ${polished}`);
};
for (const [base, polished] of [
  ['深板岩', '磨制深板岩'], ['安山岩', '磨制安山岩'], ['闪长岩', '磨制闪长岩'],
  ['花岗岩', '磨制花岗岩'], ['凝灰岩', '磨制凝灰岩'], ['玄武岩', '磨制玄武岩'],
  ['黑石', '磨制黑石'], ['磨制黑石', '磨制黑石砖'],
  ['硫黄', '磨制硫黄'], ['朱砂', '磨制朱砂'],
]) adj(base, polished);
{
  const lantern = v3ByCn('海晶灯');
  assert(lantern && lantern.area === 'H' && lantern.side === 'R' && lantern.slot >= 33 && lantern.slot <= 38,
    `海晶灯应在 H-R 光源段: ${lantern ? lantern.slot : '缺失'}`);
  const polishedUnits = units.filter(u => u.id.startsWith('STONE:polished_'));
  assert(polishedUnits.length === 10, `磨制拆单 ${polishedUnits.length}，应为 10`);
  assert(polishedUnits.every(u => u.items.length === 1), '磨制拆单应一物一格');
}

// ---------- v3 船/门/活板门 ----------
const boat = unitById.get('WOODWORK:boat_door');
assert(!!boat, '缺少船/门/活板门单元');
if (boat) {
  assert(boat.area === 'C' && boat.side === 'R' && boat.slot === 3, '船/门/活板门应在 C-R 3（矿车旁）');
  assert(boat.cn === '船/门/活板门', `船/门/活板门名称错误: ${boat.cn}`);
  assert(boat.items.length === 48, `船/门/活板门 ${boat.items.length} 件，应为 48`);
  assert(boat.items.filter(i => /_boat$/.test(i)).length === 20, '普通/箱船应为 20');
  assert(boat.items.filter(i => /_raft$/.test(i)).length === 2, '竹筏应为 2');
  assert(boat.items.filter(i => /_door$/.test(i)).length === 13, '木门应为 13');
  assert(boat.items.filter(i => /_trapdoor$/.test(i)).length === 13, '木活板门应为 13');
  const metal = boat.items.filter(i => /^(iron_|copper_|waxed_)/.test(i));
  assert(metal.length === 0, `船/门单元不应含金属门: ${metal.join(',')}`);
}

// ---------- v3 锚点（v2→v3 关键落位）----------
const anchors = [
  // B-L：染料 16 + 羊毛 16 + 混凝土 16（羊毛后方）
  ['B-L', 1, '白色染料'], ['B-L', 16, '粉红色染料'],
  ['B-L', 17, '白色羊毛/地毯'], ['B-L', 32, '粉红色羊毛/地毯'],
  ['B-L', 33, '白色混凝土'], ['B-L', 48, '粉红色混凝土'],
  // B-R：潜影盒 3（开头）+ 玻璃（白色染色玻璃前）+ 染色玻璃 16 + 遮光玻璃（粉染色玻璃后方）+ 陶瓦家族
  ['B-R', 1, '潜影盒（含彩色）1/2'], ['B-R', 2, '潜影盒（含彩色）2/2'], ['B-R', 3, '玻璃'],
  ['B-R', 4, '白色染色玻璃'], ['B-R', 19, '粉红色染色玻璃'], ['B-R', 20, '遮光玻璃'],
  ['B-R', 21, '陶瓦（无色）'], ['B-R', 22, '白色陶瓦'],
  ['B-R', 36, '品红色陶瓦'], ['B-R', 37, '粉红色陶瓦'],
  ['B-R', 38, '白色带釉陶瓦'], ['B-R', 53, '粉红色带釉陶瓦'],
  // C-R：潜影盒迁出；船/门/活板门插入矿车旁
  ['C-R', 1, '铁轨'], ['C-R', 2, '矿车'], ['C-R', 3, '船/门/活板门'],
  ['C-R', 4, '箱子/桶'], ['C-R', 5, '铜箱'], ['C-R', 6, '熔炉'],
  ['C-R', 26, '物品展示框'], ['C-R', 27, '盔甲架'],
  // D-R：拆分 + 迁入
  ['D-R', 17, '钓鱼竿'], ['D-R', 22, '箭'], ['D-R', 23, '烟花火箭'], ['D-R', 24, '烟火之星'],
  ['D-R', 25, '马铠'], ['D-R', 26, '鹦鹉螺铠'], ['D-R', 27, '挽具'], ['D-R', 28, '收纳袋'],
  ['D-R', 29, '导航'], ['D-R', 30, '时钟'],
  ['D-R', 31, '命名牌'], ['D-R', 32, '鞍'], ['D-R', 33, '拴绳'],
  ['D-R', 34, '风弹'], ['D-R', 35, '火焰弹'], ['D-R', 36, '狼铠'],
  ['D-R', 37, '锻造模板'], ['D-R', 41, '附魔之瓶'], ['D-R', 42, '不死图腾'],
  ['D-R', 43, '金苹果'], ['D-R', 44, '附魔金苹果'],
  ['D-R', 45, '告示牌（含悬挂式）'], ['D-R', 46, '展示架'], ['D-R', 47, '书架'],
  ['D-R', 48, '纸'], ['D-R', 49, '书'], ['D-R', 50, '火把/灯笼'],
  ['D-R', 51, '饰纹陶罐'], ['D-R', 52, '陶片'], ['D-R', 53, '画'], ['D-R', 54, '花盆'],
  ['D-R', 55, '龙泪'],
  // F-L：郁金香/火把花/蘑菇拆分
  ['F-L', 1, '蒲公英'], ['F-L', 6, '红郁金香'], ['F-L', 9, '粉郁金香'],
  ['F-L', 19, '火把花'], ['F-L', 20, '火把花种子'],
  ['F-L', 26, '棕色蘑菇'], ['F-L', 27, '红色蘑菇'], ['F-L', 28, '蘑菇块'],
  ['F-L', 44, '枯叶堆'],
  // F-R：海带/珊瑚/作物种子/干草糖/紫颂
  ['F-R', 1, '枯草丛'], ['F-R', 6, '海带'], ['F-R', 7, '海带块（含干海带）'],
  ['F-R', 8, '管珊瑚'], ['F-R', 12, '角珊瑚'], ['F-R', 13, '瓶子草'],
  ['F-R', 14, '小麦'], ['F-R', 15, '小麦种子'], ['F-R', 16, '干草捆'],
  ['F-R', 19, '甜菜根'], ['F-R', 20, '甜菜种子'],
  ['F-R', 21, '南瓜'], ['F-R', 22, '南瓜种子'], ['F-R', 23, '西瓜'], ['F-R', 24, '西瓜种子（含西瓜片）'],
  ['F-R', 25, '甘蔗'], ['F-R', 26, '糖'],
  ['F-R', 31, '紫颂果'], ['F-R', 32, '紫颂花'], ['F-R', 33, '爆裂果'],
  // G-L（原 R 侧对调）：碗/桶/墨囊/皮革拆分/地图
  ['G-L', 1, '苹果'], ['G-L', 9, '谜之炖菜'], ['G-L', 10, '碗'], ['G-L', 11, '金胡萝卜'],
  ['G-L', 20, '河豚'], ['G-L', 21, '铁桶'], ['G-L', 32, '硫方怪桶'],
  ['G-L', 33, '青蛙卵'], ['G-L', 34, '蜂巢/蜂箱'],
  ['G-L', 35, '墨囊'], ['G-L', 36, '荧光墨囊'],
  ['G-L', 37, '皮革'], ['G-L', 38, '兔子皮'], ['G-L', 39, '兔子脚'],
  ['G-L', 40, '海龟鳞甲'], ['G-L', 41, '犰狳鳞甲'], ['G-L', 42, '羽毛'],
  ['G-L', 50, '末影'], ['G-L', 51, '地图'],
  // G-R（原 L 侧对调）：图腾迁出
  ['G-R', 1, '腐肉'], ['G-R', 19, '蜘蛛网'], ['G-R', 20, '幽匿块'], ['G-R', 26, '回响碎片'],
  ['G-R', 27, '鹦鹉螺壳'], ['G-R', 32, '萤石粉'], ['G-R', 33, '嘎枝之心'],
  ['G-R', 34, '音乐唱片'], ['G-R', 44, '龙蛋'],
  // A-R：合成原材收编
  ['A-R', 26, '诡异（木板/菌菇）'], ['A-R', 27, '木棍'],
  // H-L 关键锚点（海绵/苔藓合并后）
  ['H-L', 9, '黏土'], ['H-L', 10, '黏土球'], ['H-L', 14, '沙砾'], ['H-L', 15, '燧石'],
  ['H-L', 17, '苔藓（含覆地苔藓）'], ['H-L', 18, '苍白苔藓（含覆地苔藓）'],
  ['H-L', 20, '雪块'], ['H-L', 24, '海绵（含湿海绵）'],
  ['H-L', 25, '红砖块'], ['H-L', 26, '红砖'], ['H-L', 30, '下界砖块'], ['H-L', 31, '下界砖'],
  ['H-L', 36, '树脂块'], ['H-L', 37, '树脂'], ['H-L', 38, '镶金黑石'],
  ['H-L', 39, '瓦'], ['H-L', 40, '楼梯'], ['H-L', 41, '台阶'],
  ['H-L', 47, '砖'], ['H-L', 48, '墙'], ['H-L', 50, '栅栏门'],
  ['H-R', 2, '圆石'], ['H-R', 3, '平滑石头'], ['H-R', 4, '苔石'],
  // H-R 尾段：床/旗帜/旗帜图案/蜡烛/坐垫 自 B 迁入
  ['H-R', 50, '床'], ['H-R', 51, '旗帜'], ['H-R', 52, '旗帜图案'],
  ['H-R', 53, '蜡烛'], ['H-R', 54, '坐垫'],
];
for (const [as, slot, cn] of anchors) {
  const [area, side] = as.split('-');
  const u = units.find(x => x.area === area && x.side === side && x.slot === slot);
  assert(u && u.cn === cn, `${area}-${side} ${slot} 应为 ${cn}，实际 ${u ? u.cn : '空'}`);
}
// 不应再存在的 v2 单元（已拆分/合并/删除）
const WOOD_SPECIES_CN = ['橡木', '云杉', '白桦', '丛林', '金合欢', '深色橡木', '红树', '樱花', '苍白橡木', '杨木', '竹', '绯红', '诡异'];
const goneLabels = [
  '染料', '导航/计时', '杂项装备', '烟花', '活珊瑚', '死珊瑚',
  '郁金香', '蘑菇', '紫颂', '皮革/鳞甲', '磨制', '苔石砖',
  '海绵', '湿海绵', '苔藓块', '覆地苔藓', '苍白苔藓块', '苍白覆地苔藓',
  ...WOOD_SPECIES_CN.map(cn => `${cn}（台阶/楼梯/告示牌/展示架）`),
];
for (const gone of goneLabels) {
  assert(!v3LabelMap.has(gone), `v2 单元不应存在（应拆分/合并/删除）: ${gone}`);
}
// B/C/D 不再有潜影盒
assert(!units.some(u => u.id.startsWith('COLOR:shulker') && u.area !== 'B'), '潜影盒应只在 B 区');
{
  const glassUnit = v3LabelMap.get('玻璃');
  const shulkers = units.filter(u => u.id.startsWith('COLOR:shulker'));
  assert(shulkers.every(u => u.side === 'R' && glassUnit && u.slot < glassUnit.slot),
    '潜影盒应在 B-R 开头、玻璃前方');
}

// ---------- v3 物品集合 ----------
const itemSetOf = cn => sorted(v3LabelMap.get(cn)?.items || []);
const eqItems = (cn, expected) => {
  const got = itemSetOf(cn);
  const d = diffSet(expected, got);
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `${cn} 物品不符；缺少 [${d.onlyA.join(',')}]，多出 [${d.onlyB.join(',')}]`);
};
eqItems('钓鱼竿', ['fishing_rod', 'carrot_on_a_stick', 'warped_fungus_on_a_stick']);
eqItems('西瓜种子（含西瓜片）', ['melon_seeds', 'melon_slice', 'glistering_melon_slice']);
eqItems('玻璃', ['glass', 'glass_pane']);
eqItems('遮光玻璃', ['tinted_glass']);
eqItems('导航', ['compass', 'recovery_compass']);
eqItems('时钟', ['clock']);
eqItems('龙泪', ['beetroot']);
eqItems('甜菜根', ['beetroot']);
eqItems('烟花火箭', ['firework_rocket']);
eqItems('烟火之星', ['firework_star']);
eqItems('告示牌（含悬挂式）', units.filter(u => u.id === 'BUILD:v_sign').flatMap(u => u.items));
{
  const stairs = v3LabelMap.get('楼梯').items;
  const slab = v3LabelMap.get('台阶').items;
  const sign = v3LabelMap.get('告示牌（含悬挂式）').items;
  const shelf = v3LabelMap.get('展示架').items;
  const brick = v3LabelMap.get('砖').items;
  assert(stairs.includes('oak_stairs') && stairs.includes('bamboo_mosaic_stairs'), '楼梯应并入树种/竹马赛克楼梯');
  assert(slab.includes('oak_slab') && slab.includes('bamboo_mosaic_slab'), '台阶应并入树种/竹马赛克台阶');
  assert(sign.includes('oak_sign') && sign.includes('oak_hanging_sign'), '告示牌应含普通+悬挂式');
  assert(shelf.includes('oak_shelf'), '展示架应含树种展示架');
  assert(brick.includes('mossy_stone_bricks') && brick.includes('bamboo_mosaic'), '砖格应含苔石砖+竹马赛克');
  assert(sign.length === 26 && shelf.length === 13, `告示牌 26 / 展示架 13，实际 ${sign.length}/${shelf.length}`);
}
{
  const coral = units.filter(u => u.id.startsWith('PLANT:coral:'));
  assert(coral.length === 5, `珊瑚格 ${coral.length}，应为 5`);
  assert(coral.every(u => u.items.length === 6), '每色珊瑚应含 块/珊瑚/扇 + 失活 6 件');
  assert(!units.some(u => u.id === 'PLANT:coral_live' || u.id === 'PLANT:coral_dead'), '活/死珊瑚合并格应删除');
}
{
  const tulip = units.filter(u => u.id.startsWith('PLANT:tulip_'));
  assert(tulip.length === 4 && tulip.every(u => u.items.length === 1), '郁金香应拆 4 格');
  const chorus = units.filter(u => ['CROP:chorus_fruit', 'CROP:chorus_flower', 'CROP:popped_chorus'].includes(u.id));
  assert(chorus.length === 3, `紫颂应拆 3 格（植株已排除）: ${chorus.length}`);
}
// 不变侧与冻结 v2 完全一致（A-L 因煤矿石/下界石英拆分除外）
{
  const d = diffSet(labelsOfV2f('A', 'L').filter(l => !['煤炭', '下界石英'].includes(l)),
    labelsOfV3('A', 'L').filter(l => !['煤矿石', '煤炭/木炭', '下界石英矿石', '石英', '石英块', '青金石矿石', '红石矿石', '绿宝石矿石', '钻石矿石'].includes(l)));
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `A-L 与 v2 相对关系不符；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
}
for (const [area, side] of [['C', 'L'], ['D', 'L']]) {
  const d = diffSet(labelsOfV2f(area, side), labelsOfV3(area, side));
  assert(d.onlyA.length === 0 && d.onlyB.length === 0,
    `${area}-${side} 应与 v2 完全一致；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
}

// ---------- v1→v2 回归校验（针对冻结 v2）----------
{
  const bedLabelsV2 = labelsOfV2f('B', 'L').slice(-3);
  const hR = labelsOfV1('H', 'R');
  const oldWoodwork = hR.slice(0, 13);
  const oldBuilding = hR.slice(13, 36);
  const miscLabels = hR.slice(41, 47);
  const potLabels = hR.slice(50, 52);
  const newWoodwork = oldWoodwork.map(l => l.replace('（台阶/楼梯/门窗/船）', '（台阶/楼梯/告示牌/展示架）'));
  const expectedH_R = [...newWoodwork, '纸', '书', ...miscLabels, ...potLabels, '船/门/活板门'];
  const expectedB_L = [...labelsOfV1('E', 'L'), ...bedLabelsV2];
  const expectedB_R = labelsOfV1('E', 'R');
  const lightLabels = ['荧石', '菌光体', '赭黄蛙明灯', '珠光蛙明灯', '青翠蛙明灯'];
  const terrainLabels = labelsOfV1('H', 'L');
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
    ['A-L', labelsOfV1('A', 'L'), labelsOfV2f('A', 'L')],
    ['A-R', expectedA_R, labelsOfV2f('A', 'R')],
    ['B-L', expectedB_L, labelsOfV2f('B', 'L')],
    ['B-R', expectedB_R, labelsOfV2f('B', 'R')],
    ['C-L', labelsOfV1('C', 'L'), labelsOfV2f('C', 'L')],
    ['C-R', labelsOfV1('C', 'R'), labelsOfV2f('C', 'R')],
    ['D-L', labelsOfV1('D', 'L'), labelsOfV2f('D', 'L')],
    ['D-R', labelsOfV1('D', 'R'), labelsOfV2f('D', 'R')],
    ['E-L', expectedE_L, labelsOfV2f('E', 'L')],
    ['E-R', expectedE_R, labelsOfV2f('E', 'R')],
    ['F-L', expectedF_L, labelsOfV2f('F', 'L')],
    ['F-R', labelsOfV1('F', 'R'), labelsOfV2f('F', 'R')],
    ['G-L', labelsOfV1('G', 'L'), labelsOfV2f('G', 'L')],
    ['G-R', expectedG_R, labelsOfV2f('G', 'R')],
    ['H-R', expectedH_R, labelsOfV2f('H', 'R')],
  ];
  for (const [name, expected, actual] of orderChecks) {
    const d = diffSet(expected, actual);
    assert(d.onlyA.length === 0 && d.onlyB.length === 0,
      `v1→v2 ${name} 顺序不符；缺少 [${d.onlyA.join(' / ')}]，多出 [${d.onlyB.join(' / ')}]`);
  }
}

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
const coldStat = stats(coldAreaUnits);

console.log('== 冷热库区校验（v3） ==');
console.log(`单元 ${units.length}（物品 ${units.filter(u => u.type === 'item').length} / 附魔 44 / 药水 40），规则 ${JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'points', 'itemsorter-points.json'), 'utf8')).items.length}`);
console.log(`热区占用 ${hotUnits.length + auxUnits.length}：A ${sideCount['A-L'] + sideCount['A-R']}，C ${sideCount['C-L'] + sideCount['C-R']}，E ${sideCount['E-L'] + sideCount['E-R']}，G ${sideCount['G-L'] + sideCount['G-R']}；热单元 ${hotUnits.length}`);
console.log(`冷区 B/D/F/H ${coldAreaUnits.length}：B ${sideCount['B-L'] + sideCount['B-R']}，D ${sideCount['D-L'] + sideCount['D-R']}，F ${sideCount['F-L'] + sideCount['F-R']}，H ${sideCount['H-L'] + sideCount['H-R']}`);
console.log(`H 区（合并区）：L ${sideCount['H-L']} / R ${sideCount['H-R']}；磨制拆单 10、告示牌 26 件、展示架 13 件、船/门/活板门 ${boat ? boat.items.length : 0} 件`);
console.log(`热单元距离：平均 ${hotStat.avg.toFixed(2)}，最远 ${hotStat.max.toFixed(1)}`);
console.log(`冷区 B/D/F/H 距离：平均 ${coldStat.avg.toFixed(2)}，最远 ${coldStat.max.toFixed(1)}`);

if (problems.length) {
  console.log('PROBLEMS', problems.length);
  console.log(problems.slice(0, 40).join('\n'));
  process.exit(1);
}
console.log('cold/hot validation passed');
