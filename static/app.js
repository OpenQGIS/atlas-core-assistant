/* AtlasCore Assistant · 标注编辑器前端 */
'use strict';

/* ================= 预设体系（依据《Gallery标签分类逻辑.md》与最新模板） ================= */

const SUBTOPICS = {
  '艺术制图': ['剪纸艺术', '极简黑金', '古城古韵', '绿道工程', '蓝图色调'],
  '工程制图': ['水工工程', '道路工程（预留）', '批量图集'],
  '空间形态': ['水系演变', '宏观肌理', '地形渲染（3维地图）', '城市肌理'],
  '图面排版': ['多图面排版', '多要素排版'],
  '制图细节': ['规则驱动与高级线型', '自适应注记避让与沿线标注', '图层微质感与混合模式'],
};
const SUBCATS = Object.keys(SUBTOPICS);
const TAG_PRESETS = {
  '视觉风格': ['剪纸', '黑金', '蓝图', '低饱和', '拟态浮雕', '波点', '暗黑系', '发光线条', '复古暖色'],
  '地理/空间': ['成都', '重庆', '上海', '南京', '阿坝', '南昌', '江西', '广西', '长江', '鄱阳湖', '平陆运河'],
  '核心地理要素': ['路网肌理', '古城墙', '机场跑道', '水系演变', '跨江大桥', '等高线', '运河航道', '工程开挖', '湖泊肌理', '跨江大桥名录'],
  '表现形式/载体': ['全景长卷', '手机壁纸', 'iPad画幅', '高程剖面', '排版横版', '标准横幅画幅', '标准竖构图', '经典近方画幅'],
  'GIS 算法/数据/方法': ['DEM/等高线', '山体阴影(Hillshade)', '空间句法(Space Syntax)', '核密度(KDE)', '点阵抽稀', '遥感指数(NDVI)', '矢量拓扑', '动态切片(DZI)'],
};
const COMPOSITIONS = ['超宽全景长卷', '标准横幅画幅', '标准竖构图', '修长立轴卷轴', '经典近方画幅'];
const CATEGORY_NAMES = { original: '原创图', gis: '转发分享' };
const WORKFLOW_KEYS = ['QGIS', 'Ink', 'PS', 'GIMP', 'AI'];
const STAGES = [
  ['01_pending', '待制池'],
  ['02_waiting', '待审池'],
  ['03_published', '成品库'],
];

/* ================= 状态 ================= */

const state = {
  stage: '02_waiting',
  items: [],
  current: null,      // { mdRel, imageRel, isDraft, imageInfo }
  fields: null,
  body: null,
  dirty: false,
  expanded: new Set(), // 展开的文件夹路径（按阶段持久化）
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ================= API ================= */

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* 非 JSON */ }
  if (!res.ok || (data && data.ok === false)) {
    throw new Error((data && data.error) || `请求失败 (${res.status})`);
  }
  return data;
}

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = type;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- 主题（浅色默认，可切换） ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('atlas_theme', t); } catch (_) { }
  const btn = $('#btnTheme');
  if (btn) btn.textContent = t === 'dark' ? '☀ 亮色' : '🌙 深色';
}

function bindTheme() {
  applyTheme((() => {
    try { return localStorage.getItem('atlas_theme') || 'light'; } catch (_) { return 'light'; }
  })());
  $('#btnTheme').onclick = () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

/* ================= 适配器：本地服务 / GitHub Pages 文件夹 双模式 ================= */

let adapter = null;

function makeServerAdapter() {
  return {
    mode: 'server',
    cfg: null,
    async init() {
      this.cfg = await api('/api/config');
      return this.cfg;
    },
    async listStage(stage) {
      const d = await api(`/api/list?stage=${encodeURIComponent(stage)}`);
      return d.items;
    },
    async getEntry(rel) {
      const d = await api(`/api/item?rel=${encodeURIComponent(rel)}`);
      let fields, body;
      if (d.isDraft) {
        let palette = [];
        try { palette = (await api(`/api/palette?rel=${encodeURIComponent(d.imageRel)}`)).colors; } catch (_) { }
        const stem = d.imageRel.split('/').pop().replace(/\.[^.]+$/, '');
        d.imageInfo.fileName = d.imageRel.split('/').pop();
        ({ fields, body } = MD.buildDraft(stem, d.imageInfo, palette));
      } else {
        ({ fields, body } = MD.parseMdText(d.raw || ''));
      }
      return { isDraft: d.isDraft, mdRel: d.mdRel, imageRel: d.imageRel, fields, body, imageInfo: d.imageInfo, raw: d.raw || '' };
    },
    async getPalette(rel) {
      return (await api(`/api/palette?rel=${encodeURIComponent(rel)}`)).colors;
    },
    async writeText(rel, text) {
      await api('/api/write', postBody({ rel, text }));
    },
    async openExternal(rel) {
      await api('/api/open', postBody({ rel }));
    },
    thumbUrl(rel, info) {
      return `/api/thumb?rel=${encodeURIComponent(rel)}&max=1024&v=${(info && info.mtime) || ''}`;
    },
    async tileSource(rel, info) {
      const enc = encodeURIComponent(rel);
      return new OpenSeadragon.DziTileSource({
        width: info.width, height: info.height, tileSize: 256, tileOverlap: 0,
        minLevel: 0, maxLevel: Math.ceil(Math.log2(Math.max(info.width, info.height))),
        getTileUrl: (l, x, y) => `/api/tile?rel=${enc}&level=${l}&x=${x}&y=${y}`,
      });
    },
  };
}

async function detectAdapter() {
  const force = new URLSearchParams(location.search).get('mode');
  if (force !== 'fs') {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch('/api/ping', { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && cfg.ok) return makeServerAdapter();
      }
    } catch (_) { }
  }
  return FSAdapter;  // GitHub Pages / 静态托管：文件夹直连模式
}

