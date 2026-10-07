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

// 图片/MD 所在流水线池 → status 字段与显示名（状态由文件夹位置唯一决定）
function stageInfoOf(rel) {
  const key = String(rel || '').split('/')[0];
  const found = STAGES.find(([k]) => k === key);
  return { key, status: MD.STAGE_STATUS[key] || '', label: found ? found[1] : key };
}

/* ================= 状态 ================= */

const state = {
  stage: '02_waiting',
  items: [],
  current: null,      // { mdRel, imageRel, isDraft, imageInfo }
  fields: null,
  body: null,
  dirty: false,
  expanded: new Set(), // 展开的文件夹路径（按阶段持久化）
  annotateMode: false,
  pickingTargetIndex: null,
};
window.state = state;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- 图标（Keyline Icons · sharp · MIT，https://keylineicons.com） ---------- */
const ICONS = {
  folder: '<path d="M3 7C3 5.3431 4.3431 4 6 4L8.6716 4C9.202 4 9.7107 4.2107 10.0858 4.5858L11.4142 5.9142C11.7893 6.2893 12.298 6.5 12.8284 6.5L18 6.5C19.6569 6.5 21 7.8431 21 9.5L21 17C21 18.6569 19.6569 20 18 20L6 20C4.3431 20 3 18.6569 3 17Z"/>',
  'folder-open': '<path d="M6 15L7.4472 12.1056C7.786 11.428 8.4785 11 9.2361 11L19.9978 11C21.4451 11 22.4132 12.4897 21.8254 13.8123L19.6032 18.8123C19.2822 19.5345 18.5659 20 17.7756 20L4 20C2.8954 20 2 19.1046 2 18L2 6C2 4.8954 2.8954 4 4 4L7.3787 4C7.7765 4 8.158 4.158 8.4393 4.4393L9.5607 5.5607C9.842 5.842 10.2235 6 10.6213 6L17 6C18.1046 6 19 6.8954 19 8L19 11"/>',
  'chevron-right': '<path d="M9 6L15 12L9 18"/>',
  'chevron-down': '<path d="M6 9L12 15L18 9"/>',
  link: '<path d="M8.1883 18.4383C7.5084 19.1181 6.5864 19.5 5.625 19.5C4.6636 19.5 3.7416 19.1181 3.0617 18.4383C2.3819 17.7584 2 16.8364 2 15.875C2 14.9136 2.3819 13.9916 3.0617 13.3117L8.1867 8.1867C8.8666 7.5069 9.7886 7.125 10.75 7.125C11.7114 7.125 12.6334 7.5069 13.3133 8.1867C13.9931 8.8666 14.375 9.7886 14.375 10.75C14.375 11.7114 13.9931 12.6334 13.3133 13.3133M15.8117 5.5617C16.4916 4.8819 17.4136 4.5 18.375 4.5C19.3364 4.5 20.2584 4.8819 20.9383 5.5617C21.6181 6.2416 22 7.1636 22 8.125C22 9.0864 21.6181 10.0084 20.9383 10.6883L15.8133 15.8133C15.1334 16.4931 14.2114 16.875 13.25 16.875C12.2886 16.875 11.3666 16.4931 10.6867 15.8133C10.0069 15.1334 9.625 14.2114 9.625 13.25C9.625 12.2886 10.0069 11.3666 10.6867 10.6867"/>',
  settings: '<path d="M13.5 4.8845C13.5 5.3482 13.8221 5.7434 14.2571 5.9041C14.4124 5.9615 14.5649 6.0247 14.7143 6.0933C15.1356 6.2869 15.6427 6.2353 15.9706 5.9076L16.5966 5.2819C16.9872 4.8916 17.6202 4.8917 18.0106 5.2821L18.7175 5.989C19.1081 6.3796 19.108 7.0129 18.7173 7.4034L18.0922 8.0283C17.7641 8.3562 17.7124 8.8636 17.9062 9.2851C17.975 9.4347 18.0383 9.5874 18.0958 9.7429C18.2566 10.1779 18.6518 10.5 19.1155 10.5L20 10.5C20.5523 10.5 21 10.9477 21 11.5L21 12.5C21 13.0523 20.5523 13.5 20 13.5L19.1155 13.5C18.6518 13.5 18.2566 13.8221 18.0956 14.257C18.0381 14.4123 17.9749 14.5648 17.9061 14.7143C17.7123 15.1355 17.7639 15.6428 18.0918 15.9707L18.7177 16.5966C19.1082 16.9871 19.1082 17.6203 18.7177 18.0108L18.0108 18.7177C17.6203 19.1082 16.9871 19.1082 16.5966 18.7177L15.9707 18.0918C15.6428 17.7639 15.1355 17.7123 14.7141 17.9058C14.5647 17.9745 14.4123 18.0376 14.2571 18.0949C13.8221 18.2556 13.5 18.6508 13.5 19.1145L13.5 20C13.5 20.5523 13.0523 21 12.5 21L11.5 21C10.9477 21 10.5 20.5523 10.5 20L10.5 19.1145C10.5 18.6508 10.1779 18.2556 9.7429 18.0951C9.5874 18.0377 9.4348 17.9746 9.2852 17.9059C8.8636 17.7124 8.3562 17.7641 8.0283 18.0922L7.4034 18.7173C7.0129 19.108 6.3796 19.1081 5.989 18.7175L5.2821 18.0106C4.8917 17.6202 4.8916 16.9872 5.2819 16.5966L5.9076 15.9706C6.2353 15.6427 6.2869 15.1356 6.0933 14.7143C6.0247 14.5649 5.9615 14.4124 5.9041 14.2571C5.7434 13.8221 5.3482 13.5 4.8845 13.5L4 13.5C3.4477 13.5 3 13.0523 3 12.5L3 11.5C3 10.9477 3.4477 10.5 4 10.5L4.8845 10.5C5.3482 10.5 5.7434 10.1779 5.904 9.7429C5.9614 9.5874 6.0245 9.4346 6.0933 9.285C6.2867 8.8635 6.2351 8.3562 5.9072 8.0283L5.2823 7.4034C4.8918 7.0129 4.8918 6.3797 5.2823 5.9892L5.9892 5.2823C6.3797 4.8918 7.0129 4.8918 7.4034 5.2823L8.0283 5.9072C8.3562 6.2351 8.8635 6.2867 9.285 6.0933C9.4346 6.0245 9.5874 5.9614 9.7429 5.904C10.1779 5.7434 10.5 5.3482 10.5 4.8845L10.5 4C10.5 3.4477 10.9477 3 11.5 3L12.5 3C13.0523 3 13.5 3.4477 13.5 4L13.5 4.8845ZM12 9.5C13.3807 9.5 14.5 10.6193 14.5 12C14.5 13.3807 13.3807 14.5 12 14.5C10.6193 14.5 9.5 13.3807 9.5 12C9.5 10.6193 10.6193 9.5 12 9.5Z"/>',
  pin: '<path d="M12 21C12 21 19 14.5 19 9.5C19 5.63401 15.866 2.5 12 2.5C8.13401 2.5 5 5.63401 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  sun: '<path d="M16.5 12C16.5 14.4854 14.4854 16.5 12 16.5C9.5147 16.5 7.5 14.4854 7.5 12C7.5 9.5147 9.5147 7.5 12 7.5C14.4854 7.5 16.5 9.5147 16.5 12ZM20.5 12L22 12M18.0104 18.0104L19.0711 19.0711M12 20.5L12 22M5.9896 18.0104L4.9289 19.0711M3.5 12L2 12M5.9896 5.9896L4.9289 4.9289M12 3.5L12 2M18.0104 5.9896L19.0711 4.9289"/>',
  moon: '<path d="M21 12C21 16.9706 16.9706 21 12 21C7.0294 21 3 16.9706 3 12C3 7.0294 7.0294 3 12 3C9.9618 5.5477 10.1652 9.2206 12.4723 11.5277C14.7794 13.8348 18.4523 14.0382 21 12Z"/>',
  image: '<path d="M6 3L18 3C19.6569 3 21 4.3431 21 6L21 18C21 19.6569 19.6569 21 18 21L6 21C4.3431 21 3 19.6569 3 18L3 6C3 4.3431 4.3431 3 6 3ZM3 18L7.9393 13.0607C8.5251 12.4749 9.4749 12.4749 10.0607 13.0607L12.0801 15.0801C12.6079 15.6079 13.4436 15.6673 14.0408 15.2194L15.9592 13.7806C16.5564 13.3327 17.3921 13.3921 17.9199 13.9199L21 17"/><path d="M9.5 7.5C9.5 8.3284 8.8284 9 8 9C7.1716 9 6.5 8.3284 6.5 7.5C6.5 6.6716 7.1716 6 8 6C8.8284 6 9.5 6.6716 9.5 7.5Z" fill="currentColor" stroke="none"/>',
  'arrow-up': '<path d="M5 11.8771L11.5875 5.17385C11.8153 4.94205 12.1847 4.94205 12.4125 5.17385L19 11.8771M12 19V5.94129"/>',
};
const icon = (name, size = 14) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- 文本框随内容自动增高（无滚动条，空值按 minRows 行高） ---------- */

function autoGrow(ta, minRows = 2) {
  const cs = getComputedStyle(ta);
  const lineH = parseFloat(cs.lineHeight) || 20;
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const minH = minRows * lineH + pad + 2;
  ta.classList.add('_ag');
  ta.style.resize = 'none';
  ta.style.overflowY = 'hidden';
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight + 2, minH) + 'px';
  };
  ta.addEventListener('input', grow);
  ta._grow = grow;
  grow();
}

function regrowTextareas() {
  $$('textarea._ag').forEach(t => t._grow && t._grow());
}

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
  if (btn) btn.innerHTML = t === 'dark' ? `${icon('sun')} 亮色` : `${icon('moon')} 深色`;
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
    async browseDir(initialDir) {
      return await api('/api/pick_dir', postBody({ initial_dir: initialDir || '' }));
    },
    async openExplorer(path) {
      return await api('/api/open_explorer', postBody({ path: path || '' }));
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
  // 给带 data-icon 的静态元素注入 SVG 图标
  $$('[data-icon]').forEach(el => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, +(el.dataset.iconSize || 14)));
  });
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
  const btnConn = $('#btnConnect');
  if (btnConn) {
    btnConn.hidden = false;
    btnConn.title = '更换已授权的本地 pic 文件夹路径';
    const span = btnConn.querySelector('span');
    if (span) span.textContent = '更换文件夹';
    else btnConn.textContent = '更换文件夹';
  }
  toast('已连接：' + FSAdapter.label, 'ok');
  loadStage(state.stage);
}

function bindConnect() {
  // pickFolder：无论之前是否连接，点击都唤起选择器重新更换/选择文件夹
  const pickFolder = async () => {
    try {
      await FSAdapter.pick();
      enterFsSession();
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 用户取消了选择
      toast((e && e.message) || String(e), 'err');
    }
  };

  // 快捷恢复授权流程（用于初次进入且有历史记录时直接请求授权）
  const restoreOrPick = async () => {
    try {
      if (FSAdapter.root && (await FSAdapter.ensurePerm())) {
        enterFsSession();
        return;
      }
      await pickFolder();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast((e && e.message) || String(e), 'err');
    }
  };

  // 顶部“更换文件夹”按钮：无论当前是否已连接，点击直接唤起目录选择器更换新目录
  $('#btnConnect').onclick = pickFolder;
  // 引导层大按钮：优先尝试恢复，无句柄则唤起选择器
  $('#btnConnectBig').onclick = restoreOrPick;
}

