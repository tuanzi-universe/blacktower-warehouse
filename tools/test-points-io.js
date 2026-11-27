'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const XLSX = require('../viewer/assets/xlsx.full.min.js');
const PointsIO = require('../viewer/assets/points-io.js');

const ROOT = path.resolve(__dirname, '..');
const htmlData = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'template', 'html-data.json'), 'utf8'));
const IO = PointsIO.create({
  slots: htmlData.slots.map(s => ({
    area: s[0], side: s[1], slot: s[2], x: s[5], y: s[6], z: s[7], yaw: s[8], pitch: s[9],
  })),
  itemCn: htmlData.itemCn,
  areas: htmlData.areas,
  defaultBlacklist: [{ name: 'minecraft:wooden_hoe' }],
});

const AREAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
let passed = 0;

function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name);
    throw e;
  }
}

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
}

function unitKey(p) {
  return [p.x, p.y, p.z, p.yaw, p.pitch].join('|');
}

function unitMatchSets(data) {
  const m = new Map();
  for (const r of data.items) {
    const k = unitKey(r.point);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(JSON.stringify(r.match));
  }
  for (const [k, arr] of m) m.set(k, arr.sort());
  return m;
}

function normalizeSpecial(data) {
  const n = IO.normalize(data);
  const out = {};
  for (const k of ['home', 'trash', 'base', 'minecart', 'button', 'ready', 'readyButton']) {
    if (n[k]) out[k] = n[k];
  }
  return out;
}

function blacklistOf(data) {
  return IO.normalize(data).blacklist;
}