/* ================= 初始化 ================= */

async function init() {
  bindTheme();
  renderStageTabs();
  bindGlobalEvents();
  bindFormEvents();
  adapter = await detectAdapter();
  if (adapter.mode === 'server') {
    $('#modeBadge').textContent = '本地服务';
    $('#modeBadge').title = '通过 editor.py 提供瓦片与文件读写';
    try {
      const cfg = await adapter.init();
      $('#connStatus').textContent = cfg.atlas_core || '未配置路径';
      if (!cfg.atlas_core) openSettings();
      else await loadStage(state.stage);
    } catch (e) {
      $('#connStatus').textContent = '服务异常';
      toast(e.message, 'err');
    }
    return;
  }
  // ---- GitHub Pages 文件夹模式 ----
  $('#modeBadge').textContent = '文件夹模式';
  $('#modeBadge').title = 'GitHub Pages 静态模式：通过浏览器直接读写本地 pic 文件夹（Chrome / Edge）';
  $('#btnConnect').hidden = false;
  $('#btnSettings').hidden = true;
  $('#btnOpenOrig').hidden = true;
  $('#connStatus').textContent = '未连接';
  bindConnect();
  const restored = await FSAdapter.tryRestore().catch(() => false);
  if (restored) {
    $('#connStatus').textContent = `${FSAdapter.label}（点击"连接文件夹"授权）`;
  }
  $('#connectOverlay').hidden = false;
  $('#viewerEmpty').hidden = true;
}

function enterFsSession() {
  $('#connectOverlay').hidden = true;
  $('#viewerEmpty').hidden = false;
  $('#connStatus').textContent = FSAdapter.label;
  toast('已连接：' + FSAdapter.label, 'ok');
  loadStage(state.stage);
}

function bindConnect() {
  const flow = async () => {
    try {
      if (FSAdapter.root && (await FSAdapter.ensurePerm())) {
        enterFsSession();
        return;
      }
      await FSAdapter.pick();
      enterFsSession();
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 用户取消了选择
      toast((e && e.message) || String(e), 'err');
    }
  };
  $('#btnConnect').onclick = flow;
  $('#btnConnectBig').onclick = flow;
}

function renderStageTabs() {
  const nav = $('#stageTabs');
  nav.innerHTML = '';
  STAGES.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.textContent = `${key.slice(0, 2)} ${label}`;
    b.dataset.stage = key;
    if (key === state.stage) b.classList.add('active');
    b.onclick = () => loadStage(key);
    nav.appendChild(b);
  });
}

async function loadStage(stage) {
  state.stage = stage;
  state.expanded = loadExpanded();
  $$('#stageTabs button').forEach(b => b.classList.toggle('active', b.dataset.stage === stage));
  if (!adapter) return;
  try {
    state.items = await adapter.listStage(stage);
    renderList();
  } catch (e) {
    state.items = [];
    renderList();
    toast(e.message, 'err');
  }
}

/* ---------------- 目录树侧栏 ---------------- */

function expandedKey() { return `atlas_expand_${state.stage}`; }

function loadExpanded() {
  try { return new Set(JSON.parse(localStorage.getItem(expandedKey()) || '[]')); }
  catch (_) { return new Set(); }
}

function saveExpanded() {
  try { localStorage.setItem(expandedKey(), JSON.stringify([...state.expanded])); } catch (_) {}
}

function expandTo(folder) {
  // 展开条目所在的所有上级文件夹
  let cur = '';
  for (const p of (folder || '').split('/').filter(Boolean)) {
    cur = cur ? `${cur}/${p}` : p;
    state.expanded.add(cur);
  }
}

