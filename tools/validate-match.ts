import { loadItemSorterPoints } from '../../warehouse-bot/src/plugins/itemsorter/points.ts';
import { matchItem } from '../../warehouse-bot/src/plugins/itemsorter/match.ts';

const file = 'C:/Projects/blacktower/warehouse-partition/data/points/itemsorter-points.json';
const loaded = loadItemSorterPoints(file, 'C:/');

function makeItem(name: string, type: number, components: Array<{ type: string; data?: unknown }> = []) {
  const componentMap = new Map(components.map(c => [c.type, c]));
  return {
    name, type, count: 1, components, removedComponents: [], componentMap, nbt: null,
  } as any;
}

const registry = {
  enchantments: {
    10: { id: 10, name: 'mending' },
    34: { id: 34, name: 'unbreaking' },
    22: { id: 22, name: 'lunge' },
  },
  effects: {
    0: { id: 0, name: 'Speed' },
    1: { id: 1, name: 'Slowness' },
  },
};
const ctx = { registry };

function find(part: string) {
  const r = loaded.rules.find(x => (x as any).displayName?.includes(part));
  if (!r) throw new Error('rule not found: ' + part);
  return r;
}

const checks: Array<[string, boolean, boolean]> = [];
function check(label: string, actual: boolean, expected: boolean) {
  checks.push([label, actual, expected]);
}

const coal = find('coal');
check('coal name', matchItem(makeItem('coal', 1), coal.match, ctx), true);
check('iron is not coal', matchItem(makeItem('iron_ingot', 1), coal.match, ctx), false);

const mending = find('mending=1');
const book1 = makeItem('enchanted_book', 1, [
  { type: 'stored_enchantments', data: { enchantments: [{ id: 10, level: 1 }] } },
]);
const book2 = makeItem('enchanted_book', 1, [
  { type: 'stored_enchantments', data: { enchantments: [{ id: 10, level: 2 }] } },
]);
check('book mending 1', matchItem(book1, mending.match, ctx), true);
check('book mending 2 vs rule 1', matchItem(book2, mending.match, ctx), false);

const unbreaking3 = find('unbreaking=3');
const bookU3 = makeItem('enchanted_book', 1, [
  { type: 'stored_enchantments', data: { enchantments: [{ id: 34, level: 3 }] } },
]);
check('book unbreaking 3', matchItem(bookU3, unbreaking3.match, ctx), true);

const speed = loaded.rules.find(r => r.match.name === 'potion' && Array.isArray(r.match.effects) && r.match.effects.includes(0));
if (!speed) throw new Error('potion speed rule not found');
const potionSpeed = makeItem('potion', 1, [
  { type: 'potion_contents', data: { customEffects: [{ id: 0 }] } },
]);
check('potion custom speed', matchItem(potionSpeed, speed.match, ctx), true);
const potionSlow = makeItem('potion', 1, [
  { type: 'potion_contents', data: { customEffects: [{ id: 1 }] } },
]);
check('potion custom slow vs speed', matchItem(potionSlow, speed.match, ctx), false);

const genericPotionRules = loaded.rules.filter(r => r.match.name === 'potion' && !r.match.effects);
check('no generic potion fallback', genericPotionRules.length === 0, true);
check('plain potion has no fallback', loaded.rules.some(r => matchItem(makeItem('potion', 1), r.match, ctx)), false);

const tippedSpeed = loaded.rules.find(r => r.match.name === 'tipped_arrow' && Array.isArray(r.match.effects) && r.match.effects.includes(0));
if (!tippedSpeed) throw new Error('tipped arrow speed rule not found');
const tippedArrowSpeed = makeItem('tipped_arrow', 1, [
  { type: 'potion_contents', data: { customEffects: [{ id: 0 }] } },
]);
check('tipped arrow speed -> effect unit', matchItem(tippedArrowSpeed, tippedSpeed.match, ctx), true);
const plainArrowMatched = loaded.rules.some(r => matchItem(makeItem('tipped_arrow', 1), r.match, ctx));
check('plain tipped arrow has no fallback', plainArrowMatched, false);

let failed = 0;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}: ${actual} (expected ${expected})`);
}
if (failed) process.exit(1);
console.log('all matching smoke checks passed');
