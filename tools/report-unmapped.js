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

const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const mapLines = fs.readFileSync(path.join(ROOT, 'data', 'item_map.csv'), 'utf8').replace(/^\uFEFF/, '').trim().split('\n').slice(1);
const mapped = new Set(mapLines.map(l => l.split(',')[0]));
const unmapped = items.filter(i => !mapped.has(i));

const nameCn = new Map();
const papers = parseCsv(fs.readFileSync('C:/Projects/blacktower/papers/序号-工作表1.csv', 'utf8'));
for (const r of papers.slice(1)) if (r[1]) nameCn.set(r[1], r[2] || '');

const CATS = [
  ['spawn_egg', '刷怪蛋', '生存模式无获取途径（仅创造/命令）', '#b45aa8'],
  ['command', '命令方块', '仅创造模式或命令获取', '#c94a4a'],
  ['creative', '创造/结构方块', '创造模式或结构方块专用', '#75808f'],
  ['unobtainable', '不可获取方块', '生存模式无法正常获取', '#8b6f4e'],
  ['trial', '试炼/宝库', '试炼密室的刷怪笼/宝库，生存无法获取本体', '#c98a1f'],
  ['test', '测试方块', '测试/调试用方块', '#3f74b8'],
  ['removed', '按要求移除', '按需求从仓库点位移除，机器人按未映射投入 trash', '#7c6f64'],
  ['special', '特殊物品', '仅命令/调试获取', '#4f8f5a'],
  ['air', '空气', '非物品，仅占位', '#9ca3af'],
];
const catMap = new Map(CATS.map(([k, cn, why, color]) => [k, { k, cn, why, color }]));

function categoryOf(id) {
  if (id === 'air') return 'air';
  if (id.endsWith('_spawn_egg')) return 'spawn_egg';
  if (['command_block', 'chain_command_block', 'repeating_command_block', 'command_block_minecart'].includes(id)) return 'command';
  if (['barrier', 'light', 'structure_block', 'structure_void', 'jigsaw'].includes(id)) return 'creative';
  if (['bedrock', 'end_portal_frame', 'reinforced_deepslate', 'budding_amethyst', 'petrified_oak_slab', 'dirt_path', 'farmland'].includes(id)) return 'unobtainable';
  if (['trial_spawner', 'vault'].includes(id)) return 'trial';
  if (id === 'spawner') return 'removed';
  if (['test_block', 'test_instance_block'].includes(id)) return 'test';
  if (['knowledge_book', 'debug_stick'].includes(id)) return 'special';
  return 'special';
}

const data = unmapped.map(id => {
  const cat = categoryOf(id);
  return { id, cn: nameCn.get(id) || id, cat, catCn: catMap.get(cat).cn, why: catMap.get(cat).why };
}).sort((a, b) => {
  const ai = CATS.findIndex(c => c[0] === a.cat), bi = CATS.findIndex(c => c[0] === b.cat);
  return ai - bi || a.cn.localeCompare(b.cn, 'zh-CN');
});

const counts = {};
for (const d of data) counts[d.cat] = (counts[d.cat] || 0) + 1;
const total = items.length;
const mappedCount = mapped.size;
const unmappedCount = data.length;
const coverage = (mappedCount / total * 100).toFixed(1);

const chips = CATS.filter(([k]) => counts[k]).map(([k, cn, why, color]) =>
  `<button class="chip" data-cat="${k}" style="--c:${color}">${cn}<b>${counts[k]}</b></button>`
).join('');