function renderStageTabs() {
  const nav = $('#stageTabs');
  nav.innerHTML = '';
  STAGES.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.innerHTML = `<span>${key.slice(0, 2)} ${label}</span><span class="stage-dot empty" data-dot="${key}"></span>`;
    b.dataset.stage = key;
    if (key === state.stage) b.classList.add('active');
    b.onclick = () => loadStage(key);
    nav.appendChild(b);
  });
}

// 刷新三个池子（待制池/待审池/成品库）的非空指示灯
async function refreshStageDots() {
  if (!adapter) return;
  STAGES.forEach(async ([key, label]) => {
    try {
      const items = await adapter.listStage(key);
      const dot = $(`#stageTabs .stage-dot[data-dot="${key}"]`);
      const btn = $(`#stageTabs button[data-stage="${key}"]`);
      if (dot) {
        const hasItems = items && items.length > 0;
        dot.classList.toggle('empty', !hasItems);
        if (btn) {
          btn.title = hasItems ? `${key} (${label})：共有 ${items.length} 个作品` : `${key} (${label})：暂无图片`;
        }
      }
    } catch (_) {}
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
    if (adapter.mode === 'fs' && adapter.connected && !state.items.length) {
      toast(`「${FSAdapter.label}/${stage}」里没有图片（支持 png/jpg/jpeg/webp/tif/tiff/bmp）`);
    }
  } catch (e) {
    state.items = [];
    renderList();
    toast(e.message, 'err');
  }
  // 加载后同步刷新所有指示灯状态
  refreshStageDots();
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
    head.innerHTML = `<span class="caret">${icon('chevron-right', 12)}</span><span class="ficon">${icon('folder', 14)}</span><span>${esc(dir.name)}</span><span class="fcount">${countUnder(dir)}</span>`;
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
    state.pickingTargetIndex = null;
    updateAnnotateModeUI();
    expandTo(it.folder);
    fillForm();
    loadViewer(data.imageRel, data.imageInfo);
    renderList();
    $('#rawText').value = data.raw || '';
    requestAnimationFrame(() => updateRawGutter());
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
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
  });
  osdViewer.addHandler('tile-drawn', () => {
    hideUnderlaySoon();
    $('#imgLoading').hidden = true;
    renderOsdOverlays();
  });
  osdViewer.addHandler('open', () => {
    renderOsdOverlays();
  });
  osdViewer.addHandler('open-failed', () => {
    $('#imgLoading').hidden = true;
    toast('原图解码失败：文件过大或浏览器不支持该格式', 'err');
  });
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
    raf = requestAnimationFrame(() => {
      raf = 0;
      $('#zoomLevel').textContent = imageZoomPct() + '%';
      const list = $('#annList')?._getList ? $('#annList')._getList() : (state.fields?.annotations || []);
      if (list && list.length && typeof updateSvgShapes === 'function') {
        updateSvgShapes(list);
      }
    });
  };
  osdViewer.addHandler('zoom', upd);
  osdViewer.addHandler('pan', upd);
  osdViewer.addHandler('animation', upd);
  osdViewer.addHandler('update-viewport', upd);

  // 采点交互：点击大图添加或更新标注
  osdViewer.addHandler('canvas-click', e => {
    if (!e.quick || !state.current) return;

    // 若处于标注采点模式或点位更新模式，优先阻止 OSD 默认点击行为（防止触发缩放）
    if (state.annotateMode || state.pickingTargetIndex !== null) {
      e.preventDefaultAction = true;
    }

    const vpPoint = osdViewer.viewport.pointFromPixel(e.position);
    const imgPoint = osdViewer.viewport.viewportToImageCoordinates(vpPoint);
    const info = state.current.imageInfo;
    const imgW = info ? info.width : 0;
    const imgH = info ? info.height : 0;
    const x = Math.round(imgPoint.x);
    const y = Math.round(imgPoint.y);
    if (imgW && imgH && (x < 0 || x > imgW || y < 0 || y > imgH)) return;

    // Alt + 鼠标点击：如果有当前激活/选中的标注，直接将点位或几何中心瞬移到点击坐标
    if (e.originalEvent && e.originalEvent.altKey) {
      e.preventDefaultAction = true;
      const activeCard = $('#annList .ann-card.highlight');
      const activeIdx = activeCard ? parseInt(activeCard.dataset.idx, 10) : -1;
      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      if (activeIdx >= 0 && list[activeIdx]) {
        const curAnn = list[activeIdx];
        if (curAnn.type === 'point' || !curAnn.type) {
          curAnn.coord = [x, y];
          toast(`[Alt快捷定位] 已将标注 #${activeIdx + 1}「${curAnn.title || curAnn.id}」移动至 [${x}, ${y}]`, 'ok');
        } else if (curAnn.type === 'rect' && Array.isArray(curAnn.bbox) && curAnn.bbox.length === 4) {
          const bw = curAnn.bbox[2];
          const bh = curAnn.bbox[3];
          curAnn.bbox[0] = Math.max(0, Math.round(x - bw / 2));
          curAnn.bbox[1] = Math.max(0, Math.round(y - bh / 2));
          curAnn.coord = [x, y];
          toast(`[Alt快捷定位] 已将矩形 #${activeIdx + 1} 中心移动至 [${x}, ${y}]`, 'ok');
        } else if (curAnn.type === 'area' && Array.isArray(curAnn.polygon) && curAnn.polygon.length) {
          const cp = getPolygonCentroid(curAnn.polygon) || curAnn.polygon[0];
          const dx = x - cp[0];
          const dy = y - cp[1];
          curAnn.polygon = curAnn.polygon.map(([px, py]) => [px + dx, py + dy]);
          curAnn.coord = [x, y];
          toast(`[Alt快捷定位] 已将多边形 #${activeIdx + 1} 整体移至 [${x}, ${y}]`, 'ok');
        } else if (curAnn.type === 'path' && Array.isArray(curAnn.polyline) && curAnn.polyline.length) {
          const mp = getPolylineMidpoint(curAnn.polyline) || curAnn.polyline[0];
          const dx = x - mp[0];
          const dy = y - mp[1];
          curAnn.polyline = curAnn.polyline.map(([px, py]) => [px + dx, py + dy]);
          curAnn.coord = [x, y];
          toast(`[Alt快捷定位] 已将折线 #${activeIdx + 1} 整体移至 [${x}, ${y}]`, 'ok');
        }
        markDirty();

        // 局部更新卡片输入框
        const ix = activeCard.querySelector('.ann-input-x');
        const iy = activeCard.querySelector('.ann-input-y');
        if (ix && curAnn.coord) ix.value = curAnn.coord[0];
        if (iy && curAnn.coord) iy.value = curAnn.coord[1];

        const taGeom = activeCard.querySelector('.ann-geom-textarea');
        if (taGeom) {
          if (curAnn.type === 'area' && curAnn.polygon) taGeom.value = JSON.stringify(curAnn.polygon);
          else if (curAnn.type === 'path' && curAnn.polyline) taGeom.value = JSON.stringify(curAnn.polyline);
          else if (curAnn.type === 'rect' && curAnn.bbox) taGeom.value = JSON.stringify(curAnn.bbox);
        }

        renderOsdOverlays();
        highlightAnnCard(activeIdx, false);
        return;
      }

      // 未选中标注卡片时回退为开发者坐标复制
      const coordStr = `[${x}, ${y}]`;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(coordStr).catch(() => {});
      console.log(`%c[DevTools] %c拾取绝对像素坐标: %c${coordStr}`, 'background:#111;color:#ff9800;font-weight:bold;padding:2px 4px', 'color:#aaa', 'color:#00e676;font-weight:bold');
      toast(`[DevTools] 拾取坐标: ${coordStr}`, 'ok');
      return;
    }

    if (!state.annotateMode && state.pickingTargetIndex === null) return;
    if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.closest('.osd-pin, .ann-vertex-handle')) return;

    if (state.pickingTargetIndex !== null) {
      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      const curAnn = list[state.pickingTargetIndex];
      if (curAnn) {
        const idx = state.pickingTargetIndex;
        if (curAnn.type === 'area') {
          curAnn.polygon = Array.isArray(curAnn.polygon) ? curAnn.polygon : [];
          curAnn.polygon.push([x, y]);
          toast(`已向多边形追加第 ${curAnn.polygon.length} 个顶点: [${x}, ${y}]`, 'ok');
        } else if (curAnn.type === 'path') {
          curAnn.polyline = Array.isArray(curAnn.polyline) ? curAnn.polyline : [];
          curAnn.polyline.push([x, y]);
          toast(`已向路线追加第 ${curAnn.polyline.length} 个节点: [${x}, ${y}]`, 'ok');
        } else if (curAnn.type === 'rect') {
          state.pickingTargetIndex = null;
          updateAnnotateModeUI();
          startRectDragSelect(idx);
          return;
        } else {
          curAnn.coord = [x, y];
          state.pickingTargetIndex = null;
          updateAnnotateModeUI();
          toast(`已更新标注 #${idx + 1} 坐标为 [${x}, ${y}]`, 'ok');
        }
        markDirty();
        renderAnnotations(list);
        highlightAnnCard(idx);
      }
      return;
    }

    if (state.annotateMode) {
      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      const nextId = generateAnnId(list.length, 'point');
      const curZoom = Number((osdViewer.viewport.viewportToImageZoom(osdViewer.viewport.getZoom(true))).toFixed(1)) || 2.0;
      const newAnn = {
        id: nextId,
        type: 'point',
        coord: [x, y],
        title: `点位 ${list.length + 1}`,
        desc: '',
        level: 'primary',
        zoomLevel: curZoom,
      };
      list.push(newAnn);
      renderAnnotations(list);
      markDirty();
      toast(`已在 [${x}, ${y}] 添加标注 #${nextId}`, 'ok');
      highlightAnnCard(list.length - 1, false);
    }
  });

  // 鼠标移动显示真实像素坐标
  const canvasEl = osdViewer.canvas;
  canvasEl.addEventListener('pointermove', e => {
    if (!osdViewer || !osdViewer.viewport || !state.current || !state.current.imageInfo) {
      $('#cursorCoord').textContent = '';
      return;
    }
    const rect = canvasEl.getBoundingClientRect();
    const pt = new OpenSeadragon.Point(e.clientX - rect.left, e.clientY - rect.top);
    const vpPoint = osdViewer.viewport.pointFromPixel(pt);
    const imgPoint = osdViewer.viewport.viewportToImageCoordinates(vpPoint);
    const info = state.current.imageInfo;
    const x = Math.round(imgPoint.x);
    const y = Math.round(imgPoint.y);
    if (x >= 0 && x <= info.width && y >= 0 && y <= info.height) {
      $('#cursorCoord').textContent = `[${x}, ${y}]`;
    } else {
      $('#cursorCoord').textContent = '';
    }
  });
  canvasEl.addEventListener('pointerleave', () => {
    $('#cursorCoord').textContent = '';
  });

  window.osdViewer = osdViewer;
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
  const loading = $('#imgLoading');
  $('#viewerEmpty').style.display = imageRel ? 'none' : 'flex';
  if (!imageRel) {
    if (osdViewer) {
      osdViewer.close();
      osdViewer.clearOverlays();
    }
    img.style.display = 'none';
    loading.hidden = true;
    $('#zoomLevel').textContent = '';
    $('#cursorCoord').textContent = '';
    return;
  }
  // 即显缩略图垫底，瓦片就绪后淡出
  underlayHidden = false;
  img.style.display = 'block';
  img.style.opacity = '1';
  const isFs = adapter.mode === 'fs';
  if (isFs) {
    loading.hidden = false;                       // 大图浏览器解码期间给出加载提示
    img.onload = () => { loading.hidden = true; };  // 缩略图垫底就绪即隐藏提示
  }
  // 缩略图与原图解码并发，避免大图串行等待两轮
  (async () => {
    try {
      img.src = isFs ? await adapter.thumbUrl(imageRel) : adapter.thumbUrl(imageRel, info);
    } catch (_) { img.style.display = 'none'; }
  })();
  const v = ensureOsd();
  try {
    const ts = isFs
      ? { type: 'image', url: await adapter.imageUrl(imageRel) }   // 位图金字塔（浏览器内解码）
      : await adapter.tileSource(imageRel, info);                 // 服务端瓦片金字塔
    v.open(ts);
  } catch (e) {
    loading.hidden = true;
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
  const zoomLbl = $('#zoomLevel');
  if (zoomLbl) {
    zoomLbl.onclick = () => {
      if (!osdViewer) return;
      zoom100();
    };
  }
  $('#btnOpenOrig').onclick = async () => {
    if (!state.current || adapter.mode !== 'server') return;
    try { await adapter.openExternal(state.current.imageRel); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/* ================= 表单 ================= */

/* 编辑状态灯：clean 绿灯「未修改」 / dirty 红灯「有修改未保存」 */
function setDirtyUI(on) {
  const el = $('#dirtyDot');
  el.className = on ? 'dirty' : 'clean';
  el.title = on ? '有修改未保存' : '未修改';
  el.querySelector('em').textContent = on ? '有修改未保存' : '未修改';
}

function markDirty() {
  if (!state.current) return;
  if (!state.dirty) {
    state.dirty = true;
    setDirtyUI(true);
    renderList();
  }
}

function clearDirty() {
  state.dirty = false;
  setDirtyUI(false);
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
  $('#formTabs').hidden = false;
  $('#saveBar').hidden = false;
  $('#secDraftTip').hidden = !state.current.isDraft;
  if (state.current.isDraft) $('#draftName').textContent = state.current.mdRel.split('/').pop();

  const set = (id, v) => { $(id).value = v ?? ''; };
  const si = stageInfoOf(state.current.mdRel || state.current.imageRel);
  $('#f_status').value = si.status ? `${si.label}（${si.status}）` : si.key;
  set('#f_id', f.id); set('#f_title', f.title); set('#f_alt_name', f.alt_name);
  set('#f_author', f.author); set('#f_date', f.date); set('#f_year', f.year);
  $('#f_hero').checked = String(f.hero || 'no').toLowerCase() === 'yes';
  syncYear();  // year 只读，始终按 date 推导（纠正 MD 中可能过期的值）
  $('#f_category').value = f.category === 'gis' ? 'gis' : 'original';
  $('#f_categoryName').value = f.categoryName || CATEGORY_NAMES[$('#f_category').value] || '';

  // physicalSize
  const phys = parsePhys(f.physicalSize);
  $('#physW').value = phys.w ?? (info ? info.cmW : '');
  $('#physH').value = phys.h ?? (info ? info.cmH : '');
  const compSel = $('#physComp');
  compSel.innerHTML = ['无', ...COMPOSITIONS].map(c => `<option>${c}</option>`).join('');
  compSel.value = phys.comp || '无';   // MD 无构图后缀时如实显示"无"，不再回填建议值
  updatePhysPreview();

  // 规格信息
  renderImgInfo(info);

  // 分类 chips
  chipField('#subCatChips', splitMulti(f.subCategory), SUBCATS, () => { renderSubCatSuggest(); renderTopicSuggest(); });
  renderSubCatSuggest();
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

  // annotations
  renderAnnotations(f.annotations || []);

  // 正文
  $('#f_intro').value = b.intro || '';
  if ($('#f_intro')._grow) $('#f_intro')._grow();
  renderVision(b.items || []);

  clearDirty();
  setSaveMsg('', '');
  refreshCombos();   // fillForm 重建 physComp 选项并赋值后，同步自定义下拉显示

  const activeTab = state.activeTab || 'tabMeta';
  switchTab(activeTab);
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
  $('#physPreview').textContent = w && h ? `${w}cm x ${h}cm${c && c !== '无' ? '，' + c : ''}` : '（待填写）';
}

function splitMulti(v) {
  if (Array.isArray(v)) return v.map(String);
  if (!v) return [];
  // 通用分隔：、 ， , ； ;（含前后空格），如「工程制图、 空间形态；多图面排版」
  return String(v).split(/[、，,;；]/).map(s => s.trim()).filter(Boolean);
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
  root._render = render;   // 供预设区外部改动列表后重渲染 chips
}

function renderSubCatSuggest() {
  const box = $('#subCatSuggest');
  const root = $('#subCatChips');
  const cur = root._getList ? root._getList() : [];
  box.innerHTML = `<div class="tag-group"><div class="gname">二级分类预设（五大类）</div><div class="gchips">${
    SUBCATS.map(c => `<span class="sug-chip${cur.includes(c) ? ' used' : ''}" data-sub="${esc(c)}">${esc(c)}</span>`).join('')}</div></div>`;
  box.querySelectorAll('[data-sub]').forEach(el => el.onclick = () => {
    const v = el.dataset.sub;
    const l = root._getList();
    if (l.includes(v)) l.splice(l.indexOf(v), 1); else l.push(v);
    root._render();
    renderSubCatSuggest();
    renderTopicSuggest();   // 专题候选池随所选分类联动
    markDirty();
  });
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
  const list = [...(colors || [])];   // 数量不固定：3 / 5 / 6 个皆可，按需增删
  const render = () => {
    box.innerHTML = '';
    list.forEach((c, i) => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      const safe = /^#[0-9A-Fa-f]{6}$/.test(c) ? c : (c ? '#888888' : '#000000');
      chip.innerHTML = `
        <input type="color" value="${safe}">
        <input type="text" class="hex" value="${esc(c)}" placeholder="#RRGGBB">
        <span class="cx" title="移除该色">×</span>`;
      const colorInp = chip.querySelector('input[type=color]');
      const hexInp = chip.querySelector('.hex');
      colorInp.oninput = () => { hexInp.value = colorInp.value.toUpperCase(); list[i] = hexInp.value; markDirty(); };
      hexInp.oninput = () => {
        const v = hexInp.value.trim();
        list[i] = v;
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) colorInp.value = v;
        markDirty();
      };
      chip.querySelector('.cx').onclick = () => { list.splice(i, 1); render(); markDirty(); };
      box.appendChild(chip);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn mini';
    add.textContent = '+ 色';
    add.title = '添加一个颜色';
    add.onclick = () => {
      list.push('');
      render();
      const last = box.querySelectorAll('.hex')[list.length - 1];
      if (last) last.focus();
    };
    box.appendChild(add);
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
      const row = document.createElement('label');
      row.className = 'wf-item';
      row.innerHTML = `<span class="wname">${esc(k)}</span>
        <input type="number" min="0" max="100" step="1" value="${vals[k]}">
        <span class="unit">%</span>`;
      const num = row.querySelector('input');
      num.oninput = () => {
        const v = parseInt(num.value, 10);
        vals[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
        updateSum(); markDirty();
      };
      num.onchange = () => { num.value = vals[k]; };  // 失焦时把输入归位为合法值
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
          <button class="btn ghost mini" data-op="up" title="上移">${icon('arrow-up', 12)}</button>
          <button class="btn ghost mini" data-op="del" title="删除">×</button>
        </div>`;
      row.querySelector('.vterm').oninput = e => { it.term = e.target.value; markDirty(); };
      row.querySelector('textarea').oninput = e => { it.desc = e.target.value; markDirty(); };
      box.appendChild(row);
      autoGrow(row.querySelector('textarea'), 2);   // 须在插入 DOM 后测高才准确
      row.querySelector('[data-op=up]').onclick = () => {
        if (i > 0) { const t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; render(); markDirty(); }
      };
      row.querySelector('[data-op=del]').onclick = () => { list.splice(i, 1); render(); markDirty(); };
    });
    box._getList = () => list.filter(it => it.term || it.desc);
  };
  render();
  $('#btnAddVision').onclick = () => { list.push({ term: '', desc: '' }); render(); markDirty(); box.lastElementChild && box.lastElementChild.querySelector('.vterm').focus(); };
}

/* ================= 大图标注 (Annotations) 交互与管理 ================= */

// 根据类型返回标准类型缩写后缀：P (Point), L (Line/Path), A (Area), R (Rect)
function getAnnTypeSuffix(type) {
  const map = { point: 'P', path: 'L', area: 'A', rect: 'R' };
  return map[type] || 'P';
}

// 方案 1：生成如 01-P, 02-L, 03-A, 04-R 的规范 ID
function generateAnnId(index, type = 'point') {
  const num = (index + 1).toString().padStart(2, '0');
  const sfx = getAnnTypeSuffix(type);
  return `${num}-${sfx}`;
}

function updateAnnotateModeUI() {
  const btn = $('#btnAnnotateMode');
  const isPicking = state.pickingTargetIndex !== null;
  const isActive = state.annotateMode || isPicking;
  if (btn) {
    btn.classList.toggle('active', isActive);
    if (isPicking) {
      btn.title = `正在拾取 #${state.pickingTargetIndex + 1} 坐标：点击大图完成更新`;
      btn.innerHTML = `<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg> <span>拾取中</span>`;
    } else if (state.annotateMode) {
      btn.title = '采点模式已开启：点击大图任意位置即可新增标注点位（再次点击退出）';
      btn.innerHTML = `<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <span>采点中</span>`;
    } else {
      btn.title = '开启采点模式：在大图上直接点击即可新增标注点位';
      btn.innerHTML = `<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <span>采点标注</span>`;
    }
  }
  if (osdViewer && osdViewer.canvas) {
    osdViewer.canvas.style.cursor = isActive ? 'crosshair' : '';
    if (!isActive) {
      osdViewer.setMouseNavEnabled(true);
      // 将焦点归还画布以确保滚轮/快捷键无缝生效
      if (document.activeElement && document.activeElement.tagName === 'BODY') {
        osdViewer.canvas.focus?.();
      }
    }
  }
}

// 矩形交互式鼠标拉框选择器 (Drag Bounding Box)
function startRectDragSelect(annIndex) {
  if (!osdViewer || !osdViewer.canvas) return;
  toast('已开启矩形拉框：请在大图上按住鼠标左键并拖拽框选目标区域', 'ok');
  osdViewer.setMouseNavEnabled(false);
  osdViewer.canvas.style.cursor = 'crosshair';

  let rubber = osdViewer.canvas.querySelector('.osd-rubberband-box');
  if (!rubber) {
    rubber = document.createElement('div');
    rubber.className = 'osd-rubberband-box';
    osdViewer.canvas.appendChild(rubber);
  }

  let isDrawing = false;
  let startPx = null;

  const tracker = new OpenSeadragon.MouseTracker({
    element: osdViewer.canvas,
    pressHandler: (e) => {
      isDrawing = true;
      startPx = e.position;
      rubber.style.display = 'block';
      rubber.style.left = `${startPx.x}px`;
      rubber.style.top = `${startPx.y}px`;
      rubber.style.width = '0px';
      rubber.style.height = '0px';
    },
    dragHandler: (e) => {
      if (!isDrawing || !startPx) return;
      const curPx = e.position;
      const left = Math.min(startPx.x, curPx.x);
      const top = Math.min(startPx.y, curPx.y);
      const width = Math.abs(curPx.x - startPx.x);
      const height = Math.abs(curPx.y - startPx.y);
      rubber.style.left = `${left}px`;
      rubber.style.top = `${top}px`;
      rubber.style.width = `${width}px`;
      rubber.style.height = `${height}px`;
    },
    releaseHandler: (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      rubber.style.display = 'none';
      tracker.destroy();
      osdViewer.setMouseNavEnabled(true);
      osdViewer.canvas.style.cursor = '';

      const endPx = e.position;
      const vp1 = osdViewer.viewport.pointFromPixel(startPx);
      const vp2 = osdViewer.viewport.pointFromPixel(endPx);
      const img1 = osdViewer.viewport.viewportToImageCoordinates(vp1);
      const img2 = osdViewer.viewport.viewportToImageCoordinates(vp2);

      const minX = Math.round(Math.min(img1.x, img2.x));
      const minY = Math.round(Math.min(img1.y, img2.y));
      const bw = Math.round(Math.abs(img2.x - img1.x));
      const bh = Math.round(Math.abs(img2.y - img1.y));

      if (bw < 10 || bh < 10) {
        toast('拉框区域过小，已取消', 'warn');
        return;
      }

      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      const ann = list[annIndex];
      if (ann) {
        ann.bbox = [minX, minY, bw, bh];
        ann.coord = [Math.round(minX + bw / 2), Math.round(minY + bh / 2)];
        markDirty();
        renderAnnotations(list);
        highlightAnnCard(annIndex);
        toast(`矩形范围已标定: [${minX}, ${minY}, ${bw}, ${bh}]`, 'ok');
      }
    }
  });
}

// 计算多边形质心
function getPolygonCentroid(pts) {
  if (!pts || !pts.length) return null;
  let sx = 0, sy = 0;
  pts.forEach(p => { sx += p[0]; sy += p[1]; });
  return [Math.round(sx / pts.length), Math.round(sy / pts.length)];
}

// 计算折线几何中点
function getPolylineMidpoint(pts) {
  if (!pts || !pts.length) return null;
  const midIdx = Math.floor(pts.length / 2);
  return pts[midIdx];
}

// 获取各类型几何图形的文字标签锚点坐标 [x, y]
function getShapeAnchorCoord(ann) {
  if (!ann) return null;
  if (ann.coord && Array.isArray(ann.coord) && ann.coord.length >= 2) {
    return ann.coord;
  }
  if (ann.type === 'rect' && Array.isArray(ann.bbox) && ann.bbox.length === 4) {
    return [Math.round(ann.bbox[0] + ann.bbox[2] / 2), Math.round(ann.bbox[1] + ann.bbox[3] / 2)];
  }
  if (ann.type === 'area' && Array.isArray(ann.polygon) && ann.polygon.length) {
    return getPolygonCentroid(ann.polygon);
  }
  if (ann.type === 'path' && Array.isArray(ann.polyline) && ann.polyline.length) {
    return getPolylineMidpoint(ann.polyline);
  }
  return null;
}

function focusAnnotation(ann) {
  if (!osdViewer || !osdViewer.viewport || !ann) return;
  let vpPt = null;
  if (ann.coord && ann.coord.length >= 2) {
    vpPt = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(ann.coord[0], ann.coord[1]));
  } else if (ann.bbox && ann.bbox.length === 4) {
    vpPt = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(ann.bbox[0] + ann.bbox[2] / 2, ann.bbox[1] + ann.bbox[3] / 2));
  } else if (ann.polygon && ann.polygon.length) {
    const cp = getPolygonCentroid(ann.polygon) || ann.polygon[0];
    vpPt = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(cp[0], cp[1]));
  } else if (ann.polyline && ann.polyline.length) {
    const mp = getPolylineMidpoint(ann.polyline) || ann.polyline[0];
    vpPt = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(mp[0], mp[1]));
  }
  if (!vpPt) return;

  const targetZoom = ann.zoomLevel
    ? osdViewer.viewport.imageToViewportZoom(ann.zoomLevel)
    : Math.max(osdViewer.viewport.getZoom(true), osdViewer.viewport.imageToViewportZoom(2.0));
  osdViewer.viewport.zoomTo(targetZoom, vpPt, false);
  osdViewer.viewport.panTo(vpPt, false);
}

