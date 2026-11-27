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

// 中文名（拆分与单体命名需要）
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

// 药水单元（v3：正面 20 → E-L，负面 20 → E-R）
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
    area: 'E',
    side: 'L',
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

// ---------- 3. 色彩重排 ----------
const oldColorUnits = unitInstances.filter(u => u.id.startsWith('COLOR:'));
const colorItems = new Set(oldColorUnits.flatMap(u => u.items));
const pickColor = (color, suffixes) => suffixes.map(s => `${color}_${s}`).filter(id => colorItems.has(id));
const pickAll = suffix => COLOR_NAMES.flatMap(([c]) => [`${c}_${suffix}`]).filter(id => colorItems.has(id));
const colorNew = [];
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:wool`, area: 'B', side: 'L', entry_type: 'item', group: '色系',
    cn: `${cn}羊毛/地毯`, family: `COLOR:${color}:wool`, rep: `${color}_wool`,
    items: pickColor(color, ['wool', 'wool_slab', 'wool_stairs', 'carpet']),
  });
}
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:terracotta`, area: 'B', side: 'L', entry_type: 'item', group: '色系',
    cn: `${cn}陶瓦`, family: `COLOR:${color}:terracotta`, rep: `${color}_terracotta`,
    items: pickColor(color, ['terracotta']),
  });
}
colorNew.push({
  id: 'COLOR:terracotta', area: 'B', side: 'L', entry_type: 'item', group: '彩色材质',
  cn: '陶瓦（无色）', family: 'COLOR:terracotta', rep: 'terracotta',
  items: ['terracotta'].filter(id => colorItems.has(id)),
});
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:glass`, area: 'B', side: 'R', entry_type: 'item', group: '色系',
    cn: `${cn}染色玻璃`, family: `COLOR:${color}:glass`, rep: `${color}_stained_glass`,
    items: pickColor(color, ['stained_glass', 'stained_glass_pane']),
  });
}
// 潜影盒两格，均可存潜影盒（含彩色）：1/2 = 无色 + 白→黄，2/2 = 黄绿→粉
const SHULKER_GROUPS = [
  { id: 'COLOR:shulker_1', cn: '潜影盒（含彩色）1/2', colors: COLOR_NAMES.slice(0, 8), plain: true },
  { id: 'COLOR:shulker_2', cn: '潜影盒（含彩色）2/2', colors: COLOR_NAMES.slice(8) },
];
for (const group of SHULKER_GROUPS) {
  const items = group.colors.flatMap(([color]) => pickColor(color, ['shulker_box']));
  if (group.plain && colorItems.has('shulker_box')) items.unshift('shulker_box');
  colorNew.push({
    id: group.id, area: 'B', side: 'R', entry_type: 'item', group: '收纳',
    cn: group.cn, family: group.id, rep: items[0],
    items,
  });
}
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:glazed`, area: 'B', side: 'L', entry_type: 'item', group: '色系',
    cn: `${cn}带釉陶瓦`, family: `COLOR:${color}:glazed`, rep: `${color}_glazed_terracotta`,
    items: pickColor(color, ['glazed_terracotta']),
  });
}
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:concrete`, area: 'B', side: 'R', entry_type: 'item', group: '色系',
    cn: `${cn}混凝土`, family: `COLOR:${color}:concrete`, rep: `${color}_concrete`,
    items: pickColor(color, ['concrete', 'concrete_powder', 'concrete_slab', 'concrete_stairs']),
  });
}
// v3：染料拆 16 格，B-L 1–8（白→黄）+ B-R 1–8（黄绿→粉）。
for (const [color, cn] of COLOR_NAMES) {
  colorNew.push({
    id: `COLOR:${color}:dye`, area: 'B', side: 'L', entry_type: 'item', group: '染料',
    cn: `${cn}染料`, family: `COLOR:${color}:dye`, rep: `${color}_dye`,
    items: pickColor(color, ['dye']),
  });
}
const bundleItems = [...pickAll('bundle'), ...(colorItems.has('bundle') ? ['bundle'] : [])];
colorNew.push({
  id: 'COLOR:bundle', area: 'D', side: 'R', entry_type: 'item', group: '杂项',
  cn: '收纳袋', family: 'COLOR:bundle', rep: 'bundle', items: bundleItems,
});
colorNew.push({
  id: 'COLOR:harness', area: 'D', side: 'R', entry_type: 'item', group: '坐骑装备',
  cn: '挽具', family: 'COLOR:harness', rep: 'white_harness', items: pickAll('harness'),
});
colorNew.push({
  id: 'COLOR:cushion', area: 'B', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '坐垫', family: 'COLOR:cushion', rep: 'white_cushion', items: pickAll('cushion'),
});
const bedItems = [...pickAll('bed'), ...(colorItems.has('straw_bed') ? ['straw_bed'] : [])];
colorNew.push({
  id: 'COLOR:bed', area: 'B', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '床', family: 'COLOR:bed', rep: 'white_bed', items: bedItems,
});
colorNew.push({
  id: 'COLOR:banner', area: 'B', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '旗帜', family: 'COLOR:banner', rep: 'white_banner', items: pickAll('banner'),
});
const candleItems = [...pickAll('candle'), ...(colorItems.has('candle') ? ['candle'] : [])];
colorNew.push({
  id: 'COLOR:candle', area: 'B', side: 'R', entry_type: 'item', group: '彩色材质',
  cn: '蜡烛', family: 'COLOR:candle', rep: 'candle', items: candleItems,
});
const coveredColorItems = new Set(colorNew.flatMap(u => u.items));
for (const id of colorItems) if (!coveredColorItems.has(id)) throw new Error(`彩色物品未分组: ${id}`);
if (coveredColorItems.size !== colorItems.size) throw new Error('彩色物品分组重复');
unitInstances = unitInstances.filter(u => !u.id.startsWith('COLOR:'));
unitInstances.push(...colorNew);

// ---------- 4. 收藏与跨区迁移 ----------
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
const dCollect = [
  'COLLECT:smithing_template', 'COLLECT:goat_horn', 'COLLECT:heavy_core',
  'COLLECT:end_crystal', 'COLLECT:experience_bottle',
].map(id => collectMap.get(id));
const bCollect = ['COLLECT:banner_pattern'].map(id => collectMap.get(id));
// 陶片/画/饰纹陶罐/花盆：2026-11-22 追加要求迁 D-R（饰纹陶罐旁）
const dDecor = ['COLLECT:sherd', 'COLLECT:painting'].map(id => collectMap.get(id));
const hCollect = ['COLLECT:decorated_pot', 'COLLECT:flower_pot'].map(id => collectMap.get(id));
const hostileCollect = [
  'COLLECT:disc',
  'COLLECT:head_zombie', 'COLLECT:head_skeleton', 'COLLECT:head_wither_skeleton',
  'COLLECT:head_creeper', 'COLLECT:head_dragon', 'COLLECT:head_piglin', 'COLLECT:head_player',
  'COLLECT:trial_key', 'COLLECT:ominous_trial_key',
  'COLLECT:dragon_egg',
].map(id => collectMap.get(id));
const mapUnit = collectMap.get('COLLECT:map');
for (const u of dCollect) { u.area = 'D'; u.side = 'R'; }
for (const u of bCollect) { u.area = 'B'; u.side = 'R'; }
for (const u of dDecor) { u.area = 'D'; u.side = 'R'; }
for (const u of hCollect) { u.area = 'D'; u.side = 'R'; }
for (const u of hostileCollect) { u.area = 'G'; u.side = 'R'; }
mapUnit.area = 'G'; mapUnit.side = 'L';
const ominousTrialUnit = collectMap.get('COLLECT:ominous_trial_key');
const raidUnit = unitInstances.find(u => u.id === 'POTION:raid_omen');
if (ominousTrialUnit && raidUnit) {
  ominousTrialUnit.items = ominousTrialUnit.items.filter(i => i !== 'ominous_bottle');
  raidUnit.items = [...new Set([...raidUnit.items, 'ominous_bottle'])];
}

// G 区 L/R 对调后的 L 侧内容：桶 + 蛋/蜂/墨/皮等掉落 + 青蛙卵/蜂巢
const bucketIds = [
  'GEAR:bucket', 'GEAR:water_bucket', 'GEAR:lava_bucket', 'GEAR:milk_bucket',
  'GEAR:powder_snow_bucket', 'GEAR:axolotl_bucket', 'GEAR:cod_bucket', 'GEAR:salmon_bucket',
  'GEAR:pufferfish_bucket', 'GEAR:tropical_fish_bucket', 'GEAR:tadpole_bucket',
  'GEAR:sulfur_cube_bucket',
];
const gLBuckets = bucketIds.map(id => unitInstances.find(u => u.id === id));
if (gLBuckets.some(u => !u)) throw new Error('桶类单元缺失');
for (const u of gLBuckets) { u.area = 'G'; u.side = 'L'; }
const gLDropIds = [
  'DROP:ink', 'DROP:glow_ink', 'DROP:leather', 'DROP:rabbit_hide', 'DROP:rabbit_foot',
  'DROP:turtle_scute', 'DROP:armadillo_scute', 'DROP:feather', 'DROP:egg', 'DROP:turtle_egg',
  'DROP:sniffer_egg', 'DROP:honeycomb', 'DROP:honeycomb_block', 'DROP:honey_bottle',
  'DROP:honey_block', 'DROP:ender',
];
const gLDrops = gLDropIds.map(id => unitInstances.find(u => u.id === id));
if (gLDrops.some(u => !u)) throw new Error('G-L 掉落单元缺失');
for (const u of gLDrops) { u.area = 'G'; u.side = 'L'; }
const movedPlantIds = ['PLANT:frogspawn', 'PLANT:bee_nest'];
const movedPlants = movedPlantIds.map(id => unitInstances.find(u => u.id === id)).filter(Boolean);
for (const u of movedPlants) { u.area = 'G'; u.side = 'L'; }
const creakingPlant = unitInstances.find(u => u.id === 'PLANT:creaking_heart');
if (creakingPlant) { creakingPlant.area = 'G'; creakingPlant.side = 'R'; }

// D-R 收藏补充：不死图腾、金苹果族
const totemUnit = unitInstances.find(u => u.id === 'DROP:totem');
if (!totemUnit) throw new Error('缺少 DROP:totem');
totemUnit.area = 'D'; totemUnit.side = 'R'; totemUnit.group = '收藏';
const goldenAppleUnit = unitInstances.find(u => u.id === 'FOOD:golden_apple');
const enchantedGoldenAppleUnit = unitInstances.find(u => u.id === 'FOOD:enchanted_golden_apple');
if (!goldenAppleUnit || !enchantedGoldenAppleUnit) throw new Error('金苹果单元缺失');
goldenAppleUnit.area = 'D'; goldenAppleUnit.side = 'R'; goldenAppleUnit.group = '收藏';
enchantedGoldenAppleUnit.area = 'D'; enchantedGoldenAppleUnit.side = 'R'; enchantedGoldenAppleUnit.group = '收藏';

// F-R 作物补充：干草捆、糖
const hayBlockUnit = unitInstances.find(u => u.id === 'FOOD:hay_block');
const sugarUnit = unitInstances.find(u => u.id === 'FOOD:sugar');
if (!hayBlockUnit || !sugarUnit) throw new Error('干草捆/糖单元缺失');
hayBlockUnit.area = 'F'; hayBlockUnit.side = 'R'; hayBlockUnit.group = '作物';
sugarUnit.area = 'F'; sugarUnit.side = 'R'; sugarUnit.group = '作物';

// F-L 灌木合并（沿用 v2 逻辑）
const bush = unitInstances.find(u => u.id === 'PLANT:bush');
if (!bush) throw new Error('缺少 PLANT:bush');
const firefly = unitInstances.find(u => u.id === 'PLANT:firefly_bush');
const redShrub = unitInstances.find(u => u.id === 'PLANT:red_shrub');
bush.items = [...new Set([bush, firefly, redShrub].filter(Boolean).flatMap(u => u.items))];
bush.cn = '灌木';
bush.family = 'PLANT:bush';
bush.rep = 'bush';
unitInstances = unitInstances.filter(u => !['PLANT:firefly_bush', 'PLANT:red_shrub'].includes(u.id));

// ---------- 5. 药水进 E 区 ----------
const movedPotions = unitInstances.filter(u => u.entry_type === 'potion');
const positiveEffects = new Set(orderedEffects.slice(0, 20));
const fLPotions = movedPotions.filter(u => u.effect && positiveEffects.has(u.effect));
const fRPotions = movedPotions.filter(u => u.effect && !positiveEffects.has(u.effect));
if (fLPotions.length !== 20 || fRPotions.length !== 20) {
  throw new Error(`药水分配 ${fLPotions.length}/${fRPotions.length}，应为 20/20`);
}
for (const u of fLPotions) { u.area = 'E'; u.side = 'L'; }
for (const u of fRPotions) { u.area = 'E'; u.side = 'R'; }
const glassBottleUnit = unitInstances.find(u => u.id === 'RAW:glass_bottle');
if (!glassBottleUnit) throw new Error('缺少 RAW:glass_bottle');

// ---------- 6. H 区自然方块拆单（一件一格；海绵/苔藓按 2026-11-22 追加要求合并）----------
const terrainOriginals = unitInstances.filter(u => u.id.startsWith('TERRAIN:'));
const hlSplit = [];
for (const u of terrainOriginals) {
  if (u.id === 'TERRAIN:sponge') {
    hlSplit.push({
      id: 'TERRAIN:sponge', area: 'H', side: 'L', entry_type: 'item',
      group: u.group, cn: '海绵（含湿海绵）', family: 'TERRAIN:sponge',
      rep: 'sponge', items: ['sponge', 'wet_sponge'],
    });
    continue;
  }
  if (u.id === 'TERRAIN:snow') {
    hlSplit.push({
      id: 'TERRAIN:snow', area: 'H', side: 'L', entry_type: 'item',
      group: u.group, cn: '雪（含雪球）', family: 'TERRAIN:snow',
      rep: 'snow', items: ['snow', 'snowball'],
    });
    hlSplit.push({
      id: 'TERRAIN:snow:block', area: 'H', side: 'L', entry_type: 'item',
      group: u.group, cn: '雪块', family: 'TERRAIN:snow:block',
      rep: 'snow_block', items: ['snow_block'],
    });
    continue;
  }
  if (u.id === 'TERRAIN:moss') {
    hlSplit.push({
      id: 'TERRAIN:moss', area: 'H', side: 'L', entry_type: 'item',
      group: u.group, cn: '苔藓（含覆地苔藓）', family: 'TERRAIN:moss',
      rep: 'moss_block', items: ['moss_block', 'moss_carpet'],
    });
    hlSplit.push({
      id: 'TERRAIN:moss:pale', area: 'H', side: 'L', entry_type: 'item',
      group: u.group, cn: '苍白苔藓（含覆地苔藓）', family: 'TERRAIN:moss:pale',
      rep: 'pale_moss_block', items: ['pale_moss_block', 'pale_moss_carpet'],
    });
    continue;
  }
  const ordered = [
    ...(u.ids || []).filter(id => u.items.includes(id)),
    ...u.items.filter(id => !(u.ids || []).includes(id)),
  ];
  for (const item of ordered) {
    hlSplit.push({
      id: `${u.id}:${item}`,
      area: 'H', side: u.side, entry_type: 'item',
      group: u.group, cn: itemCn.get(item) || item,
      family: `${u.family}:${item}`, rep: item, items: [item],
    });
  }
}
unitInstances = unitInstances.filter(u => !u.id.startsWith('TERRAIN:'));

// 自定义名称物品：同一物品 ID 按 customName 分流到独立单元
const customNameUnits = [
  {
    id: 'CUSTOM:dragon_tear', area: 'D', side: 'R', entry_type: 'item',
    group: '收藏', cn: '龙泪', family: 'CUSTOM:dragon_tear',
    rep: 'beetroot', items: ['beetroot'], customName: '龙泪',
  },
];
unitInstances.push(...customNameUnits);

// ---------- 7. 分区装配（v3）----------
const byId = id => {
  const u = unitInstances.find(x => x.id === id);
  if (!u) throw new Error(`缺少单元 ${id}`);
  return u;
};
const terrainByRep = new Map(hlSplit.map(u => [u.rep, u]));
const t = id => {
  const u = terrainByRep.get(id);
  if (!u) throw new Error(`缺少地形拆单 ${id}`);
  return u;
};

const minUnits = unitInstances.filter(u => u.id.startsWith('MIN:'));
const redUnits = unitInstances.filter(u => u.id.startsWith('RED:'));
const workUnits = unitInstances.filter(u => u.id.startsWith('WORK:'));
const woodUnits = unitInstances.filter(u => u.id.startsWith('WOODLOG:') || u.id.startsWith('WOODBY:'));

// A-R：树种 26 + 木棍/树脂/纸/书
const rawMain = ['RAW:stick'].map(byId); // 树脂迁 H-L 树脂块旁；纸/书迁 D-R 书架旁（2026-11-22 第三轮）
const aR = [...woodUnits, ...rawMain];

// 色彩各分组
const woolUnits = COLOR_NAMES.map(([c]) => byId(`COLOR:${c}:wool`));
const terraUnits = COLOR_NAMES.map(([c]) => byId(`COLOR:${c}:terracotta`));
const glazedUnits = COLOR_NAMES.map(([c]) => byId(`COLOR:${c}:glazed`));
const stainedUnits = COLOR_NAMES.map(([c]) => byId(`COLOR:${c}:glass`));
const concreteUnits = COLOR_NAMES.map(([c]) => byId(`COLOR:${c}:concrete`));
const shulkerUnits = ['COLOR:shulker_1', 'COLOR:shulker_2'].map(byId);
const bedUnits = ['COLOR:bed', 'COLOR:banner', 'COLLECT:banner_pattern', 'COLOR:candle', 'COLOR:cushion'].map(byId);
const bannerPatternUnit = byId('COLLECT:banner_pattern');

// B-L：染料16 + 羊毛16 + 混凝土16（羊毛后方）
// B-R：潜影盒3（开头）+ 玻璃（白色染色玻璃前）+ 染色玻璃16（白→粉）+ 遮光玻璃（粉染色玻璃后方）
//   + 陶瓦家族（无色最前）+ 带釉陶瓦——所有色组整侧不跨侧（2026-11-22 第七轮顺序）
const dyeAll = COLOR_NAMES.map(([c]) => byId(`COLOR:${c}:dye`));
const bL = [
  ...dyeAll,
  ...woolUnits,
  ...concreteUnits,
];
const bR = [
  ...shulkerUnits,
  byId('BUILD:glass'),
  ...stainedUnits,
  byId('BUILD:tinted_glass'),
  byId('COLOR:terracotta'),
  ...terraUnits,
  ...glazedUnits,
];

// D-R：工具→护甲→远程（钓鱼竿含两种钓竿）→弹药→坐骑/挽具/收纳袋→导航/时钟→杂项拆分→收藏
const dR = [
  ...['TOOL:sword', 'TOOL:pickaxe', 'TOOL:axe', 'TOOL:shovel', 'TOOL:hoe', 'TOOL:spear'].map(byId),
  ...['ARMOR:helmet', 'ARMOR:chestplate', 'ARMOR:leggings', 'ARMOR:boots'].map(byId),
  ...['GEAR:bow', 'GEAR:crossbow', 'GEAR:trident', 'GEAR:mace', 'GEAR:shield', 'GEAR:elytra',
    'GEAR:fishing_rod', 'GEAR:shears', 'GEAR:flint_and_steel', 'GEAR:brush', 'GEAR:spyglass'].map(byId),
  byId('GEAR:arrow'),
  byId('GEAR:firework_rocket'),
  byId('GEAR:firework_star'),
  byId('GEAR:horse_armor'),
  byId('GEAR:nautilus_armor'),
  byId('COLOR:harness'),
  byId('COLOR:bundle'),
  byId('GEAR:navigation'),
  byId('GEAR:clock'),
  byId('GEAR:name_tag'),
  byId('GEAR:saddle'),
  byId('GEAR:lead'),
  byId('GEAR:wind_charge'),
  byId('GEAR:fire_charge'),
  byId('GEAR:wolf_armor'),
  ...dCollect,
  totemUnit,
  goldenAppleUnit,
  enchantedGoldenAppleUnit,
  // 2026-11-22 追加：告示牌/展示架/书架/纸/书/火把/陶罐/花盆/陶片/画 迁 D-R 尾部
  byId('BUILD:v_sign'),
  byId('BUILD:v_shelf'),
  byId('BUILD:bookshelf'),
  byId('RAW:paper'),
  byId('RAW:book'),
  byId('LIGHT:torch'),
  byId('COLLECT:decorated_pot'),
  byId('COLLECT:sherd'),
  byId('COLLECT:painting'),
  byId('COLLECT:flower_pot'),
  byId('CUSTOM:dragon_tear'),
];

// E 区：药水 + 玻璃瓶
const eL = [glassBottleUnit, ...fLPotions];
const eR = [...fRPotions];

// F 区：植物+作物（L 44 / R 33）
const F_L_IDS = [
  'PLANT:dandelion', 'PLANT:poppy', 'PLANT:orchid', 'PLANT:azure_bluet', 'PLANT:allium',
  'PLANT:tulip_red', 'PLANT:tulip_orange', 'PLANT:tulip_white', 'PLANT:tulip_pink',
  'PLANT:oxeye', 'PLANT:cornflower', 'PLANT:lily', 'PLANT:wither_rose', 'PLANT:golden_dandelion',
  'PLANT:sunflower', 'PLANT:lilac', 'PLANT:rose_bush', 'PLANT:peony',
  'PLANT:torchflower', 'PLANT:torchflower_seeds',
  'PLANT:wildflowers', 'PLANT:cactus_flower', 'PLANT:eyeblossom', 'PLANT:petals',
  'PLANT:azalea',
  'PLANT:mushroom_brown', 'PLANT:mushroom_red', 'PLANT:mushroom_block',
  'PLANT:shelf_mushroom', 'PLANT:nether_plant',
  'PLANT:spore_blossom', 'PLANT:glow_lichen', 'PLANT:hanging_roots', 'PLANT:pale_hanging_moss',
  'PLANT:dripleaf', 'PLANT:vine',
  'PLANT:twisting_vines', 'PLANT:weeping_vines', 'PLANT:glow_berries',
  'PLANT:short_grass', 'PLANT:fern', 'PLANT:dead_bush', 'PLANT:bush', 'PLANT:leaf_litter',
];
const F_R_IDS = [
  'PLANT:dry_grass', 'PLANT:cactus',
  'PLANT:sea_pickle', 'PLANT:seagrass', 'PLANT:lily_pad',
  'PLANT:kelp', 'PLANT:kelp_block',
  'PLANT:coral:tube', 'PLANT:coral:brain', 'PLANT:coral:bubble', 'PLANT:coral:fire', 'PLANT:coral:horn',
  'PLANT:pitcher',
  'CROP:wheat', 'CROP:wheat_seeds', 'FOOD:hay_block',
  'CROP:carrot', 'CROP:potato', 'CROP:beetroot', 'CROP:beetroot_seeds',
  'CROP:pumpkin', 'CROP:pumpkin_seeds', 'CROP:melon', 'CROP:melon_seeds',
  'CROP:sugar_cane', 'FOOD:sugar',
  'CROP:nether_wart', 'CROP:cocoa', 'CROP:bamboo', 'CROP:sweet_berry',
  'CROP:chorus_fruit', 'CROP:chorus_flower', 'CROP:popped_chorus',
];
const fL = F_L_IDS.map(byId);
const fR = F_R_IDS.map(byId);

// G 区（L/R 已对调）：L=食物/碗/桶/掉落副产/地图；R=怪物掉落/幽匿/收藏
const gL = [
  ...['FOOD:apple', 'FOOD:bread', 'FOOD:cookie', 'FOOD:cake', 'FOOD:pumpkin_pie',
    'FOOD:mushroom_stew', 'FOOD:rabbit_stew', 'FOOD:beetroot_soup', 'FOOD:suspicious_stew',
    'RAW:bowl', 'FOOD:golden_carrot', 'FOOD:beef', 'FOOD:porkchop', 'FOOD:mutton',
    'FOOD:chicken', 'FOOD:rabbit', 'FOOD:cod', 'FOOD:salmon', 'FOOD:tropical_fish',
    'FOOD:pufferfish'].map(byId),
  ...gLBuckets,
  ...movedPlants,
  ...gLDrops,
  mapUnit,
];
const gR = [
  ...['DROP:rotten_flesh', 'DROP:string', 'DROP:spider_eye', 'DROP:bone', 'DROP:bone_meal',
    'DROP:bone_block', 'DROP:slime_ball', 'DROP:slime_block', 'DROP:ghast_tear', 'DROP:shulker_shell',
    'DROP:gunpowder', 'DROP:magma_cream', 'DROP:magma_block', 'DROP:blaze', 'DROP:nether_star',
    'DROP:phantom_membrane', 'DROP:prismarine_shard', 'DROP:prismarine_crystals', 'DROP:cobweb',
    'DROP:sculk', 'DROP:sculk_vein', 'DROP:sculk_sensor', 'DROP:calibrated_sculk_sensor',
    'DROP:sculk_catalyst', 'DROP:sculk_shrieker', 'DROP:echo_shard',
    'DROP:nautilus_shell', 'DROP:dragon_breath', 'DROP:breeze', 'DROP:dried_ghast',
    'DROP:heart_of_the_sea', 'DROP:glowstone_dust'].map(byId),
  creakingPlant,
  ...hostileCollect,
];

// H 区（合并区）：L=自然方块(土/苔/雪/冰/海绵)+基础方块+变体；R=石系(磨制融入)+光源+硫黄+木构件尾
const hLLeft = [
  t('dirt'), t('coarse_dirt'), t('rooted_dirt'), t('grass_block'), t('mycelium'), t('podzol'),
  t('mud'), t('muddy_mangrove_roots'), t('clay'), byId('RAW:clay_ball'),
  t('sand'), t('suspicious_sand'), t('red_sand'),
  t('gravel'), byId('RAW:flint'), t('suspicious_gravel'),
  t('moss_block'), t('pale_moss_block'),
  t('snow'), t('snow_block'),
  t('ice'), t('packed_ice'), t('blue_ice'),
  t('sponge'),
];
const hLBase = [
  byId('BUILD:base_bricks'), byId('RAW:brick'), byId('BUILD:base_packed_mud'),
  byId('BUILD:base_sandstone'), byId('BUILD:base_red_sandstone'),
  byId('BUILD:base_nether_bricks'), byId('RAW:nether_brick'), byId('BUILD:base_red_nether_bricks'),
  byId('BUILD:base_prismarine'), byId('BUILD:base_dark_prismarine'),
  byId('BUILD:base_purpur'), byId('BUILD:base_resin'),
  byId('RAW:resin'),
  byId('BUILD:base_gilded_blackstone'),
];
const variantChestIds = [
  'BUILD:v_tile', 'BUILD:v_stairs', 'BUILD:v_slab', 'BUILD:v_chiseled', 'BUILD:v_cut',
  'BUILD:v_smooth', 'BUILD:v_cracked', 'BUILD:v_pillar', 'BUILD:v_brick',
];
const variantChests = variantChestIds.map(byId);
const variantUnits = ['BUILD:wall', 'BUILD:fence', 'BUILD:fence_gate'].map(byId);
const hL = [...hLLeft, ...hLBase, ...variantChests, ...variantUnits];

const polishedIds = [
  'STONE:polished_deepslate', 'STONE:polished_andesite', 'STONE:polished_diorite',
  'STONE:polished_granite', 'STONE:polished_tuff', 'STONE:polished_basalt',
  'STONE:polished_blackstone', 'STONE:polished_blackstone_bricks',
  'STONE:polished_sulfur', 'STONE:polished_cinnabar',
];
const polishedById = Object.fromEntries(polishedIds.map(id => [id, byId(id)]));
const lightUnits = [
  'BUILD:light_glowstone', 'BUILD:light_shroomlight', 'BUILD:base_sea_lantern',
  'BUILD:light_ochre_froglight', 'BUILD:light_pearlescent_froglight', 'BUILD:light_verdant_froglight',
].map(byId);
const hRMain = [
  t('stone'), t('cobblestone'), t('smooth_stone'), t('mossy_cobblestone'),
  t('deepslate'), polishedById['STONE:polished_deepslate'], t('cobbled_deepslate'),
  t('andesite'), polishedById['STONE:polished_andesite'],
  t('diorite'), polishedById['STONE:polished_diorite'],
  t('granite'), polishedById['STONE:polished_granite'],
  t('tuff'), polishedById['STONE:polished_tuff'],
  t('calcite'), t('dripstone_block'), t('pointed_dripstone'),
  t('basalt'), polishedById['STONE:polished_basalt'],
  t('blackstone'), polishedById['STONE:polished_blackstone'], polishedById['STONE:polished_blackstone_bricks'],
  t('netherrack'), t('crimson_nylium'), t('warped_nylium'),
  t('soul_sand'), t('soul_soil'), t('nether_wart_block'), t('warped_wart_block'),
  t('end_stone'), t('obsidian'), t('crying_obsidian'),
  ...lightUnits,
  t('sulfur'), polishedById['STONE:polished_sulfur'], t('potent_sulfur'), t('sulfur_spike'),
  t('cinnabar'), polishedById['STONE:polished_cinnabar'],
];
const hRTail = [
  byId('BUILD:pumpkin'), byId('BUILD:ladder'),
  byId('BUILD:copper'), byId('BUILD:iron'),
  // 床/旗帜/旗帜图案/蜡烛/坐垫自 B 区迁入（2026-11-22 第三轮）
  byId('COLOR:bed'), byId('COLOR:banner'), bannerPatternUnit,
  byId('COLOR:candle'), byId('COLOR:cushion'),
];
const hR = [...hRMain, ...hRTail];

// C-R：船/门/活板门整格插入矿车旁（2026-11-22 追加要求）
const boatDoorUnit = byId('WOODWORK:boat_door');
const cR = [...workUnits.slice(0, 2), boatDoorUnit, ...workUnits.slice(2)];

const bySide = new Map([
  ['A-L', minUnits],
  ['A-R', aR],
  ['B-L', bL],
  ['B-R', bR],
  ['C-L', redUnits],
  ['C-R', cR],
  ['D-L', enchantUnits],
  ['D-R', dR],
  ['E-L', eL],
  ['E-R', eR],
  ['F-L', fL],
  ['F-R', fR],
  ['G-L', gL],
  ['G-R', gR],
  ['H-L', hL],
  ['H-R', hR],
]);

// ---------- 8. 校验 ----------
const placedIds = new Set([...hL, ...hR].map(u => u.id));
for (const u of hlSplit) {
  if (!placedIds.has(u.id)) throw new Error(`地形拆单未放置: ${u.id}`);
}

const counts = [
  ['矿物', minUnits.length, 32],
  ['红石', redUnits.length, 21],
  ['工作站', workUnits.length, 26],
  ['木材', woodUnits.length, 26],
  ['合成原材主', rawMain.length, 1],
  ['色彩 L', bL.length, 48],
  ['色彩 R', bR.length, 53],
  ['染料', COLOR_NAMES.length, 16],
  ['床旗图案蜡烛坐垫', bedUnits.length, 5],
  ['潜影盒', shulkerUnits.length, 2],
  ['D-R', dR.length, 55],
  ['附魔', enchantUnits.length, 44],
  ['正面药水', fLPotions.length, 20],
  ['负面药水', fRPotions.length, 20],
  ['F-L 植物', fL.length, 44],
  ['F-R 植物', fR.length, 33],
  ['G-L', gL.length, 51],
  ['G-R', gR.length, 44],
  ['地形拆单', hlSplit.length, 51],
  ['磨制融入', polishedIds.length, 10],
  ['变体组', variantChests.length, 9],
  ['墙/栅栏/栅栏门', variantUnits.length, 3],
  ['船/门/活板门', byId('WOODWORK:boat_door').items.length, 48],
  ['告示牌', byId('BUILD:v_sign').items.length, 26],
  ['展示架', byId('BUILD:v_shelf').items.length, 13],
  ['H-L', hL.length, 50],
  ['H-R', hR.length, 54],
];
for (const [name, got, want] of counts) {
  if (got !== want) throw new Error(`${name} ${got}，应为 ${want}`);
}

const groupItemExpect = {
  'BUILD:v_tile': 2, 'BUILD:v_stairs': 57, 'BUILD:v_slab': 60,
  'BUILD:v_chiseled': 12, 'BUILD:v_cut': 2,
  'BUILD:v_smooth': 4, 'BUILD:v_cracked': 4,
  'BUILD:v_pillar': 2, 'BUILD:v_infested': 7, 'BUILD:v_brick': 13,
  'BUILD:v_sign': 26, 'BUILD:v_shelf': 13,
};
for (const id of [...variantChestIds, 'BUILD:v_sign', 'BUILD:v_shelf']) {
  const u = byId(id);
  if (u.items.length !== groupItemExpect[id]) {
    throw new Error(`${id} ${u.items.length}，应为 ${groupItemExpect[id]}`);
  }
}
const variantCounts = new Map(variantUnits.map(u => [u.id, u.items.length]));
if (variantCounts.get('BUILD:wall') !== 32) throw new Error(`墙 ${variantCounts.get('BUILD:wall')}，应为 32`);
if (variantCounts.get('BUILD:fence') !== 14) throw new Error(`栅栏 ${variantCounts.get('BUILD:fence')}，应为 14`);
if (variantCounts.get('BUILD:fence_gate') !== 13) throw new Error(`栅栏门 ${variantCounts.get('BUILD:fence_gate')}，应为 13`);
for (const u of unitInstances.filter(x => x.id.startsWith('BUILD:base_'))) {
  if (u.items.length !== 1) throw new Error(`${u.id} 基础方块应 1 件，实际 ${u.items.length}`);
}

const SIDE_ORDER = ['A-L', 'A-R', 'B-L', 'B-R', 'C-L', 'C-R', 'D-L', 'D-R', 'E-L', 'E-R', 'F-L', 'F-R', 'G-L', 'G-R', 'H-L', 'H-R'];
const expectLen = {
  'A-L': 32, 'A-R': 27, 'B-L': 48, 'B-R': 53, 'C-L': 21, 'C-R': 27,
  'D-L': 44, 'D-R': 55, 'E-L': 21, 'E-R': 20, 'F-L': 44, 'F-R': 33,
  'G-L': 51, 'G-R': 44, 'H-L': 50, 'H-R': 54,
};
const globalSeen = new Set();
for (const key of SIDE_ORDER) {
  const arr = bySide.get(key);
  if (!arr) throw new Error(`缺少分区 ${key}`);
  if (arr.length > 55) throw new Error(`${key} 单元 ${arr.length} > 55`);
  if (arr.length !== expectLen[key]) throw new Error(`${key} 数组长度 ${arr.length}，应为 ${expectLen[key]}`);
  const [area, side] = key.split('-');
  for (const u of arr) {
    if (globalSeen.has(u.id)) throw new Error(`单元重复分配 ${u.id} (${key})`);
    globalSeen.add(u.id);
    u.area = area;
    u.side = side;
  }
}
for (const u of unitInstances) {
  if (!globalSeen.has(u.id)) throw new Error(`源单元未分配 ${u.id}`);
}
if (globalSeen.size !== 624) throw new Error(`分配单元 ${globalSeen.size}，应为 624`);
unitInstances = SIDE_ORDER.flatMap(key => bySide.get(key));

const placed = new Map();
for (const [k, arr] of bySide) {
  arr.forEach((u, i) => {
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

// ---------- 9. 纹理表 ----------
const oldHtml = fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8');
const texLine = oldHtml.split(/\r?\n/).find(l => l.startsWith('const TEX = '));
const TEX = texLine ? JSON.parse(texLine.slice('const TEX = '.length).replace(/;\s*$/, '')) : {};
TEX.potion = { item: 'assets/tex/potion__item.png' };
TEX.splash_potion = { item: 'assets/tex/splash_potion__item.png' };
TEX.lingering_potion = { item: 'assets/tex/lingering_potion__item.png' };
TEX.tipped_arrow = { item: 'assets/tex/arrow__item.png' };
const hasTex = id => !!(TEX[id] && (TEX[id].item || TEX[id].block));

// ---------- 10. 规则 ----------
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
// 自定义名称特例排在同名通用规则之前（首条命中）
for (const u of itemUnits.filter(x => x.customName)) {
  for (const item of u.items) {
    pushRule({ name: `minecraft:${item}`, customName: u.customName }, u);
  }
}
for (const u of itemUnits) {
  if (u.customName) continue;
  for (const item of itemOrder(u)) {
    pushRule({ name: `minecraft:${item}` }, u);
  }
}

// ---------- 11. 特殊点位与黑名单 ----------
const botPoints = JSON.parse(fs.readFileSync(BOT_CONFIG, 'utf8'));
if (!botPoints.base) throw new Error('bot 配置缺少 base 点位（旧格式请先在 bot 目录运行迁移）');
const pickPoint = (k, fields) => {
  const p = botPoints[k];
  if (!p || typeof p !== 'object') throw new Error(`缺少特殊点位 ${k}`);
  for (const f of fields) {
    if (typeof p[f] !== 'number' || !Number.isFinite(p[f])) throw new Error(`${k}.${f} 无效`);
  }
  return p;
};
const walkPoint = k => {
  const p = pickPoint(k, ['x', 'y', 'z', 'yaw', 'pitch']);
  const o = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
  for (const f of ['label', 'area', 'side']) if (p[f] !== undefined) o[f] = p[f];
  return o;
};
const blockPoint = k => {
  const p = pickPoint(k, ['x', 'y', 'z']);
  const o = { x: p.x, y: p.y, z: p.z };
  if (p.label !== undefined) o.label = p.label;
  return o;
};
const direction = k => {
  const p = pickPoint(k, ['yaw', 'pitch']);
  const o = { yaw: p.yaw, pitch: p.pitch };
  if (p.label !== undefined) o.label = p.label;
  return o;
};
const special = {
  base: walkPoint('base'),
  trash: direction('trash'),
  minecart: direction('minecart'),
  button: blockPoint('button'),
  ready: walkPoint('ready'),
  readyButton: blockPoint('readyButton'),
};
if (botPoints.home) special.home = walkPoint('home');
const DEFAULT_BLACKLIST = [{ name: 'minecraft:wooden_hoe' }];
const blacklist = Array.isArray(botPoints.blacklist) ? botPoints.blacklist : DEFAULT_BLACKLIST;
if (!Array.isArray(blacklist)) throw new Error('blacklist 必须是数组');
for (let i = 0; i < blacklist.length; i++) {
  const m = blacklist[i];
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.keys(m).length) {
    throw new Error(`blacklist[${i}] 不是有效的 Match object`);
  }
}
if (blacklist.length && !special.trash) throw new Error('blacklist 非空但缺少 trash 投掷方向');

const pointsFile = {
  items: rules,
  blacklist,
  ...(special.home ? { home: special.home } : {}),
  trash: special.trash,
  base: special.base,
  minecart: special.minecart,
  button: special.button,
  ready: special.ready,
  readyButton: special.readyButton,
};

// ---------- 12. 校验 ----------
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
    if (typeof p[f] !== 'number' || !Number.isFinite(p[f])) throw new Error(`点位字段无效 ${f}`);
  }
}
const bh = Math.hypot(special.button.x - special.base.x, special.button.z - special.base.z);
const bv = Math.abs(special.button.y - special.base.y);
if (bh > 3 || bv > 2) throw new Error(`按钮距离 base 过远: ${bh.toFixed(2)}/${bv}`);
const rr = Math.hypot(special.ready.x - special.readyButton.x, special.ready.z - special.readyButton.z);
if (rr > 4.5) throw new Error(`ready 与 readyButton 距离 ${rr.toFixed(2)} > 4.5`);

// ---------- 13. 输出 ----------
// v1 / v2 (itemsorter-points-v1/v2.json) 是冻结快照，任何 build 都不写它们。
// v3 是工作版本；itemsorter-points.json 保留为 bot 兼容副本，内容与 v3 相同。
const jsonText = JSON.stringify(pointsFile, null, 2) + '\n';
const outFiles = ['data/points/itemsorter-points-v3.json', 'data/points/itemsorter-points.json'];
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
      if (u.customName) {
        itemRows.push([item, u.customName, 'item', u.id, u.area, u.side, u.slot, 'customName', u.customName]);
      } else {
        itemRows.push([item, itemCn.get(item) || '', 'item', u.id, u.area, u.side, u.slot, 'name', item]);
      }
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

// ---------- 14. HTML 数据 ----------
const htmlData = {
  slots: slots.map(s => [s.area, s.side, s.slot, s.block_x, s.block_z, s.point.x, s.point.y, s.point.z, s.yaw, s.pitch]),
  itemCn: Object.fromEntries(obtainable.map(i => [i, itemCn.get(i) || i])),
  tex: TEX,
  areas: {
    A: { dir: '北', theme: '热区·原料·矿物·木材', themeV1: '原料·矿物', hot: true, color: '#c98a1f' },
    B: { dir: '东北', theme: '冷区·色彩', themeV1: '预留（原建材迁 H-R）', hot: false, color: '#75808f' },
    C: { dir: '东', theme: '热区·红石·功能', themeV1: '红石·功能', hot: true, color: '#c94a4a' },
    D: { dir: '东南', theme: '冷区·装备·附魔·收藏', themeV1: '装备·附魔·收藏', hot: false, color: '#3f74b8' },
    E: { dir: '南', theme: '热区·药水', themeV1: '色彩', hot: true, color: '#b45aa8' },
    F: { dir: '西南', theme: '冷区·植物', themeV1: '植物·药水', hot: false, color: '#b07a2a' },
    G: { dir: '西', theme: '热区·生物资源', themeV1: '生物资源（L 敌对 / R 友好·中立）', hot: true, color: '#8b6f4e' },
    H: { dir: '西北', theme: '冷区·自然方块·建材·木构件', themeV1: '地形·建材·收纳', hot: false, color: '#4f8f5a' },
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
console.log(`rules ${rules.length}, blacklist ${blacklist.length}`);
console.log(`slots used ${unitInstances.length}/880`);
const usedBySide = {};
for (const u of unitInstances) usedBySide[`${u.area}-${u.side}`] = (usedBySide[`${u.area}-${u.side}`] || 0) + 1;
console.log(JSON.stringify(usedBySide));
console.log(`button distance ${bh.toFixed(2)}/${bv}, ready distance ${rr.toFixed(2)}`);
console.log(`wrote ${outFiles.join(' + ')} (${Buffer.byteLength(jsonText)} bytes each)`);
