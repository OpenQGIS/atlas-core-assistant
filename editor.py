# -*- coding: utf-8 -*-
"""
AtlasCore Assistant — 标注 MD 表单编辑器（跨平台：Windows / macOS）

本地 Web 应用：左侧图片预览（缩放/平移），右侧表单化编辑 MD 的
YAML frontmatter 与正文，分类/专题/标签提供预设下拉，图片日期与
实际物理尺寸可直接从图像元数据读取计算。

启动：python editor.py [--atlas 路径] [--port 8098] [--no-browser]
依赖：仅 Pillow（pip install Pillow）
"""

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
CACHE_DIR = os.path.join(BASE_DIR, '.cache')
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')

PORT_DEFAULT = 8098
VERSION = '1.0.0'
IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp')
STAGES = ('01_pending', '02_waiting', '03_published')
DEFAULT_DPI = 300.0
THUMB_MAX = 3200

# ---------------------------------------------------------------- 配置

_config_lock = threading.Lock()
_config = None


def load_config():
    global _config
    with _config_lock:
        if _config is None:
            cfg = {}
            if os.path.exists(CONFIG_PATH):
                try:
                    with open(CONFIG_PATH, 'r', encoding='utf-8-sig') as f:
                        cfg = json.load(f)
                except Exception:
                    cfg = {}
            _config = cfg
        return dict(_config)


def save_config(cfg):
    global _config
    with _config_lock:
        _config = dict(cfg)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_atlas_root():
    root = os.environ.get('ATLAS_CORE') or load_config().get('atlas_core') or ''
    return os.path.abspath(root) if root else ''


def get_pic_dir(root=None):
    root = root or get_atlas_root()
    return os.path.join(root, 'pic') if root else ''


# ---------------------------------------------------------------- 路径安全

def resolve_rel(rel, root=None):
    """把 pic 相对路径解析为绝对路径，并确保位于 pic 目录之内。"""
    pic = get_pic_dir(root)
    if not pic:
        return None
    rel = (rel or '').replace('\\', '/').lstrip('/')
    full = os.path.realpath(os.path.join(pic, *rel.split('/')))
    try:
        if os.path.commonpath([full, os.path.realpath(pic)]) != os.path.realpath(pic):
            return None
    except ValueError:
        return None
    return full


# ---------------------------------------------------------------- MD 解析与序列化

FIELD_ORDER = ['id', 'title', 'status', 'alt_name', 'author', 'date', 'year', 'physicalSize',
               'category', 'categoryName', 'subCategory', 'topic', 'hero', 'image',
               'alias', 'tags', 'color', 'workflow']
STAGE_STATUS = {'01_pending': 'pending', '02_waiting': 'waiting', '03_published': 'published'}
LIST_FIELDS = {'alias', 'tags', 'color'}
WORKFLOW_ORDER = ['QGIS', 'Ink', 'PS', 'GIMP', 'AI']
QUOTED_ALWAYS = {'date', 'year', 'physicalSize'}
BODY_HEADING = '# 制图思路'
BODY_SECTION = '### 视觉语言与空间形态'


def _unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        return v[1:-1]
    return v