function highlightAnnCard(idx, focusTitle = false) {
  switchTab('tabAnnotations');
  const card = $(`#annList .ann-card[data-idx="${idx}"]`);
  if (!card) return;
  $$('#annList .ann-card').forEach(c => c.classList.remove('highlight'));
  card.classList.add('highlight');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (focusTitle) {
    const ti = card.querySelector('.ann-input-title');
    if (ti) { ti.focus(); ti.select(); }
  }
}

// SVG 叠加图层容器与拖拽状态
let osdSvgOverlayEl = null;
let activeDraggingVertex = null; // { annIndex, type: 'polygon'|'polyline'|'bbox', vertexIndex, isBoxEnd }

function ensureSvgOverlay() {
  if (osdSvgOverlayEl && osdSvgOverlayEl.parentElement) return osdSvgOverlayEl;
  if (!osdViewer || !osdViewer.canvas) return null;
  const old = osdViewer.canvas.querySelector('.osd-overlay-svg');
  if (old) old.remove();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'osd-overlay-svg');
  svg.innerHTML = `
    <defs>
      <pattern id="annHatchPattern" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="10" stroke="#f59e0b" stroke-width="2.5" stroke-opacity="0.45" />
      </pattern>
    </defs>
    <g id="osdShapesLayer"></g>
    <g id="osdHandlesLayer"></g>
  `;
  osdViewer.canvas.appendChild(svg);
  osdSvgOverlayEl = svg;
  return svg;
}

