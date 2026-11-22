'use strict';

// 存储单元表：顺序即匹配优先级，先具体后通用。
// ids = 精确物品 ID（不含 minecraft: 前缀）；re = 物品 ID 正则。
// v3（2026-11-22）：E 区自然方块并入 H 区；药水+玻璃瓶进 E 区；
// 树种木构件格删除（台阶/楼梯并回通用格，告示牌/展示架独立成格）；
// 磨制 10 件拆单融入石系；苔石砖/竹马赛克并入砖格；树脂/纸/书迁回 A 区。

const EXCLUDED = new Set([
  'air',
  'barrier', 'light', 'structure_block', 'structure_void', 'jigsaw',
  'bedrock', 'end_portal_frame', 'reinforced_deepslate', 'budding_amethyst',
  'petrified_oak_slab', 'trial_spawner', 'vault',
  'dirt_path', 'farmland',
  'chorus_plant', // v3 移除收纳：见《本次改进》移除物报告
  'test_block', 'test_instance_block',
  'command_block', 'chain_command_block', 'repeating_command_block',
  'command_block_minecart',
  'spawner',
  'knowledge_book', 'debug_stick',
]);

const UNITS = [];

function add(unit) {
  UNITS.push(unit);
}

function exact(id, area, side, group, cn, rep, ids) {
  add({ id, area, side, group, cn, rep, ids });
}

function pattern(id, area, side, group, cn, rep, re, ids = []) {
  add({ id, area, side, group, cn, rep, ids, re });
}

const WOOD = [
  ['oak', '橡木'],
  ['spruce', '云杉'],
  ['birch', '白桦'],
  ['jungle', '丛林'],
  ['acacia', '金合欢'],
  ['dark_oak', '深色橡木'],
  ['mangrove', '红树'],
  ['cherry', '樱花'],
  ['pale_oak', '苍白橡木'],
  ['poplar', '杨木'],
  ['bamboo', '竹'],
  ['crimson', '绯红'],
  ['warped', '诡异'],
];

function rawWoodIds(species) {
  if (species === 'bamboo') {
    return ['bamboo_block', 'stripped_bamboo_block', 'bamboo_planks'];
  }
  if (species === 'crimson' || species === 'warped') {
    return [
      `${species}_stem`, `${species}_hyphae`,
      `stripped_${species}_stem`, `stripped_${species}_hyphae`,
      `${species}_planks`, `${species}_fungus`,
    ];
  }
  if (species === 'mangrove') {
    return [
      'mangrove_log', 'mangrove_wood', 'stripped_mangrove_log', 'stripped_mangrove_wood',
      'mangrove_planks', 'mangrove_propagule', 'mangrove_roots', 'mangrove_leaves',
    ];
  }
  if (species === 'poplar') {
    return [
      'poplar_log', 'poplar_wood', 'stripped_poplar_log', 'stripped_poplar_wood',
      'poplar_planks', 'poplar_sapling',
      'poplar_leaves', 'orange_poplar_leaves', 'red_poplar_leaves', 'yellow_poplar_leaves',
    ];
  }
  return [
    `${species}_log`, `${species}_wood`,
    `stripped_${species}_log`, `stripped_${species}_wood`,
    `${species}_planks`, `${species}_sapling`, `${species}_leaves`,
  ];
}

function rawWoodLogIds(species) {
  if (species === 'bamboo') {
    return ['bamboo_block', 'stripped_bamboo_block'];
  }
  if (species === 'crimson' || species === 'warped') {
    return [
      `${species}_stem`, `${species}_hyphae`,
      `stripped_${species}_stem`, `stripped_${species}_hyphae`,
    ];
  }
  return [
    `${species}_log`, `${species}_wood`,
    `stripped_${species}_log`, `stripped_${species}_wood`,
  ];
}

function rawWoodByIds(species) {
  const logs = new Set(rawWoodLogIds(species));
  return rawWoodIds(species).filter(id => !logs.has(id));
}

function rawWoodLogLabel(species, cn) {
  if (species === 'bamboo') return `${cn}（竹块/去皮竹块）`;
  if (species === 'crimson' || species === 'warped') return `${cn}（菌柄/菌核）`;
  return `${cn}（原木/去皮）`;
}

function rawWoodByLabel(species, cn) {
  if (species === 'bamboo') return `${cn}（木板）`;
  if (species === 'crimson' || species === 'warped') return `${cn}（木板/菌菇）`;
  if (species === 'mangrove') return `${cn}（木板/树苗/树根/树叶）`;
  return `${cn}（木板/树苗/树叶）`;
}

for (const [species, cn] of WOOD) {
  const logIds = rawWoodLogIds(species);
  const byIds = rawWoodByIds(species);
  exact(`WOODLOG:${species}`, 'A', 'R', '树种原木', rawWoodLogLabel(species, cn), logIds[0], logIds);
  exact(`WOODBY:${species}`, 'A', 'R', '树种副产品', rawWoodByLabel(species, cn), byIds[0], byIds);
}

// ---------- A 原料·矿物 ----------
exact('MIN:coal_ore', 'A', 'L', '矿物', '煤矿石', 'coal_ore', ['coal_ore', 'deepslate_coal_ore']);
exact('MIN:coal', 'A', 'L', '矿物', '煤炭/木炭', 'coal', ['coal', 'charcoal']);
exact('MIN:coal_block', 'A', 'L', '矿物', '煤炭块', 'coal_block', ['coal_block']);
exact('MIN:iron_ore', 'A', 'L', '矿物', '铁矿石/原铁', 'iron_ore', ['iron_ore', 'deepslate_iron_ore', 'raw_iron', 'raw_iron_block']);
exact('MIN:iron_ingot', 'A', 'L', '矿物', '铁锭/铁粒', 'iron_ingot', ['iron_ingot', 'iron_nugget']);
exact('MIN:iron_block', 'A', 'L', '矿物', '铁块', 'iron_block', ['iron_block']);
exact('MIN:copper_ore', 'A', 'L', '矿物', '铜矿石/原铜', 'copper_ore', ['copper_ore', 'deepslate_copper_ore', 'raw_copper', 'raw_copper_block']);
exact('MIN:copper_ingot', 'A', 'L', '矿物', '铜锭/铜粒', 'copper_ingot', ['copper_ingot', 'copper_nugget']);
exact('MIN:copper_block', 'A', 'L', '矿物', '铜块', 'copper_block', ['copper_block']);
exact('MIN:gold_ore', 'A', 'L', '矿物', '金矿石/原金', 'gold_ore', ['gold_ore', 'deepslate_gold_ore', 'nether_gold_ore', 'raw_gold', 'raw_gold_block']);
exact('MIN:gold_ingot', 'A', 'L', '矿物', '金锭/金粒', 'gold_ingot', ['gold_ingot', 'gold_nugget']);
exact('MIN:gold_block', 'A', 'L', '矿物', '金块', 'gold_block', ['gold_block']);
exact('MIN:lapis_ore', 'A', 'L', '矿物', '青金石矿石', 'lapis_ore', ['lapis_ore', 'deepslate_lapis_ore']);
exact('MIN:lapis', 'A', 'L', '矿物', '青金石', 'lapis_lazuli', ['lapis_lazuli']);
exact('MIN:lapis_block', 'A', 'L', '矿物', '青金石块', 'lapis_block', ['lapis_block']);
exact('MIN:redstone_ore', 'A', 'L', '矿物', '红石矿石', 'redstone_ore', ['redstone_ore', 'deepslate_redstone_ore']);
exact('MIN:redstone', 'A', 'L', '矿物', '红石', 'redstone', ['redstone']);
exact('MIN:redstone_block', 'A', 'L', '矿物', '红石块', 'redstone_block', ['redstone_block']);
exact('MIN:emerald_ore', 'A', 'L', '矿物', '绿宝石矿石', 'emerald_ore', ['emerald_ore', 'deepslate_emerald_ore']);
exact('MIN:emerald', 'A', 'L', '矿物', '绿宝石', 'emerald', ['emerald']);
exact('MIN:emerald_block', 'A', 'L', '矿物', '绿宝石块', 'emerald_block', ['emerald_block']);
exact('MIN:diamond_ore', 'A', 'L', '矿物', '钻石矿石', 'diamond_ore', ['diamond_ore', 'deepslate_diamond_ore']);
exact('MIN:diamond', 'A', 'L', '矿物', '钻石', 'diamond', ['diamond']);
exact('MIN:diamond_block', 'A', 'L', '矿物', '钻石块', 'diamond_block', ['diamond_block']);
exact('MIN:netherite_scrap', 'A', 'L', '矿物', '下界合金碎片', 'netherite_scrap', ['netherite_scrap', 'ancient_debris']);
exact('MIN:netherite_ingot', 'A', 'L', '矿物', '下界合金锭', 'netherite_ingot', ['netherite_ingot']);
exact('MIN:netherite_block', 'A', 'L', '矿物', '下界合金块', 'netherite_block', ['netherite_block']);
exact('MIN:quartz_ore', 'A', 'L', '矿物', '下界石英矿石', 'nether_quartz_ore', ['nether_quartz_ore']);
exact('MIN:quartz', 'A', 'L', '矿物', '石英', 'quartz', ['quartz']);
exact('MIN:quartz_block', 'A', 'L', '矿物', '石英块', 'quartz_block', ['quartz_block']);
exact('MIN:amethyst', 'A', 'L', '矿物', '紫水晶', 'amethyst_shard', ['amethyst_shard', 'amethyst_cluster', 'large_amethyst_bud', 'medium_amethyst_bud', 'small_amethyst_bud']);
exact('MIN:amethyst_block', 'A', 'L', '矿物', '紫水晶块', 'amethyst_block', ['amethyst_block']);