def parse_frontmatter(text):
    """解析 YAML frontmatter（本项目子集：标量/列表/一层字典/注释）。"""
    m = re.match(r'^---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n(.*))?$', text, re.DOTALL)
    if not m:
        return {}, text, False
    yaml_text, body = m.group(1), m.group(2) or ''
    lines = yaml_text.splitlines()
    fields = {}
    order = []
    i = 0
    pending = None  # None | ('list', key) | ('dict', key)：当前未闭合的块
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s or s.startswith('#'):
            i += 1
            continue
        if s.startswith('- ') and pending and pending[0] == 'list':
            fields[pending[1]].append(_unquote(s[2:]))
            i += 1
            continue
        mm = re.match(r'^("[^"]*"|[^:]+)\s*:\s*(.*)$', s)
        if not mm:
            i += 1
            continue
        key = _unquote(mm.group(1)).strip()
        val = mm.group(2).strip()
        if val == '':
            # 列表还是字典：向后看第一条数据行
            j = i + 1
            while j < len(lines) and (not lines[j].strip() or lines[j].strip().startswith('#')):
                j += 1
            nxt = lines[j].strip() if j < len(lines) else ''
            if nxt.startswith('- '):
                fields[key] = []
                pending = ('list', key)
            else:
                fields[key] = {}
                pending = ('dict', key)
            if key not in order:
                order.append(key)
        elif pending and pending[0] == 'dict':
            # 嵌套字典条目（如 workflow 下的 QGIS: 100%）
            stripped = val
            if not (stripped.startswith('"') and stripped.endswith('"')):
                cm = re.search(r'\s+#\s', stripped)
                if cm:
                    stripped = stripped[:cm.start()].strip()
            fields[pending[1]][key] = _unquote(stripped)
        else:
            stripped = val
            if not (stripped.startswith('"') and stripped.endswith('"')):
                # 去掉行尾注释（" #..."），但保留 # 开头的值（引号包裹的色值）
                cm = re.search(r'\s+#\s', stripped)
                if cm:
                    stripped = stripped[:cm.start()].strip()
            fields[key] = _unquote(stripped)
            pending = None
            if key not in order:
                order.append(key)
        i += 1
    fields['__order__'] = order
    return fields, body, True


def parse_body(body):
    """正文 → {intro, items:[{term,desc}]}。"""
    intro_lines = []
    items = []
    in_section = False
    for line in body.splitlines():
        st = line.strip()
        if st.startswith('###'):
            in_section = True
            continue
        if not in_section:
            intro_lines.append(line)
        else:
            mm = re.match(r'^-\s*\*\*(.+?)\*\*\s*[：:]\s*(.*)$', st)
            if mm:
                items.append({'term': mm.group(1).strip(), 'desc': mm.group(2).strip()})
            elif st.startswith('-') and st != '-' and items:
                items[-1]['desc'] += '\n' + st[1:].strip()
    intro = '\n'.join(intro_lines).strip('\n')
    # 去掉首行 "# 制图思路" 标题
    intro = re.sub(r'^#\s*[^\n]*\n?', '', intro).strip('\n')
    return {'intro': intro.strip(), 'items': items}


def parse_md_text(text):
    fields, body, ok = parse_frontmatter(text)
    return fields, parse_body(body), ok


def _fmt_scalar(key, val):
    s = '' if val is None else str(val)
    quote = False
    if key in QUOTED_ALWAYS or s == '':
        quote = True
    elif s.startswith('#') or s != s.strip():
        quote = True
    elif re.fullmatch(r'[\d.]+', s):  # 纯数字一律加引号，避免 YAML 误判类型
        quote = True
    elif any(c in s for c in '"') or re.match(r'^[-?:,\[\]{}&*!|>%@`]', s):
        quote = True
    if '"' in s:
        s = s.replace('"', "'")
    return f'"{s}"' if quote else s


def serialize_md(fields, body):
    """按项目规范格式把 fields/body 序列化为完整 MD 文本。"""
    order = [k for k in FIELD_ORDER if k in fields and fields[k] not in (None, '', [], {})]
    order += [k for k in fields.get('__order__', [])
              if k not in order and k != '__order__' and fields.get(k) not in (None, '', [], {})]
    out = ['---']
    for k in order:
        v = fields[k]
        if k == 'workflow' and isinstance(v, dict):
            out.append('workflow:')
            wo = [x for x in WORKFLOW_ORDER if x in v] + [x for x in v if x not in WORKFLOW_ORDER]
            for sk in wo:
                sv = str(v[sk]).strip().rstrip('%')
                out.append(f'  {sk}: {sv}%')
        elif k in LIST_FIELDS and isinstance(v, list):
            out.append(f'{k}:')
            for item in v:
                out.append(f'  - {_fmt_scalar("__item__", item)}')
        elif isinstance(v, list):
            out.append(f'{k}:')
            for item in v:
                out.append(f'  - {_fmt_scalar("__item__", item)}')
        else:
            out.append(f'{k}: {_fmt_scalar(k, v)}')
    out.append('---')
    out.append('')
    out.append(BODY_HEADING)
    out.append('')
    intro = (body.get('intro') or '').strip('\n')
    if intro:
        out.append(intro)
        out.append('')
    items = body.get('items') or []
    if items:
        out.append(BODY_SECTION)
        out.append('')
        for it in items:
            term = (it.get('term') or '').strip() or '要点'
            desc = (it.get('desc') or '').strip()
            out.append(f'- **{term}**：{desc}')
            out.append('')  # 项目风格：要点之间空一行
        out.append('')
    return '\n'.join(out).rstrip('\n') + '\n'