function updateSvgShapes(list) {
  const svg = ensureSvgOverlay();
  if (!svg || !osdViewer || !osdViewer.viewport) return;
  const shapesLayer = svg.querySelector('#osdShapesLayer');
  const handlesLayer = svg.querySelector('#osdHandlesLayer');
  if (!shapesLayer || !handlesLayer) return;
  shapesLayer.innerHTML = '';
  handlesLayer.innerHTML = '';

  const activeCard = $('#annList .ann-card.highlight');
  const activeIdx = activeCard ? parseInt(activeCard.dataset.idx, 10) : -1;

  list.forEach((ann, idx) => {
    const isSelected = (idx === activeIdx);
    const lvl = ann.level || 'primary';

    // 1. 区域多边形 (Area / Polygon)
    if (ann.type === 'area' && Array.isArray(ann.polygon) && ann.polygon.length >= 2) {
      const pts = ann.polygon.map(pt => {
        const vp = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(pt[0], pt[1]));
        const px = osdViewer.viewport.pixelFromPoint(vp, true);
        return `${px.x.toFixed(1)},${px.y.toFixed(1)}`;
      }).join(' ');

      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts);
      const isHatch = (ann.style && ann.style.hatch) !== false;
      const isDash = (ann.style && ann.style.dash) !== false;
      poly.setAttribute('class', `ann-svg-shape level-${lvl} ${isHatch ? 'has-hatch' : ''} ${isDash ? 'is-dash' : ''} ${isSelected ? 'active' : ''}`);
      poly.setAttribute('stroke-width', isSelected ? '3' : '2');
      poly.onclick = (e) => {
        e.stopPropagation();
        highlightAnnCard(idx);
        focusAnnotation(ann);
      };
      shapesLayer.appendChild(poly);

      // 若处于选中状态，渲染各顶点拖拽手柄
      if (isSelected) {
        ann.polygon.forEach((pt, vi) => {
          const vp = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(pt[0], pt[1]));
          const px = osdViewer.viewport.pixelFromPoint(vp, true);
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('cx', px.x);
          handle.setAttribute('cy', px.y);
          handle.setAttribute('r', '6');
          handle.setAttribute('class', 'ann-vertex-handle');
          handle.setAttribute('title', `拖拽微调顶点 #${vi + 1} [${pt[0]}, ${pt[1]}]，双击删除顶点`);
          bindVertexDrag(handle, idx, 'polygon', vi);
          // 双击删除多边形顶点
          handle.ondblclick = (e) => {
            e.stopPropagation();
            if (ann.polygon.length <= 3) {
              toast('多边形至少保留 3 个顶点', 'warn');
              return;
            }
            ann.polygon.splice(vi, 1);
            markDirty();
            renderAnnotations(list);
            highlightAnnCard(idx);
            toast(`已删除多边形顶点 #${vi + 1}`, 'ok');
          };
          handlesLayer.appendChild(handle);
        });

        // 边中点加点手柄（点击直接在当前边插入新顶点）
        ann.polygon.forEach((pt, vi) => {
          const nextPt = ann.polygon[(vi + 1) % ann.polygon.length];
          const midX = Math.round((pt[0] + nextPt[0]) / 2);
          const midY = Math.round((pt[1] + nextPt[1]) / 2);
          const vp = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(midX, midY));
          const px = osdViewer.viewport.pixelFromPoint(vp, true);
          const midHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          midHandle.setAttribute('cx', px.x);
          midHandle.setAttribute('cy', px.y);
          midHandle.setAttribute('r', '4');
          midHandle.setAttribute('class', 'ann-mid-handle');
          midHandle.setAttribute('title', '点击在此插入新顶点');
          midHandle.onclick = (e) => {
            e.stopPropagation();
            ann.polygon.splice(vi + 1, 0, [midX, midY]);
            markDirty();
            renderAnnotations(list);
            highlightAnnCard(idx);
            toast(`已在多边形边中点插入新顶点`, 'ok');
          };
          handlesLayer.appendChild(midHandle);
        });
      }
    }

    // 2. 矩形特写 (Rect / bbox)
    if (ann.type === 'rect' && Array.isArray(ann.bbox) && ann.bbox.length === 4) {
      const [bx, by, bw, bh] = ann.bbox;
      const vp1 = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(bx, by));
      const vp2 = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(bx + bw, by + bh));
      const px1 = osdViewer.viewport.pixelFromPoint(vp1, true);
      const px2 = osdViewer.viewport.pixelFromPoint(vp2, true);

      const rx = Math.min(px1.x, px2.x);
      const ry = Math.min(px1.y, px2.y);
      const rw = Math.abs(px2.x - px1.x);
      const rh = Math.abs(px2.y - px1.y);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', rx);
      rect.setAttribute('y', ry);
      rect.setAttribute('width', rw);
      rect.setAttribute('height', rh);
      rect.setAttribute('class', `ann-svg-shape level-${lvl} is-dash ${isSelected ? 'active' : ''}`);
      rect.setAttribute('stroke-width', isSelected ? '2.5' : '1.5');
      rect.onclick = (e) => {
        e.stopPropagation();
        highlightAnnCard(idx);
        focusAnnotation(ann);
      };
      shapesLayer.appendChild(rect);

      if (isSelected) {
        // 矩形左上与右下角拖拽变形手柄
        const corners = [
          { cx: rx, cy: ry, isEnd: false, tip: '拖拽调整矩形起点' },
          { cx: rx + rw, cy: ry + rh, isEnd: true, tip: '拖拽调整矩形宽高' }
        ];
        corners.forEach((c) => {
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('cx', c.cx);
          handle.setAttribute('cy', c.cy);
          handle.setAttribute('r', '6');
          handle.setAttribute('class', 'ann-vertex-handle');
          handle.setAttribute('title', c.tip);
          bindVertexDrag(handle, idx, 'bbox', c.isEnd ? 1 : 0);
          handlesLayer.appendChild(handle);
        });
      }
    }

    // 3. 路径/折线 (Path / Polyline)
    if (ann.type === 'path' && Array.isArray(ann.polyline) && ann.polyline.length >= 2) {
      const pts = ann.polyline.map(pt => {
        const vp = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(pt[0], pt[1]));
        const px = osdViewer.viewport.pixelFromPoint(vp, true);
        return `${px.x.toFixed(1)},${px.y.toFixed(1)}`;
      }).join(' ');

      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', pts);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('class', `ann-svg-shape level-${lvl} ${isSelected ? 'active' : ''}`);
      polyline.setAttribute('stroke-width', isSelected ? '3.5' : '2');
      polyline.onclick = (e) => {
        e.stopPropagation();
        highlightAnnCard(idx);
        focusAnnotation(ann);
      };
      shapesLayer.appendChild(polyline);

      if (isSelected) {
        // 节点拖拽与删除手柄
        ann.polyline.forEach((pt, vi) => {
          const vp = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(pt[0], pt[1]));
          const px = osdViewer.viewport.pixelFromPoint(vp, true);
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('cx', px.x);
          handle.setAttribute('cy', px.y);
          handle.setAttribute('r', '6');
          handle.setAttribute('class', 'ann-vertex-handle');
          handle.setAttribute('title', `拖拽微调路线节点 #${vi + 1} [${pt[0]}, ${pt[1]}]，双击删除`);
          bindVertexDrag(handle, idx, 'polyline', vi);
          handle.ondblclick = (e) => {
            e.stopPropagation();
            if (ann.polyline.length <= 2) {
              toast('路线至少保留 2 个节点', 'warn');
              return;
            }
            ann.polyline.splice(vi, 1);
            markDirty();
            renderAnnotations(list);
            highlightAnnCard(idx);
            toast(`已删除路线节点 #${vi + 1}`, 'ok');
          };
          handlesLayer.appendChild(handle);
        });

        // 路线线段中点加点手柄
        for (let vi = 0; vi < ann.polyline.length - 1; vi++) {
          const pt = ann.polyline[vi];
          const nextPt = ann.polyline[vi + 1];
          const midX = Math.round((pt[0] + nextPt[0]) / 2);
          const midY = Math.round((pt[1] + nextPt[1]) / 2);
          const vp = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(midX, midY));
          const px = osdViewer.viewport.pixelFromPoint(vp, true);
          const midHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          midHandle.setAttribute('cx', px.x);
          midHandle.setAttribute('cy', px.y);
          midHandle.setAttribute('r', '4');
          midHandle.setAttribute('class', 'ann-mid-handle');
          midHandle.setAttribute('title', '点击在此插入新路线拐点');
          midHandle.onclick = (e) => {
            e.stopPropagation();
            ann.polyline.splice(vi + 1, 0, [midX, midY]);
            markDirty();
            renderAnnotations(list);
            highlightAnnCard(idx);
            toast(`已在路线中段插入新节点`, 'ok');
          };
          handlesLayer.appendChild(midHandle);
        }
      }
    }
  });
}