function buildTreeModel(items) {
  const root = { name: '', path: '', dirs: new Map(), files: [] };
  for (const it of items) {
    let node = root;
    for (const p of (it.folder || '').split('/').filter(Boolean)) {
      if (!node.dirs.has(p)) {
        node.dirs.set(p, { name: p, path: node.path ? `${node.path}/${p}` : p, dirs: new Map(), files: [] });
      }
      node = node.dirs.get(p);
    }
    node.files.push(it);
  }
  return root;
}

function countUnder(node) {
  let n = node.files.length;
  for (const d of node.dirs.values()) n += countUnder(d);
  return n;
}

function itemBadges(it) {
  const badges = [];
  if (it.hero) badges.push('<span class="badge hero">★</span>');
  if (!it.hasMd) badges.push('<span class="badge nomd">无MD</span>');
  if (state.current && state.current.imageRel === it.imageRel && state.dirty) badges.push('<span class="badge dirty">未保存</span>');
  return badges.join('');
}

function renderFileItem(it, depth) {
  const div = document.createElement('div');
  div.className = 'file-item' + (state.current && state.current.imageRel === it.imageRel ? ' active' : '');
  div.style.setProperty('--depth', depth);
  div.innerHTML = `
    <div class="fname"><b title="${esc(it.stem)}">${esc(it.displayName)}</b>${itemBadges(it)}</div>
    <div class="fsub">${esc(it.id || it.title || '')}</div>`;
  div.onclick = () => openItem(it);
  return div;
}

function renderTreeNode(node, depth, box) {
  const files = [...node.files].sort((a, b) => b.mtime - a.mtime);
  for (const it of files) box.appendChild(renderFileItem(it, depth));
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  for (const dir of dirs) {
    const open = state.expanded.has(dir.path);
    const head = document.createElement('div');
    head.className = 'tree-folder' + (open ? ' open' : '');
    head.style.setProperty('--depth', depth);
    head.innerHTML = `<span class="caret">▶</span><span class="ficon">📁</span><span>${esc(dir.name)}</span><span class="fcount">${countUnder(dir)}</span>`;
    head.onclick = () => {
      if (state.expanded.has(dir.path)) state.expanded.delete(dir.path);
      else state.expanded.add(dir.path);
      saveExpanded();
      renderList();
    };
    box.appendChild(head);
    if (open) renderTreeNode(dir, depth + 1, box);
  }
}

