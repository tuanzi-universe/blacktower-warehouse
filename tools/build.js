'use strict';

const fs = require('fs');
const path = require('path');
const { UNITS, EXCLUDED, COLOR_NAMES } = require('./families');
const { ENCHANTS, EFFECT_IDS, EFFECT_NAMES, POTION_ORDER } = require('./attributes');

const ROOT = path.resolve(__dirname, '..');
const BOT_CONFIG = 'C:/Projects/blacktower/warehouse-bot/config/itemsorter-points.json';

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

function readCsvObjects(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = rows[0];
  return rows.slice(1).filter(r => r.some(x => x !== '')).map(r => {
    const o = {};
    header.forEach((h, i) => o[h] = r[i] ?? '');
    return o;
  });
}

// ---------- 1. 物理货位 ----------
const rawRows = readCsvObjects(path.join(ROOT, 'data', 'partition.csv'));
const sideSlots = new Map(); // A-L -> Map(coordKey -> slot)
for (const r of rawRows) {
  const key = `${r.area}-${r.side}`;
  if (!sideSlots.has(key)) sideSlots.set(key, new Map());
  const m = sideSlots.get(key);
  const coord = `${r.block_x},${r.block_z}`;
  if (!m.has(coord)) {
    m.set(coord, {
      area: r.area,
      side: r.side,
      block_x: Number(r.block_x),
      block_y: Number(r.block_y),
      block_z: Number(r.block_z),
      bot_x: Number(r.bot_x),
      bot_y: Number(r.bot_y),
      bot_z: Number(r.bot_z),
      yaw: Number(r.bot_face_yaw),
      pitch: Number(r.bot_face_pitch || 0),
    });
  }
}

const AXIS_ORDER = {
  A: { axis: 'block_z', dir: -1 },
  B: { axis: 'block_x', dir: 1 },
  C: { axis: 'block_x', dir: 1 },
  D: { axis: 'block_x', dir: 1 },
  E: { axis: 'block_z', dir: 1 },
  F: { axis: 'block_x', dir: -1 },
  G: { axis: 'block_x', dir: -1 },
  H: { axis: 'block_x', dir: -1 },
};

const slots = [];
for (const [key, map] of sideSlots) {
  const [area, side] = key.split('-');
  const { axis, dir } = AXIS_ORDER[area];
  const arr = [...map.values()].sort((a, b) => dir * (a[axis] - b[axis]));
  if (arr.length !== 55) throw new Error(`${key} 唯一货位 ${arr.length}，应为 55`);
  arr.forEach((s, i) => {
    slots.push({
      ...s,
      slot: i + 1,
      point: {
        x: s.bot_x + 0.5,
        y: s.bot_y,
        z: s.bot_z + 0.5,
        yaw: s.yaw,
        pitch: s.pitch,
      },
    });
  });
}
if (slots.length !== 880) throw new Error(`货位总数 ${slots.length}，应为 880`);

const slotByKey = new Map();
for (const s of slots) slotByKey.set(`${s.area}-${s.side}-${s.slot}`, s);

// ---------- 2. 物品与单元 ----------
const allItems = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const allSet = new Set(allItems);
const obtainable = allItems.filter(i => !EXCLUDED.has(i) && !i.endsWith('_spawn_egg'));
const SPECIAL_ITEMS = new Set(['enchanted_book', 'potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']);

const assigned = new Map();
const unmatched = [];
for (const item of obtainable) {
  if (SPECIAL_ITEMS.has(item)) continue;
  let hit = null;
  for (const u of UNITS) {
    if (u.ids && u.ids.includes(item)) { hit = u; break; }
    if (u.re && u.re.test(item)) { hit = u; break; }
  }
  if (!hit) { unmatched.push(item); continue; }
  if (!assigned.has(hit.id)) assigned.set(hit.id, []);
  assigned.get(hit.id).push(item);
}
if (unmatched.length) throw new Error(`未匹配物品 ${unmatched.length}: ${unmatched.slice(0, 30).join(', ')}`);

const enchantNames = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'enchantments.json'), 'utf8')));
for (const [key] of ENCHANTS) if (!enchantNames.has(key)) throw new Error(`附魔缺失: ${key}`);
if (ENCHANTS.length !== enchantNames.size) throw new Error(`附魔数量 ${ENCHANTS.length} != ${enchantNames.size}`);

const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
for (const e of effects) {
  if (EFFECT_IDS[e] === undefined) throw new Error(`效果缺少数字 ID: ${e}`);
  if (!EFFECT_NAMES[e]) throw new Error(`效果缺少中文名: ${e}`);
}

// 中文名（H-L 拆分与单体命名需要）
const itemCn = new Map();
const paperRows = readCsvObjects('C:/Projects/blacktower/papers/序号-工作表1.csv');
for (const r of paperRows) {
  if (r['Minecraft ID']) itemCn.set(r['Minecraft ID'], r['中文译名'] || '');
}
const missingCn = obtainable.filter(i => !itemCn.get(i));
if (missingCn.length) console.warn(`缺少中文名 ${missingCn.length}: ${missingCn.slice(0, 10).join(', ')}`);

// 单元实例：普通单元 + 附魔单元 + 药水单元
let unitInstances = [];
for (const u of UNITS) {
  const items = (assigned.get(u.id) || []).slice();
  if (!items.length) continue;
  unitInstances.push({
    ...u,
    entry_type: 'item',
    family: u.id,
    items,
  });
}

// D-L 附魔
const enchantUnits = [];
ENCHANTS.forEach(([key, cn, maxLevel], i) => {
  enchantUnits.push({
    id: `ENCHANT:${key}`,
    area: 'D',
    side: 'L',
    slot: i + 1,
    entry_type: 'enchant',
    group: '附魔书',
    cn: `附魔·${cn}`,
    family: `enchant:${key}`,
    rep: 'enchanted_book',
    items: ['enchanted_book'],
    enchant: { key, cn, maxLevel },
  });
});
enchantUnits.push({
  id: 'ENCHANT:other',
  area: 'D',
  side: 'L',
  slot: ENCHANTS.length + 1,
  entry_type: 'enchant',
  group: '附魔书',
  cn: '附魔·其他',
  family: 'enchant:other',
  rep: 'enchanted_book',
  items: ['enchanted_book'],
  enchant: null,
});

