import { loadItemSorterPoints } from '../../warehouse-bot/src/plugins/itemsorter/points.ts';

const file = 'C:/Projects/blacktower/warehouse-partition/data/points/itemsorter-points.json';
const loaded = loadItemSorterPoints(file, 'C:/');
console.log('loaded rules:', loaded.rules.length);
console.log('blacklist:', loaded.blacklist.length, JSON.stringify(loaded.blacklist));
console.log('collector:', JSON.stringify(loaded.collector));
console.log('first rule:', JSON.stringify(loaded.rules[0]));
console.log('last rule:', JSON.stringify(loaded.rules[loaded.rules.length - 1]));