function renderList() {
  const kw = $('#filterInput').value.trim().toLowerCase();
  const box = $('#fileList');
  box.innerHTML = '';
  const matches = state.items.filter(it => {
    if (!kw) return true;
    return [it.stem, it.id, it.title, it.folder].some(v => (v || '').toLowerCase().includes(kw));
  });
  $('#itemCount').textContent = `${matches.length} 项`;
  if (!matches.length) {
    box.innerHTML = '<div class="placeholder" style="position:static;padding:30px 10px;text-align:center">（空）</div>';
    return;
  }
  if (kw) {
    // 筛选时扁平展示，保持原有体验
    for (const it of matches) box.appendChild(renderFileItem(it, 0));
  } else {
    renderTreeNode(buildTreeModel(matches), 0, box);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ================= 打开条目 ================= */

async function openItem(it) {
  if (state.dirty && !confirm('当前修改尚未保存，确定切换吗？')) return;
  const rel = it.mdRel || it.imageRel;
  try {
    const data = await adapter.getEntry(rel);
    state.current = { mdRel: data.mdRel, imageRel: data.imageRel, isDraft: data.isDraft, imageInfo: data.imageInfo };
    state.fields = data.fields;
    state.body = data.body;
    state.dirty = false;
    expandTo(it.folder);
    fillForm();
    loadViewer(data.imageRel, data.imageInfo);
    renderList();
    $('#rawText').value = data.raw || '';
    $('#rawBox').open = false;
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ================= 图片查看器（OpenSeadragon 深焦瓦片） ================= */

let osdViewer = null;
let underlayHidden = false;

function ensureOsd() {
  if (osdViewer) return osdViewer;
  osdViewer = OpenSeadragon({
    element: document.getElementById('osdWrap'),
    showNavigationControl: false,
    animationTime: 0.25,
    blendTime: 0.15,
    immediateRender: true,
    maxZoomPixelRatio: 6,
    minZoomImageRatio: 0.03,
    visibilityRatio: 0.5,
    gestureSettingsMouse: { dblClickToZoom: false },
  });
  osdViewer.addHandler('tile-drawn', hideUnderlaySoon);
  osdViewer.addHandler('canvas-press', hideUnderlay);
  osdViewer.addHandler('canvas-scroll', hideUnderlay);
  osdViewer.addHandler('canvas-double-click', e => {
    e.preventDefaultAction = true;
    const z = imageZoomPct();
    if (Math.abs(z - 100) < 6) osdViewer.viewport.goHome();
    else zoom100();
  });
  let raf = 0;
  const upd = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; $('#zoomLevel').textContent = imageZoomPct() + '%'; });
  };
  osdViewer.addHandler('zoom', upd);
  osdViewer.addHandler('animation', upd);
  return osdViewer;
}

function imageZoomPct() {
  if (!osdViewer || !osdViewer.viewport) return 0;
  return Math.round(osdViewer.viewport.viewportToImageZoom(osdViewer.viewport.getZoom(true)) * 100);
}

function hideUnderlay() {
  const img = $('#mainImg');
  if (underlayHidden || img.style.display === 'none') return;
  underlayHidden = true;
  img.style.opacity = '0';
  setTimeout(() => { if (underlayHidden) img.style.display = 'none'; }, 260);
}

function hideUnderlaySoon() { setTimeout(hideUnderlay, 60); }

function zoom100() {
  const vp = osdViewer.viewport;
  vp.zoomTo(vp.imageToViewportZoom(1), vp.getCenter(), false);
}

async function loadViewer(imageRel, info) {
  const img = $('#mainImg');
  $('#viewerEmpty').style.display = imageRel ? 'none' : 'flex';
  if (!imageRel) {
    if (osdViewer) osdViewer.close();
    img.style.display = 'none';
    $('#zoomLevel').textContent = '';
    return;
  }
  // 即显缩略图垫底，瓦片就绪后淡出
  underlayHidden = false;
  img.style.display = 'block';
  img.style.opacity = '1';
  try {
    img.src = adapter.mode === 'fs'
      ? await adapter.thumbUrl(imageRel)
      : adapter.thumbUrl(imageRel, info);
  } catch (_) { img.style.display = 'none'; }
  const v = ensureOsd();
  try {
    const ts = adapter.mode === 'fs'
      ? { type: 'image', url: await adapter.imageUrl(imageRel) }   // 位图金字塔（浏览器内解码）
      : await adapter.tileSource(imageRel, info);                 // 服务端瓦片金字塔
    v.open(ts);
  } catch (e) {
    toast('图片打开失败：' + e.message, 'err');
  }
  if (info) {
    $('#imgMeta').textContent =
      `${info.width}×${info.height} px · ${info.format || ''} · ${info.sizeMB}MB` +
      (info.dpi ? ` · ${info.dpi} DPI` : ' · 无DPI(按300估)');
  }
}

function bindViewer() {
  $$('#viewerBar [data-zoom]').forEach(b => b.onclick = () => {
    if (!osdViewer) return;
    b.dataset.zoom === 'fit' ? osdViewer.viewport.goHome() : zoom100();
  });
  $('#btnOpenOrig').onclick = async () => {
    if (!state.current || adapter.mode !== 'server') return;
    try { await adapter.openExternal(state.current.imageRel); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/* ================= 表单 ================= */

function markDirty() {
  if (!state.current) return;
  if (!state.dirty) {
    state.dirty = true;
    $('#dirtyDot').classList.add('on');
    renderList();
  }
}

function clearDirty() {
  state.dirty = false;
  $('#dirtyDot').classList.remove('on');
  setSaveMsg('', '');
  renderList();
}

function setSaveMsg(msg, cls) {
  const el = $('#saveMsg');
  el.textContent = msg;
  el.className = cls;
}

function fillForm() {
  const f = state.fields, b = state.body, info = state.current.imageInfo;
  $('#formEmpty').hidden = true;
  $('#formBody').hidden = false;
  $('#saveBar').hidden = false;
  $('#secDraftTip').hidden = !state.current.isDraft;
  if (state.current.isDraft) $('#draftName').textContent = state.current.mdRel.split('/').pop();

  const set = (id, v) => { $(id).value = v ?? ''; };
  set('#f_id', f.id); set('#f_title', f.title); set('#f_alt_name', f.alt_name);
  set('#f_author', f.author); set('#f_date', f.date); set('#f_year', f.year);
  $('#f_hero').checked = String(f.hero || 'no').toLowerCase() === 'yes';
  $('#f_category').value = f.category === 'gis' ? 'gis' : 'original';
  $('#f_categoryName').value = f.categoryName || CATEGORY_NAMES[$('#f_category').value] || '';

  // physicalSize
  const phys = parsePhys(f.physicalSize);
  $('#physW').value = phys.w ?? (info ? info.cmW : '');
  $('#physH').value = phys.h ?? (info ? info.cmH : '');
  const compSel = $('#physComp');
  compSel.innerHTML = COMPOSITIONS.map(c => `<option>${c}</option>`).join('');
  compSel.value = phys.comp || (info ? info.suggestedComposition : COMPOSITIONS[1]);
  updatePhysPreview();

  // 规格信息
  renderImgInfo(info);

  // 分类 chips
  chipField('#subCatChips', splitMulti(f.subCategory), SUBCATS, v => renderTopicSuggest());
  renderTopicSuggest();
  chipField('#topicChips', splitMulti(f.topic), allTopics(), null);

  // alias / tags
  chipField('#aliasChips', f.alias || [], [], null);
  chipField('#tagsChips', f.tags || [], [], null);
  renderTagPresets();

  // colors
  renderColors((f.color || []).slice(0, 8));

  // workflow
  const wf = f.workflow && typeof f.workflow === 'object' ? f.workflow : {};
  renderWorkflow(wf);

  // 正文
  $('#f_intro').value = b.intro || '';
  renderVision(b.items || []);

  clearDirty();
  setSaveMsg('', '');
}

function renderImgInfo(info) {
  const grid = $('#imgInfoGrid');
  if (!info) { grid.innerHTML = '<span class="muted small">未找到配对图片</span>'; return; }
  const cells = [
    ['像素', `${info.width} × ${info.height}`],
    ['DPI', info.dpi || '无 → 按 300 估算'],
    ['物理尺寸', `${info.cmW} × ${info.cmH} cm`],
    ['建议构图', info.suggestedComposition],
    ['文件时间', info.fileTime || '-'],
    ['EXIF 时间', info.exifDate || '-'],
  ];
  grid.innerHTML = cells.map(([k, v]) => `<div class="info-cell"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('');
  const dh = $('#dateHint');
  const bits = [];
  if (info.exifDate) bits.push(`<span class="hint-btn" data-adopt="${esc(info.exifDate)}">采用 EXIF ${esc(info.exifDate.slice(0, 10))}</span>`);
  bits.push(`<span class="hint-btn" data-adopt="${esc((info.fileTime || '').slice(0, 10))}">采用文件时间 ${esc((info.fileTime || '').slice(0, 10))}</span>`);
  bits.push(`<span class="hint-btn" data-today>采用今天</span>`);
  dh.innerHTML = bits.join(' · ');
  dh.querySelectorAll('[data-adopt]').forEach(el => el.onclick = () => {
    const raw = el.dataset.adopt.replace(/[:/-]/g, '.');  // 2024:07:08 → 2024.07.08
    const m = raw.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (m) { $('#f_date').value = `${m[1]}.${m[2]}.${m[3]}`; syncYear(); markDirty(); }
  });
  dh.querySelector('[data-today]').onclick = () => {
    const d = new Date();
    $('#f_date').value = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    syncYear(); markDirty();
  };
}

function parsePhys(s) {
  if (!s) return { w: null, h: null, comp: null };
  const m = String(s).match(/([\d.]+)\s*cm\s*[x×]\s*([\d.]+)\s*cm[，,]?\s*(.*)/);
  if (!m) return { w: null, h: null, comp: null };
  return { w: m[1], h: m[2], comp: m[3] || null };
}

function updatePhysPreview() {
  const w = $('#physW').value, h = $('#physH').value, c = $('#physComp').value;
  $('#physPreview').textContent = w && h ? `${w}cm x ${h}cm，${c}` : '（待填写）';
}

function splitMulti(v) {
  if (Array.isArray(v)) return v.map(String);
  if (!v) return [];
  return String(v).split(/[、,，]/).map(s => s.trim()).filter(Boolean);
}

function allTopics() {
  return [...new Set(Object.values(SUBTOPICS).flat())];
}

/* ---------- 通用 chips 编辑器 ---------- */

function chipField(selector, values, suggestions, onchange) {
  const root = $(selector);
  root.innerHTML = '';
  const list = [...values];
  const render = () => {
    root.querySelectorAll('.chip').forEach(c => c.remove());
    const input = root.querySelector('input');
    list.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${esc(v)} <span class="x" title="移除">×</span>`;
      chip.querySelector('.x').onclick = () => { list.splice(i, 1); render(); markDirty(); onchange && onchange(); };
      root.insertBefore(chip, input);
    });
  };
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = suggestions.length ? '输入或点击下方预设…' : '回车添加';
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (v && !list.includes(v)) { list.push(v); input.value = ''; render(); markDirty(); onchange && onchange(); }
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop(); render(); markDirty(); onchange && onchange();
    }
  };
  root.appendChild(input);
  render();
  root._getList = () => list;
}