// 将鼠标/指针事件精确转换为 OSD 视口坐标与原图像素坐标
function eventToImageCoordinates(e) {
  if (!osdViewer || !osdViewer.canvas || !osdViewer.viewport) return null;
  const orig = e.originalEvent || e;
  let clientX = orig.clientX;
  let clientY = orig.clientY;
  if (clientX === undefined && orig.touches && orig.touches.length > 0) {
    clientX = orig.touches[0].clientX;
    clientY = orig.touches[0].clientY;
  }
  if (clientX === undefined && orig.changedTouches && orig.changedTouches.length > 0) {
    clientX = orig.changedTouches[0].clientX;
    clientY = orig.changedTouches[0].clientY;
  }
  if (clientX === undefined) return null;

  const rect = osdViewer.canvas.getBoundingClientRect();
  const pt = new OpenSeadragon.Point(clientX - rect.left, clientY - rect.top);
  const vpPoint = osdViewer.viewport.pointFromPixel(pt);
  const imgPoint = osdViewer.viewport.viewportToImageCoordinates(vpPoint);
  return {
    vpPoint,
    imgPoint,
    x: Math.round(imgPoint.x),
    y: Math.round(imgPoint.y)
  };
}

// 绑定多边形/线段顶点的鼠标拖拽微调
function bindVertexDrag(handleEl, annIndex, type, vertexIndex) {
  let isDragging = false;
  let vertexRafId = 0;
  let pendingVertex = null;

  new OpenSeadragon.MouseTracker({
    element: handleEl,
    pressHandler: () => {
      isDragging = true;
      handleEl.classList.add('dragging');
      osdViewer.setMouseNavEnabled(false);
    },
    dragHandler: (e) => {
      if (!isDragging) return;
      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      const ann = list[annIndex];
      if (!ann) return;

      const coords = eventToImageCoordinates(e);
      if (!coords) return;
      const info = state.current?.imageInfo;
      const maxX = info ? info.width : Infinity;
      const maxY = info ? info.height : Infinity;
      const nx = Math.max(0, Math.min(maxX, coords.x));
      const ny = Math.max(0, Math.min(maxY, coords.y));

      pendingVertex = [nx, ny];
      if (!vertexRafId) {
        vertexRafId = requestAnimationFrame(() => {
          vertexRafId = 0;
          if (!pendingVertex) return;
          const [curX, curY] = pendingVertex;
          if (type === 'polygon' && ann.polygon) {
            ann.polygon[vertexIndex] = [curX, curY];
          } else if (type === 'polyline' && ann.polyline) {
            ann.polyline[vertexIndex] = [curX, curY];
          } else if (type === 'bbox' && ann.bbox) {
            if (vertexIndex === 0) {
              const oldRight = ann.bbox[0] + ann.bbox[2];
              const oldBottom = ann.bbox[1] + ann.bbox[3];
              ann.bbox[0] = curX;
              ann.bbox[1] = curY;
              ann.bbox[2] = Math.max(10, oldRight - curX);
              ann.bbox[3] = Math.max(10, oldBottom - curY);
            } else {
              ann.bbox[2] = Math.max(10, curX - ann.bbox[0]);
              ann.bbox[3] = Math.max(10, curY - ann.bbox[1]);
            }
          }
          updateSvgShapes(list);
        });
      }
    },
    releaseHandler: () => {
      if (!isDragging) return;
      isDragging = false;
      if (vertexRafId) {
        cancelAnimationFrame(vertexRafId);
        vertexRafId = 0;
      }
      handleEl.classList.remove('dragging');
      osdViewer.setMouseNavEnabled(true);
      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      markDirty();
      renderAnnotations(list);
      highlightAnnCard(annIndex);
      toast(`已更新几何节点坐标`, 'ok');
    }
  });
}

function makePinElement(ann, idx) {
  const el = document.createElement('div');
  el.className = `osd-pin pin-${ann.level || 'primary'} is-draggable`;
  el.dataset.idx = idx;
  el.innerHTML = `
    <div class="pin-marker">
      <div class="pin-dot"></div>
      <div class="pin-pulse"></div>
    </div>
    <div class="pin-label">${esc(ann.title || ann.id || '标注')}</div>
  `;
  el.title = `${ann.title || ann.id} [${(ann.coord || []).join(', ')}] - 按住 Alt 拖拽平滑移动，点击右侧联动`;

  // 支持直接按住点位 Pin 拖拽移动（RAF 节流高刷）
  let isPinDragging = false;
  let hasDragged = false;
  let startX = 0;
  let startY = 0;
  let pinRafId = 0;
  let pendingCoords = null;

  new OpenSeadragon.MouseTracker({
    element: el,
    pressHandler: (e) => {
      isPinDragging = true;
      hasDragged = false;
      const orig = e.originalEvent || e;
      startX = orig.clientX || 0;
      startY = orig.clientY || 0;
      el.classList.add('is-dragging');
      osdViewer.setMouseNavEnabled(false);
    },
    dragHandler: (e) => {
      if (!isPinDragging) return;
      const orig = e.originalEvent || e;
      const dx = (orig.clientX || 0) - startX;
      const dy = (orig.clientY || 0) - startY;
      if (Math.hypot(dx, dy) > 3) {
        hasDragged = true;
      }
      const coords = eventToImageCoordinates(e);
      if (!coords) return;
      const info = state.current?.imageInfo;
      const maxX = info ? info.width : Infinity;
      const maxY = info ? info.height : Infinity;
      const nx = Math.max(0, Math.min(maxX, coords.x));
      const ny = Math.max(0, Math.min(maxY, coords.y));

      pendingCoords = [nx, ny];
      if (!pinRafId) {
        pinRafId = requestAnimationFrame(() => {
          pinRafId = 0;
          if (!pendingCoords) return;
          const [curX, curY] = pendingCoords;
          ann.coord = [curX, curY];
          const card = $(`#annList .ann-card[data-idx="${idx}"]`);
          if (card) {
            const ix = card.querySelector('.ann-input-x');
            const iy = card.querySelector('.ann-input-y');
            if (ix && ix.value != curX) ix.value = curX;
            if (iy && iy.value != curY) iy.value = curY;
          }
          const newVpPt = osdViewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(curX, curY));
          osdViewer.updateOverlay(el, newVpPt);
        });
      }
    },
    releaseHandler: () => {
      if (!isPinDragging) return;
      isPinDragging = false;
      if (pinRafId) {
        cancelAnimationFrame(pinRafId);
        pinRafId = 0;
      }
      el.classList.remove('is-dragging');
      osdViewer.setMouseNavEnabled(true);
      if (hasDragged) {
        markDirty();
        renderOsdOverlays();
        highlightAnnCard(idx);
        toast(`标注 #${idx + 1} 已移动至 [${ann.coord[0]}, ${ann.coord[1]}]`, 'ok');
      }
    },
    clickHandler: (e) => {
      // 仅当没有发生位移拖拽时才响应点击联动与聚焦
      if (hasDragged) return;
      if (e.originalEvent) {
        e.originalEvent.stopPropagation();
      }
      highlightAnnCard(idx, false);
      focusAnnotation(ann);
    }
  });

  return el;
}

// 针对多边形、矩形和路线等非单点类型渲染轻量悬浮标签（不显示侵入性的红点脉冲）
function makeShapeTagElement(ann, idx) {
  const el = document.createElement('div');
  el.className = `osd-shape-tag level-${ann.level || 'primary'}`;
  el.dataset.idx = idx;
  el.innerHTML = `<div class="tag-label">${esc(ann.title || ann.id || '标注')}</div>`;
  el.title = `${ann.title || ann.id} - 点击联动聚焦`;
  el.onclick = (e) => {
    e.stopPropagation();
    highlightAnnCard(idx, false);
    focusAnnotation(ann);
  };
  return el;
}

