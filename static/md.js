/* MD frontmatter 解析/序列化/校验 —— 与 atlas 项目规范一致的纯 JS 实现
   （GitHub Pages 模式与本地服务模式共用，保证两种模式写出同样的文件） */
'use strict';
window.MD = (() => {

  const FIELD_ORDER = ['id', 'title', 'status', 'alt_name', 'author', 'date', 'year', 'physicalSize',
    'category', 'categoryName', 'subCategory', 'topic', 'hero', 'image',
    'alias', 'tags', 'color', 'workflow', 'annotations'];
  const STAGE_STATUS = { '01_pending': 'pending', '02_waiting': 'waiting', '03_published': 'published' };
  const LIST_FIELDS = new Set(['alias', 'tags', 'color']);
  const WORKFLOW_ORDER = ['QGIS', 'Ink', 'PS', 'GIMP', 'AI'];
  const QUOTED_ALWAYS = new Set(['date', 'year', 'physicalSize']);
  const BODY_HEADING = '# 制图思路';
  const BODY_SECTION = '### 视觉语言与空间形态';
  const REQUIRED_FIELDS = ['id', 'title', 'date', 'category', 'categoryName', 'image'];
  const CATEGORY_NAMES = { original: '原创图', gis: '转发分享' };
  const COMPOSITIONS = ['超宽全景长卷', '标准横幅画幅', '标准竖构图', '修长立轴卷轴', '经典近方画幅'];

  function unquote(v) {
    v = String(v).trim();
    if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) return v.slice(1, -1);
    return v;
  }

  function stripComment(v) {
    if (v.startsWith('"') && v.endsWith('"')) return v;
    const m = v.match(/\s+#\s/);
    return m ? v.slice(0, m.index).trim() : v;
  }

  function parseVal(v) {
    v = String(v).trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(x => {
        x = x.trim();
        const n = Number(x);
        return isNaN(n) ? unquote(x) : n;
      });
    }
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
    const n = Number(v);
    if (!isNaN(n) && v !== '') return n;
    return unquote(v);
  }

  function parseAnnotationsBlock(lines) {
    const anns = [];
    let curr = null;
    let subListKey = null;
    let subDictKey = null;
    for (const raw of lines) {
      const s = raw.trim();
      if (!s || s.startsWith('#')) continue;
      const indent = raw.length - raw.trimStart().length;
      if (s.startsWith('- ')) {
        const rest = s.slice(2).trim();
        if (subListKey && curr && (rest.startsWith('[') || /^[\d.-]+/.test(rest))) {
          curr[subListKey].push(parseVal(rest));
          continue;
        }
        curr = {};
        anns.push(curr);
        subListKey = null;
        subDictKey = null;
        if (rest) {
          const m = rest.match(/^(\w+)\s*:\s*(.*)$/);
          if (m) curr[m[1]] = parseVal(m[2]);
        }
        continue;
      }
      const m = s.match(/^(\w+)\s*:\s*(.*)$/);
      if (m && curr) {
        const k = m[1];
        const v = m[2].trim();
        if (!v) {
          if (k === 'polygon' || k === 'polyline') {
            curr[k] = [];
            subListKey = k;
            subDictKey = null;
          } else {
            curr[k] = {};
            subDictKey = k;
            subListKey = null;
          }
        } else if (subDictKey && indent >= 6) {
          curr[subDictKey][k] = parseVal(v);
        } else {
          subDictKey = null;
          subListKey = null;
          curr[k] = parseVal(v);
        }
      }
    }
    return anns;
  }

  function parseFrontmatter(text) {
    const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/);
    if (!m) return { fields: {}, body: text, ok: false };
    const lines = m[1].split(/\r?\n/);
    const fields = {};
    const order = [];
    let pending = null; // null | {kind:'list'|'dict', key}
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s || s.startsWith('#')) continue;
      if (s.startsWith('- ') && pending && pending.kind === 'list') {
        fields[pending.key].push(unquote(s.slice(2)));
        continue;
      }
      const mm = s.match(/^("[^"]*"|[^:]+)\s*:\s*(.*)$/);
      if (!mm) continue;
      const key = unquote(mm[1]).trim();
      const val = mm[2].trim();

      if (key === 'annotations') {
        const annLines = [];
        let j = i + 1;
        while (j < lines.length) {
          const jl = lines[j];
          const js = jl.trim();
          if (!js || js.startsWith('#')) {
            annLines.push(jl);
            j++;
            continue;
          }
          if (jl.startsWith('  ') || jl.startsWith('\t')) {
            annLines.push(jl);
            j++;
          } else {
            break;
          }
        }
        fields.annotations = parseAnnotationsBlock(annLines);
        if (!order.includes('annotations')) order.push('annotations');
        i = j - 1;
        pending = null;
        continue;
      }
      if (val === '') {
        // 向后看第一条数据行，决定列表还是字典
        let j = i + 1;
        while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith('#'))) j++;
        const nxt = j < lines.length ? lines[j].trim() : '';
        if (nxt.startsWith('- ')) { fields[key] = []; pending = { kind: 'list', key }; }
        else { fields[key] = {}; pending = { kind: 'dict', key }; }
      } else if (pending && pending.kind === 'dict') {
        fields[pending.key][key] = unquote(stripComment(val));
      } else {
        fields[key] = unquote(stripComment(val));
        pending = null;
      }
      if (!order.includes(key)) order.push(key);
    }
    fields.__order__ = order;
    return { fields, body: m[2] || '', ok: true };
  }

  function parseBody(body) {
    const introLines = [];
    const items = [];
    let inSection = false;
    for (const line of String(body || '').split(/\r?\n/)) {
      const st = line.trim();
      if (st.startsWith('###')) { inSection = true; continue; }
      if (!inSection) { introLines.push(line); }
      else {
        const mm = st.match(/^-\s*\*\*(.+?)\*\*\s*[：:]\s*(.*)$/);
        if (mm) items.push({ term: mm[1].trim(), desc: mm[2].trim() });
        else if (st.startsWith('-') && st !== '-' && items.length) items[items.length - 1].desc += '\n' + st.slice(1).trim();
      }
    }
    let intro = introLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    intro = intro.replace(/^#[^\n]*\n?/, '').replace(/^\n+/, '').replace(/\n+$/, '');
    return { intro, items };
  }

  function parseMdText(text) {
    const { fields, body, ok } = parseFrontmatter(text);
    return { fields, body: parseBody(body), ok };
  }

  function fmtScalar(key, val) {
    let s = val === null || val === undefined ? '' : String(val);
    let quote = false;
    if (QUOTED_ALWAYS.has(key) || s === '') quote = true;
    else if (s.startsWith('#') || s !== s.trim()) quote = true;
    else if (/^[\d.]+$/.test(s)) quote = true;
    else if (s.includes('"') || /^[-?:,\[\]{}&*!|>%@`]/.test(s)) quote = true;
    if (s.includes('"')) s = s.replace(/"/g, "'");
    return quote ? `"${s}"` : s;
  }

  function serializeMd(fields, body) {
    const empty = v => v === undefined || v === null || v === '' ||
      (Array.isArray(v) && !v.length) || (typeof v === 'object' && !(v instanceof Date) && v !== null && !Array.isArray(v) && !Object.keys(v).length);
    let order = FIELD_ORDER.filter(k => k in fields && !empty(fields[k]));
    for (const k of (fields.__order__ || [])) {
      if (k === '__order__' || order.includes(k)) continue;
      if (k in fields && !empty(fields[k])) order.push(k);
    }
    const out = ['---'];
    for (const k of order) {
      const v = fields[k];
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        out.push(`${k}:`);
        const keys = [...WORKFLOW_ORDER.filter(x => x in v), ...Object.keys(v).filter(x => !WORKFLOW_ORDER.includes(x))];
        for (const sk of keys) out.push(`  ${sk}: ${String(v[sk]).replace(/%$/, '').trim()}%`);
      } else if (k === 'annotations' && Array.isArray(v)) {
        out.push('annotations:');
        for (const ann of v) {
          if (!ann || typeof ann !== 'object') continue;
          let first = true;
          const keysOrder = ['id', 'type', 'coord', 'title', 'desc', 'level', 'zoomLevel', 'bbox', 'polygon', 'polyline', 'style'];
          const orderedKeys = [...keysOrder.filter(x => x in ann), ...Object.keys(ann).filter(x => !keysOrder.includes(x))];
          for (const ak of orderedKeys) {
            const av = ann[ak];
            if (av === undefined || av === null || av === '' || (Array.isArray(av) && !av.length)) continue;
            const dash = first ? '- ' : '  ';
            first = false;
            if (ak === 'coord' && Array.isArray(av)) {
              out.push(`  ${dash}coord: [${av[0]}, ${av[1]}]`);
            } else if (ak === 'bbox' && Array.isArray(av)) {
              out.push(`  ${dash}bbox: [${av.join(', ')}]`);
            } else if ((ak === 'polygon' || ak === 'polyline') && Array.isArray(av)) {
              out.push(`  ${dash}${ak}:`);
              for (const pt of av) {
                if (Array.isArray(pt)) out.push(`      - [${pt[0]}, ${pt[1]}]`);
                else out.push(`      - ${pt}`);
              }
            } else if (ak === 'style' && typeof av === 'object') {
              out.push(`  ${dash}style:`);
              for (const [sk, sv] of Object.entries(av)) {
                out.push(`      ${sk}: ${sv}`);
              }
            } else if (typeof av === 'boolean') {
              out.push(`  ${dash}${ak}: ${av}`);
            } else if (typeof av === 'number') {
              out.push(`  ${dash}${ak}: ${av}`);
            } else {
              out.push(`  ${dash}${ak}: ${fmtScalar(ak, av)}`);
            }
          }
        }
      } else if (Array.isArray(v)) {
        out.push(`${k}:`);
        for (const item of v) out.push(`  - ${fmtScalar('__item__', item)}`);
      } else {
        out.push(`${k}: ${fmtScalar(k, v)}`);
      }
    }
    out.push('---', '', BODY_HEADING, '');
    const intro = (body && body.intro || '').replace(/^\n+|\n+$/g, '');
    if (intro) out.push(intro, '');
    const items = (body && body.items) || [];
    if (items.length) {
      out.push(BODY_SECTION, '');
      for (const it of items) {
        out.push(`- **${(it.term || '').trim() || '要点'}**：${(it.desc || '').trim()}`);
        out.push('');
      }
    }
    return out.join('\n').replace(/\n+$/, '') + '\n';
  }

  function validate(fields, body, ctx = {}) {
    const errors = [], warnings = [];
    for (const k of REQUIRED_FIELDS) {
      if (!String(fields[k] ?? '').trim()) errors.push(`缺少必填字段：${k}`);
    }
    const sid = String(fields.id || '');
    if (sid && !/^[A-Za-z0-9_\-]+$/.test(sid)) warnings.push(`id 建议使用英文/数字/下划线（当前：${sid}）`);
    for (const c of (fields.color || [])) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(String(c))) errors.push(`色值格式非法：${c}（应为 #RRGGBB）`);
    }
    const wf = fields.workflow || {};
    try {
      const total = Object.values(wf).reduce((s, v) => s + (parseInt(String(v).replace('%', '').trim()) || 0), 0);
      if (total !== 100) warnings.push(`workflow 占比合计 ${total}% ≠ 100%`);
    } catch (_) { warnings.push('workflow 占比含非数值'); }
    if (ctx.imageName && fields.image && fields.image !== ctx.imageName) {
      warnings.push(`image 字段 ${fields.image} 与配对图片 ${ctx.imageName} 不一致（保存时自动修正为配对名）`);
    }
    if (!ctx.imageName) warnings.push('未找到配对图片');
    if (!String(body?.intro || '').trim()) warnings.push('制图思路正文为空');
    return { errors, warnings };
  }

  function suggestComposition(w, h) {
    if (!w || !h) return '标准横幅画幅';
    const r = w / h;
    if (r >= 3.0) return '超宽全景长卷';
    if (r >= 1.25) return '标准横幅画幅';
    if (r >= 0.9) return '经典近方画幅';
    if (r >= 0.35) return '标准竖构图';
    return '修长立轴卷轴';
  }

  function buildDraft(stem, info, palette = [], today = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const draftId = stem.replace(/\s+/g, '_');
    const wf = {}; WORKFLOW_ORDER.forEach(k => wf[k] = '0%'); wf.QGIS = '100%';
    return {
      fields: {
        id: draftId,
        title: stem,
        alt_name: stem,
        author: 'OpenQGIS',
        date: `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`,
        year: `${today.getFullYear()}.${today.getMonth() + 1}`,
        physicalSize: `${(info.cmW || 0).toFixed(1)}cm x ${(info.cmH || 0).toFixed(1)}cm，${suggestComposition(info.width, info.height)}`,
        category: 'original',
        categoryName: '原创图',
        subCategory: '',
        topic: '',
        hero: 'yes',
        image: info.fileName || '',
        alias: [draftId, stem],
        tags: [],
        color: palette.slice(0, 5),
        workflow: wf,
        __order__: [...FIELD_ORDER],
      },
      body: { intro: '', items: [] },
    };
  }

  return { FIELD_ORDER, STAGE_STATUS, WORKFLOW_ORDER, COMPOSITIONS, CATEGORY_NAMES, parseMdText, parseFrontmatter, parseBody, serializeMd, validate, suggestComposition, buildDraft };
})();