function renderTopicSuggest() {
  const subs = $('#subCatChips')._getList ? $('#subCatChips')._getList() : [];
  const pool = subs.length ? [...new Set(subs.flatMap(s => SUBTOPICS[s] || []))] : allTopics();
  const box = $('#topicSuggest');
  box.innerHTML = `<div class="tag-group"><div class="gname">${subs.length ? '当前分类可选专题' : '全部专题（未选分类）'}</div><div class="gchips">${
    pool.map(t => `<span class="sug-chip" data-add="${esc(t)}">${esc(t)}</span>`).join('')}</div></div>`;
  box.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
    const v = el.dataset.add;
    const input = $('#topicChips');
    if (!input._getList().includes(v)) {
      input._getList().push(v);
      input.querySelectorAll('.chip').forEach(c => c.remove());
      const inp = input.querySelector('input');
      input._getList().forEach(val => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${esc(val)} <span class="x">×</span>`;
        chip.querySelector('.x').onclick = () => { chip.remove(); const l = input._getList(); l.splice(l.indexOf(val), 1); renderTopicSuggest(); markDirty(); };
        input.insertBefore(chip, inp);
      });
      markDirty();
    }
    renderTopicSuggest();
  });
}

function renderTagPresets() {
  const box = $('#tagPresetGroups');
  box.innerHTML = Object.entries(TAG_PRESETS).map(([g, tags]) =>
    `<div class="tag-group"><div class="gname">${g}</div><div class="gchips">${
      tags.map(t => `<span class="sug-chip" data-tag="${esc(t)}">${esc(t)}</span>`).join('')}</div></div>`).join('');
  const refresh = () => {
    const used = new Set($('#tagsChips')._getList());
    box.querySelectorAll('[data-tag]').forEach(el => el.classList.toggle('used', used.has(el.dataset.tag)));
  };
  box.querySelectorAll('[data-tag]').forEach(el => el.onclick = () => {
    const v = el.dataset.tag;
    const l = $('#tagsChips')._getList();
    if (l.includes(v)) { l.splice(l.indexOf(v), 1); } else { l.push(v); }
    // 重渲染 chips
    const input = $('#tagsChips');
    input.querySelectorAll('.chip').forEach(c => c.remove());
    const inp = input.querySelector('input');
    l.forEach(val => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${esc(val)} <span class="x">×</span>`;
      chip.querySelector('.x').onclick = () => { const i = l.indexOf(val); l.splice(i, 1); chip.remove(); refresh(); markDirty(); };
      input.insertBefore(chip, inp);
    });
    refresh();
    markDirty();
  });
  refresh();
}