# ---------------------------------------------------------------- 图像信息

def suggest_composition(w, h):
    if not w or not h:
        return '标准横幅画幅'
    r = w / h
    if r >= 3.0:
        return '超宽全景长卷'
    if r >= 1.25:
        return '标准横幅画幅'
    if r >= 0.9:
        return '经典近方画幅'
    if r >= 0.35:
        return '标准竖构图'
    return '修长立轴卷轴'


def image_info(path):
    info = {'width': None, 'height': None, 'format': None, 'dpi': None,
            'exifDate': None, 'fileTime': None, 'sizeMB': None,
            'cmW': None, 'cmH': None, 'suggestedComposition': None}
    try:
        with Image.open(path) as im:
            w, h = im.size
            info['width'], info['height'] = w, h
            info['format'] = im.format
            dpi = im.info.get('dpi')
            if dpi and dpi[0] and dpi[0] > 1:
                info['dpi'] = round(float(dpi[0]), 1)
            try:
                ex = im.getexif()
                v = ex.get(36867) or ex.get(306)  # DateTimeOriginal / DateTime
                if v:
                    info['exifDate'] = str(v)
            except Exception:
                pass
    except Exception:
        return info
    info['sizeMB'] = round(os.path.getsize(path) / 1048576, 1)
    mt = os.path.getmtime(path)
    info['mtime'] = int(mt)
    info['fileTime'] = datetime.fromtimestamp(mt).strftime('%Y.%m.%d %H:%M')
    eff = info['dpi'] or DEFAULT_DPI
    info['cmW'] = round(info['width'] / eff * 2.54, 1)
    info['cmH'] = round(info['height'] / eff * 2.54, 1)
    info['suggestedComposition'] = suggest_composition(info['width'], info['height'])
    return info


def extract_palette(path, n=5):
    """_mediancut 量化提取 n 个主色（按出现频次降序）。"""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
        im.thumbnail((256, 256))
        q = im.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
        palette = q.getpalette()[:n * 3]
        counts = {}
        for cnt, idx in q.getcolors(maxcolors=n * 256) or []:
            counts[idx] = counts.get(idx, 0) + cnt
        ranked = sorted(counts, key=counts.get, reverse=True)
        colors = []
        for idx in ranked:
            r, g, b = palette[idx * 3: idx * 3 + 3]
            colors.append('#{:02X}{:02X}{:02X}'.format(r, g, b))
        # 频次缺失时按调色板顺序补齐
        for idx in range(n):
            if len(colors) >= n:
                break
            r, g, b = palette[idx * 3: idx * 3 + 3]
            c = '#{:02X}{:02X}{:02X}'.format(r, g, b)
            if c not in colors:
                colors.append(c)
        return colors[:n]


def make_thumb(path, max_dim=THUMB_MAX):
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = hashlib.sha1(f'{path}|{os.path.getmtime(path)}|{max_dim}'.encode('utf-8')).hexdigest()[:20]
    out = os.path.join(CACHE_DIR, key + '.jpg')
    if os.path.exists(out):
        return out
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
        im.thumbnail((max_dim, max_dim), Image.LANCZOS)
        fd, tmp = tempfile.mkstemp(suffix='.jpg', dir=CACHE_DIR)
        os.close(fd)
        im.save(tmp, 'JPEG', quality=88)
        os.replace(tmp, out)
    return out