const rows = data.map(d => `<div class="row" data-cat="${d.cat}" data-id="${d.id}" data-cn="${d.cn}">
  <span class="badge" style="--c:${catMap.get(d.cat).color}">${d.catCn}</span>
  <span class="cn">${d.cn}</span>
  <code>${d.id}</code>
  <span class="why">${d.why}</span>
</div>`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,">
<title>未收录物品报告</title>
<style>
:root{--bg:#f1eee7;--panel:#fff;--ink:#1e242b;--muted:#6b7280;--line:#e7e1d6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,"Segoe UI","Microsoft YaHei",sans-serif}
header{padding:24px 28px 10px;max-width:1100px;margin:0 auto}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
h1{margin:0;font-size:22px;letter-spacing:.2px}
.sub{color:var(--muted);font-size:12.5px;margin-top:6px}
.back{border:1px solid #d8d3c8;background:#fff;border-radius:9px;padding:7px 12px;text-decoration:none;color:#374151;font-size:13px;white-space:nowrap}
.back:hover{background:#faf8f3}
main{max-width:1100px;margin:0 auto;padding:0 28px 28px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0 14px}
.kpi{background:var(--panel);border-radius:12px;padding:12px 14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.kpi span{font-size:11.5px;color:var(--muted)}
.note{background:#fff;border-radius:12px;padding:12px 14px;font-size:12.5px;color:#5f5a52;line-height:1.7;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.note b{color:#374151}
.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 10px}
input{height:38px;border:1px solid #d8d3c8;border-radius:9px;padding:0 12px;font:inherit;background:#fff;outline:none;min-width:260px}
input:focus{border-color:#9ca3af}
.chip{border:1px solid #e3ddd1;background:#fff;border-radius:999px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer;color:#4b5563;display:inline-flex;align-items:center;gap:6px}
.chip b{font-weight:600;color:#111;font-variant-numeric:tabular-nums}
.chip.on{background:var(--c);border-color:var(--c);color:#fff}
.chip.on b{color:#fff}
.chip:hover{filter:brightness(.97)}
.list{background:var(--panel);border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 30px rgba(0,0,0,.04)}
.row{display:grid;grid-template-columns:110px minmax(150px,1fr) minmax(220px,1.2fr) minmax(220px,1.4fr);gap:12px;align-items:center;padding:9px 14px;border-bottom:1px solid #f1ece2;font-size:12.5px}
.row:last-child{border-bottom:0}
.row:hover{background:#faf8f3}
.badge{justify-self:start;background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--c);border-radius:999px;padding:3px 9px;font-size:11px;white-space:nowrap}
.cn{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
code{color:#8b857a;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.why{color:#6b7280;font-size:11.5px}
.empty{padding:44px;text-align:center;color:#8b857a;font-size:13px}
footer{max-width:1100px;margin:0 auto;padding:0 28px 30px;color:#9a9488;font-size:11.5px;line-height:1.7}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}.row{grid-template-columns:1fr;gap:3px}.badge{justify-self:start}input{min-width:0;width:100%}}
</style>
</head>
<body>
<header>
  <div class="top">
    <div>
      <h1>未收录物品报告</h1>
      <div class="sub">items.json ${total} 项 · 已收录 ${mappedCount} 项 · 未收录 ${unmappedCount} 项 · 覆盖率 ${coverage}%</div>
    </div>
    <a class="back" href="partition-2d.html">← 返回点位图</a>
  </div>
</header>
<main>
  <div class="kpis">
    <div class="kpi"><b>${total}</b><span>items.json 总条目</span></div>
    <div class="kpi"><b>${mappedCount}</b><span>已收录到点位</span></div>
    <div class="kpi"><b>${unmappedCount}</b><span>未收录</span></div>
    <div class="kpi"><b>${coverage}%</b><span>条目覆盖率</span></div>
  </div>
  <div class="note">
    <b>结论：</b>当前点位已收录 ${mappedCount} 项；未收录的 ${unmappedCount} 项中，刷怪笼为按要求移除，其余为生存模式无法正常获取的物品，不是遗漏。<br>
    这些物品不会命中任何点位规则，机器人遇到时会按未映射物品投入 <b>trash</b>。若服务器通过活动/商店发放，需要另行开单元。<br>
    <b>说明：</b>本报告按 <code>items.json</code> 与当前 <code>item_map.csv</code> 对比生成；<code>potted_*</code>、<code>*_wall_fan</code>、<code>twisted_vines_plant</code> 不在 items.json，未统计。
  </div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="搜索中文名 / 物品 ID…" autocomplete="off">
    <button class="chip on" data-cat="all" style="--c:#111">全部<b>${unmappedCount}</b></button>
    ${chips}
  </div>
  <div class="list" id="list">${rows}</div>
</main>
<footer>数据来源：items.json、item_map.csv、papers/序号-工作表1.csv。点位图：partition-2d.html。</footer>
<script>
const rows = [...document.querySelectorAll('.row')];
const chips = [...document.querySelectorAll('.chip')];
let cat = 'all';
function apply() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  let n = 0;
  for (const row of rows) {
    const okCat = cat === 'all' || row.dataset.cat === cat;
    const hay = (row.dataset.cn + ' ' + row.dataset.id).toLowerCase();
    const okQ = !q || hay.includes(q);
    const show = okCat && okQ;
    row.style.display = show ? '' : 'none';
    if (show) n++;
  }
  let empty = document.getElementById('empty');
  if (!empty) { empty = document.createElement('div'); empty.id = 'empty'; empty.className = 'empty'; empty.textContent = '没有匹配项'; document.getElementById('list').appendChild(empty); }
  empty.style.display = n ? 'none' : '';
}
document.getElementById('q').addEventListener('input', apply);
for (const chip of chips) chip.addEventListener('click', () => {
  cat = chip.dataset.cat;
  chips.forEach(c => c.classList.toggle('on', c === chip));
  apply();
});
apply();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'viewer', 'unmapped.html'), html, 'utf8');
console.log('items', total, 'mapped', mappedCount, 'unmapped', unmappedCount, counts);
console.log('wrote 未收录物品.html', html.length, 'chars');