function renderOsdOverlays() {
  if (!osdViewer || !osdViewer.viewport || !state.current) return;
  osdViewer.clearOverlays();
  const list = $('#annList')._getList ? $('#annList')._getList() : (state.fields?.annotations || []);

  list.forEach((ann, idx) => {
    if (!ann) return;
    if (ann.type === 'point') {
      // 1. 点标注 (Point)：渲染地标 Pin（红点 + 脉冲 + 药丸标签）
      if (!ann.coord || !Array.isArray(ann.coord) || ann.coord.length < 2) return;
      const pt = new OpenSeadragon.Point(ann.coord[0], ann.coord[1]);
      const vpPt = osdViewer.viewport.imageToViewportCoordinates(pt);
      const el = makePinElement(ann, idx);
      osdViewer.addOverlay({
        element: el,
        location: vpPt,
        placement: OpenSeadragon.Placement.TOP_LEFT,
        checkResize: false
      });
    } else {
      // 2. 几何标注 (Area / Rect / Path)：在几何质心/锚点渲染极简浮动标签，绝不堆叠多余的红点脉冲！
      const anchor = getShapeAnchorCoord(ann);
      if (anchor) {
        const pt = new OpenSeadragon.Point(anchor[0], anchor[1]);
        const vpPt = osdViewer.viewport.imageToViewportCoordinates(pt);
        const el = makeShapeTagElement(ann, idx);
        osdViewer.addOverlay({
          element: el,
          location: vpPt,
          placement: OpenSeadragon.Placement.TOP_LEFT,
          checkResize: false
        });
      }
    }
  });

  // 3. 同步渲染点线面 SVG 矢量形状与交互控制手柄
  updateSvgShapes(list);
}


function renderAnnotations(items) {
  const box = $('#annList');
  box.innerHTML = '';
  const list = (items || []).map(it => ({
    id: it.id || '',
    type: it.type || 'point',
    coord: Array.isArray(it.coord) && it.coord.length >= 2 ? [...it.coord] : (it.type === 'point' ? [0, 0] : undefined),
    title: it.title || '',
    desc: it.desc || '',
    level: it.level || 'primary',
    zoomLevel: it.zoomLevel !== undefined ? it.zoomLevel : 2.0,
    polygon: Array.isArray(it.polygon) ? it.polygon : undefined,
    polyline: Array.isArray(it.polyline) ? it.polyline : undefined,
    bbox: Array.isArray(it.bbox) ? it.bbox : undefined,
    style: it.style && typeof it.style === 'object' ? it.style : undefined,
  }));

  const updateCount = () => {
    const c = list.length;
    $('#annCount').textContent = c;
    const badge = $('#tabAnnBadge');
    if (badge) {
      badge.textContent = c;
      badge.hidden = (c === 0);
    }
  };

  const render = () => {
    box.innerHTML = '';
    list.forEach((ann, i) => {
      const isPoint = (ann.type || 'point') === 'point';
      const isRect = ann.type === 'rect';
      const isArea = ann.type === 'area';
      const isPath = ann.type === 'path';

      // 动态判断顶部操作按钮的文案与图标
      let actionBtnText = '采点';
      let actionBtnTip = '在大图上重新点击拾取此点坐标';
      let actionBtnSvg = `<svg class="ic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`;
      if (isRect) {
        actionBtnText = '拉框';
        actionBtnTip = '在大图上鼠标拖拽重新框选矩形区域';
        actionBtnSvg = `<svg class="ic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
      } else if (isArea) {
        actionBtnText = '加顶点';
        actionBtnTip = '在大图上点击追加新多边形顶点';
        actionBtnSvg = `<svg class="ic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 22 22 22"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
      } else if (isPath) {
        actionBtnText = '加节点';
        actionBtnTip = '在大图上点击追加新路线折线节点';
        actionBtnSvg = `<svg class="ic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 19 8 7 14 15 20 5"/><line x1="12" y1="4" x2="12" y2="10"/><line x1="9" y1="7" x2="15" y2="7"/></svg>`;
      }

      const card = document.createElement('div');
      card.className = 'ann-card';
      card.dataset.idx = i;
      card.innerHTML = `
        <div class="ann-head">
          <span class="ann-idx">#${i + 1}</span>
          <input class="ann-input-title" type="text" value="${esc(ann.title)}" placeholder="标题 (如：马道枢纽)">
          <span class="ann-badge level-${ann.level || 'primary'}">${ann.level || 'primary'}</span>
          <span class="ann-badge type-badge">${ann.type || 'point'}</span>
          <button class="btn mini ann-btn-focus" type="button" title="在大图上聚焦定位此标注">
            <svg class="ic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>聚焦</span>
          </button>
          <button class="btn mini ann-btn-pick" type="button" title="${actionBtnTip}">
            ${actionBtnSvg}
            <span>${actionBtnText}</span>
          </button>
          <button class="btn mini ghost ann-btn-del" type="button" title="删除标注">
            <svg class="ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
        <div class="ann-body">
          <div class="grid2">
            <label class="field"><span>id</span><input class="ann-input-id" type="text" value="${esc(ann.id)}" placeholder="01-P"></label>
            <label class="field"><span>等级 level</span>
              <select class="ann-select-level">
                <option value="primary" ${ann.level === 'primary' ? 'selected' : ''}>primary (核心主线)</option>
                <option value="accent" ${ann.level === 'accent' ? 'selected' : ''}>accent (工艺/工程亮点)</option>
                <option value="info" ${ann.level === 'info' ? 'selected' : ''}>info (辅助注记)</option>
              </select>
            </label>
            <label class="field"><span>类型 type</span>
              <select class="ann-select-type">
                <option value="point" ${isPoint ? 'selected' : ''}>point (单点/地标)</option>
                <option value="area" ${isArea ? 'selected' : ''}>area (工程段/多边形)</option>
                <option value="rect" ${isRect ? 'selected' : ''}>rect (矩形特写)</option>
                <option value="path" ${isPath ? 'selected' : ''}>path (折线/路线)</option>
              </select>
            </label>
            <label class="field"><span>聚焦倍率 zoomLevel</span>
              <div style="display:flex;gap:4px">
                <input class="ann-input-zoom" type="number" step="0.1" min="0.1" value="${ann.zoomLevel ?? ''}" placeholder="2.0">
                <button class="btn mini ann-btn-curzoom" type="button" title="设为当前视图缩放倍率">当前</button>
              </div>
            </label>
          </div>

          <!-- 坐标行：对 path 完全隐藏；对 point 显示核心点位坐标；对 area/rect 显示标签锚点(留空自动居中) -->
          <div class="ann-coord-row" style="${isPath ? 'display:none' : ''}">
            <span class="muted small">${isPoint ? '点位坐标 coord [X, Y]：' : '标签浮动锚点 coord [X, Y]（可选，留空则自动居中）：'}</span>
            <input class="ann-input-x" type="number" value="${ann.coord?.[0] ?? ''}" placeholder="${isPoint ? '0' : '自动居中'}">
            <span class="muted small">,</span>
            <input class="ann-input-y" type="number" value="${ann.coord?.[1] ?? ''}" placeholder="${isPoint ? '0' : '自动居中'}">
          </div>

          <!-- 点、线、面专属几何配置面板 -->
          <div class="ann-geom-row" style="${isPoint ? 'display:none' : ''}">
            <div class="geom-header">
              <span class="geom-title">${isArea ? '多边形顶点 polygon (顺/逆时针)' : (isRect ? '矩形范围 bbox [X, Y, W, H]' : '折线点列 polyline')}</span>
              <button class="btn mini ann-btn-edit-geom" type="button" title="${isRect ? '在大图上鼠标拖拽重新框选' : '聚焦并激活顶点微调手柄'}">
                <svg class="ic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                <span>${isRect ? '重新拉框' : '微调手柄'}</span>
              </button>
            </div>
            <textarea class="ann-input-geom" rows="2" placeholder="${isRect ? '[2600, 1750, 400, 300]' : '[[3400, 1850], [4860, 2100], [4650, 2350]]'}">${
              isArea ? JSON.stringify(ann.polygon || []) : (isRect ? JSON.stringify(ann.bbox || []) : JSON.stringify(ann.polyline || []))
            }</textarea>
            ${isArea ? `
            <div style="display:flex;gap:12px;font-size:11px;color:var(--muted);margin-top:2px">
              <label><input type="checkbox" class="ann-chk-dash" ${(ann.style?.dash !== false) ? 'checked' : ''}> 工程虚线边框</label>
              <label><input type="checkbox" class="ann-chk-hatch" ${(ann.style?.hatch !== false) ? 'checked' : ''}> 45°斜斑马线底纹</label>
            </div>` : ''}
          </div>

          <div class="field" style="margin-top:4px">
            <span>说明 desc</span>
            <textarea class="ann-input-desc" rows="2" placeholder="详细工程/地理说明（1~2句话）">${esc(ann.desc)}</textarea>
          </div>
        </div>`;

      // Event bindings
      const inputTitle = card.querySelector('.ann-input-title');
      inputTitle.oninput = e => {
        ann.title = e.target.value;
        markDirty();
        renderOsdOverlays();
      };

      const inputId = card.querySelector('.ann-input-id');
      inputId.oninput = e => { ann.id = e.target.value; markDirty(); };

      const selLevel = card.querySelector('.ann-select-level');
      selLevel.onchange = e => {
        ann.level = e.target.value;
        const b = card.querySelector('.ann-badge.level-primary, .ann-badge.level-accent, .ann-badge.level-info');
        if (b) {
          b.className = `ann-badge level-${ann.level}`;
          b.textContent = ann.level;
        }
        markDirty();
        renderOsdOverlays();
      };

      const selType = card.querySelector('.ann-select-type');
      selType.onchange = e => {
        const oldType = ann.type;
        ann.type = e.target.value;
        card.querySelector('.ann-badge.type-badge').textContent = ann.type;

        // 若当前 ID 为默认生成的格式（如 01-P、02-P 或 ann-01），自动联动将后缀更新为对应类型的缩写
        const newSfx = getAnnTypeSuffix(ann.type);
        const m = (ann.id || '').match(/^(\d{2})-[PLAR]$/i);
        if (m) {
          ann.id = `${m[1]}-${newSfx}`;
        } else if (!ann.id || /^ann-\d+$/i.test(ann.id)) {
          ann.id = generateAnnId(i, ann.type);
        }

        // 初始化几何默认值
        const cx = ann.coord?.[0] || 1000;
        const cy = ann.coord?.[1] || 1000;
        if (ann.type === 'area' && (!ann.polygon || !ann.polygon.length)) {
          ann.polygon = [[cx - 150, cy - 100], [cx + 150, cy - 100], [cx + 150, cy + 100], [cx - 150, cy + 100]];
          ann.style = { dash: true, hatch: true };
        } else if (ann.type === 'rect' && (!ann.bbox || !ann.bbox.length)) {
          ann.bbox = [cx - 150, cy - 100, 300, 200];
        } else if (ann.type === 'path') {
          if (!ann.polyline || !ann.polyline.length) {
            ann.polyline = [[cx - 200, cy], [cx, cy], [cx + 200, cy]];
          }
          // path 类型不需要 coord，删除残留
          delete ann.coord;
        } else if (ann.type === 'point' && (!ann.coord || !ann.coord.length)) {
          ann.coord = [cx, cy];
        }
        markDirty();
        render();
        highlightAnnCard(i);
      };

      const inputZoom = card.querySelector('.ann-input-zoom');
      inputZoom.oninput = e => {
        ann.zoomLevel = e.target.value ? Number(e.target.value) : undefined;
        markDirty();
      };

      card.querySelector('.ann-btn-curzoom').onclick = () => {
        if (!osdViewer || !osdViewer.viewport) return;
        const cur = Number((osdViewer.viewport.viewportToImageZoom(osdViewer.viewport.getZoom(true))).toFixed(1)) || 2.0;
        ann.zoomLevel = cur;
        inputZoom.value = cur;
        markDirty();
        toast(`已设为当前缩放倍率：${cur}x`, 'ok');
      };

      const inputX = card.querySelector('.ann-input-x');
      const inputY = card.querySelector('.ann-input-y');
      const updateCoord = () => {
        const rawX = inputX.value.trim();
        const rawY = inputY.value.trim();
        if (rawX === '' && rawY === '') {
          if (ann.type !== 'point') {
            delete ann.coord;
          } else {
            ann.coord = [0, 0];
          }
        } else {
          ann.coord = [Number(rawX) || 0, Number(rawY) || 0];
        }
        markDirty();
        renderOsdOverlays();
      };
      if (inputX && inputY) {
        inputX.oninput = updateCoord;
        inputY.oninput = updateCoord;
      }

      const taGeom = card.querySelector('.ann-input-geom');
      if (taGeom) {
        taGeom.onchange = e => {
          try {
            const parsed = JSON.parse(e.target.value);
            if (ann.type === 'area') ann.polygon = parsed;
            else if (ann.type === 'rect') ann.bbox = parsed;
            else if (ann.type === 'path') ann.polyline = parsed;
            markDirty();
            renderOsdOverlays();
            toast('几何坐标解析成功', 'ok');
          } catch (err) {
            toast('JSON 格式错误，请检查坐标括号', 'err');
          }
        };
      }

      const chkDash = card.querySelector('.ann-chk-dash');
      if (chkDash) {
        chkDash.onchange = e => {
          ann.style = ann.style || {};
          ann.style.dash = e.target.checked;
          markDirty();
          renderOsdOverlays();
        };
      }

      const chkHatch = card.querySelector('.ann-chk-hatch');
      if (chkHatch) {
        chkHatch.onchange = e => {
          ann.style = ann.style || {};
          ann.style.hatch = e.target.checked;
          markDirty();
          renderOsdOverlays();
        };
      }

      // 重新拉框或微调手柄
      const btnEditGeom = card.querySelector('.ann-btn-edit-geom');
      if (btnEditGeom) {
        btnEditGeom.onclick = () => {
          if (ann.type === 'rect') {
            startRectDragSelect(i);
          } else if (ann.type === 'area' || ann.type === 'path') {
            toast('已激活顶点微调：请在大图上直接拖动蓝色控制手柄；双击手柄可删除节点', 'ok');
            highlightAnnCard(i);
            focusAnnotation(ann);
          }
        };
      }

      const taDesc = card.querySelector('.ann-input-desc');
      taDesc.oninput = e => {
        ann.desc = e.target.value;
        markDirty();
      };
      autoGrow(taDesc, 2);

      card.querySelector('.ann-btn-focus').onclick = () => {
        focusAnnotation(ann);
        highlightAnnCard(i, false);
      };

      // 头部操作按钮点击（根据类型分流：拉框/加点/加节点）
      card.querySelector('.ann-btn-pick').onclick = () => {
        if (ann.type === 'rect') {
          startRectDragSelect(i);
          return;
        }
        state.pickingTargetIndex = i;
        state.annotateMode = false;
        updateAnnotateModeUI();
        if (ann.type === 'area') {
          toast(`已进入多边形加点模式，请在大图上连续点击以追加顶点（完成后点击顶部采点退出）`, 'ok');
        } else if (ann.type === 'path') {
          toast(`已进入折线加点模式，请在大图上连续点击以追加拐点（完成后点击顶部采点退出）`, 'ok');
        } else {
          toast(`已进入重采坐标模式，请在大图上点击 #${i + 1}「${ann.title || ann.id}」的新位置`, 'ok');
        }
      };

      card.querySelector('.ann-btn-del').onclick = () => {
        list.splice(i, 1);
        if (state.pickingTargetIndex === i) state.pickingTargetIndex = null;
        updateAnnotateModeUI();
        render();
        markDirty();
        renderOsdOverlays();
      };

      box.appendChild(card);
    });

    updateCount();
    renderOsdOverlays();
  };

  box._getList = () => list.filter(it => it.title || it.id || (it.coord && it.coord.length === 2) || it.polygon?.length || it.polyline?.length || it.bbox?.length);
  render();
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
  const stage = stageInfoOf(state.current.mdRel || state.current.imageRel);
  if (stage.status) fields.status = stage.status;  // 始终以实际所在池为准，纠正过期值
  if ($('#physW').value && $('#physH').value) {
    const comp = $('#physComp').value;
    fields.physicalSize = `${(+$('#physW').value).toFixed(1)}cm x ${(+$('#physH').value).toFixed(1)}cm${comp && comp !== '无' ? '，' + comp : ''}`;
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
  const anns = $('#annList')._getList ? $('#annList')._getList() : [];
  if (anns.length) fields.annotations = anns;
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

/* ================= 分段 Tab 切换与表单面板 ================= */

function switchTab(tabId) {
  const tabsNav = $('#formTabs');
  if (!tabsNav) return;
  const targetBtn = tabsNav.querySelector(`.form-tab-btn[data-tab="${tabId}"]`);
  const targetPanel = $(`#${tabId}`);
  if (!targetBtn || !targetPanel) return;

  tabsNav.querySelectorAll('.form-tab-btn').forEach(b => b.classList.remove('active'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));

  targetBtn.classList.add('active');
  targetPanel.classList.add('active');
  state.activeTab = tabId;

  const formPane = $('#formPane');
  if (formPane) {
    formPane.classList.toggle('tab-raw-active', tabId === 'tabRaw');
  }

  if (tabId === 'tabRaw') {
    refreshRaw();
  }
  regrowTextareas();
}

function bindFormTabs() {
  const nav = $('#formTabs');
  if (!nav) return;
  nav.addEventListener('click', e => {
    const btn = e.target.closest('.form-tab-btn');
    if (!btn) return;
    const tabId = btn.dataset.tab;
    if (tabId) switchTab(tabId);
  });
}

/* ================= 源码模式 ================= */

function updateRawGutter() {
  const ta = $('#rawText');
  const gutter = $('#rawGutter');
  const measure = $('#rawMeasure');
  if (!ta || !gutter || !measure) return;

  const text = ta.value || '';
  const lines = text.split('\n');
  const count = lines.length;

  // 确保测量容器宽度等于 textarea 的内容区域宽度 (clientWidth - 左右 padding)
  const cs = getComputedStyle(ta);
  const padL = parseFloat(cs.paddingLeft) || 12;
  const padR = parseFloat(cs.paddingRight) || 12;
  const contentWidth = Math.max(10, ta.clientWidth - padL - padR);
  measure.style.width = contentWidth + 'px';

  // 渲染虚拟测量行
  measure.innerHTML = lines.map(l => `<div class="code-editor-measure-line">${esc(l) || '&#8203;'}</div>`).join('');

  // 同步测量高度生成行号 DOM
  const measureDivs = measure.children;
  const gutterHtmlArr = [];
  for (let i = 0; i < count; i++) {
    const h = measureDivs[i] ? measureDivs[i].offsetHeight : 19.2;
    gutterHtmlArr.push(`<div class="code-editor-gutter-line" style="height:${h}px">${i + 1}</div>`);
  }
  gutter.innerHTML = gutterHtmlArr.join('');
  gutter.scrollTop = ta.scrollTop;
}

function refreshRaw() {
  if (!state.current) return;
  const { fields, body } = collectForm();
  $('#rawText').value = MD.serializeMd(fields, body);
  requestAnimationFrame(() => updateRawGutter());
}

function bindRaw() {
  const ta = $('#rawText');
  const gutter = $('#rawGutter');
  if (!ta) return;

  ta.addEventListener('input', () => {
    updateRawGutter();
  });

  ta.addEventListener('scroll', () => {
    if (gutter) gutter.scrollTop = ta.scrollTop;
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (state.activeTab === 'tabRaw') {
        updateRawGutter();
      }
    });
    ro.observe(ta);
  }

  // 编程编辑器体验：按 Tab 插入两个空格缩进
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.setRangeText('  ', start, end, 'end');
      updateRawGutter();
      markDirty();
    }
  });

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
  const dlg = $('#settingsDlg');
  if (!dlg) return;
  const connText = ($('#connStatus')?.textContent || '').trim();
  const inputEl = $('#cfgAtlas');
  if (inputEl) {
    inputEl.value = (connText !== '未配置路径' && connText !== '服务异常' && connText !== '未连接')
      ? connText : '';
  }
  try {
    if (dlg.open) dlg.close();
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      dlg.show();
    }
  } catch (err) {
    console.error('打开设置弹窗失败:', err);
    try { dlg.show(); } catch (_) {}
  }
}