# ---------------------------------------------------------------- 深焦瓦片（金字塔按需加载）

TILE_SIZE = 256
_DECODE_CACHE = {}          # path -> (mtime, 已解码 RGB Image)，LRU 最多 2 张
_DECODE_LOCK = threading.Lock()


def get_decoded(path):
    """解码原图并做 LRU 缓存：深推平移时避免每个瓦片都重新解码 90MB PNG。"""
    mt = os.path.getmtime(path)
    with _DECODE_LOCK:
        hit = _DECODE_CACHE.get(path)
        if hit and hit[0] == mt:
            # 触碰一下实现 LRU 顺序
            _DECODE_CACHE.pop(path)
            _DECODE_CACHE[path] = hit
            return hit[1]
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode != 'RGB':
            im = im.convert('RGB')
        im.load()
    if im.width * im.height * 3 <= 400 * 1024 * 1024:  # 超大图不缓存，防止内存爆掉
        with _DECODE_LOCK:
            _DECODE_CACHE[path] = (mt, im)
            while len(_DECODE_CACHE) > 2:
                _DECODE_CACHE.pop(next(iter(_DECODE_CACHE)))
    return im


def max_level_of(w, h):
    return max(0, math.ceil(math.log2(max(w, h))))


def make_tile(path, level, x, y):
    """DZI 风格瓦片：level 越大分辨率越高，只切请求的那一块。"""
    with Image.open(path) as im0:
        W, H = im0.size
        fmt = im0.format
    ml = max_level_of(W, H)
    if level < 0 or level > ml:
        return None
    scale = 2 ** (ml - level)
    lw, lh = math.ceil(W / scale), math.ceil(H / scale)
    tx, ty = x * TILE_SIZE, y * TILE_SIZE
    if tx >= lw or ty >= lh:
        return None
    tw, th = min(TILE_SIZE, lw - tx), min(TILE_SIZE, lh - ty)

    os.makedirs(os.path.join(CACHE_DIR, 'tiles'), exist_ok=True)
    key = hashlib.sha1(f'{path}|{os.path.getmtime(path)}|{level}|{x}|{y}'.encode('utf-8')).hexdigest()[:24]
    out = os.path.join(CACHE_DIR, 'tiles', key + '.jpg')
    if os.path.exists(out):
        return out

    need = max(lw, lh)
    src = path
    if need <= 1024:
        src = make_thumb(path, 1024)
    elif need <= THUMB_MAX:
        src = make_thumb(path, THUMB_MAX)

    if src == path:
        im = get_decoded(path)
        sw, sh = im.size
        rx, ry = tx * sw / lw, ty * sh / lh
        rw, rh = max(1.0, tw * sw / lw), max(1.0, th * sh / lh)
        box = (min(int(rx), sw - 1), min(int(ry), sh - 1),
               min(max(int(rx + rw), int(rx) + 1), sw),
               min(max(int(ry + rh), int(ry) + 1), sh))
        region = im.crop(box).resize((tw, th), Image.LANCZOS)
    else:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert('RGB')
            sw, sh = im.size
            # 层坐标 → 源图坐标
            rx, ry = tx * sw / lw, ty * sh / lh
            rw, rh = max(1.0, tw * sw / lw), max(1.0, th * sh / lh)
            box = (min(int(rx), sw - 1), min(int(ry), sh - 1),
                   min(max(int(rx + rw), int(rx) + 1), sw),
                   min(max(int(ry + rh), int(ry) + 1), sh))
            region = im.crop(box).resize((tw, th), Image.LANCZOS)

    fd, tmp = tempfile.mkstemp(suffix='.jpg', dir=os.path.join(CACHE_DIR, 'tiles'))
    os.close(fd)
    region.save(tmp, 'JPEG', quality=86)
    os.replace(tmp, out)
    return out