// 合成原材：v3 起树脂/纸/书回归 A-R；碗归 G-L（炖菜旁）；玻璃瓶归 E-L（药水前）；
// 雪球随自然方块并入 H 区；燧石/黏土球/红砖/下界砖按亲缘并入 H 区。
exact('RAW:stick', 'A', 'R', '合成原材', '木棍', 'stick', ['stick']);
exact('RAW:resin', 'A', 'R', '合成原材', '树脂', 'resin_clump', ['resin_clump']);
exact('RAW:paper', 'A', 'R', '合成原材', '纸', 'paper', ['paper']);
exact('RAW:book', 'A', 'R', '合成原材', '书', 'book', ['book', 'writable_book', 'written_book']);
exact('RAW:bowl', 'G', 'L', '食物', '碗', 'bowl', ['bowl']);
exact('RAW:glass_bottle', 'E', 'L', '药水', '玻璃瓶', 'glass_bottle', ['glass_bottle']);
exact('RAW:flint', 'H', 'L', '地形', '燧石', 'flint', ['flint']);
exact('RAW:clay_ball', 'H', 'L', '地形', '黏土球', 'clay_ball', ['clay_ball']);
exact('RAW:brick', 'H', 'L', '基础方块', '红砖', 'brick', ['brick']);
exact('RAW:nether_brick', 'H', 'L', '基础方块', '下界砖', 'nether_brick', ['nether_brick']);

// ---------- B 色彩·建材 ----------
// 变体合并（按要求）：墙/栅栏/栅栏门跨材质各占 1 格，优先于各材质建材单元匹配。
pattern('BUILD:wall', 'H', 'L', '建材变体', '墙', 'stone_brick_wall', /_wall$/);
pattern('BUILD:fence', 'H', 'L', '建材变体', '栅栏', 'oak_fence', /_fence$/);
pattern('BUILD:fence_gate', 'H', 'L', '建材变体', '栅栏门', 'oak_fence_gate', /_fence_gate$/);
exact('BUILD:glass', 'B', 'R', '建材', '玻璃', 'glass', ['glass', 'glass_pane']);
exact('BUILD:tinted_glass', 'B', 'R', '建材', '遮光玻璃', 'tinted_glass', ['tinted_glass']);
exact('BUILD:light_glowstone', 'H', 'R', '光源', '荧石', 'glowstone', ['glowstone']);
exact('BUILD:light_shroomlight', 'H', 'R', '光源', '菌光体', 'shroomlight', ['shroomlight']);
exact('BUILD:light_ochre_froglight', 'H', 'R', '光源', '赭黄蛙明灯', 'ochre_froglight', ['ochre_froglight']);
exact('BUILD:light_pearlescent_froglight', 'H', 'R', '光源', '珠光蛙明灯', 'pearlescent_froglight', ['pearlescent_froglight']);
exact('BUILD:light_verdant_froglight', 'H', 'R', '光源', '青翠蛙明灯', 'verdant_froglight', ['verdant_froglight']);
exact('BUILD:bookshelf', 'H', 'R', '建材', '书架', 'bookshelf', ['bookshelf', 'chiseled_bookshelf']);
exact('BUILD:pumpkin', 'H', 'R', '建材', '南瓜灯', 'carved_pumpkin', ['carved_pumpkin', 'jack_o_lantern']);
exact('BUILD:ladder', 'H', 'R', '建材', '梯子', 'ladder', ['ladder']);

pattern('BUILD:copper', 'H', 'R', '铜铁构件', '铜系建材', 'chiseled_copper', /^(waxed_)?(exposed_|weathered_|oxidized_)?copper(_block|_grate|_bars|_door|_trapdoor|_chain|_golem_statue)?$|^(waxed_)?(exposed_|weathered_|oxidized_)?(cut|chiseled)_copper(_slab|_stairs)?$/, ['chiseled_copper']);
pattern('BUILD:iron', 'H', 'R', '铜铁构件', '铁构件', 'iron_bars', /^iron_(bars|door|trapdoor|chain)$/, ['iron_bars']);
pattern('LIGHT:torch', 'H', 'R', '照明', '火把/灯笼', 'torch', /^(waxed_)?(exposed_|weathered_|oxidized_)?copper_lantern$/, ['torch', 'soul_torch', 'copper_torch', 'lantern', 'soul_lantern', 'copper_lantern', 'end_rod']);

// ---------- C 红石·功能 ----------
exact('RED:hopper', 'C', 'L', '红石元件', '漏斗', 'hopper', ['hopper']);
exact('RED:comparator', 'C', 'L', '红石元件', '红石比较器', 'comparator', ['comparator']);
exact('RED:repeater', 'C', 'L', '红石元件', '红石中继器', 'repeater', ['repeater']);
exact('RED:piston', 'C', 'L', '红石元件', '活塞', 'piston', ['piston', 'sticky_piston']);
exact('RED:observer', 'C', 'L', '红石元件', '侦测器', 'observer', ['observer']);
exact('RED:dispenser', 'C', 'L', '红石元件', '发射器/投掷器', 'dispenser', ['dispenser', 'dropper']);
exact('RED:pressure_plate', 'C', 'L', '红石元件', '压力板', 'oak_pressure_plate', ['oak_pressure_plate', 'spruce_pressure_plate', 'birch_pressure_plate', 'jungle_pressure_plate', 'acacia_pressure_plate', 'dark_oak_pressure_plate', 'mangrove_pressure_plate', 'cherry_pressure_plate', 'pale_oak_pressure_plate', 'poplar_pressure_plate', 'bamboo_pressure_plate', 'crimson_pressure_plate', 'warped_pressure_plate', 'stone_pressure_plate', 'light_weighted_pressure_plate', 'heavy_weighted_pressure_plate', 'polished_blackstone_pressure_plate']);
exact('RED:button', 'C', 'L', '红石元件', '按钮', 'oak_button', ['oak_button', 'spruce_button', 'birch_button', 'jungle_button', 'acacia_button', 'dark_oak_button', 'mangrove_button', 'cherry_button', 'pale_oak_button', 'poplar_button', 'bamboo_button', 'crimson_button', 'warped_button', 'stone_button', 'polished_blackstone_button']);
exact('RED:lever', 'C', 'L', '红石元件', '拉杆', 'lever', ['lever']);
exact('RED:tripwire', 'C', 'L', '红石元件', '绊线钩', 'tripwire_hook', ['tripwire_hook']);
exact('RED:daylight', 'C', 'L', '红石元件', '阳光探测器', 'daylight_detector', ['daylight_detector']);
exact('RED:torch', 'C', 'L', '红石元件', '红石火把', 'redstone_torch', ['redstone_torch']);
exact('RED:target', 'C', 'L', '红石元件', '标靶', 'target', ['target']);
exact('RED:note_block', 'C', 'L', '红石元件', '音符盒', 'note_block', ['note_block']);
exact('RED:jukebox', 'C', 'L', '红石元件', '唱片机', 'jukebox', ['jukebox']);
exact('RED:lamp', 'C', 'L', '红石元件', '红石灯', 'redstone_lamp', ['redstone_lamp']);
exact('RED:tnt', 'C', 'L', '红石元件', 'TNT', 'tnt', ['tnt']);
exact('RED:scaffolding', 'C', 'L', '红石元件', '脚手架', 'scaffolding', ['scaffolding']);
pattern('RED:lightning_rod', 'C', 'L', '红石元件', '避雷针', 'lightning_rod', /^(waxed_)?(exposed_|weathered_|oxidized_)?lightning_rod$/, ['lightning_rod']);
pattern('RED:copper_bulb', 'C', 'L', '红石元件', '铜灯', 'copper_bulb', /^(waxed_)?(exposed_|weathered_|oxidized_)?copper_bulb$/, ['copper_bulb']);
exact('RED:crafter', 'C', 'L', '红石元件', '合成器', 'crafter', ['crafter']);