function bindSettings() {
  const btnSettings = $('#btnSettings');
  if (btnSettings) {
    btnSettings.onclick = openSettings;
  }
  // 支持直接点击路径文本更换路径或更换授权文件夹
  const connEl = $('#connStatus');
  if (connEl) {
    connEl.style.cursor = 'pointer';
    connEl.title = '点击随时更换 atlas-core 路径或选择新文件夹';
    connEl.onclick = () => {
      if (adapter && adapter.mode === 'fs') {
        $('#btnConnect')?.click();
      } else {
        openSettings();
      }
    };
  }

  const dlg = $('#settingsDlg');
  if (dlg) {
    // 点击背景遮罩区域自动关闭弹窗
    dlg.addEventListener('click', e => {
      const rect = dlg.getBoundingClientRect();
      const inDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!inDialog) dlg.close();
    });
  }

  const btnBrowse = $('#cfgBrowse');
  if (btnBrowse) {
    btnBrowse.onclick = async () => {
      if (adapter.mode !== 'server') {
        toast('网页模式下请使用文件系统直接授权，本地服务模式支持唤起资源管理器', 'warn');
        return;
      }
      btnBrowse.disabled = true;
      try {
        toast('正在调起系统资源管理器，请在弹出窗口中选择 atlas-core 根目录…', 'ok');
        const cur = ($('#cfgAtlas')?.value || '').trim();
        const res = await adapter.browseDir(cur);
        if (res && res.path) {
          if ($('#cfgAtlas')) $('#cfgAtlas').value = res.path;
          if (!res.has_pic) {
            toast(`已选路径：${res.path}（提示：未在该目录下发现 pic/ 文件夹，请确认）`, 'err');
          } else {
            toast(`已选择路径：${res.path}`, 'ok');
          }
        }
      } catch (e) {
        toast(`调用资源管理器失败：${e.message}`, 'err');
      } finally {
        btnBrowse.disabled = false;
      }
    };
  }

  const btnOpenExp = $('#cfgOpenExplorer');
  if (btnOpenExp) {
    btnOpenExp.onclick = async () => {
      const cur = ($('#cfgAtlas')?.value || '').trim();
      if (!cur) return toast('请先输入或选择路径', 'err');
      if (adapter.mode !== 'server') return toast('网页模式下无法直接打开资源管理器', 'warn');
      try {
        await adapter.openExplorer(cur);
        toast('已在系统资源管理器中打开', 'ok');
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  }

  const btnCancel = $('#cfgCancel');
  if (btnCancel && dlg) {
    btnCancel.onclick = () => dlg.close();
  }

  const btnSave = $('#cfgSave');
  if (btnSave) {
    btnSave.onclick = async () => {
      try {
        const val = ($('#cfgAtlas')?.value || '').trim();
        await api('/api/config', postBody({ atlas_core: val }));
        if (dlg) dlg.close();
        if ($('#connStatus')) $('#connStatus').textContent = val;
        toast('配置已保存', 'ok');
        await loadStage(state.stage);
      } catch (e) { toast(e.message, 'err'); }
    };
  }
}

/* ================= 全局事件 ================= */

function bindGlobalEvents() {
  bindViewer();
  bindFormTabs();
  bindRaw();
  bindSettings();
  $('#filterInput').oninput = renderList;
  // 监听 Alt 键按下与松开，给画布添加准星样式提示
  window.addEventListener('keydown', e => {
    if (e.key === 'Alt') {
      $('#osdWrap')?.classList.add('alt-active');
    }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'Alt') {
      $('#osdWrap')?.classList.remove('alt-active');
    }
  });
  window.addEventListener('blur', () => {
    $('#osdWrap')?.classList.remove('alt-active');
  });

  document.addEventListener('keydown', e => {
    // Ctrl/Cmd + S 保存
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
      return;
    }

    // Alt + 方向键：对当前选中的标注进行像素级微调（严格拦截视口平移与浏览器滚动）
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (e.altKey && arrowKeys.includes(e.key)) {
      // 若当前焦点在可编辑表单或输入框中，不抢占键盘输入
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) && !document.activeElement?.classList.contains('ann-input-x') && !document.activeElement?.classList.contains('ann-input-y')) {
        return;
      }

      const activeCard = $('#annList .ann-card.highlight');
      const activeIdx = activeCard ? parseInt(activeCard.dataset.idx, 10) : -1;
      const list = $('#annList')._getList ? $('#annList')._getList() : [];
      if (activeIdx >= 0 && list[activeIdx]) {
        e.preventDefault();
        e.stopPropagation();

        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;

        const curAnn = list[activeIdx];
        const info = state.current?.imageInfo;
        const maxX = info ? info.width : Infinity;
        const maxY = info ? info.height : Infinity;

        if (curAnn.type === 'point' || !curAnn.type) {
          const curX = Math.max(0, Math.min(maxX, (curAnn.coord?.[0] || 0) + dx));
          const curY = Math.max(0, Math.min(maxY, (curAnn.coord?.[1] || 0) + dy));
          curAnn.coord = [curX, curY];
        } else if (curAnn.type === 'rect' && Array.isArray(curAnn.bbox) && curAnn.bbox.length === 4) {
          curAnn.bbox[0] = Math.max(0, curAnn.bbox[0] + dx);
          curAnn.bbox[1] = Math.max(0, curAnn.bbox[1] + dy);
          if (curAnn.coord) {
            curAnn.coord[0] = Math.round(curAnn.bbox[0] + curAnn.bbox[2] / 2);
            curAnn.coord[1] = Math.round(curAnn.bbox[1] + curAnn.bbox[3] / 2);
          }
        } else if (curAnn.type === 'area' && Array.isArray(curAnn.polygon)) {
          curAnn.polygon = curAnn.polygon.map(([px, py]) => [
            Math.max(0, Math.min(maxX, px + dx)),
            Math.max(0, Math.min(maxY, py + dy))
          ]);
          if (curAnn.coord) {
            const cp = getPolygonCentroid(curAnn.polygon) || curAnn.polygon[0];
            curAnn.coord = [cp[0], cp[1]];
          }
        } else if (curAnn.type === 'path' && Array.isArray(curAnn.polyline)) {
          curAnn.polyline = curAnn.polyline.map(([px, py]) => [
            Math.max(0, Math.min(maxX, px + dx)),
            Math.max(0, Math.min(maxY, py + dy))
          ]);
          if (curAnn.coord) {
            const mp = getPolylineMidpoint(curAnn.polyline) || curAnn.polyline[0];
            curAnn.coord = [mp[0], mp[1]];
          }
        }

        markDirty();

        // 局部更新卡片输入框，避免整表销毁重建导致的焦点丢失与闪烁
        const ix = activeCard.querySelector('.ann-input-x');
        const iy = activeCard.querySelector('.ann-input-y');
        if (ix && curAnn.coord) ix.value = curAnn.coord[0];
        if (iy && curAnn.coord) iy.value = curAnn.coord[1];

        const taGeom = activeCard.querySelector('.ann-geom-textarea');
        if (taGeom) {
          if (curAnn.type === 'area' && curAnn.polygon) taGeom.value = JSON.stringify(curAnn.polygon);
          else if (curAnn.type === 'path' && curAnn.polyline) taGeom.value = JSON.stringify(curAnn.polyline);
          else if (curAnn.type === 'rect' && curAnn.bbox) taGeom.value = JSON.stringify(curAnn.bbox);
        }

        renderOsdOverlays();
        highlightAnnCard(activeIdx, false);
      }
    }
  });
  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('resize', regrowTextareas);

  // 表单面板宽度拖拽
  const splitter = $('#splitter');
  splitter.addEventListener('mousedown', e => {
    splitter.classList.add('on');
    const move = ev => {
      const w = window.innerWidth - ev.clientX;
      $('#formPane').style.width = Math.min(Math.max(w, 360), window.innerWidth * 0.6) + 'px';
      regrowTextareas();   // 宽度变化后重算自动增高文本框的高度
    };
    const up = () => { splitter.classList.remove('on'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
  });
}

/* ---------- 自定义下拉（原生 select 仅作数据载体，弹窗样式随主题） ---------- */

function makeCombo(sel) {
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  sel.insertAdjacentElement('afterend', wrap);
  sel.hidden = true;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'combo-btn';
  btn.innerHTML = `<span class="combo-val"></span>${icon('chevron-down', 14)}`;
  btn.setAttribute('aria-haspopup', 'listbox');
  const pop = document.createElement('div');
  pop.className = 'combo-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'listbox');
  wrap.append(btn, pop);

  const refreshBtn = () => {
    btn.querySelector('.combo-val').textContent = (sel.options[sel.selectedIndex] || {}).text || '';
    btn.setAttribute('aria-expanded', String(!pop.hidden));
  };
  const buildOpts = () => {
    pop.innerHTML = [...sel.options].map(o =>
      `<div class="combo-opt${o.value === sel.value ? ' sel' : ''}" role="option" data-v="${esc(o.value)}">${esc(o.textContent)}</div>`).join('');
    pop.querySelectorAll('.combo-opt').forEach(el => el.onclick = () => {
      sel.value = el.dataset.v;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    });
  };
  const open = () => { buildOpts(); pop.hidden = false; wrap.classList.add('open'); refreshBtn(); };
  const close = () => { pop.hidden = true; wrap.classList.remove('open'); refreshBtn(); };

  btn.onclick = e => { e.stopPropagation(); pop.hidden ? open() : close(); };
  btn.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (pop.hidden) { open(); return; }
      const opts = [...pop.querySelectorAll('.combo-opt')];
      const i = opts.findIndex(el => el.classList.contains('sel'));
      const n = e.key === 'ArrowDown' ? Math.min(i + 1, opts.length - 1) : Math.max(i - 1, 0);
      if (opts[n]) { sel.value = opts[n].dataset.v; buildOpts(); }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!pop.hidden) { e.preventDefault(); close(); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    } else if (e.key === 'Escape' && !pop.hidden) {
      close();
    }
  };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });

  sel._refreshCombo = refreshBtn;
  refreshBtn();
}