# ---------------------------------------------------------------- 文件清单

def list_stage(stage):
    pic = get_pic_dir()
    stage_dir = os.path.join(pic, stage)
    items = []
    if not os.path.isdir(stage_dir):
        return items
    for dirpath, dirnames, filenames in os.walk(stage_dir):
        dirnames.sort()
        stems = {}
        for fn in filenames:
            base, ext = os.path.splitext(fn)
            if ext.lower() in IMAGE_EXTS:
                stems.setdefault(base, fn)
        for base, img in sorted(stems.items()):
            rel_dir = os.path.relpath(dirpath, pic).replace('\\', '/')
            md_rel = None
            md_file = os.path.join(dirpath, base + '.md')
            if os.path.exists(md_file):
                md_rel = f'{rel_dir}/{base}.md'
            item = {
                'stem': base,
                'displayName': base,
                'folder': '' if rel_dir == stage else rel_dir[len(stage) + 1:],
                'imageRel': f'{rel_dir}/{img}',
                'mdRel': md_rel,
                'hasMd': md_rel is not None,
                'mtime': int(os.path.getmtime(os.path.join(dirpath, img))),
            }
            if md_rel:
                try:
                    with open(md_file, 'r', encoding='utf-8-sig') as f:
                        fields, _, _ = parse_frontmatter(f.read())
                    item['id'] = fields.get('id', '')
                    item['title'] = fields.get('title', base)
                    item['hero'] = str(fields.get('hero', 'no')).lower() == 'yes'
                    item['mtime'] = int(os.path.getmtime(md_file))
                except Exception:
                    pass
            items.append(item)
    items.sort(key=lambda x: -x['mtime'])
    return items


def build_draft(image_path):
    """从图片生成 MD 草稿字段（Step 2 的人工替代入口）。"""
    base = os.path.splitext(os.path.basename(image_path))[0]
    today = datetime.now()
    info = image_info(image_path)
    try:
        palette = extract_palette(image_path)
    except Exception:
        palette = []
    phys = f'{info["cmW"]:.1f}cm x {info["cmH"]:.1f}cm，{info["suggestedComposition"]}'
    draft_id = re.sub(r'[\s]+', '_', base)
    norm = image_path.replace('\\', '/')
    stage = next((s for s in STAGES if f'/{s}/' in norm), '')
    fields = {
        'id': draft_id,
        'title': base,
        'status': STAGE_STATUS.get(stage, ''),
        'alt_name': base,
        'author': 'OpenQGIS',
        'date': today.strftime('%Y.%m.%d'),
        'year': f'{today.year}.{today.month}',
        'physicalSize': phys,
        'category': 'original',
        'categoryName': '原创图',
        'subCategory': '',
        'topic': '',
        'hero': 'yes',
        'image': os.path.basename(image_path),
        'alias': [draft_id, base],
        'tags': [],
        'color': palette,
        'workflow': {'QGIS': '100%', 'Ink': '0%', 'PS': '0%', 'GIMP': '0%', 'AI': '0%'},
        '__order__': list(FIELD_ORDER),
    }
    body = {'intro': '', 'items': []}
    return fields, body, info


# ---------------------------------------------------------------- 校验

REQUIRED_FIELDS = ['id', 'title', 'date', 'category', 'categoryName', 'image']