/* ---------- 色板 ---------- */

function renderColors(colors) {
  const box = $('#colorList');
  const list = [...(colors || [])];
  while (list.length < 5) list.push('');
  const render = () => {
    box.innerHTML = '';
    list.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'color-row';
      const safe = /^#[0-9A-Fa-f]{6}$/.test(c) ? c : (c ? '#888888' : '#000000');
      row.innerHTML = `
        <span class="muted small">#${i + 1}</span>
        <input type="color" value="${safe}" ${c ? '' : 'style="opacity:.35"'}>
        <input type="text" class="hex" value="${esc(c)}" placeholder="#RRGGBB">
        <div class="swatch-preview" style="background:${safe}"></div>`;
      const colorInp = row.querySelector('input[type=color]');
      const hexInp = row.querySelector('.hex');
      const prev = row.querySelector('.swatch-preview');
      colorInp.oninput = () => { hexInp.value = colorInp.value.toUpperCase(); prev.style.background = colorInp.value; list[i] = hexInp.value; markDirty(); };
      hexInp.oninput = () => {
        const v = hexInp.value.trim();
        list[i] = v;
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) { colorInp.value = v; prev.style.background = v; }
        markDirty();
      };
      box.appendChild(row);
    });
    box._getList = () => list.filter(Boolean);
  };
  render();
}

/* ---------- workflow ---------- */

function renderWorkflow(wf) {
  const box = $('#wfList');
  box.innerHTML = '';
  const vals = {};
  WORKFLOW_KEYS.forEach(k => {
    const raw = String(wf[k] ?? '0').replace('%', '').trim();
    vals[k] = Number.isFinite(parseInt(raw)) ? parseInt(raw) : 0;
  });
  const extra = Object.keys(wf).filter(k => !WORKFLOW_KEYS.includes(k));
  const keys = [...WORKFLOW_KEYS, ...extra];
  extra.forEach(k => vals[k] = parseInt(String(wf[k]).replace('%', '')) || 0);
  const render = () => {
    box.innerHTML = '';
    keys.forEach(k => {
      const row = document.createElement('div');
      row.className = 'wf-row';
      row.innerHTML = `<span class="wname">${esc(k)}</span>
        <input type="range" min="0" max="100" step="5" value="${vals[k]}">
        <span class="wval">${vals[k]}%</span>`;
      const rng = row.querySelector('input');
      rng.oninput = () => { vals[k] = +rng.value; row.querySelector('.wval').textContent = rng.value + '%'; updateSum(); markDirty(); };
      box.appendChild(row);
    });
    updateSum();
  };
  const updateSum = () => {
    const total = keys.reduce((s, k) => s + vals[k], 0);
    const el = $('#wfSum');
    el.textContent = total + '%';
    el.className = 'badge ' + (total === 100 ? 'ok' : 'bad');
  };
  $('#btnNormWf').onclick = () => {
    const total = keys.reduce((s, k) => s + vals[k], 0);
    if (total <= 0) { vals.QGIS = 100; }
    else {
      let acc = 0;
      keys.forEach((k, i) => {
        if (i === keys.length - 1) vals[k] = 100 - acc;
        else { vals[k] = Math.round(vals[k] / total * 100 / 5) * 5; acc += vals[k]; }
      });
      // 修正尾差
      let diff = 100 - keys.reduce((s, k) => s + vals[k], 0);
      for (const k of keys) { while (diff > 0 && vals[k] + 5 <= 100) { vals[k] += 5; diff -= 5; } while (diff < 0 && vals[k] - 5 >= 0) { vals[k] -= 5; diff += 5; } }
    }
    render();
    markDirty();
  };
  render();
  box._getMap = () => {
    const m = {};
    keys.forEach(k => m[k] = vals[k] + '%');
    return m;
  };
}