function refreshCombos() {
  $$('select').forEach(s => s._refreshCombo && s._refreshCombo());
}

function bindFormEvents() {
  makeCombo($('#f_category'));
  makeCombo($('#physComp'));
  autoGrow($('#f_intro'), 2);
  $('#formScroll').addEventListener('input', e => {
    if (e.target.closest('#tabRaw')) return;
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
      toast(`已提取 ${colors.length} 主色`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  // 大图标注相关按钮
  $('#btnAnnotateMode').onclick = () => {
    if (state.pickingTargetIndex !== null) state.pickingTargetIndex = null;
    state.annotateMode = !state.annotateMode;
    updateAnnotateModeUI();
    if (state.annotateMode) {
      switchTab('tabAnnotations');
      toast('采点模式已开启：在大图上直接点击即可新增标注点位', 'ok');
    } else {
      toast('已退出采点模式');
    }
  };

  $('#btnAddAnn').onclick = () => {
    const list = $('#annList')._getList ? $('#annList')._getList() : [];
    const info = state.current?.imageInfo;
    const cx = info ? Math.round(info.width / 2) : 1000;
    const cy = info ? Math.round(info.height / 2) : 1000;
    const curZoom = osdViewer && osdViewer.viewport
      ? Number((osdViewer.viewport.viewportToImageZoom(osdViewer.viewport.getZoom(true))).toFixed(1)) || 2.0
      : 2.0;
    const nextId = generateAnnId(list.length, 'point');
    list.push({
      id: nextId,
      type: 'point',
      coord: [cx, cy],
      title: `标注 ${list.length + 1}`,
      desc: '',
      level: 'primary',
      zoomLevel: curZoom,
    });
    renderAnnotations(list);
    markDirty();
    highlightAnnCard(list.length - 1, true);
    toast(`已添加标注 #${nextId}，可输入信息或点击「采点」调整位置`, 'ok');
  };

  $('#btnPromptAnn').onclick = () => {
    const cur = state.current;
    const info = cur?.imageInfo;
    const title = $('#f_title').value || cur?.imageRel?.split('/').pop() || '未命名图纸';
    const intro = $('#f_intro').value || '';
    const vision = ($('#visionList')._getList ? $('#visionList')._getList() : []).map(v => `- **${v.term}**：${v.desc}`).join('\n');
    const promptText = `# 需求：为 AtlasCore/Gallery 描述文件生成【大图坐标标注 (annotations)】

## 1. 当前图纸规格与信息
- 图纸标题：${title}
- 图像文件：${cur?.imageRel?.split('/').pop() || ''}
- 原图真实像素尺寸：${info?.width || 0} × ${info?.height || 0} px
- 物理尺寸：${$('#physW').value || info?.cmW || 0}cm × ${$('#physH').value || info?.cmH || 0}cm (DPI: ${info?.dpi || 300})
- 制图思路与视觉要素：
${intro}

${vision}

## 2. 坐标系统与计算基准
- 基准坐标系：必须严格基于【原图物理像素尺寸 (Image Pixels)】，以图片左上角为原点 [0, 0]，向右为 X，向下为 Y。格式为 [X, Y] 正整数。
- 坐标范围限制：X 必须在 [0 ~ ${info?.width || 0}]，Y 必须在 [0 ~ ${info?.height || 0}] 之间。

## 3. 输出数据模型规范 (YAML annotations)
请从上述制图思路中识别或推测关键地标、枢纽节点、重点工程区、古城门或特写区域，生成符合规范的 annotations YAML 代码块：

\`\`\`yaml
annotations:
  - id: 01-P
    type: point
    coord: [X, Y]
    title: 地标名称(6字以内)
    desc: 详细工程/地理说明(1~2句话)
    level: primary | accent | info
    zoomLevel: 2.2
  - id: 02-L
    type: path
    polyline: [[X1, Y1], [X2, Y2], [X3, Y3]]
    title: 路线名称
    desc: 工程走向说明
    level: accent
  - id: 03-A
    type: area
    polygon: [[X1, Y1], [X2, Y2], [X3, Y3], [X4, Y4]]
    title: 作业区域名称
    desc: 重点闭合区域说明
    level: info
    style:
      dash: true
      hatch: true
\`\`\`
`;
    navigator.clipboard.writeText(promptText).then(() => {
      toast('已复制标准 AI 标注提示词（包含当前图像尺寸与上下文）！', 'ok');
    }).catch(() => {
      toast('复制失败，请检查浏览器剪贴板权限', 'err');
    });
  };

  $('#btnSave').onclick = save;
}

init();