def validate(fields, body, md_path):
    errors, warnings = [], []
    for k in REQUIRED_FIELDS:
        if not str(fields.get(k, '')).strip():
            errors.append(f'缺少必填字段：{k}')
    sid = str(fields.get('id', ''))
    if sid and not re.fullmatch(r'[A-Za-z0-9_\-]+', sid):
        warnings.append(f'id 建议使用英文/数字/下划线（当前：{sid}）')
    for c in fields.get('color') or []:
        if not re.fullmatch(r'#[0-9A-Fa-f]{6}', str(c)):
            errors.append(f'色值格式非法：{c}（应为 #RRGGBB）')
    wf = fields.get('workflow') or {}
    try:
        total = sum(int(str(v).strip().rstrip('%') or 0) for v in wf.values())
        if total != 100:
            warnings.append(f'workflow 占比合计 {total}% ≠ 100%')
    except Exception:
        warnings.append('workflow 占比含非数值')
    img_field = str(fields.get('image', ''))
    if img_field:
        sibling = os.path.join(os.path.dirname(md_path), img_field)
        if not os.path.exists(sibling):
            warnings.append(f'image 字段 {img_field} 与同目录文件不匹配')
    if not (body.get('intro') or '').strip():
        warnings.append('制图思路正文为空')
    return errors, warnings


# ---------------------------------------------------------------- HTTP 服务