// H-R 药水
const POTION_FORMS = [
  ['potion', '普通药水'],
  ['splash_potion', '喷溅药水'],
  ['lingering_potion', '滞留药水'],
];
const potionUnits = [];
const orderedEffects = [
  ...POTION_ORDER.filter(e => effects.includes(e)),
  ...effects.filter(e => !POTION_ORDER.includes(e)),
];
if (orderedEffects.length !== effects.length || new Set(orderedEffects).size !== effects.length) {
  throw new Error('POTION_ORDER 与 effects.json 不一致');
}
orderedEffects.forEach((e, i) => {
  potionUnits.push({
    id: `POTION:${e}`,
    area: 'H',
    side: 'R',
    slot: i + 1,
    entry_type: 'potion',
    group: '药水',
    cn: `药水·${EFFECT_NAMES[e]}`,
    family: `potion:${e}`,
    rep: 'potion',
    items: [...POTION_FORMS.map(([f]) => f), 'tipped_arrow'],
    effect: e,
  });
});

unitInstances.push(...enchantUnits, ...potionUnits);

// ---------- 色彩重排 + 收藏迁移 ----------
const oldColorUnits = unitInstances.filter(u => u.id.startsWith('COLOR:'));
const colorItems = new Set(oldColorUnits.flatMap(u => u.items));
const pickColor = (color, suffixes) => suffixes.map(s => `${color}_${s}`).filter(id => colorItems.has(id));
const pickAll = suffix => COLOR_NAMES.flatMap(([c]) => [`${c}_${suffix}`]).filter(id => colorItems.has(id));
const colorNew = [];
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:wool`, area: 'E', side: 'L', entry_type: 'item', group: '色系',
    cn: `${cn}羊毛/地毯`, family: `COLOR:${color}:wool`, rep: `${color}_wool`,
    items: pickColor(color, ['wool', 'wool_slab', 'wool_stairs', 'carpet']),
  });
}
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:terracotta`, area: 'E', side: 'L', entry_type: 'item', group: '色系',
    cn: `${cn}陶瓦`, family: `COLOR:${color}:terracotta`, rep: `${color}_terracotta`,
    items: pickColor(color, ['terracotta']),
  });
}
colorNew.push({
  id: 'COLOR:terracotta', area: 'E', side: 'L', entry_type: 'item', group: '彩色材质',
  cn: '陶瓦（无色）', family: 'COLOR:terracotta', rep: 'terracotta',
  items: ['terracotta'].filter(id => colorItems.has(id)),
});
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:glass`, area: 'E', side: 'R', entry_type: 'item', group: '色系',
    cn: `${cn}染色玻璃`, family: `COLOR:${color}:glass`, rep: `${color}_stained_glass`,
    items: pickColor(color, ['stained_glass', 'stained_glass_pane']),
  });
}
const SHULKER_GROUPS = [
  { id: 'COLOR:shulker_1', cn: '彩色潜影盒 1/2', colors: COLOR_NAMES.slice(0, 8) },
  { id: 'COLOR:shulker_2', cn: '彩色潜影盒 2/2', colors: COLOR_NAMES.slice(8) },
];
for (const group of SHULKER_GROUPS) {
  colorNew.push({
    id: group.id, area: 'C', side: 'R', entry_type: 'item', group: '收纳',
    cn: group.cn, family: group.id, rep: `${group.colors[0][0]}_shulker_box`,
    items: group.colors.flatMap(([color]) => pickColor(color, ['shulker_box'])),
  });
}
colorNew.push({
  id: 'COLOR:shulker', area: 'C', side: 'R', entry_type: 'item', group: '收纳',
  cn: '潜影盒（无色）', family: 'COLOR:shulker', rep: 'shulker_box',
  items: colorItems.has('shulker_box') ? ['shulker_box'] : [],
});
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:glazed`, area: 'E', side: 'L', entry_type: 'item', group: '色系',
    cn: `${cn}带釉陶瓦`, family: `COLOR:${color}:glazed`, rep: `${color}_glazed_terracotta`,
    items: pickColor(color, ['glazed_terracotta']),
  });
}
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:concrete`, area: 'E', side: 'R', entry_type: 'item', group: '色系',
    cn: `${cn}混凝土`, family: `COLOR:${color}:concrete`, rep: `${color}_concrete`,
    items: pickColor(color, ['concrete', 'concrete_powder', 'concrete_slab', 'concrete_stairs']),
  });
}
const dyeItems = pickAll('dye');
colorNew.push({
  id: 'COLOR:dye', area: 'E', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '染料', family: 'COLOR:dye', rep: 'white_dye', items: dyeItems,
});
const bundleItems = [...pickAll('bundle'), ...(colorItems.has('bundle') ? ['bundle'] : [])];
colorNew.push({
  id: 'COLOR:bundle', area: 'E', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '收纳袋', family: 'COLOR:bundle', rep: 'bundle', items: bundleItems,
});
colorNew.push({
  id: 'COLOR:harness', area: 'E', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '挽具', family: 'COLOR:harness', rep: 'white_harness', items: pickAll('harness'),
});
colorNew.push({
  id: 'COLOR:cushion', area: 'E', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '坐垫', family: 'COLOR:cushion', rep: 'white_cushion', items: pickAll('cushion'),
});
const bedItems = [...pickAll('bed'), ...(colorItems.has('straw_bed') ? ['straw_bed'] : [])];
colorNew.push({
  id: 'COLOR:bed', area: 'H', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '床', family: 'COLOR:bed', rep: 'white_bed', items: bedItems,
});
colorNew.push({
  id: 'COLOR:banner', area: 'H', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '旗帜', family: 'COLOR:banner', rep: 'white_banner', items: pickAll('banner'),
});
const candleItems = [...pickAll('candle'), ...(colorItems.has('candle') ? ['candle'] : [])];
colorNew.push({
  id: 'COLOR:candle', area: 'H', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '蜡烛', family: 'COLOR:candle', rep: 'candle', items: candleItems,
});
const coveredColorItems = new Set(colorNew.flatMap(u => u.items));
for (const id of colorItems) if (!coveredColorItems.has(id)) throw new Error(`彩色物品未分组: ${id}`);
if (coveredColorItems.size !== colorItems.size) throw new Error('彩色物品分组重复');
unitInstances = unitInstances.filter(u => !u.id.startsWith('COLOR:'));
unitInstances.push(...colorNew);

// 收藏迁移
const collectIds = [
  'COLLECT:disc', 'COLLECT:sherd', 'COLLECT:banner_pattern', 'COLLECT:smithing_template',
  'COLLECT:map', 'COLLECT:goat_horn',
  'COLLECT:head_zombie', 'COLLECT:head_skeleton', 'COLLECT:head_wither_skeleton',
  'COLLECT:head_creeper', 'COLLECT:head_dragon', 'COLLECT:head_piglin', 'COLLECT:head_player',
  'COLLECT:trial_key', 'COLLECT:ominous_trial_key', 'COLLECT:dragon_egg',
  'COLLECT:heavy_core', 'COLLECT:painting', 'COLLECT:decorated_pot', 'COLLECT:flower_pot',
  'COLLECT:experience_bottle', 'COLLECT:end_crystal',
];
const collectMap = new Map(unitInstances.filter(u => collectIds.includes(u.id)).map(u => [u.id, u]));
for (const id of collectIds) if (!collectMap.has(id)) throw new Error(`收藏单元缺失: ${id}`);
unitInstances = unitInstances.filter(u => !collectIds.includes(u.id));
const dCollect = ['COLLECT:smithing_template', 'COLLECT:goat_horn', 'COLLECT:heavy_core', 'COLLECT:end_crystal'].map(id => collectMap.get(id));
const hCollect = ['COLLECT:decorated_pot', 'COLLECT:flower_pot'].map(id => collectMap.get(id));
const hostileCollect = [
  'COLLECT:disc',
  'COLLECT:head_zombie', 'COLLECT:head_skeleton', 'COLLECT:head_wither_skeleton',
  'COLLECT:head_creeper', 'COLLECT:head_dragon', 'COLLECT:head_piglin', 'COLLECT:head_player',
  'COLLECT:trial_key', 'COLLECT:ominous_trial_key',
  'COLLECT:dragon_egg',
].map(id => collectMap.get(id));
const neutralCollect = ['COLLECT:sherd', 'COLLECT:banner_pattern', 'COLLECT:map', 'COLLECT:painting', 'COLLECT:experience_bottle'].map(id => collectMap.get(id));
for (const u of dCollect) { u.area = 'D'; u.side = 'R'; }
for (const u of hCollect) { u.area = 'H'; u.side = 'R'; }
for (const u of hostileCollect) { u.area = 'G'; u.side = 'L'; }
for (const u of neutralCollect) { u.area = 'G'; u.side = 'R'; }
const ominousTrialUnit = collectMap.get('COLLECT:ominous_trial_key');
const raidUnit = unitInstances.find(u => u.id === 'POTION:raid_omen');
if (ominousTrialUnit && raidUnit) {
  ominousTrialUnit.items = ominousTrialUnit.items.filter(i => i !== 'ominous_bottle');
  raidUnit.items = [...new Set([...raidUnit.items, 'ominous_bottle'])];
}
const gMoveIds = [
  'DROP:ink', 'DROP:leather', 'DROP:feather',
  'DROP:egg', 'DROP:turtle_egg', 'DROP:sniffer_egg',
  'DROP:honeycomb', 'DROP:honeycomb_block', 'DROP:honey_bottle', 'DROP:honey_block',
  'DROP:ender',
];
const gMoved = gMoveIds.map(id => unitInstances.find(u => u.id === id)).filter(Boolean);
if (gMoved.length !== gMoveIds.length) throw new Error('G-R 迁移单元缺失');
for (const u of gMoved) { u.area = 'G'; u.side = 'R'; }
const gMovedSet = new Set(gMoved.map(u => u.id));
const bucketIds = [
  'GEAR:bucket', 'GEAR:water_bucket', 'GEAR:lava_bucket', 'GEAR:milk_bucket',
  'GEAR:powder_snow_bucket', 'GEAR:axolotl_bucket', 'GEAR:cod_bucket', 'GEAR:salmon_bucket',
  'GEAR:pufferfish_bucket', 'GEAR:tropical_fish_bucket', 'GEAR:tadpole_bucket',
  'GEAR:sulfur_cube_bucket',
];
const gRBuckets = bucketIds.map(id => unitInstances.find(u => u.id === id));
if (gRBuckets.some(u => !u)) throw new Error('桶类单元缺失');
for (const u of gRBuckets) { u.area = 'G'; u.side = 'R'; }
const gRBucketSet = new Set(bucketIds);

// ---------- 结构调整 ----------
// H-L 拆成单物品，一物一格；顺序按单元定义（石/深板岩已在泥后）
// 只拆地形单元；BUILD:wall/fence/fence_gate 是整组变体，不能拆。
const hlOriginals = unitInstances.filter(u => u.area === 'H' && u.side === 'L' && u.id.startsWith('TERRAIN:'));
const hlSplit = [];
for (const u of hlOriginals) {
  const ordered = [
    ...(u.ids || []).filter(id => u.items.includes(id)),
    ...u.items.filter(id => !(u.ids || []).includes(id)),
  ];
  for (const item of ordered) {
    hlSplit.push({
      id: `${u.id}:${item}`,
      area: 'H', side: 'L', entry_type: 'item',
      group: u.group, cn: itemCn.get(item) || item,
      family: `${u.family}:${item}`, rep: item, items: [item],
    });
  }
}
unitInstances = unitInstances.filter(u => !(u.area === 'H' && u.side === 'L' && u.id.startsWith('TERRAIN:')));

// B 区全部搬到 H-R；玻璃单元改为 E-R 头部
const bUnits = unitInstances.filter(u => u.area === 'B');
for (const u of bUnits) { u.area = 'H'; u.side = 'R'; }
const buildGlass = bUnits.find(u => u.id === 'BUILD:glass');
if (!buildGlass) throw new Error('缺少 BUILD:glass');
buildGlass.area = 'E';
buildGlass.side = 'R';

// H-R 药水搬到 F 区 LR 尾部：L 20 正面，R 20 负面/稀有；无兜底
const movedPotions = unitInstances.filter(u => u.entry_type === 'potion');
const positiveEffects = new Set(orderedEffects.slice(0, 20));
const positivePotionUnits = movedPotions.filter(u => u.effect && positiveEffects.has(u.effect));
const negativePotionUnits = movedPotions.filter(u => u.effect && !positiveEffects.has(u.effect));
const fLPotions = positivePotionUnits;
const fRPotions = negativePotionUnits;
if (fLPotions.length !== 20 || fRPotions.length !== 20) {
  throw new Error(`药水分配 ${fLPotions.length}/${fRPotions.length}，应为 20/20`);
}
for (const u of fLPotions) { u.area = 'F'; u.side = 'L'; }
for (const u of fRPotions) { u.area = 'F'; u.side = 'R'; }

// F-L 调整：蜂箱/嘎枝之心/青蛙卵 -> G-L；灌木合并；紫颂 -> F-L
const movedPlantIds = ['PLANT:frogspawn', 'PLANT:bee_nest'];
const movedPlants = movedPlantIds.map(id => unitInstances.find(u => u.id === id)).filter(Boolean);
for (const u of movedPlants) { u.area = 'G'; u.side = 'R'; }
const creakingPlant = unitInstances.find(u => u.id === 'PLANT:creaking_heart');
if (creakingPlant) { creakingPlant.area = 'G'; creakingPlant.side = 'L'; }

const bush = unitInstances.find(u => u.id === 'PLANT:bush');
if (!bush) throw new Error('缺少 PLANT:bush');
const firefly = unitInstances.find(u => u.id === 'PLANT:firefly_bush');
const redShrub = unitInstances.find(u => u.id === 'PLANT:red_shrub');
bush.items = [...new Set([bush, firefly, redShrub].filter(Boolean).flatMap(u => u.items))];
bush.cn = '灌木';
bush.family = 'PLANT:bush';
bush.rep = 'bush';
unitInstances = unitInstances.filter(u => !['PLANT:firefly_bush', 'PLANT:red_shrub'].includes(u.id));

const chorus = unitInstances.find(u => u.id === 'CROP:chorus');
if (chorus) { chorus.area = 'F'; chorus.side = 'L'; }

// F 区非药水 59 个单元：前 30 放 L 前部，后 29 放 R 前部
const fNonPotion = [
  ...unitInstances.filter(u => u.area === 'F' && u.side === 'L' && u.entry_type === 'item'),
  ...unitInstances.filter(u => u.area === 'F' && u.side === 'R' && u.entry_type === 'item'),
];
if (fNonPotion.length !== 59) throw new Error(`F 非药水单元 ${fNonPotion.length}，应为 59`);
const fLPlants = fNonPotion.slice(0, 30);
const fRPlants = fNonPotion.slice(30);
for (const u of fLPlants) { u.area = 'F'; u.side = 'L'; }
for (const u of fRPlants) { u.area = 'F'; u.side = 'R'; }

// 按区/侧分配格位（冷热库区显式顺序，内→外）
const SIDE_ORDER = ['A-L', 'A-R', 'B-L', 'B-R', 'C-L', 'C-R', 'D-L', 'D-R', 'E-L', 'E-R', 'F-L', 'F-R', 'G-L', 'G-R', 'H-L', 'H-R'];
const movedSet = new Set(movedPlantIds);
const eLWool = COLOR_NAMES.map(([c]) => colorNew.find(u => u.id === `COLOR:${c}:wool`));
const eLTerra = new Map(COLOR_NAMES.map(([c]) => [c, colorNew.find(u => u.id === `COLOR:${c}:terracotta`)]));
const eLGlazed = new Map(COLOR_NAMES.map(([c]) => [c, colorNew.find(u => u.id === `COLOR:${c}:glazed`)]));
const eL = [...eLWool];
for (const [c] of COLOR_NAMES) eL.push(eLTerra.get(c), eLGlazed.get(c));
eL.push(colorNew.find(u => u.id === 'COLOR:terracotta'));
const eRGlass = COLOR_NAMES.map(([c]) => colorNew.find(u => u.id === `COLOR:${c}:glass`));
const eRConcrete = COLOR_NAMES.map(([c]) => colorNew.find(u => u.id === `COLOR:${c}:concrete`));
const eRExtras = ['COLOR:dye', 'COLOR:bundle', 'COLOR:harness', 'COLOR:cushion'].map(id => colorNew.find(u => u.id === id));
const eR = [buildGlass, ...eRGlass, ...eRConcrete, ...eRExtras];
for (const [name, arr] of [['eL', eL], ['eR', eR]]) {
  if (arr.some(u => !u)) throw new Error(`${name} 存在未定义的色彩单元`);
}
const bedUnits = colorNew.filter(u => ['COLOR:bed', 'COLOR:banner', 'COLOR:candle'].includes(u.id));
const cRShulkers = ['COLOR:shulker_1', 'COLOR:shulker_2', 'COLOR:shulker'].map(id => colorNew.find(u => u.id === id));
if (cRShulkers.some(u => !u)) throw new Error('缺少潜影盒单元');
const gLBase = unitInstances.filter(u => u.area === 'G' && u.side === 'L' && !movedSet.has(u.id) && !gMovedSet.has(u.id) && u.id !== 'PLANT:creaking_heart');
const gRBase = unitInstances.filter(u => u.area === 'G' && u.side === 'R' && !gMovedSet.has(u.id) && !movedSet.has(u.id) && !gRBucketSet.has(u.id));
const gL = [...gLBase, ...(creakingPlant ? [creakingPlant] : []), ...hostileCollect];
const gR = [...gRBase, ...gRBuckets, ...gMoved, ...movedPlants, ...neutralCollect];
const dRBase = unitInstances.filter(u => u.area === 'D' && u.side === 'R');
const dR = [...dRBase, ...dCollect];

// 热区：A 矿物、C 红石、E 地形、G 生物资源（正向四区）
// 冷区：B 色彩、D 装备、F 植物药水、H 木材建材收纳原材（斜向四区）
const minUnits = unitInstances.filter(u => u.id.startsWith('MIN:'));
const redUnits = unitInstances.filter(u => u.id.startsWith('RED:'));
const woodUnits = unitInstances.filter(u => u.id.startsWith('WOODLOG:') || u.id.startsWith('WOODBY:'));
const workUnits = unitInstances.filter(u => u.id.startsWith('WORK:'));
const rawUnits = unitInstances.filter(u => u.id.startsWith('RAW:'));
// 六个合成原材迁到语境位置：树脂→H-L 树脂块旁；纸/书→H-R 书架旁；碗→G-R 炖菜旁；
// 玻璃瓶→F-L 药水前；雪球→E-L 雪块旁。
const rawMoveIds = ['RAW:resin', 'RAW:paper', 'RAW:book', 'RAW:bowl', 'RAW:glass_bottle', 'RAW:snowball'];
const rawMoved = rawMoveIds.map(id => unitInstances.find(u => u.id === id));
if (rawMoved.some(u => !u)) throw new Error('原材迁移单元缺失');
const [resinUnit, paperUnit, bookUnit, bowlUnit, glassBottleUnit, snowballUnit] = rawMoved;
const rawMain = rawUnits.filter(u => !rawMoveIds.includes(u.id));
const lightUnits = bUnits.filter(u => u.id.startsWith('BUILD:light_'));
const variantUnits = unitInstances.filter(u => ['BUILD:wall', 'BUILD:fence', 'BUILD:fence_gate'].includes(u.id));
const terrainUnits = hlSplit;
// C-R 恢复原顺序：前 4 个工作站 → 3 个潜影盒 → 其余工作站
const cR = [...workUnits.slice(0, 4), ...cRShulkers, ...workUnits.slice(4)];
// H 区剩余：L 基础方块 + 变体组 + 墙/栅栏/栅栏门，R 木构件 + 杂项/陶罐 + 船/门/活板门
const baseUnits = unitInstances.filter(u => u.group === '基础方块');
const groupUnits = unitInstances.filter(u => u.id.startsWith('BUILD:v_'));
const hWoodwork = bUnits.filter(u => u.id.startsWith('WOODWORK:'));
const hMisc = [
  ...bUnits.filter(u => !u.id.startsWith('WOODWORK:') && u.group !== '石质建材' && u.id !== 'BUILD:glass' && !u.id.startsWith('BUILD:light_')),
  ...hCollect,
];
const boatDoorUnit = unitInstances.find(u => u.id === 'WOODWORK:boat_door');
const baseWithResin = [];
for (const u of baseUnits) {
  baseWithResin.push(u);
  if (u.id === 'BUILD:base_resin') baseWithResin.push(resinUnit);
}
if (baseWithResin.length !== 14) throw new Error(`H-L 基础方块+树脂 ${baseWithResin.length}，应为 14`);
const hRWithBooks = [...hWoodwork, paperUnit, bookUnit, ...hMisc, ...(boatDoorUnit ? [boatDoorUnit] : [])];
const gRWithBowl = [];
for (const u of gR) {
  gRWithBowl.push(u);
  if (u.id === 'FOOD:suspicious_stew') gRWithBowl.push(bowlUnit);
}
if (!gRWithBowl.includes(bowlUnit)) throw new Error('碗未插入 G-R 炖菜后');
// E 区两侧均衡并靠北：地形 53 拆 29/24，L/R 都从 slot 1 起；光源 5 接 E-R 地形尾部。
const snowIdx = terrainUnits.findIndex(u => u.id === 'TERRAIN:snow:snow_block');
if (snowIdx < 0) throw new Error('缺少雪块地形单元');
const eTerrainL = [...terrainUnits.slice(0, snowIdx + 1), snowballUnit, ...terrainUnits.slice(snowIdx + 1, 29)];
const eTerrainR = terrainUnits.slice(29);
if (eTerrainL.length !== 30) throw new Error(`E-L 地形+雪球 ${eTerrainL.length}，应为 30`);
if (eTerrainR.length !== 24) throw new Error(`E-R 地形 ${eTerrainR.length}，应为 24`);

const counts = [
  ['矿物', minUnits.length, 25],
  ['红石', redUnits.length, 21],
  ['木材', woodUnits.length, 26],
  ['合成原材主', rawMain.length, 5],
  ['原材迁出', rawMoved.length, 6],
  ['工作站/容器', workUnits.length, 26],
  ['C-R', cR.length, 29],
  ['地形', terrainUnits.length, 53],
  ['E-L 地形+雪球', eTerrainL.length, 30],
  ['E-R 地形', eTerrainR.length, 24],
  ['光源', lightUnits.length, 5],
  ['基础方块+树脂', baseWithResin.length, 14],
  ['变体组', groupUnits.length, 12],
  ['墙/栅栏/栅栏门', variantUnits.length, 3],
  ['船/门/活板门', boatDoorUnit ? boatDoorUnit.items.length : 0, 48],
  ['H-R 组合', hRWithBooks.length, 24],
  ['G-R 含碗', gRWithBowl.length, 54],
  ['F-L 含瓶', fLPlants.length + 1 + fLPotions.length, 51],
  ['色彩 L', eL.length, 49],
  ['色彩 R', eR.length, 37],
  ['床旗蜡烛', bedUnits.length, 3],
  ['潜影盒', cRShulkers.length, 3],
  ['D-R', dR.length, 31],
  ['G-L', gL.length, 45],
  ['G-R', gR.length, 53],
  ['附魔', enchantUnits.length, 44],
  ['F-L 植物', fLPlants.length, 30],
  ['F-R 植物', fRPlants.length, 29],
  ['正面药水', fLPotions.length, 20],
  ['负面药水', fRPotions.length, 20],
];
for (const [name, got, want] of counts) {
  if (got !== want) throw new Error(`${name} ${got}，应为 ${want}`);
}
const groupItemExpect = {
  'BUILD:v_tile': 2, 'BUILD:v_stairs': 43, 'BUILD:v_slab': 46,
  'BUILD:v_chiseled': 12, 'BUILD:v_polished': 10, 'BUILD:v_cut': 2,
  'BUILD:v_smooth': 5, 'BUILD:v_cracked': 4, 'BUILD:v_mossy': 1,
  'BUILD:v_pillar': 2, 'BUILD:v_infested': 7, 'BUILD:v_brick': 11,
};
for (const u of groupUnits) {
  if (u.items.length !== groupItemExpect[u.id]) throw new Error(`${u.id} ${u.items.length}，应为 ${groupItemExpect[u.id]}`);
}
for (const u of baseUnits) {
  if (u.items.length !== 1) throw new Error(`${u.id} 基础方块应 1 件，实际 ${u.items.length}`);
}
const variantCounts = new Map(variantUnits.map(u => [u.id, u.items.length]));
if (variantCounts.get('BUILD:wall') !== 32) throw new Error(`墙 ${variantCounts.get('BUILD:wall')}，应为 32`);
if (variantCounts.get('BUILD:fence') !== 14) throw new Error(`栅栏 ${variantCounts.get('BUILD:fence')}，应为 14`);
if (variantCounts.get('BUILD:fence_gate') !== 13) throw new Error(`栅栏门 ${variantCounts.get('BUILD:fence_gate')}，应为 13`);

const bySide = new Map([
  ['A-L', minUnits],
  ['A-R', [...woodUnits, ...rawMain]],
  ['B-L', [...eL, ...bedUnits]],
  ['B-R', eR],
  ['C-L', redUnits],
  ['C-R', cR],
  ['D-L', enchantUnits],
  ['D-R', dR],
  ['E-L', eTerrainL],
  ['E-R', [...eTerrainR, ...lightUnits]],
  ['F-L', [...fLPlants, null, null, null, null, glassBottleUnit, ...fLPotions]],
  ['F-R', [...fRPlants, null, null, null, null, null, null, ...fRPotions]],
  ['G-L', gL],
  ['G-R', gRWithBowl],
  ['H-L', [...baseWithResin, ...groupUnits, ...variantUnits]],
  ['H-R', hRWithBooks],
]);

const expectLen = {
  'A-L': 25, 'A-R': 31, 'B-L': 52, 'B-R': 37, 'C-L': 21, 'C-R': 29,
  'D-L': 44, 'D-R': 31, 'E-L': 30, 'E-R': 29, 'F-L': 55, 'F-R': 55,
  'G-L': 45, 'G-R': 54, 'H-L': 29, 'H-R': 24,
};
const expectUnits = {
  'A-L': 25, 'A-R': 31, 'B-L': 52, 'B-R': 37, 'C-L': 21, 'C-R': 29,
  'D-L': 44, 'D-R': 31, 'E-L': 30, 'E-R': 29, 'F-L': 51, 'F-R': 49,
  'G-L': 45, 'G-R': 54, 'H-L': 29, 'H-R': 24,
};
const globalSeen = new Set();
for (const key of SIDE_ORDER) {
  const arr = bySide.get(key);
  if (!arr) throw new Error(`缺少分区 ${key}`);
  if (arr.length > 55) throw new Error(`${key} 单元 ${arr.length} > 55`);
  if (arr.length !== expectLen[key]) throw new Error(`${key} 数组长度 ${arr.length}，应为 ${expectLen[key]}`);
  const [area, side] = key.split('-');
  let count = 0;
  for (const u of arr) {
    if (!u) continue;
    count++;
    if (globalSeen.has(u.id)) throw new Error(`单元重复分配 ${u.id} (${key})`);
    globalSeen.add(u.id);
    u.area = area;
    u.side = side;
  }
  if (count !== expectUnits[key]) throw new Error(`${key} 单元 ${count}，应为 ${expectUnits[key]}`);
}
for (const u of unitInstances) {
  if (!globalSeen.has(u.id)) throw new Error(`源单元未分配 ${u.id}`);
}
if (globalSeen.size !== 581) throw new Error(`分配单元 ${globalSeen.size}，应为 581`);
unitInstances = SIDE_ORDER.flatMap(key => bySide.get(key)).filter(Boolean);

const placed = new Map();
for (const [k, arr] of bySide) {
  arr.forEach((u, i) => {
    if (!u) return;
    const slot = slotByKey.get(`${u.area}-${u.side}-${i + 1}`);
    if (!slot) throw new Error(`缺少货位 ${u.area}-${u.side}-${i + 1}`);
    u.slot = i + 1;
    u.point = {
      x: slot.point.x,
      y: slot.point.y,
      z: slot.point.z,
      yaw: slot.point.yaw,
      pitch: slot.point.pitch,
      label: u.cn,
      area: u.area,
      side: u.side,
    };
    placed.set(u.id, u);
  });
}

// ---------- 3. 纹理表 ----------
const oldHtml = fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8');
const texLine = oldHtml.split(/\r?\n/).find(l => l.startsWith('const TEX = '));
const TEX = texLine ? JSON.parse(texLine.slice('const TEX = '.length).replace(/;\s*$/, '')) : {};
TEX.potion = { item: 'assets/tex/potion__item.png' };
TEX.splash_potion = { item: 'assets/tex/splash_potion__item.png' };
TEX.lingering_potion = { item: 'assets/tex/lingering_potion__item.png' };
TEX.tipped_arrow = { item: 'assets/tex/arrow__item.png' };
const hasTex = id => !!(TEX[id] && (TEX[id].item || TEX[id].block));

// ---------- 5. 规则 ----------
const rules = [];
function pushRule(match, unit) {
  rules.push({ match, point: unit.point });
}

// 附魔：每个附魔的 1..max 级，再兜底
for (const u of enchantUnits) {
  if (!u.enchant) continue;
  for (let lv = 1; lv <= u.enchant.maxLevel; lv++) {
    pushRule({ name: 'minecraft:enchanted_book', enchantments: { [u.enchant.key]: lv } }, u);
  }
}
pushRule({ name: 'minecraft:enchanted_book' }, enchantUnits.find(u => !u.enchant));

// 药水：每个效果 × 三种药水形态 + 对应效果的药箭；无兜底
for (const u of potionUnits) {
  for (const [form] of POTION_FORMS) {
    pushRule({ name: `minecraft:${form}`, effects: [EFFECT_IDS[u.effect]] }, u);
  }
  pushRule({ name: 'minecraft:tipped_arrow', effects: [EFFECT_IDS[u.effect]] }, u);
}
if (raidUnit) pushRule({ name: 'minecraft:ominous_bottle' }, raidUnit);

// 普通物品：按区/侧/格排序，代表物优先，其余按中文名排序
function itemOrder(u) {
  const first = (u.items.includes(u.rep) && hasTex(u.rep)) ? u.rep : (u.items.find(hasTex) || u.items[0]);
  const items = u.items.filter(i => i !== first);
  items.sort((a, b) => (itemCn.get(a) || a).localeCompare(itemCn.get(b) || b, 'zh-CN'));
  return [first, ...items];
}
const itemUnits = unitInstances.filter(u => u.entry_type === 'item');
itemUnits.sort((a, b) => {
  const ak = `${a.area}${a.side}`.localeCompare(`${b.area}${b.side}`);
  return ak || a.slot - b.slot;
});
for (const u of itemUnits) {
  for (const item of itemOrder(u)) {
    pushRule({ name: `minecraft:${item}` }, u);
  }
}

// ---------- 6. 特殊点位 ----------
const botPoints = JSON.parse(fs.readFileSync(BOT_CONFIG, 'utf8'));
const special = {
  trash: botPoints.trash,
  minecart: botPoints.minecart,
  collector: botPoints.collector,
  button: botPoints.button,
  ready: botPoints.ready,
  readyButton: botPoints.readyButton,
};
for (const k of ['trash', 'minecart', 'collector', 'button', 'ready', 'readyButton']) {
  if (!special[k]) throw new Error(`缺少特殊点位 ${k}`);
}

const pointsFile = {
  items: rules,
  ...special,
};

// ---------- 7. 校验 ----------
const pointKeys = new Set();
for (const u of unitInstances) {
  const p = u.point;
  const key = `${p.x},${p.y},${p.z},${p.yaw},${p.pitch}`;
  if (pointKeys.has(key)) throw new Error(`重复点位: ${key} (${u.id})`);
  pointKeys.add(key);
}
const matchKeys = new Set();
for (const r of rules) {
  const k = JSON.stringify(r.match);
  if (matchKeys.has(k)) throw new Error(`重复 match: ${k}`);
  matchKeys.add(k);
  const p = r.point;
  for (const f of ['x', 'y', 'z', 'yaw', 'pitch']) {
    if (typeof p[f] !== 'number' || !Number.isFinite(p[f])) throw new Error(`点位字段无效 ${u.id}.${f}`);
  }
}
const bh = Math.hypot(special.button.x - special.collector.x, special.button.z - special.collector.z);
const bv = Math.abs(special.button.y - special.collector.y);
if (bh > 3 || bv > 2) throw new Error(`按钮距离 collector 过远: ${bh.toFixed(2)}/${bv}`);
const rr = Math.hypot(special.ready.x - special.readyButton.x, special.ready.z - special.readyButton.z);
if (rr > 4.5) throw new Error(`ready 与 readyButton 距离 ${rr.toFixed(2)} > 4.5`);

// ---------- 8. 输出 ----------
// v1 (itemsorter-points-v1.json) 是冻结快照，任何 build 都不写它。
// v2 是工作版本；itemsorter-points.json 保留为 bot 兼容副本，内容与 v2 相同。
const jsonText = JSON.stringify(pointsFile, null, 2) + '\n';
const outFiles = ['data/points/itemsorter-points-v2.json', 'data/points/itemsorter-points.json'];
for (const file of outFiles) {
  const tmp = path.join(ROOT, file + '.tmp');
  fs.writeFileSync(tmp, jsonText, 'utf8');
  fs.renameSync(tmp, path.join(ROOT, file));
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file, header, rows) {
  const text = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n') + '\n';
  fs.writeFileSync(path.join(ROOT, file), text, 'utf8');
}

const slotUnit = new Map();
for (const u of unitInstances) slotUnit.set(`${u.area}-${u.side}-${u.slot}`, u);

writeCsv('data/partition_new.csv',
  ['area', 'side', 'slot', 'unit_id', 'entry_type', 'group_cn', 'unit_cn', 'family', 'representative', 'item_count', 'block_x', 'block_y', 'block_z', 'point_x', 'point_y', 'point_z', 'yaw', 'pitch'],
  slots.sort((a, b) => `${a.area}${a.side}`.localeCompare(`${b.area}${b.side}`) || a.slot - b.slot).map(s => {
    const u = slotUnit.get(`${s.area}-${s.side}-${s.slot}`);
    return [
      s.area, s.side, s.slot, u ? u.id : '', u ? u.entry_type : '', u ? u.group : '', u ? u.cn : '',
      u ? u.family : '', u ? u.rep : '', u ? u.items.length : '',
      s.block_x, s.block_y, s.block_z, s.point.x, s.point.y, s.point.z, s.yaw, s.pitch,
    ];
  }));

writeCsv('data/storage_units.csv',
  ['unit_id', 'area', 'side', 'slot', 'entry_type', 'group_cn', 'unit_cn', 'family', 'representative', 'item_count', 'point_x', 'point_y', 'point_z', 'yaw', 'pitch'],
  unitInstances.sort((a, b) => `${a.area}${a.side}`.localeCompare(`${b.area}${b.side}`) || a.slot - b.slot).map(u => [
    u.id, u.area, u.side, u.slot, u.entry_type, u.group, u.cn, u.family, u.rep, u.items.length,
    u.point.x, u.point.y, u.point.z, u.point.yaw, u.point.pitch,
  ]));

const itemRows = [];
for (const u of unitInstances) {
  if (u.entry_type === 'item') {
    for (const item of u.items) {
      itemRows.push([item, itemCn.get(item) || '', 'item', u.id, u.area, u.side, u.slot, 'name', item]);
    }
  } else if (u.entry_type === 'enchant') {
    if (u.enchant) {
      for (let lv = 1; lv <= u.enchant.maxLevel; lv++) {
        itemRows.push(['enchanted_book', itemCn.get('enchanted_book') || '附魔书', 'enchant', u.id, u.area, u.side, u.slot, 'enchantments', `${u.enchant.key}:${lv}`]);
      }
    } else {
      itemRows.push(['enchanted_book', itemCn.get('enchanted_book') || '附魔书', 'enchant', u.id, u.area, u.side, u.slot, 'fallback', 'enchanted_book']);
    }
  } else if (u.entry_type === 'potion') {
    for (const [form] of POTION_FORMS) {
      itemRows.push([form, itemCn.get(form) || form, 'potion', u.id, u.area, u.side, u.slot, 'effects', `${EFFECT_IDS[u.effect]}:${u.effect}`]);
    }
    itemRows.push(['tipped_arrow', itemCn.get('tipped_arrow') || '药水箭', 'potion', u.id, u.area, u.side, u.slot, 'effects', `${EFFECT_IDS[u.effect]}:${u.effect}`]);
    if (u.id === 'POTION:raid_omen') {
      itemRows.push(['ominous_bottle', itemCn.get('ominous_bottle') || '不祥之瓶', 'potion', u.id, u.area, u.side, u.slot, 'name', 'ominous_bottle']);
    }
  }
}
writeCsv('data/item_map.csv',
  ['item_id', 'name_cn', 'entry_type', 'unit_id', 'area', 'side', 'slot', 'match_type', 'match_detail'],
  itemRows);

// ---------- 9. HTML 数据 ----------
const htmlData = {
  slots: slots.map(s => [s.area, s.side, s.slot, s.block_x, s.block_z, s.point.x, s.point.y, s.point.z, s.yaw, s.pitch]),
  itemCn: Object.fromEntries(obtainable.map(i => [i, itemCn.get(i) || i])),
  tex: TEX,
  areas: {
    A: { dir: '北', theme: '热区·原料·矿物·木材', themeV1: '原料·矿物', hot: true, color: '#c98a1f' },
    B: { dir: '东北', theme: '冷区·色彩', themeV1: '预留（原建材迁 H-R）', hot: false, color: '#75808f' },
    C: { dir: '东', theme: '热区·红石·功能', themeV1: '红石·功能', hot: true, color: '#c94a4a' },
    D: { dir: '东南', theme: '冷区·装备·附魔·收藏', themeV1: '装备·附魔·收藏', hot: false, color: '#3f74b8' },
    E: { dir: '南', theme: '热区·地形·光源', themeV1: '色彩', hot: true, color: '#b45aa8' },
    F: { dir: '西南', theme: '冷区·植物·药水', themeV1: '植物·药水', hot: false, color: '#b07a2a' },
    G: { dir: '西', theme: '热区·生物资源', themeV1: '生物资源（L 敌对 / R 友好·中立）', hot: true, color: '#8b6f4e' },
    H: { dir: '西北', theme: '冷区·建材·木构件·收纳', themeV1: '地形·建材·收纳', hot: false, color: '#4f8f5a' },
  },
  units: unitInstances.map(u => ({
    id: u.id, area: u.area, side: u.side, slot: u.slot, type: u.entry_type, group: u.group,
    cn: u.cn, family: u.family, rep: u.rep, items: u.items,
    point: [u.point.x, u.point.y, u.point.z, u.point.yaw],
  })),
};
fs.writeFileSync(path.join(ROOT, 'tools', 'template', 'html-data.json'), JSON.stringify(htmlData), 'utf8');

console.log(`items ${allItems.length}, obtainable ${obtainable.length}, excluded ${allItems.length - obtainable.length}`);
console.log(`units ${unitInstances.length} (item ${itemUnits.length}, enchant ${enchantUnits.length}, potion ${potionUnits.length})`);
console.log(`rules ${rules.length}`);
console.log(`slots used ${unitInstances.length}/880`);
const usedBySide = {};
for (const u of unitInstances) usedBySide[`${u.area}-${u.side}`] = (usedBySide[`${u.area}-${u.side}`] || 0) + 1;
console.log(JSON.stringify(usedBySide));
console.log(`button distance ${bh.toFixed(2)}/${bv}, ready distance ${rr.toFixed(2)}`);
console.log(`wrote ${outFiles.join(' + ')} (${Buffer.byteLength(jsonText)} bytes each)`);