function workbookBuffer(wb) {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function roundTrip(name, file) {
  console.log('\n[' + name + ']');
  const data = load(file);
  const v = IO.validate(data);
  ok('validate has no errors', () => assert.strictEqual(v.errors.length, 0, JSON.stringify(v.errors.slice(0, 5), null, 2)));
  console.log(`  stats: rules=${v.stats.rules} units=${v.stats.units} occupied=${v.stats.occupied} blacklist=${v.stats.blacklist} warnings=${v.warnings.length}`);
  if (v.warnings.length) console.log('  warnings: ' + v.warnings.slice(0, 8).map(w => w.path + ' ' + w.message).join('\n            '));

  ok('JSON export starts with {', () => {
    const text = IO.buildJson(data);
    assert.strictEqual(text.charCodeAt(0), 0x7B);
  });

  const jsonText = IO.buildJson(data);
  const jp = IO.parseJson(jsonText);
  ok('JSON round-trip no errors', () => assert.strictEqual(jp.errors.length, 0, JSON.stringify(jp.errors.slice(0, 5), null, 2)));
  ok('JSON round-trip same stats', () => {
    assert.strictEqual(jp.stats.rules, v.stats.rules);
    assert.strictEqual(jp.stats.units, v.stats.units);
    assert.strictEqual(jp.stats.occupied, v.stats.occupied);
    assert.strictEqual(jp.stats.blacklist, v.stats.blacklist);
  });
  ok('JSON round-trip same unit matches', () => {
    assert.deepStrictEqual([...unitMatchSets(jp.data).entries()].sort(), [...unitMatchSets(data).entries()].sort());
  });
  ok('JSON round-trip same special points', () => {
    assert.deepStrictEqual(normalizeSpecial(jp.data), normalizeSpecial(data));
  });
  ok('JSON round-trip same blacklist', () => {
    assert.deepStrictEqual(blacklistOf(jp.data), blacklistOf(data));
  });

  const wb = IO.buildWorkbook(data, { version: name, versionName: name, source: 'test', exportedAt: '2026-11-20 00:00:00' }, XLSX);
  ok('sheet names', () => {
    assert.deepStrictEqual(wb.SheetNames, ['汇总', '黑名单', ...AREAS, '规则明细']);
  });
  ok('partition sheets have 111 rows', () => {
    for (const a of AREAS) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[a], { header: 1 });
      assert.strictEqual(rows.length, 111, `${a}: ${rows.length}`);
      assert.strictEqual(rows[0][0], '区');
      assert.strictEqual(rows[0][9], '规则(JSON)');
    }
  });
  ok('blacklist sheet has note + header + entries', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['黑名单'], { header: 1 });
    assert.strictEqual(rows.length, 2 + blacklistOf(data).length, String(rows.length));
    assert.strictEqual(rows[1][1], '物品ID');
  });
  ok('detail sheet has note + header + rules', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['规则明细'], { header: 1 });
    assert.strictEqual(rows.length, data.items.length + 2, String(rows.length));
  });

  const buf = workbookBuffer(wb);
  const xp = IO.parseWorkbook(buf, XLSX, { type: 'buffer' });
  ok('Excel round-trip no errors', () => assert.strictEqual(xp.errors.length, 0, JSON.stringify(xp.errors.slice(0, 8), null, 2)));
  console.log(`  Excel warnings: ${xp.warnings.length}`);
  if (xp.warnings.length) console.log('  ' + xp.warnings.slice(0, 10).map(w => w.path + ' ' + w.message).join('\n  '));
  ok('Excel round-trip same stats', () => {
    assert.strictEqual(xp.stats.rules, v.stats.rules);
    assert.strictEqual(xp.stats.units, v.stats.units);
    assert.strictEqual(xp.stats.occupied, v.stats.occupied);
    assert.strictEqual(xp.stats.blacklist, v.stats.blacklist);
  });
  ok('Excel round-trip same unit matches', () => {
    assert.deepStrictEqual([...unitMatchSets(xp.data).entries()].sort(), [...unitMatchSets(data).entries()].sort());
  });
  ok('Excel round-trip same special points', () => {
    assert.deepStrictEqual(normalizeSpecial(xp.data), normalizeSpecial(data));
  });
  ok('Excel round-trip same blacklist', () => {
    assert.deepStrictEqual(blacklistOf(xp.data), blacklistOf(data));
  });
  ok('Excel round-trip same unit first-occurrence order', () => {
    const seq = d => {
      const seen = new Set(), out = [];
      for (const r of d.items) {
        const k = unitKey(r.point);
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
      return out;
    };
    assert.deepStrictEqual(seq(xp.data), seq(data));
  });
  ok('Excel round-trip same rule order inside each unit', () => {
    const lists = d => {
      const m = new Map();
      for (const r of d.items) {
        const k = unitKey(r.point);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(JSON.stringify(r.match));
      }
      return [...m.entries()].sort();
    };
    assert.deepStrictEqual(lists(xp.data), lists(data));
  });

  return { data, v };
}

function expectError(label, result, needle) {
  ok(label, () => {
    assert.ok(result.errors.length > 0, 'expected errors');
    if (needle) assert.ok(result.errors.some(e => (e.path + ' ' + e.message).includes(needle)),
      `missing "${needle}" in ${JSON.stringify(result.errors.slice(0, 5), null, 2)}`);
  });
}

function mutatedWorkbook(data, fn) {
  const wb = IO.buildWorkbook(data, { version: 'v2', versionName: 'v2', source: 'test', exportedAt: '' }, XLSX);
  fn(wb);
  return workbookBuffer(wb);
}

function editSheet(wb, name, fn) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  fn(rows);
  wb.Sheets[name] = XLSX.utils.aoa_to_sheet(rows);
}