exact('WORK:rail', 'C', 'R', '轨道/工作站', '铁轨', 'rail', ['rail', 'detector_rail', 'activator_rail', 'powered_rail']);
exact('WORK:minecart', 'C', 'R', '轨道/工作站', '矿车', 'minecart', ['minecart', 'chest_minecart', 'furnace_minecart', 'hopper_minecart', 'tnt_minecart']);
exact('WORK:chest', 'C', 'R', '容器', '箱子/桶', 'chest', ['chest', 'trapped_chest', 'barrel', 'ender_chest']);
pattern('WORK:copper_chest', 'C', 'R', '容器', '铜箱', 'copper_chest', /^(waxed_)?(exposed_|weathered_|oxidized_)?copper_chest$/, ['copper_chest']);
exact('WORK:furnace', 'C', 'R', '工作站', '熔炉', 'furnace', ['furnace', 'blast_furnace', 'smoker']);
exact('WORK:anvil', 'C', 'R', '工作站', '铁砧', 'anvil', ['anvil', 'chipped_anvil', 'damaged_anvil']);
exact('WORK:crafting_table', 'C', 'R', '工作站', '工作台', 'crafting_table', ['crafting_table']);
exact('WORK:stonecutter', 'C', 'R', '工作站', '切石机', 'stonecutter', ['stonecutter']);
exact('WORK:cartography', 'C', 'R', '工作站', '制图台', 'cartography_table', ['cartography_table']);
exact('WORK:fletching', 'C', 'R', '工作站', '制箭台', 'fletching_table', ['fletching_table']);
exact('WORK:smithing', 'C', 'R', '工作站', '锻造台', 'smithing_table', ['smithing_table']);
exact('WORK:grindstone', 'C', 'R', '工作站', '砂轮', 'grindstone', ['grindstone']);
exact('WORK:loom', 'C', 'R', '工作站', '织布机', 'loom', ['loom']);
exact('WORK:enchanting_table', 'C', 'R', '工作站', '附魔台', 'enchanting_table', ['enchanting_table']);
exact('WORK:beacon', 'C', 'R', '工作站', '信标', 'beacon', ['beacon']);
exact('WORK:conduit', 'C', 'R', '工作站', '潮涌核心', 'conduit', ['conduit']);
exact('WORK:cauldron', 'C', 'R', '工作站', '炼药锅', 'cauldron', ['cauldron']);
exact('WORK:composter', 'C', 'R', '工作站', '堆肥桶', 'composter', ['composter']);
exact('WORK:brewing', 'C', 'R', '工作站', '酿造台', 'brewing_stand', ['brewing_stand']);
exact('WORK:lectern', 'C', 'R', '工作站', '讲台', 'lectern', ['lectern']);
exact('WORK:bell', 'C', 'R', '工作站', '钟', 'bell', ['bell']);
exact('WORK:lodestone', 'C', 'R', '工作站', '磁石', 'lodestone', ['lodestone']);
exact('WORK:respawn_anchor', 'C', 'R', '工作站', '重生锚', 'respawn_anchor', ['respawn_anchor']);
exact('WORK:campfire', 'C', 'R', '工作站', '营火', 'campfire', ['campfire', 'soul_campfire']);
exact('WORK:item_frame', 'C', 'R', '展示', '物品展示框', 'item_frame', ['item_frame', 'glow_item_frame']);
exact('WORK:armor_stand', 'C', 'R', '展示', '盔甲架', 'armor_stand', ['armor_stand']);