/* ---------- 视觉语言条目 ---------- */

function renderVision(items) {
  const box = $('#visionList');
  box.innerHTML = '';
  const list = items.map(it => ({ term: it.term || '', desc: it.desc || '' }));
  const render = () => {
    box.innerHTML = '';
    list.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'vision-row';
      row.innerHTML = `
        <input type="text" class="vterm" placeholder="要点名（加粗词）" value="${esc(it.term)}">
        <textarea placeholder="描述…" rows="2">${esc(it.desc)}</textarea>
        <div class="vops">
          <button class="btn ghost mini" data-op="up" title="上移">↑</button>
          <button class="btn ghost mini" data-op="del" title="删除">×</button>
        </div>`;
      row.querySelector('.vterm').oninput = e => { it.term = e.target.value; markDirty(); };
      row.querySelector('textarea').oninput = e => { it.desc = e.target.value; markDirty(); };
      row.querySelector('[data-op=up]').onclick = () => {
        if (i > 0) { const t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; render(); markDirty(); }
      };
      row.querySelector('[data-op=del]').onclick = () => { list.splice(i, 1); render(); markDirty(); };
      box.appendChild(row);
    });
    box._getList = () => list.filter(it => it.term || it.desc);
  };
  render();
  $('#btnAddVision').onclick = () => { list.push({ term: '', desc: '' }); render(); markDirty(); box.lastElementChild && box.lastElementChild.querySelector('.vterm').focus(); };
}

/* ================= 收集 & 保存 ================= */

function syncYear() {
  const m = ($('#f_date').value || '').match(/(\d{4})[.\-/](\d{1,2})/);
  if (m) $('#f_year').value = `${m[1]}.${parseInt(m[2])}`;
}

function collectForm() {
  syncYear();
  const fields = {};
  const keep = (k, v) => { if (v !== undefined && v !== null && v !== '') fields[k] = v; };
  keep('id', $('#f_id').value.trim());
  keep('title', $('#f_title').value.trim());
  keep('alt_name', $('#f_alt_name').value.trim());
  keep('author', $('#f_author').value.trim());
  keep('date', $('#f_date').value.trim());
  keep('year', $('#f_year').value.trim());
  if ($('#physW').value && $('#physH').value) {
    fields.physicalSize = `${(+$('#physW').value).toFixed(1)}cm x ${(+$('#physH').value).toFixed(1)}cm，${$('#physComp').value}`;
  }
  const cat = $('#f_category').value;
  fields.category = cat;
  fields.categoryName = $('#f_categoryName').value || CATEGORY_NAMES[cat];
  const subs = $('#subCatChips')._getList();
  if (subs.length) fields.subCategory = subs.join('、');
  const tops = $('#topicChips')._getList();
  if (tops.length) fields.topic = tops.join('、');
  fields.hero = $('#f_hero').checked ? 'yes' : 'no';
  const imgName = state.current.imageRel ? state.current.imageRel.split('/').pop() : '';
  if (imgName) fields.image = imgName;
  const alias = $('#aliasChips')._getList();
  if (alias.length) fields.alias = alias;
  const tags = $('#tagsChips')._getList();
  if (tags.length) fields.tags = tags;
  const colors = $('#colorList')._getList();
  if (colors.length) fields.color = colors;
  fields.workflow = $('#wfList')._getMap();
  // 保留未知附加字段（__order__ 除外）
  if (state.fields) {
    for (const k of (state.fields.__order__ || [])) {
      if (k === '__order__' || k in fields) continue;
      const v = state.fields[k];
      if (v !== undefined && v !== null && v !== '') fields[k] = v;
    }
  }
  const body = {
    intro: $('#f_intro').value,
    items: $('#visionList')._getList(),
  };
  return { fields, body };
}

function postBody(obj) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