function main() {
  const v2 = roundTrip('v2', 'data/points/itemsorter-points-v2.json');
  roundTrip('v1', 'data/points/itemsorter-points-v1.json');
  roundTrip('v3', 'data/points/itemsorter-points-v3.json');

  console.log('\n[extras]');
  const base = v2.data;
  const meta = { version: 'v2', versionName: 'v2', source: 'test', exportedAt: '' };

  {
    const d = JSON.parse(JSON.stringify(base));
    d.items[0].weight = 5;
    const p = IO.parseWorkbook(workbookBuffer(IO.buildWorkbook(d, meta, XLSX)), XLSX, { type: 'buffer' });
    ok('weight preserved', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      const r = p.data.items.find(x => x.match.enchantments && x.match.enchantments.mending === 1);
      assert.strictEqual(r.weight, 5);
    });
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.home = { x: 5210.5, y: 115, z: -37740.5, yaw: 0, pitch: 0, label: '家', area: 'X', side: 'L' };
    const p = IO.parseWorkbook(workbookBuffer(IO.buildWorkbook(d, meta, XLSX)), XLSX, { type: 'buffer' });
    ok('home preserved', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      assert.deepStrictEqual(p.data.home, d.home);
    });
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    delete d.ready.yaw;
    delete d.ready.pitch;
    const p = IO.parseWorkbook(workbookBuffer(IO.buildWorkbook(d, meta, XLSX)), XLSX, { type: 'buffer' });
    ok('ready optional yaw/pitch', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      assert.ok(!('yaw' in p.data.ready));
      assert.ok(!('pitch' in p.data.ready));
    });
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    const first = d.items[0];
    const cx = first.point.x + 0.25;
    first.point = { ...first.point, x: cx, label: '自定义测试' };
    const wb = IO.buildWorkbook(d, meta, XLSX);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.D, { header: 1 });
    const row = rows.find(r => r[4] === '自定义测试');
    ok('custom point exported as custom row', () => {
      assert.ok(row);
      assert.strictEqual(row[3], '');
      assert.ok(row[10].includes('"x"'));
    });
    const p = IO.parseWorkbook(workbookBuffer(wb), XLSX, { type: 'buffer' });
    ok('custom point round-trip', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      const r = p.data.items.find(x => x.point.label === '自定义测试');
      assert.strictEqual(r.point.x, cx);
    });
  }
  {
    const buf = mutatedWorkbook(base, wb => {
      editSheet(wb, 'D', rows => {
        // D-L #1 已有格位，再填自定义点位应报错
        assert.strictEqual(rows[1][3], 1);
        rows[1][10] = '{"x":1,"y":2,"z":3,"yaw":0,"pitch":0}';
      });
    });
    expectError('slot + custom both filled', IO.parseWorkbook(buf, XLSX, { type: 'buffer' }), '只能填写一个');
  }

  console.log('\n[blacklist]');
  {
    const d = JSON.parse(JSON.stringify(base));
    delete d.blacklist;
    ok('missing blacklist gets default', () => {
      assert.deepStrictEqual(IO.applyDefaults(d).blacklist, [{ name: 'minecraft:wooden_hoe' }]);
    });
    ok('explicit empty blacklist stays empty', () => {
      assert.deepStrictEqual(IO.applyDefaults({ ...d, blacklist: [] }).blacklist, []);
    });
    const p = IO.parseJson(JSON.stringify(d));
    ok('JSON import applies default blacklist', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      assert.deepStrictEqual(p.data.blacklist, [{ name: 'minecraft:wooden_hoe' }]);
    });
  }
  {
    const line = IO.parseBlacklistText('wooden_hoe\nminecraft:stone');
    ok('text blacklist line mode', () => {
      assert.strictEqual(line.errors.length, 0, JSON.stringify(line.errors, null, 2));
      assert.deepStrictEqual(line.blacklist, [
        { name: 'minecraft:wooden_hoe' },
        { name: 'minecraft:stone' },
      ]);
    });
    const json = IO.parseBlacklistText('[{"nameRegex":"^minecraft:.*_shulker_box$"}]');
    ok('text blacklist JSON mode', () => {
      assert.strictEqual(json.errors.length, 0, JSON.stringify(json.errors, null, 2));
      assert.deepStrictEqual(json.blacklist, [{ nameRegex: '^minecraft:.*_shulker_box$' }]);
    });
    const bad = IO.parseBlacklistText('[{"name":"","nameRegex":"["}]');
    expectError('text blacklist rejects invalid match', bad, 'name');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    delete d.trash;
    expectError('blacklist requires trash', IO.validate(d), 'blacklist');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.blacklist = [{ name: 'minecraft:wooden_hoe' }, { nameRegex: '^minecraft:.*_shulker_box$' }];
    const wb = IO.buildWorkbook(d, meta, XLSX);
    ok('blacklist Excel sheet entries', () => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['黑名单'], { header: 1 });
      assert.strictEqual(rows.length, 4, String(rows.length));
      assert.strictEqual(rows[2][1], 'minecraft:wooden_hoe');
      assert.strictEqual(rows[3][2], '^minecraft:.*_shulker_box$');
    });
    const p = IO.parseWorkbook(workbookBuffer(wb), XLSX, { type: 'buffer' });
    ok('blacklist Excel round-trip', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      assert.deepStrictEqual(blacklistOf(p.data), blacklistOf(d));
    });
  }
  {
    const wb = IO.buildWorkbook(base, meta, XLSX);
    delete wb.Sheets['黑名单'];
    wb.SheetNames = wb.SheetNames.filter(n => n !== '黑名单');
    const p = IO.parseWorkbook(workbookBuffer(wb), XLSX, { type: 'buffer' });
    ok('Excel without blacklist sheet applies default', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      assert.deepStrictEqual(blacklistOf(p.data), [{ name: 'minecraft:wooden_hoe' }]);
    });
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.blacklist = [];
    const p = IO.parseWorkbook(workbookBuffer(IO.buildWorkbook(d, meta, XLSX)), XLSX, { type: 'buffer' });
    ok('Excel empty blacklist sheet means empty', () => {
      assert.strictEqual(p.errors.length, 0, JSON.stringify(p.errors.slice(0, 3), null, 2));
      assert.deepStrictEqual(blacklistOf(p.data), []);
    });
  }
  {
    const buf = mutatedWorkbook(base, wb => {
      editSheet(wb, '黑名单', rows => { rows[2][1] = ''; });
    });
    expectError('blacklist row without match', IO.parseWorkbook(buf, XLSX, { type: 'buffer' }), '黑名单');
  }

  console.log('\n[error cases]');

  {
    const d = JSON.parse(JSON.stringify(base));
    delete d.collector;
    expectError('missing base', IO.validate(d), 'base');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.version = 1;
    expectError('unknown root field', IO.validate(d), 'version');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.items[0].match = { nameRegex: '[' };
    expectError('bad regex', IO.validate(d), '正则');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.items.push(JSON.parse(JSON.stringify(d.items[0])));
    expectError('duplicate match', IO.validate(d), '重复');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    d.items[0].point.x += 0.25;
    const v = IO.validate(d);
    ok('point not on slot is warning', () => {
      assert.strictEqual(v.errors.length, 0);
      assert.ok(v.warnings.some(w => w.message.includes('880')));
    });
  }

  {
    const buf = mutatedWorkbook(base, wb => {
      editSheet(wb, 'A', rows => {
        // A-L #1 与 #2 是已占用单元，把 #2 的格位改成 1
        assert.strictEqual(rows[2][3], 2);
        rows[2][3] = 1;
      });
    });
    expectError('duplicate slot', IO.parseWorkbook(buf, XLSX, { type: 'buffer' }), '格位');
  }
  {
    const buf = mutatedWorkbook(base, wb => {
      editSheet(wb, 'A', rows => { rows[1][9] = '{bad'; });
    });
    expectError('bad rules json', IO.parseWorkbook(buf, XLSX, { type: 'buffer' }), '规则(JSON)');
  }
  {
    const buf = mutatedWorkbook(base, wb => {
      delete wb.Sheets.B;
      wb.SheetNames = wb.SheetNames.filter(n => n !== 'B');
    });
    expectError('missing sheet', IO.parseWorkbook(buf, XLSX, { type: 'buffer' }), 'B');
  }
  {
    const d = JSON.parse(JSON.stringify(base));
    delete d.button;
    const v = IO.validate(d);
    ok('missing button is warning', () => {
      assert.strictEqual(v.errors.length, 0);
      assert.ok(v.warnings.some(w => w.path === 'button'));
    });
  }

  console.log(`\n${passed} checks passed`);
}

main();