// ---------- D 装备·武器 ----------
const TOOL_MATS = ['wooden', 'stone', 'copper', 'iron', 'golden', 'diamond', 'netherite'];
for (const [type, cn] of [['sword', '剑'], ['pickaxe', '镐'], ['axe', '斧'], ['shovel', '锹'], ['hoe', '锄'], ['spear', '矛']]) {
  exact(`TOOL:${type}`, 'D', 'R', '工具武器', cn, `iron_${type}`, TOOL_MATS.map(m => `${m}_${type}`));
}
const ARMOR_MATS = ['leather', 'chainmail', 'copper', 'iron', 'golden', 'diamond', 'netherite'];
for (const [piece, cn] of [['helmet', '头盔'], ['chestplate', '胸甲'], ['leggings', '护腿'], ['boots', '靴子']]) {
  const ids = ARMOR_MATS.map(m => `${m}_${piece}`);
  if (piece === 'helmet') ids.push('turtle_helmet');
  exact(`ARMOR:${piece}`, 'D', 'R', '护甲', cn, `iron_${piece}`, ids);
}
exact('GEAR:bow', 'D', 'R', '远程/工具', '弓', 'bow', ['bow']);
exact('GEAR:crossbow', 'D', 'R', '远程/工具', '弩', 'crossbow', ['crossbow']);
exact('GEAR:trident', 'D', 'R', '远程/工具', '三叉戟', 'trident', ['trident']);
exact('GEAR:mace', 'D', 'R', '远程/工具', '重锤', 'mace', ['mace']);
exact('GEAR:shield', 'D', 'R', '远程/工具', '盾牌', 'shield', ['shield']);
exact('GEAR:elytra', 'D', 'R', '远程/工具', '鞘翅', 'elytra', ['elytra']);
exact('GEAR:fishing_rod', 'D', 'R', '远程/工具', '钓鱼竿', 'fishing_rod', ['fishing_rod', 'carrot_on_a_stick', 'warped_fungus_on_a_stick']);
exact('GEAR:shears', 'D', 'R', '远程/工具', '剪刀', 'shears', ['shears']);
exact('GEAR:flint_and_steel', 'D', 'R', '远程/工具', '打火石', 'flint_and_steel', ['flint_and_steel']);
exact('GEAR:brush', 'D', 'R', '远程/工具', '刷子', 'brush', ['brush']);
exact('GEAR:spyglass', 'D', 'R', '远程/工具', '望远镜', 'spyglass', ['spyglass']);
exact('GEAR:arrow', 'D', 'R', '弹药', '箭', 'arrow', ['arrow', 'spectral_arrow']);
exact('GEAR:firework_rocket', 'D', 'R', '弹药', '烟花火箭', 'firework_rocket', ['firework_rocket']);
exact('GEAR:firework_star', 'D', 'R', '弹药', '烟火之星', 'firework_star', ['firework_star']);
exact('GEAR:bucket', 'G', 'L', '容器', '铁桶', 'bucket', ['bucket']);
exact('GEAR:water_bucket', 'G', 'L', '容器', '水桶', 'water_bucket', ['water_bucket']);
exact('GEAR:lava_bucket', 'G', 'L', '容器', '熔岩桶', 'lava_bucket', ['lava_bucket']);
exact('GEAR:milk_bucket', 'G', 'L', '容器', '奶桶', 'milk_bucket', ['milk_bucket']);
exact('GEAR:powder_snow_bucket', 'G', 'L', '容器', '细雪桶', 'powder_snow_bucket', ['powder_snow_bucket']);
exact('GEAR:axolotl_bucket', 'G', 'L', '容器', '美西螈桶', 'axolotl_bucket', ['axolotl_bucket']);
exact('GEAR:cod_bucket', 'G', 'L', '容器', '鳕鱼桶', 'cod_bucket', ['cod_bucket']);
exact('GEAR:salmon_bucket', 'G', 'L', '容器', '鲑鱼桶', 'salmon_bucket', ['salmon_bucket']);
exact('GEAR:pufferfish_bucket', 'G', 'L', '容器', '河豚桶', 'pufferfish_bucket', ['pufferfish_bucket']);
exact('GEAR:tropical_fish_bucket', 'G', 'L', '容器', '热带鱼桶', 'tropical_fish_bucket', ['tropical_fish_bucket']);
exact('GEAR:tadpole_bucket', 'G', 'L', '容器', '蝌蚪桶', 'tadpole_bucket', ['tadpole_bucket']);
exact('GEAR:sulfur_cube_bucket', 'G', 'L', '容器', '硫方怪桶', 'sulfur_cube_bucket', ['sulfur_cube_bucket']);
exact('GEAR:horse_armor', 'D', 'R', '坐骑装备', '马铠', 'iron_horse_armor', ['leather_horse_armor', 'copper_horse_armor', 'iron_horse_armor', 'golden_horse_armor', 'diamond_horse_armor', 'netherite_horse_armor']);
exact('GEAR:nautilus_armor', 'D', 'R', '坐骑装备', '鹦鹉螺铠', 'copper_nautilus_armor', ['copper_nautilus_armor', 'iron_nautilus_armor', 'golden_nautilus_armor', 'diamond_nautilus_armor', 'netherite_nautilus_armor']);
exact('GEAR:navigation', 'D', 'R', '杂项', '导航', 'compass', ['compass', 'recovery_compass']);
exact('GEAR:clock', 'D', 'R', '杂项', '时钟', 'clock', ['clock']);
exact('GEAR:name_tag', 'D', 'R', '杂项', '命名牌', 'name_tag', ['name_tag']);
exact('GEAR:saddle', 'D', 'R', '杂项', '鞍', 'saddle', ['saddle']);
exact('GEAR:lead', 'D', 'R', '杂项', '拴绳', 'lead', ['lead']);
exact('GEAR:wind_charge', 'D', 'R', '杂项', '风弹', 'wind_charge', ['wind_charge']);
exact('GEAR:fire_charge', 'D', 'R', '杂项', '火焰弹', 'fire_charge', ['fire_charge']);
exact('GEAR:wolf_armor', 'D', 'R', '杂项', '狼铠', 'wolf_armor', ['wolf_armor']);

// ---------- E 色彩（build 内按色彩重组到 B 区）----------
const COLOR_NAMES = [
  ['white', '白色'], ['light_gray', '淡灰色'], ['gray', '灰色'], ['black', '黑色'],
  ['brown', '棕色'], ['red', '红色'], ['orange', '橙色'], ['yellow', '黄色'],
  ['lime', '黄绿色'], ['green', '绿色'], ['cyan', '青色'], ['light_blue', '淡蓝色'],
  ['blue', '蓝色'], ['purple', '紫色'], ['magenta', '品红色'], ['pink', '粉红色'],
];
const COLOR_SUFFIXES = [
  'wool', 'wool_slab', 'wool_stairs', 'carpet', 'concrete', 'concrete_powder',
  'concrete_slab', 'concrete_stairs', 'terracotta', 'glazed_terracotta',
  'stained_glass', 'stained_glass_pane', 'shulker_box', 'bed', 'banner',
  'candle', 'dye', 'bundle', 'harness', 'cushion',
];
for (const [color, cn] of COLOR_NAMES) {
  pattern(`COLOR:${color}`, 'B', 'L', '色系', `${cn}系`, `${color}_wool`, new RegExp(`^${color}_(${COLOR_SUFFIXES.join('|')})$`), [`${color}_wool`]);
}
exact('COLOR:base_terracotta', 'B', 'L', '基础色', '陶瓦', 'terracotta', ['terracotta']);
exact('COLOR:base_shulker', 'B', 'L', '基础色', '潜影盒', 'shulker_box', ['shulker_box']);
exact('COLOR:base_bundle', 'B', 'L', '基础色', '收纳袋', 'bundle', ['bundle']);
exact('COLOR:base_candle', 'B', 'L', '基础色', '蜡烛', 'candle', ['candle']);
exact('COLOR:base_bed', 'B', 'L', '基础色', '草床', 'straw_bed', ['straw_bed']);

// ---------- 收藏（build 内分配到 B/D/G/H）----------
exact('COLLECT:disc', 'G', 'R', '收藏', '音乐唱片', 'music_disc_cat', ['music_disc_cat', 'disc_fragment_5', 'music_disc_11', 'music_disc_13', 'music_disc_5', 'music_disc_blocks', 'music_disc_bounce', 'music_disc_chirp', 'music_disc_creator', 'music_disc_creator_music_box', 'music_disc_far', 'music_disc_lava_chicken', 'music_disc_mall', 'music_disc_mellohi', 'music_disc_otherside', 'music_disc_pigstep', 'music_disc_precipice', 'music_disc_relic', 'music_disc_stal', 'music_disc_strad', 'music_disc_tears', 'music_disc_wait', 'music_disc_ward']);
pattern('COLLECT:sherd', 'B', 'R', '收藏', '陶片', 'angler_pottery_sherd', /_pottery_sherd$/);
pattern('COLLECT:banner_pattern', 'B', 'R', '彩色材质', '旗帜图案', 'flower_banner_pattern', /_banner_pattern$/, ['flower_banner_pattern']);
pattern('COLLECT:smithing_template', 'D', 'R', '收藏', '锻造模板', 'netherite_upgrade_smithing_template', /_smithing_template$/, ['netherite_upgrade_smithing_template']);
pattern('COLLECT:map', 'G', 'L', '收藏', '地图', 'filled_map', /^(map|filled_map|.*_map)$/, ['map', 'filled_map']);
exact('COLLECT:goat_horn', 'D', 'R', '收藏', '山羊角', 'goat_horn', ['goat_horn']);
exact('COLLECT:head_zombie', 'G', 'R', '收藏', '僵尸的头', 'zombie_head', ['zombie_head']);
exact('COLLECT:head_skeleton', 'G', 'R', '收藏', '骷髅头颅', 'skeleton_skull', ['skeleton_skull']);
exact('COLLECT:head_wither_skeleton', 'G', 'R', '收藏', '凋灵骷髅头颅', 'wither_skeleton_skull', ['wither_skeleton_skull']);
exact('COLLECT:head_creeper', 'G', 'R', '收藏', '苦力怕的头', 'creeper_head', ['creeper_head']);
exact('COLLECT:head_dragon', 'G', 'R', '收藏', '龙首', 'dragon_head', ['dragon_head']);
exact('COLLECT:head_piglin', 'G', 'R', '收藏', '猪灵的头', 'piglin_head', ['piglin_head']);
exact('COLLECT:head_player', 'G', 'R', '收藏', '玩家的头', 'player_head', ['player_head']);
exact('COLLECT:trial_key', 'G', 'R', '收藏', '试炼钥匙', 'trial_key', ['trial_key']);
exact('COLLECT:ominous_trial_key', 'G', 'R', '收藏', '不祥试炼钥匙', 'ominous_trial_key', ['ominous_trial_key', 'ominous_bottle']);
exact('COLLECT:dragon_egg', 'G', 'R', '收藏', '龙蛋', 'dragon_egg', ['dragon_egg']);
exact('COLLECT:heavy_core', 'D', 'R', '收藏', '重核', 'heavy_core', ['heavy_core']);
exact('COLLECT:painting', 'B', 'R', '收藏', '画', 'painting', ['painting']);
exact('COLLECT:decorated_pot', 'H', 'R', '收藏', '饰纹陶罐', 'decorated_pot', ['decorated_pot']);
exact('COLLECT:flower_pot', 'H', 'R', '收藏', '花盆', 'flower_pot', ['flower_pot']);
exact('COLLECT:experience_bottle', 'D', 'R', '收藏', '附魔之瓶', 'experience_bottle', ['experience_bottle']);
exact('COLLECT:end_crystal', 'D', 'R', '收藏', '末影水晶', 'end_crystal', ['end_crystal']);