async function save() {
  if (!state.current) return;
  const { fields, body } = collectForm();
  const imageName = state.current.imageRel ? state.current.imageRel.split('/').pop() : '';
  if (imageName) fields.image = imageName;  // 始终写配对图片名
  const { errors, warnings } = MD.validate(fields, body, { imageName });
  if (errors.length) {
    setSaveMsg(errors.join('；'), 'err');
    toast('保存失败：' + errors.join('；'), 'err');
    return;
  }
  const text = MD.serializeMd(fields, body);
  try {
    await adapter.writeText(state.current.mdRel, text);
    clearDirty();
    state.current.isDraft = false;
    $('#secDraftTip').hidden = true;
    $('#rawText').value = text;
    let msg = '已保存';
    if (warnings.length) {
      msg = '已保存，但注意：' + warnings.join('；');
      toast(msg, 'err');
    } else {
      toast(msg, 'ok');
    }
    setSaveMsg(msg, warnings.length ? 'err' : 'ok');
    state.items = await adapter.listStage(state.stage);
    renderList();
  } catch (e) {
    setSaveMsg(e.message, 'err');
    toast('保存失败：' + e.message, 'err');
  }
}

/* ================= 源码模式 ================= */

function bindRaw() {
  $('#rawBox').querySelector('summary').addEventListener('click', e => {
    if ($('#rawBox').open) return; // 即将展开 → 生成预览
    e.preventDefault();
    $('#rawBox').open = true;
    refreshRaw();
  });
  function refreshRaw() {
    if (!state.current) return;
    const { fields, body } = collectForm();
    $('#rawText').value = MD.serializeMd(fields, body);
  }
  $('#btnRawRefresh').onclick = refreshRaw;
  $('#btnRawApply').onclick = () => {
    const { fields, body, ok } = MD.parseMdText($('#rawText').value);
    if (!ok) { toast('无法解析：缺少 frontmatter 或格式错误', 'err'); return; }
    state.fields = fields;
    state.body = body;
    fillForm();
    markDirty();
    toast('已应用回表单', 'ok');
  };
}

/* ================= 设置 ================= */

function openSettings() {
  $('#cfgAtlas').value = ($('#connStatus').textContent !== '未配置路径' && $('#connStatus').textContent !== '服务异常')
    ? $('#connStatus').textContent : '';
  $('#settingsDlg').showModal();
}

function bindSettings() {
  $('#btnSettings').onclick = openSettings;
  $('#cfgCancel').onclick = () => $('#settingsDlg').close();
  $('#cfgSave').onclick = async () => {
    try {
      await api('/api/config', postBody({ atlas_core: $('#cfgAtlas').value.trim() }));
      $('#settingsDlg').close();
      $('#connStatus').textContent = $('#cfgAtlas').value.trim();
      toast('配置已保存', 'ok');
      await loadStage(state.stage);
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ================= 全局事件 ================= */

function bindGlobalEvents() {
  bindViewer();
  bindRaw();
  bindSettings();
  $('#filterInput').oninput = renderList;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // 表单面板宽度拖拽
  const splitter = $('#splitter');
  splitter.addEventListener('mousedown', e => {
    splitter.classList.add('on');
    const move = ev => {
      const w = window.innerWidth - ev.clientX;
      $('#formPane').style.width = Math.min(Math.max(w, 360), window.innerWidth * 0.6) + 'px';
    };
    const up = () => { splitter.classList.remove('on'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
  });
}

function bindFormEvents() {
  $('#formScroll').addEventListener('input', e => {
    if (e.target.closest('#rawBox')) return;
    markDirty();
    if (e.target.id === 'f_date') syncYear();
    if (['physW', 'physH', 'physComp'].includes(e.target.id)) updatePhysPreview();
  });
  $('#f_hero').onchange = markDirty;
  $('#f_category').onchange = () => {
    $('#f_categoryName').value = CATEGORY_NAMES[$('#f_category').value];
    markDirty();
  };
  $('#btnApplyPhys').onclick = () => {
    const info = state.current && state.current.imageInfo;
    if (!info) return toast('没有图片信息', 'err');
    if (!$('#physW').value) $('#physW').value = info.cmW;
    if (!$('#physH').value) $('#physH').value = info.cmH;
    updatePhysPreview();
    markDirty();
  };
  $('#btnAutoPhys').onclick = () => {
    const info = state.current && state.current.imageInfo;
    if (!info) return toast('没有图片信息', 'err');
    $('#physW').value = info.cmW;
    $('#physH').value = info.cmH;
    $('#physComp').value = info.suggestedComposition;
    updatePhysPreview();
    markDirty();
    toast(`已按 ${info.dpi || 300} DPI 计算物理尺寸`, 'ok');
  };
  $('#btnPalette').onclick = async () => {
    if (!state.current || !state.current.imageRel) return;
    try {
      const colors = await adapter.getPalette(state.current.imageRel);
      renderColors(colors);
      markDirty();
      toast('已提取 5 主色', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#btnSave').onclick = save;
}

init();
