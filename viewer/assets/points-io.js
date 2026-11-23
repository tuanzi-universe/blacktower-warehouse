/* points-io.js — itemsorter 点位 Excel / JSON 转换与校验
 * 浏览器：window.PointsIO；Node：module.exports
 * 纯数据逻辑，不依赖 DOM。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PointsIO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const AREAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const ROOT_KEYS = ['items', 'blacklist', 'home', 'trash', 'collector', 'minecart', 'button', 'ready', 'readyButton'];
  const RULE_KEYS = ['weight', 'match', 'point'];
  const MATCH_KEYS = ['name', 'nameRegex', 'enchantments', 'customName', 'customNameRegex', 'lore', 'loreRegex', 'potionId', 'effects'];
  const POINT_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'label', 'area', 'side'];
  const READY_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'label'];
  const BLOCK_KEYS = ['x', 'y', 'z', 'label'];
  const SPECIAL_ORDER = ['home', 'trash', 'collector', 'minecart', 'button', 'ready', 'readyButton'];
  const SPECIAL_NAMES = {
    home: '家', trash: '垃圾点', collector: '接收点', minecart: '矿车点',
    button: '领取按钮', ready: '准备点', readyButton: '准备按钮',
  };
  const SPECIAL_KIND = {
    home: 'point', trash: 'point', collector: 'point', minecart: 'point',
    button: 'block', ready: 'ready', readyButton: 'block',
  };
  const PART_HEADER = ['区', '顺序', '侧', '格位', '单元名', '类型', '代表物', '合并物品', '规则数', '规则(JSON)', '自定义点位(JSON)', '备注'];
  const DETAIL_HEADER = [
    '全局序号', '区', '侧', '格位', '单元名', '规则序号', '权重',
    '物品ID', '物品ID正则', '附魔(JSON)', '自定义名称', '自定义名称正则',
    'Lore', 'Lore正则', '药水ID', '效果(JSON)', 'x', 'y', 'z', 'yaw', 'pitch',
  ];
  const BLACKLIST_HEADER = [
    '序号', '物品ID', '物品ID正则', '附魔(JSON)', '自定义名称', '自定义名称正则',
    'Lore', 'Lore正则', '药水ID', '效果(JSON)', '备注',
  ];
  const MAX_CELL = 32000;       // Excel 单元格上限 32767，留余量
  const MAX_SHEET_ROWS = 5000;
  const MAX_TOTAL_ROWS = 20000;

  // ---------- 基础工具 ----------
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function numStr(v) { return String(Number(v)); }
  function pointKey(p) { return [numStr(p.x), numStr(p.y), numStr(p.z), numStr(p.yaw), numStr(p.pitch)].join('|'); }
  function xzKey(p) { return [numStr(p.x), numStr(p.z)].join('|'); }
  function text(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    if (v instanceof Date) return v.toISOString();
    return String(v).trim();
  }
  function toNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }
  function toInt(v) {
    const n = toNum(v);
    return Number.isInteger(n) ? n : null;
  }
  function canonical(v) {
    if (Array.isArray(v)) return v.map(canonical);
    if (isObject(v)) {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = canonical(v[k]);
      return o;
    }
    return v;
  }
  function matchKey(m) {
    const c = canonical(m);
    if (typeof c.name === 'string') c.name = c.name.replace(/^minecraft:/, '');
    return JSON.stringify(c);
  }
  function emptyStats() { return { rules: 0, units: 0, occupied: 0, blacklist: 0, byArea: {} }; }
  function cloneJson(v) { return JSON.parse(JSON.stringify(v)); }
  function firstNonEmpty(set) { for (const v of set) if (v) return v; return ''; }

  function itemIdOfMatch(m) {
    if (!m) return '';
    if (m.name) return String(m.name).replace(/^minecraft:/, '');
    if (m.enchantments) return 'enchanted_book';
    if (m.effects || m.potionId !== undefined) return 'potion';
    return '';
  }

  function create(opts) {
    opts = opts || {};
    const itemCn = opts.itemCn || {};
    const areaInfo = opts.areas || {};
    const slots = (opts.slots || []).map(s => ({
      area: String(s.area || ''), side: String(s.side || ''), slot: Number(s.slot),
      x: Number(s.x), y: Number(s.y), z: Number(s.z), yaw: Number(s.yaw), pitch: Number(s.pitch),
    }));
    const slotByKey = new Map();
    const slotByPoint = new Map();
    for (const s of slots) {
      slotByKey.set(`${s.area}-${s.side}-${s.slot}`, s);
      slotByPoint.set(pointKey(s), s);
    }
    const defaultBlacklist = Array.isArray(opts.defaultBlacklist) ? cloneJson(opts.defaultBlacklist) : null;

    function applyDefaults(data) {
      if (!isObject(data) || !defaultBlacklist) return data;
      if (!has(data, 'blacklist') || data.blacklist === undefined) {
        return { ...data, blacklist: cloneJson(defaultBlacklist) };
      }
      return data;
    }

    function cnOf(id) { return itemCn[id] || id; }
    function firstItemLabel(rules) {
      for (const r of rules) {
        const id = itemIdOfMatch(r.match);
        if (id) return cnOf(id);
      }
      return '未命名';
    }
    function unitType(rules, label) {
      if (rules.some(r => r.match.enchantments) || /^附魔/.test(label || '')) return '附魔书';
      if (rules.some(r => r.match.effects || r.match.potionId !== undefined) || /^药水/.test(label || '')) return '药水';
      return '物品';
    }

    // 点位按 x/y/z/yaw/pitch 分组；货位优先作为 area/side 的权威来源
    function analyze(data) {
      const groups = new Map();
      const items = data.items || [];
      items.forEach((rule, index) => {
        if (!isObject(rule) || !isObject(rule.point)) return;
        const k = pointKey(rule.point);
        if (!groups.has(k)) groups.set(k, { key: k, point: rule.point, rules: [], firstIndex: index });
        groups.get(k).rules.push({ rule, index });
      });
      const units = [...groups.values()].map(g => {
        const s = slotByPoint.get(g.key) || null;
        const area = s ? s.area : (g.point.area || '');
        const side = s ? s.side : (g.point.side || '');
        const label = g.point.label || firstItemLabel(g.rules.map(x => x.rule)) || '未命名';
        const ids = [...new Set(g.rules.map(x => itemIdOfMatch(x.rule.match)).filter(Boolean))];
        return {
          ...g, slot: s, area, side, label,
          type: unitType(g.rules.map(x => x.rule), label),
          itemIds: ids,
        };
      });
      units.sort((a, b) => a.firstIndex - b.firstIndex);
      return { units, byKey: new Map(units.map(u => [u.key, u])) };
    }

    function statsOf(data) {
      const { units } = analyze(data);
      const byArea = {};
      let occupied = 0;
      for (const u of units) {
        const area = u.area || '未分区';
        const a = byArea[area] || (byArea[area] = { area, units: 0, l: 0, r: 0, occupied: 0, rules: 0 });
        a.units++;
        if (u.side === 'L') a.l++;
        else if (u.side === 'R') a.r++;
        if (u.slot) { a.occupied++; occupied++; }
        a.rules += u.rules.length;
      }
      return {
        rules: (data.items || []).length, units: units.length, occupied,
        blacklist: Array.isArray(data.blacklist) ? data.blacklist.length : 0,
        byArea,
      };
    }

    // ---------- 校验 ----------
    function validate(data) {
      const errors = [];
      const warnings = [];
      const err = (path, message) => errors.push({ path, message });
      const warn = (path, message) => warnings.push({ path, message });
      const done = () => ({ errors, warnings, stats: emptyStats() });

      if (!isObject(data)) {
        err('', '根节点必须是 object');
        return done();
      }
      for (const k of Object.keys(data)) if (!ROOT_KEYS.includes(k)) err(k, `未知根字段 "${k}"`);

      let items = [];
      if (has(data, 'items')) {
        if (!Array.isArray(data.items)) err('items', 'items 必须是数组');
        else items = data.items;
      }
      if (!items.length) warn('items', 'items 为空');

      let blacklist = [];
      if (has(data, 'blacklist')) {
        if (!Array.isArray(data.blacklist)) err('blacklist', 'blacklist 必须是数组');
        else {
          blacklist = data.blacklist;
          const seen = new Map();
          blacklist.forEach((m, i) => {
            const path = `blacklist[${i}]`;
            if (!isObject(m)) { err(path, '黑名单项必须是 object'); return; }
            checkMatch(m, path);
            const mk = matchKey(m);
            if (seen.has(mk)) warn(path, `与 ${seen.get(mk)} 的黑名单条件重复`);
            else seen.set(mk, path);
          });
          if (blacklist.length && !has(data, 'trash')) {
            err('blacklist', 'blacklist 非空时必须同时提供 trash 点位');
          }
        }
      }

      function compile(src, path) {
        try { new RegExp(src); return true; }
        catch (e) { err(path, `正则无法编译：${e.message}`); return false; }
      }

      function checkPoint(p, path, kind) {
        const allowed = kind === 'block' ? BLOCK_KEYS : kind === 'ready' ? READY_KEYS : POINT_KEYS;
        for (const k of Object.keys(p)) if (!allowed.includes(k)) err(`${path}.${k}`, `未知点位字段 "${k}"`);
        for (const k of ['x', 'y', 'z']) if (!isNum(p[k])) err(`${path}.${k}`, `${k} 必须是有限数字`);
        if (kind === 'point') {
          for (const k of ['yaw', 'pitch']) if (!isNum(p[k])) err(`${path}.${k}`, `${k} 必须是有限数字`);
        } else if (kind === 'ready') {
          for (const k of ['yaw', 'pitch']) if (has(p, k) && !isNum(p[k])) err(`${path}.${k}`, `${k} 必须是有限数字`);
        }
        if (has(p, 'label') && typeof p.label !== 'string') err(`${path}.label`, 'label 必须是字符串');
        if (kind === 'point') {
          for (const k of ['area', 'side']) if (has(p, k) && typeof p[k] !== 'string') err(`${path}.${k}`, `${k} 必须是字符串`);
        }
      }

      function checkMatch(m, path) {
        for (const k of Object.keys(m)) if (!MATCH_KEYS.includes(k)) err(`${path}.${k}`, `未知 match 字段 "${k}"`);
        if (!MATCH_KEYS.some(k => has(m, k))) err(path, 'match 至少需要一个条件');

        if (has(m, 'name') && has(m, 'nameRegex')) err(path, 'name 与 nameRegex 互斥');
        if (has(m, 'customName') && has(m, 'customNameRegex')) err(path, 'customName 与 customNameRegex 互斥');
        if (has(m, 'lore') && has(m, 'loreRegex')) err(path, 'lore 与 loreRegex 互斥');

        for (const k of ['name', 'nameRegex', 'customName', 'customNameRegex', 'lore', 'loreRegex']) {
          if (!has(m, k)) continue;
          if (typeof m[k] !== 'string') { err(`${path}.${k}`, `${k} 必须是字符串`); continue; }
          if ((k === 'name' || k === 'nameRegex') && !m[k]) err(`${path}.${k}`, `${k} 不能为空`);
          if (k === 'name') {
            if (m.name !== m.name.toLowerCase()) warn(`${path}.name`, 'name 建议使用小写');
            if (!/^minecraft:/.test(m.name)) warn(`${path}.name`, 'name 建议带 minecraft: 前缀');
          }
          if (k === 'nameRegex') {
            if (compile(m.nameRegex, `${path}.nameRegex`) && !m.nameRegex.includes('minecraft:')) {
              warn(`${path}.nameRegex`, 'nameRegex 作用于 minecraft:<物品ID>，建议包含 minecraft: 前缀');
            }
            if (m.nameRegex.startsWith('/')) warn(`${path}.nameRegex`, '正则不要写 /.../ 分隔符');
          }
          if ((k === 'customNameRegex' || k === 'loreRegex') && m[k]) {
            compile(m[k], `${path}.${k}`);
            if (m[k].startsWith('/')) warn(`${path}.${k}`, '正则不要写 /.../ 分隔符');
          }
        }

        if (has(m, 'enchantments')) {
          if (!isObject(m.enchantments) || !Object.keys(m.enchantments).length) {
            err(`${path}.enchantments`, 'enchantments 必须是非空 object');
          } else {
            for (const [k, v] of Object.entries(m.enchantments)) {
              if (!Number.isInteger(v) || v < 1) err(`${path}.enchantments.${k}`, '附魔等级必须是 ≥1 的整数');
            }
          }
        }
        if (has(m, 'effects')) {
          if (!Array.isArray(m.effects) || !m.effects.length) {
            err(`${path}.effects`, 'effects 必须是非空数组');
          } else {
            m.effects.forEach((v, i) => {
              if (!(typeof v === 'string' && v) && !(Number.isInteger(v) && v >= 0)) {
                err(`${path}.effects[${i}]`, '效果必须是非空字符串或 ≥0 的整数');
              }
            });
          }
        }
        if (has(m, 'potionId') && (!Number.isInteger(m.potionId) || m.potionId < 0)) {
          err(`${path}.potionId`, 'potionId 必须是 ≥0 的整数');
        }
        if (!has(m, 'name') && !has(m, 'nameRegex')) {
          warn(path, '没有 name/nameRegex 的规则可能匹配任意物品');
        }
      }

      for (const [key, kind] of Object.entries(SPECIAL_KIND)) {
        if (!has(data, key)) {
          if (key === 'collector' || key === 'minecart') err(key, `缺少必填点位 ${key}`);
          else if (key === 'trash' || key === 'button' || key === 'ready' || key === 'readyButton') {
            warn(key, `未提供 ${key} 点位`);
          }
          continue;
        }
        if (!isObject(data[key])) err(key, `${key} 必须是 object`);
        else checkPoint(data[key], key, kind);
      }

      const matches = new Map();
      for (let i = 0; i < items.length; i++) {
        const r = items[i];
        const path = `items[${i}]`;
        if (!isObject(r)) { err(path, '规则必须是 object'); continue; }
        for (const k of Object.keys(r)) if (!RULE_KEYS.includes(k)) err(`${path}.${k}`, `未知规则字段 "${k}"`);
        if (has(r, 'weight') && !Number.isInteger(r.weight)) err(`${path}.weight`, 'weight 必须是整数');
        if (!isObject(r.match)) err(`${path}.match`, 'match 必须是 object');
        else {
          checkMatch(r.match, `${path}.match`);
          const mk = matchKey(r.match);
          if (matches.has(mk)) err(`${path}.match`, `与 ${matches.get(mk)} 的 match 完全重复`);
          else matches.set(mk, `${path}.match`);
        }
        if (!isObject(r.point)) err(`${path}.point`, 'point 必须是 object');
        else checkPoint(r.point, `${path}.point`, 'point');
      }

      // 按点位汇总，检查单元名/朝向一致性与货位冲突
      const groups = new Map();
      items.forEach((r, i) => {
        if (!isObject(r) || !isObject(r.point)) return;
        const k = pointKey(r.point);
        if (!groups.has(k)) {
          groups.set(k, { key: k, point: r.point, rules: [], indices: [], labels: new Set(), areas: new Set(), sides: new Set() });
        }
        const g = groups.get(k);
        g.rules.push(r);
        g.indices.push(i);
        if (typeof r.point.label === 'string' && r.point.label.trim()) g.labels.add(r.point.label.trim());
        if (typeof r.point.area === 'string' && r.point.area.trim()) g.areas.add(r.point.area.trim());
        if (typeof r.point.side === 'string' && r.point.side.trim()) g.sides.add(r.point.side.trim());
      });

      const slotSeen = new Map();
      const labelSeen = new Map();
      const byArea = {};
      let occupied = 0;
      for (const g of groups.values()) {
        const path = `items[${g.indices[0]}].point`;
        if (g.labels.size > 1) err(path, `同一点位存在多个单元名：${[...g.labels].join(' / ')}`);
        if (g.areas.size > 1) warn(path, `同一点位存在多个 area：${[...g.areas].join(' / ')}`);
        if (g.sides.size > 1) warn(path, `同一点位存在多个 side：${[...g.sides].join(' / ')}`);

        const s = slotByPoint.get(g.key) || null;
        const area = s ? s.area : firstNonEmpty(g.areas);
        const side = s ? s.side : firstNonEmpty(g.sides);
        if (s) {
          const sk = `${s.area}-${s.side}-${s.slot}`;
          if (slotSeen.has(sk)) err(path, `货位 ${sk} 被多个点位占用（另一个 ${slotSeen.get(sk)}）`);
          else { slotSeen.set(sk, path); occupied++; }
          const pa = firstNonEmpty(g.areas);
          const ps = firstNonEmpty(g.sides);
          if (pa && pa !== s.area) warn(path, `area "${pa}" 与货位 ${sk} 不一致`);
          if (ps && ps !== s.side) warn(path, `side "${ps}" 与货位 ${sk} 不一致`);
        } else {
          warn(path, '点位不在 880 格内，无法在图上显示');
        }
        if (area && !AREAS.includes(area)) warn(path, `area "${area}" 不在 A–H`);

        const label = firstNonEmpty(g.labels) || firstItemLabel(g.rules) || '';
        if (label) {
          if (labelSeen.has(label)) warn(path, `单元名重复："${label}"（另一处 ${labelSeen.get(label)}）`);
          else labelSeen.set(label, path);
        }
        const a = byArea[area || '未分区'] || (byArea[area || '未分区'] = { area: area || '未分区', units: 0, l: 0, r: 0, occupied: 0, rules: 0 });
        a.units++;
        if (side === 'L') a.l++;
        else if (side === 'R') a.r++;
        if (s) a.occupied++;
        a.rules += g.rules.length;
      }

      // 同名通用规则可能遮蔽特例
      const byName = new Map();
      items.forEach((r, i) => {
        if (!isObject(r) || !isObject(r.match)) return;
        const m = r.match;
        const name = typeof m.name === 'string' ? m.name.replace(/^minecraft:/, '')
          : typeof m.nameRegex === 'string' ? 're:' + m.nameRegex : '';
        if (!name) return;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ i, m, cond: Object.keys(m).length });
      });
      for (const [name, arr] of byName) {
        const generic = arr.filter(x => x.cond === 1);
        const specific = arr.filter(x => x.cond > 1);
        for (const g of generic) {
          const hit = specific.find(s => (g.m.weight || 0) >= (s.m.weight || 0) && g.i < s.i);
          if (hit) {
            warn(`items[${g.i}].match`, `同名通用规则可能遮蔽更具体的规则（${name}）`);
            break;
          }
        }
      }

      const collector = data.collector, button = data.button;
      if (isObject(collector) && isObject(button) && isNum(collector.x) && isNum(collector.y) && isNum(collector.z)
        && isNum(button.x) && isNum(button.y) && isNum(button.z)) {
        const bh = Math.hypot(button.x - collector.x, button.z - collector.z);
        const bv = Math.abs(button.y - collector.y);
        if (bh > 3 || bv > 2) warn('button', `button 与 collector 距离过远（水平 ${bh.toFixed(2)} / 垂直 ${bv.toFixed(2)}）`);
      }
      const ready = data.ready, readyButton = data.readyButton;
      if (isObject(ready) && isObject(readyButton) && isNum(ready.x) && isNum(ready.z) && isNum(readyButton.x) && isNum(readyButton.z)) {
        const rr = Math.hypot(ready.x - readyButton.x, ready.z - readyButton.z);
        if (rr > 4.5) warn('ready', `ready 与 readyButton 距离 ${rr.toFixed(2)} > 4.5`);
      }

      return {
        errors, warnings,
        stats: { rules: items.length, units: groups.size, occupied, blacklist: blacklist.length, byArea },
      };
    }

    function validateBlacklist(list, basePath = 'blacklist') {
      const stub = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      const data = { items: [], blacklist: list, trash: stub, collector: stub, minecart: stub };
      const v = validate(data);
      const inPath = e => {
        const p = String(e.path || '');
        return p === basePath || p.startsWith(basePath + '.') || p.startsWith(basePath + '[');
      };
      return { errors: v.errors.filter(inPath), warnings: v.warnings.filter(inPath) };
    }

    function parseBlacklistText(raw) {
      const errors = [];
      const warnings = [];
      const s = String(raw == null ? '' : raw).trim();
      if (!s) return { blacklist: [], errors, warnings };
      let list;
      if (s.startsWith('[') || s.startsWith('{') || s.startsWith('"')) {
        let parsed;
        try { parsed = JSON.parse(s); }
        catch (e) {
          errors.push({ path: '黑名单', message: `JSON 解析失败：${e.message}` });
          return { blacklist: [], errors, warnings };
        }
        const norm = v => typeof v === 'string'
          ? { name: /^minecraft:/.test(v) ? v : `minecraft:${v}` }
          : v;
        list = (Array.isArray(parsed) ? parsed : [parsed]).map(norm);
      } else {
        list = s.split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#') && !line.startsWith('//'))
          .map(line => ({ name: /^minecraft:/.test(line) ? line : `minecraft:${line}` }));
      }
      const v = validateBlacklist(list);
      errors.push(...v.errors);
      warnings.push(...v.warnings);
      return {
        blacklist: errors.length ? [] : list.map(normalizeMatch),
        errors, warnings,
      };
    }

    // ---------- 规范化（仅校验通过后调用） ----------
    function normalizeMatch(m) {
      const o = {};
      for (const k of MATCH_KEYS) {
        if (!has(m, k)) continue;
        if (k === 'enchantments') o[k] = { ...m[k] };
        else if (k === 'effects') o[k] = m[k].slice();
        else o[k] = m[k];
      }
      return o;
    }
    function normalizePoint(p, kind) {
      const o = { x: p.x, y: p.y, z: p.z };
      if (kind === 'point') { o.yaw = p.yaw; o.pitch = p.pitch; }
      else if (kind === 'ready') {
        if (has(p, 'yaw')) o.yaw = p.yaw;
        if (has(p, 'pitch')) o.pitch = p.pitch;
      }
      if (has(p, 'label')) o.label = p.label;
      if (kind === 'point') {
        if (has(p, 'area')) { const v = String(p.area).trim(); if (v) o.area = v; }
        if (has(p, 'side')) { const v = String(p.side).trim(); if (v) o.side = v; }
      }
      return o;
    }
    function normalize(data) {
      const out = {};
      out.items = (data.items || []).map(r => {
        const o = {};
        if (has(r, 'weight')) o.weight = r.weight;
        o.match = normalizeMatch(r.match);
        o.point = normalizePoint(r.point, 'point');
        return o;
      });
      out.blacklist = (Array.isArray(data.blacklist) ? data.blacklist : []).map(normalizeMatch);
      for (const key of SPECIAL_ORDER) {
        if (!has(data, key)) continue;
        out[key] = normalizePoint(data[key], SPECIAL_KIND[key]);
      }
      return out;
    }

    // ---------- JSON ----------
    function buildJson(data) {
      const d = applyDefaults(data);
      const v = validate(d);
      if (v.errors.length) {
        const e = new Error('点位数据校验失败');
        e.validation = v;
        throw e;
      }
      return JSON.stringify(normalize(d), null, 2) + '\n';
    }

    function parseJson(raw) {
      const errors = [];
      const warnings = [];
      let s = String(raw == null ? '' : raw);
      if (s.charCodeAt(0) === 0xFEFF) {
        s = s.slice(1);
        warnings.push({ path: '文件', message: '检测到 BOM，已自动去除；导出文件不含 BOM' });
      }
      let data;
      try { data = JSON.parse(s); }
      catch (e) {
        errors.push({ path: 'JSON', message: e.message });
        return { data: null, errors, warnings, stats: emptyStats() };
      }
      data = applyDefaults(data);
      const v = validate(data);
      errors.push(...v.errors);
      warnings.push(...v.warnings);
      const normalized = errors.length ? null : normalize(data);
      return { data: normalized, errors, warnings, stats: v.stats };
    }

    // ---------- Excel 导出 ----------
    function ruleToCell(rule) {
      const o = {};
      if (has(rule, 'weight')) o.weight = rule.weight;
      o.match = rule.match;
      return o;
    }
    function rulesCell(unit) {
      const s = JSON.stringify(unit.rules.map(x => ruleToCell(x.rule)));
      if (s.length > MAX_CELL) throw new Error(`单元「${unit.label}」规则 JSON 过长（${s.length} 字符），超过 Excel 单元格限制`);
      return s;
    }
    function mergedText(unit) {
      const ids = unit.itemIds.length ? unit.itemIds : [''];
      return [...new Set(ids.map(id => id ? cnOf(id) : unit.type))].join('、');
    }
    function pointCell(p) {
      return JSON.stringify({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
    }

    function partitionRows(area, units) {
      const bySlot = new Map();
      const custom = [];
      for (const u of units) {
        if (u.slot && u.slot.area === area) bySlot.set(`${u.slot.side}-${u.slot.slot}`, u);
        else if (!u.slot && u.area === area) custom.push(u);
      }
      const rows = [PART_HEADER.slice()];
      for (const side of ['L', 'R']) {
        for (let i = 1; i <= 55; i++) {
          const u = bySlot.get(`${side}-${i}`);
          if (!u) { rows.push([area, '', side, i, '', '', '', '', '', '', '', '']); continue; }
          rows.push([
            area, u.firstIndex + 1, side, i, u.label, u.type,
            firstItemLabel(u.rules.map(x => x.rule)), mergedText(u), u.rules.length,
            rulesCell(u), '', '',
          ]);
        }
      }
      custom.sort((a, b) => (a.side || 'L').localeCompare(b.side || 'L') || a.firstIndex - b.firstIndex);
      for (const u of custom) {
        const side = u.side === 'R' ? 'R' : 'L';
        rows.push([
          area, u.firstIndex + 1, side, '', u.label, u.type,
          firstItemLabel(u.rules.map(x => x.rule)), mergedText(u), u.rules.length,
          rulesCell(u), pointCell(u.point), '',
        ]);
      }
      return rows;
    }

    function otherRows(units) {
      const rows = [PART_HEADER.slice()];
      const list = units.slice().sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.firstIndex - b.firstIndex);
      for (const u of list) {
        const side = u.side === 'R' ? 'R' : 'L';
        rows.push([
          u.area || '其他', u.firstIndex + 1, side, '', u.label, u.type,
          firstItemLabel(u.rules.map(x => x.rule)), mergedText(u), u.rules.length,
          rulesCell(u), pointCell(u.point), '',
        ]);
      }
      return rows;
    }

    function summaryRows(data, meta, stats, units) {
      meta = meta || {};
      const rows = [
        ['仓库分区点位导出'],
        ['版本', meta.versionName || meta.version || ''],
        ['导出时间', meta.exportedAt || ''],
        ['数据源', meta.source || ''],
        ['规则数', stats.rules],
        ['单元数', stats.units],
        ['黑名单', stats.blacklist || 0],
        ['占用格位', stats.occupied],
        ['空余格位', Math.max(0, 880 - stats.occupied)],
        [],
        ['特殊点位'],
        ['键', '中文名', 'x', 'y', 'z', 'yaw', 'pitch', 'label', 'area', 'side'],
      ];
      for (const key of SPECIAL_ORDER) {
        const p = data[key];
        if (!p) continue;
        rows.push([
          key, SPECIAL_NAMES[key], p.x, p.y, p.z,
          has(p, 'yaw') ? p.yaw : '', has(p, 'pitch') ? p.pitch : '',
          p.label || '', p.area || '', p.side || '',
        ]);
      }
      rows.push([], ['分区统计'], ['区', '方位', '主题', 'L 单元', 'R 单元', '占用格', '空余格', '规则数']);
      for (const a of AREAS) {
        const s = stats.byArea[a] || { units: 0, l: 0, r: 0, occupied: 0, rules: 0 };
        rows.push([a, areaInfo[a]?.dir || '', areaInfo[a]?.theme || '', s.l, s.r, s.occupied, Math.max(0, 110 - s.occupied), s.rules]);
      }
      for (const k of Object.keys(stats.byArea)) {
        if (AREAS.includes(k)) continue;
        const s = stats.byArea[k];
        rows.push([k, '', '', s.l, s.r, s.occupied, '', s.rules]);
      }
      const sumL = units.filter(u => u.side === 'L').length;
      const sumR = units.filter(u => u.side === 'R').length;
      rows.push(['合计', '', '', sumL, sumR, stats.occupied, Math.max(0, 880 - stats.occupied), stats.rules]);
      rows.push([], ['编辑说明'],
        ['A–H 每区一个 sheet，L/R 各 55 格，空位行保留。'],
        ['规则(JSON) 为该单元全部 match；顺序即单元内优先级，可带 weight。'],
        ['格位存在时坐标由货位自动生成；自定义点位请留空格位并填“自定义点位(JSON)”。'],
        ['“顺序”用于保持规则优先级；留空则按 sheet/格位顺序。'],
        ['“黑名单”sheet 每行一条 Match；物品ID 可省略 minecraft: 前缀。'],
        ['未提供黑名单时默认 minecraft:wooden_hoe；显式空数组/空 sheet 表示禁用。'],
        ['“规则明细”仅供审阅，导入不读取。'],
        ['导入生成独立导入视图；有错误则整份拒绝。'],
      );
      return rows;
    }

    function detailRows(data, units) {
      const byKey = new Map(units.map(u => [u.key, u]));
      const seq = new Map();
      for (const u of units) u.rules.forEach((r, j) => seq.set(r.index, j + 1));
      const rows = [['仅供审阅，导入以各分区 sheet 的 规则(JSON) 为准'], DETAIL_HEADER.slice()];
      (data.items || []).forEach((r, i) => {
        const m = r.match || {};
        const u = byKey.get(pointKey(r.point)) || null;
        rows.push([
          i + 1, u ? u.area : '', u ? u.side : '', u && u.slot ? u.slot.slot : '', u ? u.label : '',
          seq.get(i) || '', has(r, 'weight') ? r.weight : '',
          m.name || '', m.nameRegex || '',
          m.enchantments ? JSON.stringify(m.enchantments) : '',
          m.customName || '', m.customNameRegex || '', m.lore || '', m.loreRegex || '',
          m.potionId !== undefined ? m.potionId : '',
          m.effects ? JSON.stringify(m.effects) : '',
          r.point.x, r.point.y, r.point.z, r.point.yaw, r.point.pitch,
        ]);
      });
      return rows;
    }

    function blacklistRows(data) {
      const rows = [
        ['每行一条黑名单 Match；物品ID 可省略 minecraft: 前缀；空表表示无黑名单'],
        BLACKLIST_HEADER.slice(),
      ];
      (data.blacklist || []).forEach((m, i) => {
        rows.push([
          i + 1, m.name || '', m.nameRegex || '',
          m.enchantments ? JSON.stringify(m.enchantments) : '',
          m.customName || '', m.customNameRegex || '', m.lore || '', m.loreRegex || '',
          m.potionId !== undefined ? m.potionId : '',
          m.effects ? JSON.stringify(m.effects) : '',
          '',
        ]);
      });
      return rows;
    }

    function buildWorkbook(data, meta, XLSX) {
      if (!XLSX || !XLSX.utils) throw new Error('SheetJS (XLSX) 未加载');
      const d = applyDefaults(data);
      const v = validate(d);
      if (v.errors.length) {
        const e = new Error('点位数据校验失败');
        e.validation = v;
        throw e;
      }
      const { units } = analyze(d);
      const wb = XLSX.utils.book_new();
      const cols = (widths) => widths.map(wch => ({ wch }));

      const sum = XLSX.utils.aoa_to_sheet(summaryRows(d, meta, v.stats, units));
      sum['!cols'] = cols([18, 14, 10, 10, 10, 10, 10, 28, 8, 8]);
      XLSX.utils.book_append_sheet(wb, sum, '汇总');

      const bl = blacklistRows(d);
      const bws = XLSX.utils.aoa_to_sheet(bl);
      bws['!cols'] = cols([6, 28, 30, 30, 20, 24, 30, 30, 8, 30, 16]);
      bws['!autofilter'] = { ref: `A2:K${bl.length}` };
      XLSX.utils.book_append_sheet(wb, bws, '黑名单');

      for (const a of AREAS) {
        const rows = partitionRows(a, units);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = cols([5, 7, 5, 6, 28, 8, 22, 40, 7, 80, 24, 16]);
        ws['!autofilter'] = { ref: `A1:L${rows.length}` };
        XLSX.utils.book_append_sheet(wb, ws, a);
      }

      const other = units.filter(u => !u.slot && !AREAS.includes(u.area));
      if (other.length) {
        const rows = otherRows(other);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = cols([8, 7, 5, 6, 28, 8, 22, 40, 7, 80, 24, 16]);
        ws['!autofilter'] = { ref: `A1:L${rows.length}` };
        XLSX.utils.book_append_sheet(wb, ws, '其他');
      }

      const detail = detailRows(d, units);
      const dws = XLSX.utils.aoa_to_sheet(detail);
      dws['!cols'] = cols([8, 5, 5, 6, 28, 7, 6, 28, 30, 30, 20, 24, 30, 30, 8, 30, 10, 8, 10, 8, 8]);
      dws['!autofilter'] = { ref: `A2:U${detail.length}` };
      XLSX.utils.book_append_sheet(wb, dws, '规则明细');
      return wb;
    }

    // ---------- Excel 导入 ----------
    function normHeader(v) {
      return text(v).replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
    }
    const HEADER_ALIASES = {
      '区': '区', '区域': '区',
      '顺序': '顺序', '全局顺序': '顺序',
      '侧': '侧', '侧别': '侧',
      '格位': '格位', '货位': '格位', 'slot': '格位',
      '单元名': '单元名', '单元': '单元名', '名称': '单元名',
      '类型': '类型', '代表物': '代表物', '合并物品': '合并物品', '规则数': '规则数',
      '规则(json)': '规则(JSON)', '规则json': '规则(JSON)', '规则': '规则(JSON)',
      '自定义点位(json)': '自定义点位(JSON)', '自定义点位json': '自定义点位(JSON)', '自定义点位': '自定义点位(JSON)',
      '备注': '备注', '键': '键', '点位键': '键',
      '序号': '序号', '物品id': '物品ID', '物品id正则': '物品ID正则',
      '附魔(json)': '附魔(JSON)', '自定义名称': '自定义名称', '自定义名称正则': '自定义名称正则',
      'lore': 'Lore', 'lore正则': 'Lore正则', '药水id': '药水ID', '效果(json)': '效果(JSON)',
      'x': 'x', 'y': 'y', 'z': 'z', 'yaw': 'yaw', 'pitch': 'pitch', 'label': 'label',
      'area': 'area', 'side': 'side', '中文名': '中文名',
    };
    function headerMap(row) {
      const map = {};
      (row || []).forEach((v, i) => {
        const k = HEADER_ALIASES[normHeader(v)];
        if (k && map[k] === undefined) map[k] = i;
      });
      return map;
    }
    function findHeader(rows, required) {
      for (let i = 0; i < Math.min(rows.length, 12); i++) {
        const map = headerMap(rows[i]);
        if (required.every(k => map[k] !== undefined)) return { index: i, map };
      }
      return null;
    }
    function sheetRows(XLSX, ws) {
      if (!ws || !ws['!ref']) return [];
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    }

    function parseSummary(wb, XLSX, errors, warnings) {
      const ws = wb.Sheets['汇总'];
      if (!ws) { errors.push({ path: '汇总', message: '缺少“汇总”sheet' }); return null; }
      const rows = sheetRows(XLSX, ws);
      const found = findHeader(rows, ['键', 'x', 'y', 'z']);
      if (!found) { errors.push({ path: '汇总', message: '汇总 sheet 缺少特殊点位表（需 键/x/y/z 表头）' }); return null; }
      const map = found.map;
      const special = {};
      const specialRows = {};
      let sourceVersion = '';
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        if (text(rows[i][0]) === '版本') { sourceVersion = text(rows[i][1]); break; }
      }
      if (sourceVersion && /v1/i.test(sourceVersion)) {
        warnings.push({ path: '汇总', message: '文件版本为 v1，已作为 v2 导入' });
      }
      for (let i = found.index + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const key = text(row[map['键']]);
        const first = text(row[0]);
        if (first === '分区统计' || first === '编辑说明') break;
        if (!key) continue;
        if (!SPECIAL_KIND[key]) {
          errors.push({ path: `汇总!第${i + 1}行`, message: `未知特殊点位键 "${key}"` });
          continue;
        }
        if (special[key]) {
          errors.push({ path: `汇总!第${i + 1}行`, message: `特殊点位 ${key} 重复` });
          continue;
        }
        const x = toNum(row[map.x]), y = toNum(row[map.y]), z = toNum(row[map.z]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          errors.push({ path: `汇总!第${i + 1}行`, message: `${key} 的 x/y/z 必须是数字` });
          continue;
        }
        const p = { x, y, z };
        if (key === 'button' || key === 'readyButton') {
          const label = map.label !== undefined ? text(row[map.label]) : '';
          if (label) p.label = label;
        } else if (key === 'ready') {
          if (map.yaw !== undefined) { const n = toNum(row[map.yaw]); if (Number.isFinite(n)) p.yaw = n; }
          if (map.pitch !== undefined) { const n = toNum(row[map.pitch]); if (Number.isFinite(n)) p.pitch = n; }
          const label = map.label !== undefined ? text(row[map.label]) : '';
          if (label) p.label = label;
        } else {
          const yaw = map.yaw !== undefined ? toNum(row[map.yaw]) : NaN;
          const pitch = map.pitch !== undefined ? toNum(row[map.pitch]) : NaN;
          if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) {
            errors.push({ path: `汇总!第${i + 1}行`, message: `${key} 的 yaw/pitch 必须是数字` });
            continue;
          }
          p.yaw = yaw; p.pitch = pitch;
          const label = map.label !== undefined ? text(row[map.label]) : '';
          if (label) p.label = label;
          const area = map.area !== undefined ? text(row[map.area]) : '';
          const side = map.side !== undefined ? text(row[map.side]) : '';
          if (area) p.area = area;
          if (side) p.side = side;
        }
        special[key] = p;
        specialRows[key] = i + 1;
      }
      return { special, specialRows, sourceVersion };
    }

    function parseBlacklist(wb, XLSX, errors, warnings) {
      const ws = wb.Sheets['黑名单'];
      if (!ws) {
        return { blacklist: defaultBlacklist ? cloneJson(defaultBlacklist) : [], rows: [] };
      }
      const rows = sheetRows(XLSX, ws);
      if (!rows.length) return { blacklist: [], rows: [] };
      let found = null;
      const matchCols = ['物品ID', '物品ID正则', '附魔(JSON)', '自定义名称', '自定义名称正则', 'Lore', 'Lore正则', '药水ID', '效果(JSON)'];
      for (let i = 0; i < Math.min(rows.length, 12); i++) {
        const map = headerMap(rows[i]);
        if (matchCols.some(k => map[k] !== undefined)) { found = { index: i, map }; break; }
      }
      if (!found) {
        if (rows.some(r => r.some(v => text(v) !== ''))) {
          errors.push({ path: '黑名单', message: '黑名单 sheet 找不到表头（需 物品ID / 物品ID正则 / 附魔(JSON) 等列）' });
        }
        return { blacklist: [], rows: [] };
      }
      const map = found.map;
      const blacklist = [];
      const rowRefs = [];
      for (let i = found.index + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const path = `黑名单!第${i + 1}行`;
        if (!row.some(v => text(v) !== '')) continue;
        const m = {};
        const get = k => map[k] !== undefined ? text(row[map[k]]) : '';
        const name = get('物品ID');
        if (name) m.name = /^minecraft:/.test(name) ? name : `minecraft:${name}`;
        for (const k of ['物品ID正则', '自定义名称', '自定义名称正则', 'Lore', 'Lore正则']) {
          const v = k === '物品ID正则' ? get('物品ID正则') : get(k);
          if (!v) continue;
          m[{ '物品ID正则': 'nameRegex', '自定义名称': 'customName', '自定义名称正则': 'customNameRegex', 'Lore': 'lore', 'Lore正则': 'loreRegex' }[k]] = v;
        }
        const enchRaw = get('附魔(JSON)');
        if (enchRaw) {
          try {
            const v = JSON.parse(enchRaw);
            if (!isObject(v)) throw new Error('必须是 object');
            m.enchantments = v;
          } catch (e) { errors.push({ path, message: `附魔(JSON) 解析失败：${e.message}` }); continue; }
        }
        const potionRaw = get('药水ID');
        if (potionRaw) {
          const n = toInt(potionRaw);
          if (n === null) { errors.push({ path, message: `药水ID 必须是 ≥0 的整数（当前 "${potionRaw}"）` }); continue; }
          m.potionId = n;
        }
        const effRaw = get('效果(JSON)');
        if (effRaw) {
          try {
            const v = JSON.parse(effRaw);
            if (!Array.isArray(v)) throw new Error('必须是数组');
            m.effects = v;
          } catch (e) { errors.push({ path, message: `效果(JSON) 解析失败：${e.message}` }); continue; }
        }
        if (!Object.keys(m).length) {
          errors.push({ path, message: '黑名单行没有匹配条件' });
          continue;
        }
        const bv = validateBlacklist([m]);
        if (bv.errors.length) {
          for (const e of bv.errors) errors.push({ path: `${path} ${e.path}`, message: e.message });
          continue;
        }
        for (const w of bv.warnings) warnings.push({ path: `${path} ${w.path}`, message: w.message });
        blacklist.push(m);
        rowRefs.push({ sheet: '黑名单', row: i + 1 });
      }
      return { blacklist, rows: rowRefs };
    }

    function parsePartition(wb, sheetName, XLSX, errors, warnings, seen) {
      const ws = wb.Sheets[sheetName];
      if (!ws) { errors.push({ path: sheetName, message: `缺少 ${sheetName} sheet` }); return []; }
      const rows = sheetRows(XLSX, ws);
      if (!rows.length) { warnings.push({ path: sheetName, message: `${sheetName} sheet 为空，按空区处理` }); return []; }
      if (rows.length > MAX_SHEET_ROWS) {
        errors.push({ path: sheetName, message: `${sheetName} sheet 行数 ${rows.length} 超过 ${MAX_SHEET_ROWS}` });
        return [];
      }
      const found = findHeader(rows, ['侧', '单元名', '规则(JSON)']);
      if (!found) {
        errors.push({ path: sheetName, message: '找不到表头（需要 侧 / 单元名 / 规则(JSON)）' });
        return [];
      }
      const map = found.map;
      if (map['格位'] === undefined && map['自定义点位(JSON)'] === undefined) {
        errors.push({ path: sheetName, message: '缺少“格位”或“自定义点位(JSON)”列' });
        return [];
      }
      const units = [];
      let srcOrder = 0;
      for (let i = found.index + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const rowNo = i + 1;
        const path = `${sheetName}!第${rowNo}行`;
        if (!row.some(v => text(v) !== '')) continue;
        const unitName = text(row[map['单元名']]);
        const rulesRaw = text(row[map['规则(JSON)']]);
        if (!unitName && !rulesRaw) continue;
        if (!unitName) { errors.push({ path, message: '有规则但缺少单元名' }); continue; }
        if (!rulesRaw) { errors.push({ path, message: `单元「${unitName}」缺少规则(JSON)` }); continue; }

        const areaCell = map['区'] !== undefined ? text(row[map['区']]).toUpperCase() : '';
        let area;
        if (AREAS.includes(sheetName)) {
          area = areaCell || sheetName;
          if (area !== sheetName) { errors.push({ path, message: `区 "${area}" 与 sheet ${sheetName} 不一致` }); continue; }
        } else {
          area = areaCell;
          if (!area) { errors.push({ path, message: '其他 sheet 必须填写区列' }); continue; }
        }
        const side = text(row[map['侧']]).toUpperCase();
        if (side !== 'L' && side !== 'R') { errors.push({ path, message: `侧必须是 L 或 R（当前 "${side}"）` }); continue; }

        const slotRaw = map['格位'] !== undefined ? text(row[map['格位']]) : '';
        const customRaw = map['自定义点位(JSON)'] !== undefined ? text(row[map['自定义点位(JSON)']]) : '';
        if (slotRaw && customRaw) { errors.push({ path, message: '格位与自定义点位只能填写一个' }); continue; }
        if (!slotRaw && !customRaw) { errors.push({ path, message: '格位与自定义点位都为空' }); continue; }

        let point = null;
        let slot = null;
        if (slotRaw) {
          const slotNo = toInt(slotRaw);
          if (slotNo === null || slotNo < 1 || slotNo > 55) {
            errors.push({ path, message: `格位必须是 1–55 的整数（当前 "${slotRaw}"）` });
            continue;
          }
          slot = slotByKey.get(`${area}-${side}-${slotNo}`) || null;
          if (!slot) { errors.push({ path, message: `找不到货位 ${area}-${side}-${slotNo}` }); continue; }
          const sk = `${area}-${side}-${slotNo}`;
          if (seen.slots.has(sk)) { errors.push({ path, message: `格位 ${sk} 重复（另一处 ${seen.slots.get(sk)}）` }); continue; }
          seen.slots.set(sk, path);
          point = { x: slot.x, y: slot.y, z: slot.z, yaw: slot.yaw, pitch: slot.pitch, label: unitName, area, side };
        } else {
          let cp;
          try { cp = JSON.parse(customRaw); }
          catch (e) { errors.push({ path, message: `自定义点位 JSON 解析失败：${e.message}` }); continue; }
          if (!isObject(cp)) { errors.push({ path, message: '自定义点位必须是 object' }); continue; }
          const extra = Object.keys(cp).filter(k => !['x', 'y', 'z', 'yaw', 'pitch'].includes(k));
          if (extra.length) { errors.push({ path, message: `自定义点位含未知字段：${extra.join(', ')}` }); continue; }
          const x = toNum(cp.x), y = toNum(cp.y), z = toNum(cp.z), yaw = toNum(cp.yaw), pitch = toNum(cp.pitch);
          if (![x, y, z, yaw, pitch].every(Number.isFinite)) {
            errors.push({ path, message: '自定义点位需要数字 x/y/z/yaw/pitch' });
            continue;
          }
          point = { x, y, z, yaw, pitch, label: unitName, area, side };
        }

        const pk = pointKey(point);
        if (seen.points.has(pk)) { errors.push({ path, message: `点位重复（另一处 ${seen.points.get(pk)}）` }); continue; }
        seen.points.set(pk, path);

        let arr;
        try { arr = JSON.parse(rulesRaw); }
        catch (e) { errors.push({ path, message: `规则(JSON) 解析失败：${e.message}` }); continue; }
        if (!Array.isArray(arr) || !arr.length) { errors.push({ path, message: '规则(JSON) 必须是非空数组' }); continue; }

        const rules = [];
        let bad = false;
        for (let j = 0; j < arr.length; j++) {
          const el = arr[j];
          let match = null;
          let weight;
          if (isObject(el) && has(el, 'match')) {
            const extra = Object.keys(el).filter(k => k !== 'match' && k !== 'weight');
            if (extra.length) { errors.push({ path, message: `规则[${j}] 含未知字段：${extra.join(', ')}` }); bad = true; continue; }
            match = el.match;
            if (has(el, 'weight')) {
              if (!Number.isInteger(el.weight)) { errors.push({ path, message: `规则[${j}] weight 必须是整数` }); bad = true; continue; }
              weight = el.weight;
            }
          } else if (isObject(el)) {
            match = el;
          } else {
            errors.push({ path, message: `规则[${j}] 必须是 object` });
            bad = true; continue;
          }
          if (!isObject(match)) { errors.push({ path, message: `规则[${j}] match 必须是 object` }); bad = true; continue; }
          rules.push({ match, weight, row: { sheet: sheetName, row: rowNo } });
        }
        if (bad || !rules.length) continue;

        let order = null;
        if (map['顺序'] !== undefined) {
          const rawOrder = text(row[map['顺序']]);
          if (rawOrder) {
            const n = toNum(rawOrder);
            if (Number.isInteger(n)) order = n;
            else warnings.push({ path, message: `顺序 "${rawOrder}" 不是整数，已忽略` });
          }
        }
        units.push({ area, side, slot, unitName, point, rules, order, srcOrder: srcOrder++ });
      }
      return units;
    }

    function remap(list, ruleRows, specialRows, blacklistRows) {
      return list.map(e => {
        const m = /^items\[(\d+)\]/.exec(e.path || '');
        if (m) {
          const r = ruleRows[Number(m[1])];
          if (r) return { ...e, path: `${r.sheet}!第${r.row}行 ${e.path}` };
        }
        const bm = /^blacklist\[(\d+)\]/.exec(e.path || '');
        if (bm) {
          const r = blacklistRows[Number(bm[1])];
          if (r) return { ...e, path: `${r.sheet}!第${r.row}行 ${e.path}` };
        }
        const key = String(e.path || '').split('.')[0];
        if (specialRows[key]) return { ...e, path: `汇总!第${specialRows[key]}行 ${e.path}` };
        return e;
      });
    }

    function parseWorkbook(input, XLSX, readOpts) {
      const errors = [];
      const warnings = [];
      if (!XLSX || !XLSX.read) {
        errors.push({ path: '文件', message: 'SheetJS (XLSX) 未加载' });
        return { data: null, errors, warnings, stats: emptyStats(), meta: {} };
      }
      let wb;
      try {
        const type = readOpts?.type
          || (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input) ? 'buffer' : 'array');
        wb = XLSX.read(input, { type, cellDates: false });
      } catch (e) {
        errors.push({ path: '文件', message: `无法读取 Excel：${e.message}` });
        return { data: null, errors, warnings, stats: emptyStats(), meta: {} };
      }

      const missing = AREAS.filter(a => !wb.Sheets[a]);
      if (!wb.Sheets['汇总']) errors.push({ path: '汇总', message: '缺少“汇总”sheet' });
      if (missing.length) errors.push({ path: '工作簿', message: `缺少分区 sheet：${missing.join(', ')}` });
      if (errors.length) return { data: null, errors, warnings, stats: emptyStats(), meta: {} };

      let totalRows = 0;
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (!ws || !ws['!ref']) continue;
        try { totalRows += XLSX.utils.decode_range(ws['!ref']).e.r + 1; } catch (_) {}
      }
      if (totalRows > MAX_TOTAL_ROWS) {
        errors.push({ path: '工作簿', message: `总行数 ${totalRows} 超过 ${MAX_TOTAL_ROWS}` });
        return { data: null, errors, warnings, stats: emptyStats(), meta: {} };
      }

      const sum = parseSummary(wb, XLSX, errors, warnings);
      if (!sum) return { data: null, errors, warnings, stats: emptyStats(), meta: {} };
      const bl = parseBlacklist(wb, XLSX, errors, warnings);

      const seen = { slots: new Map(), points: new Map() };
      let units = [];
      for (const a of AREAS) units.push(...parsePartition(wb, a, XLSX, errors, warnings, seen));
      if (wb.Sheets['其他']) units.push(...parsePartition(wb, '其他', XLSX, errors, warnings, seen));

      units.sort((a, b) => {
        const ao = a.order == null ? Infinity : a.order;
        const bo = b.order == null ? Infinity : b.order;
        if (ao !== bo) return ao - bo;
        return a.srcOrder - b.srcOrder;
      });

      const items = [];
      const ruleRows = [];
      for (const u of units) {
        for (const r of u.rules) {
          const o = {};
          if (r.weight !== undefined) o.weight = r.weight;
          o.match = r.match;
          o.point = { ...u.point };
          items.push(o);
          ruleRows.push(r.row);
        }
      }

      const data = { items, blacklist: bl.blacklist };
      for (const key of SPECIAL_ORDER) if (sum.special[key]) data[key] = sum.special[key];

      const v = validate(data);
      errors.push(...v.errors);
      warnings.push(...v.warnings);
      const allErrors = remap(errors, ruleRows, sum.specialRows, bl.rows);
      const allWarnings = remap(warnings, ruleRows, sum.specialRows, bl.rows);
      const normalized = allErrors.length ? null : normalize(data);
      return {
        data: normalized,
        errors: allErrors,
        warnings: allWarnings,
        stats: v.stats,
        meta: { sourceVersion: sum.sourceVersion },
      };
    }

    return {
      buildWorkbook, parseWorkbook, buildJson, parseJson,
      validate, normalize, stats: statsOf, analyze,
      applyDefaults, validateBlacklist, parseBlacklistText,
    };
  }

  return { create, version: '1.0' };
});