// ---------- F 植物农业 ----------
exact('PLANT:dandelion', 'F', 'L', '花卉', '蒲公英', 'dandelion', ['dandelion']);
exact('PLANT:poppy', 'F', 'L', '花卉', '虞美人', 'poppy', ['poppy']);
exact('PLANT:orchid', 'F', 'L', '花卉', '兰花', 'blue_orchid', ['blue_orchid']);
exact('PLANT:azure_bluet', 'F', 'L', '花卉', '蓝花美耳草', 'azure_bluet', ['azure_bluet']);
exact('PLANT:allium', 'F', 'L', '花卉', '绒球葱', 'allium', ['allium']);
exact('PLANT:tulip_red', 'F', 'L', '花卉', '红郁金香', 'red_tulip', ['red_tulip']);
exact('PLANT:tulip_orange', 'F', 'L', '花卉', '橙郁金香', 'orange_tulip', ['orange_tulip']);
exact('PLANT:tulip_white', 'F', 'L', '花卉', '白郁金香', 'white_tulip', ['white_tulip']);
exact('PLANT:tulip_pink', 'F', 'L', '花卉', '粉郁金香', 'pink_tulip', ['pink_tulip']);
exact('PLANT:oxeye', 'F', 'L', '花卉', '滨菊', 'oxeye_daisy', ['oxeye_daisy']);
exact('PLANT:cornflower', 'F', 'L', '花卉', '矢车菊', 'cornflower', ['cornflower']);
exact('PLANT:lily', 'F', 'L', '花卉', '铃兰', 'lily_of_the_valley', ['lily_of_the_valley']);
exact('PLANT:wither_rose', 'F', 'L', '花卉', '凋灵玫瑰', 'wither_rose', ['wither_rose']);
exact('PLANT:golden_dandelion', 'F', 'L', '花卉', '金蒲公英', 'golden_dandelion', ['golden_dandelion']);
exact('PLANT:sunflower', 'F', 'L', '高花', '向日葵', 'sunflower', ['sunflower']);
exact('PLANT:lilac', 'F', 'L', '高花', '丁香', 'lilac', ['lilac']);
exact('PLANT:rose_bush', 'F', 'L', '高花', '玫瑰丛', 'rose_bush', ['rose_bush']);
exact('PLANT:peony', 'F', 'L', '高花', '牡丹', 'peony', ['peony']);
exact('PLANT:torchflower', 'F', 'L', '花卉', '火把花', 'torchflower', ['torchflower']);
exact('PLANT:torchflower_seeds', 'F', 'L', '花卉', '火把花种子', 'torchflower_seeds', ['torchflower_seeds']);
exact('PLANT:wildflowers', 'F', 'L', '花卉', '野花簇', 'wildflowers', ['wildflowers']);
exact('PLANT:cactus_flower', 'F', 'L', '花卉', '仙人掌花', 'cactus_flower', ['cactus_flower']);
exact('PLANT:eyeblossom', 'F', 'L', '花卉', '眼眸花', 'open_eyeblossom', ['open_eyeblossom', 'closed_eyeblossom']);
exact('PLANT:petals', 'F', 'L', '花卉', '粉红色花簇', 'pink_petals', ['pink_petals']);
exact('PLANT:azalea', 'F', 'L', '灌木', '杜鹃', 'azalea', ['azalea', 'flowering_azalea', 'azalea_leaves', 'flowering_azalea_leaves']);
exact('PLANT:mushroom_brown', 'F', 'L', '菌类', '棕色蘑菇', 'brown_mushroom', ['brown_mushroom']);
exact('PLANT:mushroom_red', 'F', 'L', '菌类', '红色蘑菇', 'red_mushroom', ['red_mushroom']);
exact('PLANT:mushroom_block', 'F', 'L', '菌类', '蘑菇块', 'brown_mushroom_block', ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem']);
exact('PLANT:shelf_mushroom', 'F', 'L', '菌类', '层孔菇', 'shelf_mushroom', ['shelf_mushroom']);
exact('PLANT:nether_plant', 'F', 'L', '菌类', '下界植物', 'crimson_roots', ['crimson_roots', 'warped_roots', 'nether_sprouts']);
exact('PLANT:spore_blossom', 'F', 'L', '草藤', '孢子花', 'spore_blossom', ['spore_blossom']);
exact('PLANT:glow_lichen', 'F', 'L', '草藤', '发光地衣', 'glow_lichen', ['glow_lichen']);
exact('PLANT:hanging_roots', 'F', 'L', '草藤', '垂根', 'hanging_roots', ['hanging_roots']);
exact('PLANT:pale_hanging_moss', 'F', 'L', '草藤', '苍白垂须', 'pale_hanging_moss', ['pale_hanging_moss']);
exact('PLANT:dripleaf', 'F', 'L', '草藤', '垂滴叶', 'big_dripleaf', ['big_dripleaf', 'small_dripleaf']);
exact('PLANT:vine', 'F', 'L', '草藤', '藤蔓', 'vine', ['vine']);
exact('PLANT:twisting_vines', 'F', 'L', '草藤', '缠怨藤', 'twisting_vines', ['twisting_vines']);
exact('PLANT:weeping_vines', 'F', 'L', '草藤', '垂泪藤', 'weeping_vines', ['weeping_vines']);
exact('PLANT:glow_berries', 'F', 'L', '草藤', '发光浆果', 'glow_berries', ['glow_berries']);
exact('PLANT:short_grass', 'F', 'L', '草类', '矮草/高草', 'short_grass', ['short_grass', 'tall_grass']);
exact('PLANT:fern', 'F', 'L', '草类', '蕨', 'fern', ['fern', 'large_fern']);
exact('PLANT:dead_bush', 'F', 'L', '草类', '枯萎的灌木', 'dead_bush', ['dead_bush']);
exact('PLANT:bush', 'F', 'L', '草类', '灌木', 'bush', ['bush']);
exact('PLANT:firefly_bush', 'F', 'L', '草类', '萤火虫灌木丛', 'firefly_bush', ['firefly_bush']);
exact('PLANT:leaf_litter', 'F', 'L', '草类', '枯叶堆', 'leaf_litter', ['leaf_litter']);
exact('PLANT:dry_grass', 'F', 'R', '草类', '枯草丛', 'short_dry_grass', ['short_dry_grass', 'tall_dry_grass']);
exact('PLANT:red_shrub', 'F', 'L', '草类', '红灌木', 'red_shrub', ['red_shrub']);
exact('PLANT:cactus', 'F', 'R', '草类', '仙人掌', 'cactus', ['cactus']);
exact('PLANT:sea_pickle', 'F', 'R', '水生', '海泡菜', 'sea_pickle', ['sea_pickle']);
exact('PLANT:seagrass', 'F', 'R', '水生', '海草', 'seagrass', ['seagrass']);
exact('PLANT:lily_pad', 'F', 'R', '水生', '睡莲', 'lily_pad', ['lily_pad']);
exact('PLANT:kelp', 'F', 'R', '水生', '海带', 'kelp', ['kelp']);
exact('PLANT:kelp_block', 'F', 'R', '水生', '海带块（含干海带）', 'dried_kelp_block', ['dried_kelp', 'dried_kelp_block']);
const CORAL_KINDS = [
  ['tube', '管'], ['brain', '脑纹'], ['bubble', '气泡'], ['fire', '火'], ['horn', '角'],
];
for (const [kind, cn] of CORAL_KINDS) {
  exact(`PLANT:coral:${kind}`, 'F', 'R', '珊瑚', `${cn}珊瑚`, `${kind}_coral`, [
    `${kind}_coral`, `${kind}_coral_block`, `${kind}_coral_fan`,
    `dead_${kind}_coral`, `dead_${kind}_coral_block`, `dead_${kind}_coral_fan`,
  ]);
}
exact('PLANT:frogspawn', 'G', 'L', '水生', '青蛙卵', 'frogspawn', ['frogspawn']);
exact('PLANT:bee_nest', 'G', 'L', '其他', '蜂巢/蜂箱', 'bee_nest', ['bee_nest', 'beehive']);
exact('PLANT:creaking_heart', 'G', 'R', '其他', '嘎枝之心', 'creaking_heart', ['creaking_heart']);
exact('PLANT:pitcher', 'F', 'R', '其他', '瓶子草', 'pitcher_plant', ['pitcher_plant', 'pitcher_pod']);

exact('CROP:wheat', 'F', 'R', '作物', '小麦', 'wheat', ['wheat']);
exact('CROP:wheat_seeds', 'F', 'R', '作物', '小麦种子', 'wheat_seeds', ['wheat_seeds']);
exact('CROP:carrot', 'F', 'R', '作物', '胡萝卜', 'carrot', ['carrot']);
exact('CROP:potato', 'F', 'R', '作物', '马铃薯', 'potato', ['potato', 'baked_potato', 'poisonous_potato']);
exact('CROP:beetroot', 'F', 'R', '作物', '甜菜根', 'beetroot', ['beetroot']);
exact('CROP:beetroot_seeds', 'F', 'R', '作物', '甜菜种子', 'beetroot_seeds', ['beetroot_seeds']);
exact('CROP:pumpkin', 'F', 'R', '作物', '南瓜', 'pumpkin', ['pumpkin']);
exact('CROP:pumpkin_seeds', 'F', 'R', '作物', '南瓜种子', 'pumpkin_seeds', ['pumpkin_seeds']);
exact('CROP:melon', 'F', 'R', '作物', '西瓜', 'melon', ['melon']);
exact('CROP:melon_seeds', 'F', 'R', '作物', '西瓜种子（含西瓜片）', 'melon_seeds', ['melon_seeds', 'melon_slice', 'glistering_melon_slice']);
exact('CROP:sugar_cane', 'F', 'R', '作物', '甘蔗', 'sugar_cane', ['sugar_cane']);
exact('CROP:nether_wart', 'F', 'R', '作物', '下界疣', 'nether_wart', ['nether_wart']);
exact('CROP:cocoa', 'F', 'R', '作物', '可可豆', 'cocoa_beans', ['cocoa_beans']);
exact('CROP:bamboo', 'F', 'R', '作物', '竹子', 'bamboo', ['bamboo']);
exact('CROP:sweet_berry', 'F', 'R', '作物', '甜浆果', 'sweet_berries', ['sweet_berry_bush', 'sweet_berries']);
exact('CROP:chorus_fruit', 'F', 'R', '作物', '紫颂果', 'chorus_fruit', ['chorus_fruit']);
exact('CROP:chorus_flower', 'F', 'R', '作物', '紫颂花', 'chorus_flower', ['chorus_flower']);
exact('CROP:popped_chorus', 'F', 'R', '作物', '爆裂果', 'popped_chorus_fruit', ['popped_chorus_fruit']);

// ---------- G 生物资源·食物（v3 L/R 对调后：食物在 L，掉落在 R）----------
exact('DROP:rotten_flesh', 'G', 'R', '怪物掉落', '腐肉', 'rotten_flesh', ['rotten_flesh']);
exact('DROP:string', 'G', 'R', '怪物掉落', '线', 'string', ['string']);
exact('DROP:spider_eye', 'G', 'R', '怪物掉落', '蜘蛛眼', 'spider_eye', ['spider_eye', 'fermented_spider_eye']);
exact('DROP:bone', 'G', 'R', '怪物掉落', '骨头', 'bone', ['bone']);
exact('DROP:bone_meal', 'G', 'R', '怪物掉落', '骨粉', 'bone_meal', ['bone_meal']);
exact('DROP:bone_block', 'G', 'R', '怪物掉落', '骨块', 'bone_block', ['bone_block']);
exact('DROP:slime_ball', 'G', 'R', '怪物掉落', '黏液球', 'slime_ball', ['slime_ball']);
exact('DROP:slime_block', 'G', 'R', '怪物掉落', '黏液块', 'slime_block', ['slime_block']);
exact('DROP:ghast_tear', 'G', 'R', '怪物掉落', '恶魂之泪', 'ghast_tear', ['ghast_tear']);
exact('DROP:shulker_shell', 'G', 'R', '怪物掉落', '潜影壳', 'shulker_shell', ['shulker_shell']);
exact('DROP:gunpowder', 'G', 'R', '怪物掉落', '火药', 'gunpowder', ['gunpowder']);
exact('DROP:magma_cream', 'G', 'R', '怪物掉落', '岩浆膏', 'magma_cream', ['magma_cream']);
exact('DROP:magma_block', 'G', 'R', '怪物掉落', '岩浆块', 'magma_block', ['magma_block']);
exact('DROP:blaze', 'G', 'R', '怪物掉落', '烈焰', 'blaze_rod', ['blaze_rod', 'blaze_powder']);
exact('DROP:nether_star', 'G', 'R', '怪物掉落', '下界之星', 'nether_star', ['nether_star']);
exact('DROP:phantom_membrane', 'G', 'R', '怪物掉落', '幻翼膜', 'phantom_membrane', ['phantom_membrane']);
exact('DROP:prismarine_shard', 'G', 'R', '怪物掉落', '海晶碎片', 'prismarine_shard', ['prismarine_shard']);
exact('DROP:prismarine_crystals', 'G', 'R', '怪物掉落', '海晶砂粒', 'prismarine_crystals', ['prismarine_crystals']);
exact('DROP:cobweb', 'G', 'R', '怪物掉落', '蜘蛛网', 'cobweb', ['cobweb']);
exact('DROP:sculk', 'G', 'R', '幽匿', '幽匿块', 'sculk', ['sculk']);
exact('DROP:sculk_vein', 'G', 'R', '幽匿', '幽匿脉络', 'sculk_vein', ['sculk_vein']);
exact('DROP:sculk_sensor', 'G', 'R', '幽匿', '幽匿感测体', 'sculk_sensor', ['sculk_sensor']);
exact('DROP:calibrated_sculk_sensor', 'G', 'R', '幽匿', '校频幽匿感测体', 'calibrated_sculk_sensor', ['calibrated_sculk_sensor']);
exact('DROP:sculk_catalyst', 'G', 'R', '幽匿', '幽匿催发体', 'sculk_catalyst', ['sculk_catalyst']);
exact('DROP:sculk_shrieker', 'G', 'R', '幽匿', '幽匿尖啸体', 'sculk_shrieker', ['sculk_shrieker']);
exact('DROP:echo_shard', 'G', 'R', '幽匿', '回响碎片', 'echo_shard', ['echo_shard']);
exact('DROP:nautilus_shell', 'G', 'R', '怪物掉落', '鹦鹉螺壳', 'nautilus_shell', ['nautilus_shell']);
exact('DROP:dragon_breath', 'G', 'R', '怪物掉落', '龙息', 'dragon_breath', ['dragon_breath']);
exact('DROP:breeze', 'G', 'R', '怪物掉落', '旋风棒', 'breeze_rod', ['breeze_rod']);
exact('DROP:dried_ghast', 'G', 'R', '怪物掉落', '失水恶魂', 'dried_ghast', ['dried_ghast']);
exact('DROP:heart_of_the_sea', 'G', 'R', '怪物掉落', '海洋之心', 'heart_of_the_sea', ['heart_of_the_sea']);
exact('DROP:glowstone_dust', 'G', 'R', '怪物掉落', '萤石粉', 'glowstone_dust', ['glowstone_dust']);
exact('DROP:ink', 'G', 'L', '怪物掉落', '墨囊', 'ink_sac', ['ink_sac']);
exact('DROP:glow_ink', 'G', 'L', '怪物掉落', '荧光墨囊', 'glow_ink_sac', ['glow_ink_sac']);
exact('DROP:leather', 'G', 'L', '怪物掉落', '皮革', 'leather', ['leather']);
exact('DROP:rabbit_hide', 'G', 'L', '怪物掉落', '兔子皮', 'rabbit_hide', ['rabbit_hide']);
exact('DROP:rabbit_foot', 'G', 'L', '怪物掉落', '兔子脚', 'rabbit_foot', ['rabbit_foot']);
exact('DROP:turtle_scute', 'G', 'L', '怪物掉落', '海龟鳞甲', 'turtle_scute', ['turtle_scute']);
exact('DROP:armadillo_scute', 'G', 'L', '怪物掉落', '犰狳鳞甲', 'armadillo_scute', ['armadillo_scute']);
exact('DROP:feather', 'G', 'L', '怪物掉落', '羽毛', 'feather', ['feather']);
exact('DROP:egg', 'G', 'L', '怪物掉落', '鸡蛋', 'egg', ['egg', 'blue_egg', 'brown_egg']);
exact('DROP:turtle_egg', 'G', 'L', '怪物掉落', '海龟蛋', 'turtle_egg', ['turtle_egg']);
exact('DROP:sniffer_egg', 'G', 'L', '怪物掉落', '嗅探兽蛋', 'sniffer_egg', ['sniffer_egg']);
exact('DROP:honeycomb', 'G', 'L', '怪物掉落', '蜜脾', 'honeycomb', ['honeycomb']);
exact('DROP:honeycomb_block', 'G', 'L', '怪物掉落', '蜜脾块', 'honeycomb_block', ['honeycomb_block']);
exact('DROP:honey_bottle', 'G', 'L', '怪物掉落', '蜂蜜瓶', 'honey_bottle', ['honey_bottle']);
exact('DROP:honey_block', 'G', 'L', '怪物掉落', '蜂蜜块', 'honey_block', ['honey_block']);
exact('DROP:ender', 'G', 'L', '怪物掉落', '末影', 'ender_pearl', ['ender_pearl', 'ender_eye']);
exact('DROP:totem', 'D', 'R', '收藏', '不死图腾', 'totem_of_undying', ['totem_of_undying']);

exact('FOOD:apple', 'G', 'L', '食物', '苹果', 'apple', ['apple']);
exact('FOOD:bread', 'G', 'L', '食物', '面包', 'bread', ['bread']);
exact('FOOD:cookie', 'G', 'L', '食物', '曲奇', 'cookie', ['cookie']);
exact('FOOD:cake', 'G', 'L', '食物', '蛋糕', 'cake', ['cake']);
exact('FOOD:pumpkin_pie', 'G', 'L', '食物', '南瓜派', 'pumpkin_pie', ['pumpkin_pie']);
exact('FOOD:mushroom_stew', 'G', 'L', '食物', '蘑菇煲', 'mushroom_stew', ['mushroom_stew']);
exact('FOOD:rabbit_stew', 'G', 'L', '食物', '兔肉煲', 'rabbit_stew', ['rabbit_stew']);
exact('FOOD:beetroot_soup', 'G', 'L', '食物', '甜菜汤', 'beetroot_soup', ['beetroot_soup']);
exact('FOOD:suspicious_stew', 'G', 'L', '食物', '谜之炖菜', 'suspicious_stew', ['suspicious_stew']);
exact('FOOD:golden_apple', 'D', 'R', '收藏', '金苹果', 'golden_apple', ['golden_apple']);
exact('FOOD:enchanted_golden_apple', 'D', 'R', '收藏', '附魔金苹果', 'enchanted_golden_apple', ['enchanted_golden_apple']);
exact('FOOD:golden_carrot', 'G', 'L', '食物', '金胡萝卜', 'golden_carrot', ['golden_carrot']);
exact('FOOD:beef', 'G', 'L', '食物', '牛肉', 'beef', ['beef', 'cooked_beef']);
exact('FOOD:porkchop', 'G', 'L', '食物', '猪排', 'porkchop', ['porkchop', 'cooked_porkchop']);
exact('FOOD:mutton', 'G', 'L', '食物', '羊肉', 'mutton', ['mutton', 'cooked_mutton']);
exact('FOOD:chicken', 'G', 'L', '食物', '鸡肉', 'chicken', ['chicken', 'cooked_chicken']);
exact('FOOD:rabbit', 'G', 'L', '食物', '兔肉', 'rabbit', ['rabbit', 'cooked_rabbit']);
exact('FOOD:cod', 'G', 'L', '食物', '鳕鱼', 'cod', ['cod', 'cooked_cod']);
exact('FOOD:salmon', 'G', 'L', '食物', '鲑鱼', 'salmon', ['salmon', 'cooked_salmon']);
exact('FOOD:tropical_fish', 'G', 'L', '食物', '热带鱼', 'tropical_fish', ['tropical_fish']);
exact('FOOD:pufferfish', 'G', 'L', '食物', '河豚', 'pufferfish', ['pufferfish']);
exact('FOOD:hay_block', 'F', 'R', '作物', '干草捆', 'hay_block', ['hay_block']);
exact('FOOD:sugar', 'F', 'R', '作物', '糖', 'sugar', ['sugar']);

// ---------- H 地形（自然方块，v3 与建材合并为同一区）----------
exact('TERRAIN:dirt', 'H', 'L', '土壤', '泥土', 'dirt', ['dirt', 'coarse_dirt', 'rooted_dirt']);
exact('TERRAIN:grass_block', 'H', 'L', '土壤', '草方块', 'grass_block', ['grass_block']);
exact('TERRAIN:mycelium', 'H', 'L', '土壤', '菌丝体', 'mycelium', ['mycelium']);
exact('TERRAIN:podzol', 'H', 'L', '土壤', '灰化土', 'podzol', ['podzol']);
exact('TERRAIN:mud', 'H', 'L', '土壤', '泥', 'mud', ['mud', 'muddy_mangrove_roots']);
exact('TERRAIN:stone', 'H', 'R', '石地形', '石头/圆石', 'stone', ['stone', 'cobblestone', 'mossy_cobblestone']);
exact('TERRAIN:smooth_stone', 'H', 'R', '石地形', '平滑石头', 'smooth_stone', ['smooth_stone']);
exact('TERRAIN:deepslate', 'H', 'R', '石地形', '深板岩', 'deepslate', ['deepslate', 'cobbled_deepslate']);
exact('TERRAIN:moss', 'H', 'L', '土壤', '苔藓', 'moss_block', ['moss_block', 'moss_carpet', 'pale_moss_block', 'pale_moss_carpet']);
exact('TERRAIN:clay', 'H', 'L', '土壤', '黏土', 'clay', ['clay']);
exact('TERRAIN:gravel', 'H', 'L', '土壤', '沙砾', 'gravel', ['gravel', 'suspicious_gravel']);
exact('TERRAIN:sand', 'H', 'L', '土壤', '沙子', 'sand', ['sand', 'suspicious_sand']);
exact('TERRAIN:red_sand', 'H', 'L', '土壤', '红沙', 'red_sand', ['red_sand']);
exact('TERRAIN:snow', 'H', 'L', '冰雪', '雪', 'snow_block', ['snow', 'snow_block', 'snowball', 'powder_snow']);
exact('TERRAIN:ice', 'H', 'L', '冰雪', '冰', 'ice', ['ice', 'packed_ice', 'blue_ice']);
exact('TERRAIN:dripstone', 'H', 'R', '石地形', '滴水石', 'dripstone_block', ['dripstone_block', 'pointed_dripstone']);
exact('TERRAIN:andesite', 'H', 'R', '石地形', '安山岩', 'andesite', ['andesite']);
exact('TERRAIN:diorite', 'H', 'R', '石地形', '闪长岩', 'diorite', ['diorite']);
exact('TERRAIN:granite', 'H', 'R', '石地形', '花岗岩', 'granite', ['granite']);
exact('TERRAIN:tuff', 'H', 'R', '石地形', '凝灰岩', 'tuff', ['tuff']);
exact('TERRAIN:calcite', 'H', 'R', '石地形', '方解石', 'calcite', ['calcite']);
exact('TERRAIN:basalt', 'H', 'R', '下界地形', '玄武岩', 'basalt', ['basalt']);
exact('TERRAIN:blackstone', 'H', 'R', '下界地形', '黑石', 'blackstone', ['blackstone']);
exact('TERRAIN:netherrack', 'H', 'R', '下界地形', '下界岩', 'netherrack', ['netherrack']);
exact('TERRAIN:nylium', 'H', 'R', '下界地形', '菌岩', 'crimson_nylium', ['crimson_nylium', 'warped_nylium']);
exact('TERRAIN:soul', 'H', 'R', '下界地形', '灵魂沙/土', 'soul_sand', ['soul_sand', 'soul_soil']);
exact('TERRAIN:end_stone', 'H', 'R', '末地地形', '末地石', 'end_stone', ['end_stone']);
exact('TERRAIN:obsidian', 'H', 'R', '末地地形', '黑曜石', 'obsidian', ['obsidian', 'crying_obsidian']);
exact('TERRAIN:sponge', 'H', 'L', '地形', '海绵', 'sponge', ['sponge', 'wet_sponge']);
exact('TERRAIN:sulfur', 'H', 'R', '地形', '硫黄', 'sulfur', ['sulfur', 'potent_sulfur', 'sulfur_spike']);
exact('TERRAIN:cinnabar', 'H', 'R', '地形', '朱砂', 'cinnabar', ['cinnabar']);
exact('TERRAIN:wart_block', 'H', 'R', '下界地形', '疣块', 'nether_wart_block', ['nether_wart_block', 'warped_wart_block']);

// ---------- H-L 建材：基础方块独立 + 变体 groupby ----------
// 基础方块：一件一格；海晶灯并入 H-R 光源段。
exact('BUILD:base_bricks', 'H', 'L', '基础方块', '红砖块', 'bricks', ['bricks']);
exact('BUILD:base_packed_mud', 'H', 'L', '基础方块', '压实泥', 'packed_mud', ['packed_mud']);
exact('BUILD:base_sandstone', 'H', 'L', '基础方块', '砂岩', 'sandstone', ['sandstone']);
exact('BUILD:base_red_sandstone', 'H', 'L', '基础方块', '红砂岩', 'red_sandstone', ['red_sandstone']);
exact('BUILD:base_nether_bricks', 'H', 'L', '基础方块', '下界砖块', 'nether_bricks', ['nether_bricks']);
exact('BUILD:base_red_nether_bricks', 'H', 'L', '基础方块', '红色下界砖块', 'red_nether_bricks', ['red_nether_bricks']);
exact('BUILD:base_prismarine', 'H', 'L', '基础方块', '海晶石', 'prismarine', ['prismarine']);
exact('BUILD:base_dark_prismarine', 'H', 'L', '基础方块', '暗海晶石', 'dark_prismarine', ['dark_prismarine']);
exact('BUILD:base_sea_lantern', 'H', 'R', '光源', '海晶灯', 'sea_lantern', ['sea_lantern']);
exact('BUILD:base_purpur', 'H', 'L', '基础方块', '紫珀块', 'purpur_block', ['purpur_block']);
exact('BUILD:base_resin', 'H', 'L', '基础方块', '树脂块', 'resin_block', ['resin_block']);
exact('BUILD:base_gilded_blackstone', 'H', 'L', '基础方块', '镶金黑石', 'gilded_blackstone', ['gilded_blackstone']);

// 磨制 10 件：v3 拆单，紧跟各自然方块（build 内插入石系顺序）。
exact('STONE:polished_deepslate', 'H', 'R', '石地形', '磨制深板岩', 'polished_deepslate', ['polished_deepslate']);
exact('STONE:polished_andesite', 'H', 'R', '石地形', '磨制安山岩', 'polished_andesite', ['polished_andesite']);
exact('STONE:polished_diorite', 'H', 'R', '石地形', '磨制闪长岩', 'polished_diorite', ['polished_diorite']);
exact('STONE:polished_granite', 'H', 'R', '石地形', '磨制花岗岩', 'polished_granite', ['polished_granite']);
exact('STONE:polished_tuff', 'H', 'R', '石地形', '磨制凝灰岩', 'polished_tuff', ['polished_tuff']);
exact('STONE:polished_basalt', 'H', 'R', '下界地形', '磨制玄武岩', 'polished_basalt', ['polished_basalt']);
exact('STONE:polished_blackstone', 'H', 'R', '下界地形', '磨制黑石', 'polished_blackstone', ['polished_blackstone']);
exact('STONE:polished_blackstone_bricks', 'H', 'R', '下界地形', '磨制黑石砖', 'polished_blackstone_bricks', ['polished_blackstone_bricks']);
exact('STONE:polished_sulfur', 'H', 'R', '地形', '磨制硫黄', 'polished_sulfur', ['polished_sulfur']);
exact('STONE:polished_cinnabar', 'H', 'R', '地形', '磨制朱砂', 'polished_cinnabar', ['polished_cinnabar']);

// 变体按类型跨材质合并；磨制已拆单融入石系，苔石砖/竹马赛克并入砖格。
pattern('BUILD:v_tile', 'H', 'L', '建材变体', '瓦', 'deepslate_tiles', /_tiles$/);
pattern('BUILD:v_stairs', 'H', 'L', '建材变体', '楼梯', 'stone_stairs', /_stairs$/);
pattern('BUILD:v_slab', 'H', 'L', '建材变体', '台阶', 'stone_slab', /_slab$/);
pattern('BUILD:v_chiseled', 'H', 'L', '建材变体', '雕纹', 'chiseled_stone_bricks', /^chiseled_/);
pattern('BUILD:v_cut', 'H', 'L', '建材变体', '切制', 'cut_sandstone', /^cut_/);
pattern('BUILD:v_smooth', 'H', 'L', '建材变体', '平滑', 'smooth_stone', /^smooth_/);
pattern('BUILD:v_cracked', 'H', 'L', '建材变体', '裂纹', 'cracked_stone_bricks', /^cracked_/);
pattern('BUILD:v_pillar', 'H', 'L', '建材变体', '柱', 'quartz_pillar', /_pillar$/);
pattern('BUILD:v_infested', 'H', 'L', '建材变体', '蛀蚀', 'infested_stone', /^infested_/);
pattern('BUILD:v_brick', 'H', 'L', '建材变体', '砖', 'stone_bricks', /_bricks?$/, ['mossy_stone_bricks', 'bamboo_mosaic']);
// 告示牌/展示架：原按树种的收纳删除，统一进通用格。
pattern('BUILD:v_sign', 'H', 'R', '木构件', '告示牌（含悬挂式）', 'oak_sign', /_sign$/);
pattern('BUILD:v_shelf', 'H', 'R', '木构件', '展示架', 'oak_shelf', /_shelf$/);

// 船/门/活板门：只收木材；铁/铜门与活板门已被 BUILD:copper/BUILD:iron 先匹配。
pattern('WOODWORK:boat_door', 'H', 'R', '木构件', '船/门/活板门', 'oak_boat', /(_boat|_raft|_door|_trapdoor)$/);

module.exports = { UNITS, EXCLUDED, COLOR_NAMES };