class Handler(BaseHTTPRequestHandler):
    server_version = 'AtlasAssistant/' + VERSION

    def log_message(self, fmt, *args):
        pass

    # ---- 基础工具
    def _json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def _err(self, msg, status=400):
        self._json({'ok': False, 'error': msg}, status)

    def _file(self, path, ctype):
        try:
            with open(path, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            self._err('文件读取失败', 404)

    def _query(self):
        qs = urllib.parse.urlsplit(self.path).query
        return {k: v[0] for k, v in urllib.parse.parse_qs(qs).items()}

    def _body_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n) if n else b'{}'
        return json.loads(raw.decode('utf-8'))

    # ---- 路由
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        q = self._query()
        try:
            if path == '/' or path == '/index.html':
                page = os.path.join(BASE_DIR, 'index.html')
                if not os.path.exists(page):
                    page = os.path.join(STATIC_DIR, 'index.html')
                self._file(page, 'text/html; charset=utf-8')
            elif path.startswith('/static/'):
                rel = path[len('/static/'):].replace('\\', '/').lstrip('/')
                rel = urllib.parse.unquote(rel)
                if '..' in rel.split('/'):
                    self._err('非法路径', 403)
                    return
                full = os.path.join(STATIC_DIR, *rel.split('/'))
                ext = rel.rsplit('.', 1)[-1].lower()
                ctype = {
                    'css': 'text/css; charset=utf-8',
                    'js': 'application/javascript; charset=utf-8',
                    'mjs': 'application/javascript; charset=utf-8',
                    'html': 'text/html; charset=utf-8',
                    'svg': 'image/svg+xml',
                }.get(ext, 'application/octet-stream')
                self._file(full, ctype)
            elif path == '/api/ping':
                self._json({'ok': True, 'version': VERSION})
            elif path == '/api/config':
                self.api_config_get()
            elif path == '/api/list':
                self.api_list(q)
            elif path == '/api/item':
                self.api_item(q)
            elif path == '/api/palette':
                self.api_palette(q)
            elif path == '/api/thumb':
                self.api_thumb(q)
            elif path == '/api/tile':
                self.api_tile(q)
            elif path == '/api/rawfile':
                self.api_rawfile(q)
            else:
                self._err('接口不存在', 404)
        except Exception as e:
            self._err(f'服务错误：{e}', 500)

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        try:
            payload = self._body_json()
            if path == '/api/config':
                self.api_config_set(payload)
            elif path == '/api/preview':
                self.api_preview(payload)
            elif path == '/api/parse':
                self.api_parse(payload)
            elif path == '/api/save':
                self.api_save(payload)
            elif path == '/api/write':
                self.api_write(payload)
            elif path == '/api/open':
                self.api_open(payload)
            else:
                self._err('接口不存在', 404)
        except Exception as e:
            self._err(f'服务错误：{e}', 500)

    # ---- API 实现
    def api_config_get(self):
        root = get_atlas_root()
        pic = get_pic_dir(root)
        stages = {}
        for st in STAGES:
            d = os.path.join(pic, st) if pic else ''
            stages[st] = {'exists': bool(d) and os.path.isdir(d)}
        self._json({'ok': True, 'atlas_core': root, 'pic_dir': pic, 'stages': stages,
                    'version': VERSION, 'port': self.server.server_address[1]})

    def api_config_set(self, payload):
        root = str(payload.get('atlas_core', '')).strip()
        pic = os.path.join(os.path.abspath(root), 'pic') if root else ''
        if not root or not os.path.isdir(pic):
            self._err(f'路径无效或缺少 pic 子目录：{root}')
            return
        save_config({'atlas_core': os.path.abspath(root)})
        self._json({'ok': True, 'atlas_core': os.path.abspath(root)})

    def api_list(self, q):
        if not get_pic_dir():
            self._err('未配置 atlas-core 路径，请先在设置中填写')
            return
        stage = q.get('stage', '02_waiting')
        if stage not in STAGES:
            self._err(f'非法阶段：{stage}')
            return
        self._json({'ok': True, 'stage': stage, 'items': list_stage(stage)})

    def api_item(self, q):
        rel = q.get('rel', '')
        full = resolve_rel(rel)
        if not full or not os.path.exists(full):
            self._err(f'文件不存在：{rel}')
            return
        base, ext = os.path.splitext(full)
        if ext.lower() == '.md':
            md_full = full
            img_full = None
            for e in IMAGE_EXTS:
                if os.path.exists(base + e):
                    img_full = base + e
                    break
        else:
            img_full = full
            md_full = base + '.md' if os.path.exists(base + '.md') else None
        pic = get_pic_dir()
        rel_of = lambda p: os.path.relpath(p, pic).replace('\\', '/') if p else None

        info = image_info(img_full) if img_full else None
        if md_full:
            with open(md_full, 'r', encoding='utf-8-sig') as f:
                raw = f.read()
            fields, body, ok = parse_md_text(raw)
            if not ok:
                self._err('MD 缺少 frontmatter（--- ... ---）')
                return
            self._json({'ok': True, 'isDraft': False, 'mdRel': rel_of(md_full),
                        'imageRel': rel_of(img_full), 'fields': fields, 'body': body,
                        'imageInfo': info, 'raw': raw})
        else:
            fields, body, info = build_draft(img_full)
            self._json({'ok': True, 'isDraft': True, 'mdRel': rel_of(base + '.md'),
                        'imageRel': rel_of(img_full), 'fields': fields, 'body': body,
                        'imageInfo': info, 'raw': ''})

    def api_palette(self, q):
        full = resolve_rel(q.get('rel', ''))
        if not full or not os.path.exists(full):
            self._err('图片不存在')
            return
        self._json({'ok': True, 'colors': extract_palette(full)})

    def api_thumb(self, q):
        full = resolve_rel(q.get('rel', ''))
        if not full or not os.path.exists(full):
            self._err('图片不存在', 404)
            return
        try:
            max_dim = min(int(q.get('max', THUMB_MAX)), THUMB_MAX)
            thumb = make_thumb(full, max_dim)
        except Exception as e:
            self._err(f'缩略图生成失败：{e}', 500)
            return
        self._file(thumb, 'image/jpeg')

    def api_rawfile(self, q):
        """按需返回原图字节（大图慎用）。"""
        full = resolve_rel(q.get('rel', ''))
        if not full or not os.path.exists(full):
            self._err('文件不存在', 404)
            return
        ext = os.path.splitext(full)[1].lower().lstrip('.')
        ctype = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                 'webp': 'image/webp', 'tif': 'image/tiff', 'tiff': 'image/tiff',
                 'bmp': 'image/bmp', 'md': 'text/markdown; charset=utf-8'}.get(ext, 'application/octet-stream')
        self._file(full, ctype)

    def api_tile(self, q):
        full = resolve_rel(q.get('rel', ''))
        if not full or not os.path.exists(full):
            self._err('图片不存在', 404)
            return
        try:
            level = int(q.get('level', '-1'))
            x = int(q.get('x', '0'))
            y = int(q.get('y', '0'))
            tile = make_tile(full, level, x, y)
        except Exception as e:
            self._err(f'瓦片生成失败：{e}', 500)
            return
        if not tile:
            self._err('瓦片越界', 404)
            return
        self._file(tile, 'image/jpeg')

    def api_preview(self, payload):
        text = serialize_md(payload.get('fields') or {}, payload.get('body') or {})
        self._json({'ok': True, 'text': text})

    def api_parse(self, payload):
        text = str(payload.get('text', ''))
        fields, body, ok = parse_md_text(text)
        if not ok:
            self._err('无法解析：缺少 frontmatter 或格式错误')
            return
        self._json({'ok': True, 'fields': fields, 'body': body})

    def api_save(self, payload):
        md_rel = payload.get('mdRel', '')
        full = resolve_rel(md_rel)
        if not full:
            self._err(f'非法保存路径：{md_rel}')
            return
        if not md_rel.lower().endswith('.md'):
            self._err('只能保存 .md 文件')
            return
        fields = payload.get('fields') or {}
        body = payload.get('body') or {}
        # 规范化 workflow 数值格式
        if isinstance(fields.get('workflow'), dict):
            fields['workflow'] = {k: (str(v).strip().rstrip('%') or 0) + '%' if not str(v).strip().endswith('%')
                                  else str(v).strip() for k, v in fields['workflow'].items()}
        errors, warnings = validate(fields, body, full)
        if errors:
            self._json({'ok': False, 'errors': errors, 'warnings': warnings})
            return
        text = serialize_md(fields, body)
        # 原子写入
        fd, tmp = tempfile.mkstemp(suffix='.md', dir=os.path.dirname(full))
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            os.replace(tmp, full)
        except Exception:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise
        self._json({'ok': True, 'saved': md_rel, 'warnings': warnings,
                    'text': text})

    def api_write(self, payload):
        """前端已用 md.js 序列化并校验，这里只做受控原子写入。"""
        rel = payload.get('rel', '')
        full = resolve_rel(rel)
        if not full or not rel.lower().endswith('.md'):
            self._err('只能写入 pic 内的 .md 文件')
            return
        text = str(payload.get('text', ''))
        if text and not text.startswith('---'):
            self._err('内容不是合法的 MD（缺少 frontmatter）')
            return
        fd, tmp = tempfile.mkstemp(suffix='.md', dir=os.path.dirname(full))
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            os.replace(tmp, full)
        except Exception:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise
        self._json({'ok': True, 'saved': rel})

    def api_open(self, payload):
        full = resolve_rel(payload.get('rel', ''))
        if not full or not os.path.exists(full):
            self._err('文件不存在')
            return
        try:
            if sys.platform.startswith('win'):
                os.startfile(full)  # noqa
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', full])
            else:
                subprocess.Popen(['xdg-open', full])
            self._json({'ok': True})
        except Exception as e:
            self._err(f'打开失败：{e}')


def main():
    ap = argparse.ArgumentParser(description='AtlasCore 标注 MD 表单编辑器')
    ap.add_argument('--atlas', help='atlas-core 根目录（默认读 config.json）')
    ap.add_argument('--port', type=int, default=PORT_DEFAULT, help=f'端口（默认 {PORT_DEFAULT}）')
    ap.add_argument('--no-browser', action='store_true', help='不自动打开浏览器')
    args = ap.parse_args()

    if args.atlas:
        pic = os.path.join(os.path.abspath(args.atlas), 'pic')
        if not os.path.isdir(pic):
            print(f'[错误] {args.atlas} 下未找到 pic 目录')
            sys.exit(1)
        save_config({'atlas_core': os.path.abspath(args.atlas)})

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{args.port}'
    root = get_atlas_root()
    print('=' * 52)
    print('  AtlasCore Assistant · 标注编辑器')
    print(f'  版本 {VERSION}    地址 {url}')
    print(f'  atlas-core: {root or "（未配置，请在页面设置中填写）"}')
    print('  Ctrl+C 停止服务')
    print('=' * 52)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')


if __name__ == '__main__':
    main()
