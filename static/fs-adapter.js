/* File System Access 适配器：GitHub Pages 模式下的"本地服务"
   直接打开磁盘上的 pic 文件夹，原位读写 MD 与图片，零后端。
   需要 Chrome / Edge（showDirectoryPicker）。 */
'use strict';
window.FSAdapter = (() => {

  const STAGES = ['01_pending', '02_waiting', '03_published'];
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp']);
  const thumbCache = new Map();  // rel -> blobUrl
  const urlCache = new Map();    // rel -> blobUrl（原图）

  // ---------- IndexedDB（记住文件夹句柄） ----------
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('atlas-assistant', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const tx = db.transaction('kv').objectStore('kv').get(key);
        tx.onsuccess = () => res(tx.result);
        tx.onerror = () => rej(tx.error);
      });
    } catch (_) { return undefined; }
  }
  async function idbSet(key, val) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
        tx.onsuccess = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch (_) { }
  }

  const A = {
    mode: 'fs',
    root: null,        // 用户选择的目录（atlas-core 根或 pic 目录）
    picRoot: null,     // 实际包含 01_/02_/03_ 的目录
    label: '',

    get connected() { return !!this.picRoot; },

    async pick() {
      if (!window.showDirectoryPicker) {
        throw new Error('当前浏览器不支持文件夹访问（需要 Chrome / Edge）');
      }
      const h = await showDirectoryPicker({ mode: 'readwrite' });
      await this.setRoot(h);
      await idbSet('rootHandle', h);
    },

    async tryRestore() {
      const h = await idbGet('rootHandle');
      if (!h) return false;
      try {
        await this.setRoot(h);
        return true;
      } catch (_) { return false; }
    },

    async ensurePerm() {
      if (!this.root) return false;
      const opts = { mode: 'readwrite' };
      if ((await this.root.queryPermission(opts)) === 'granted') return true;
      // requestPermission 必须由用户手势触发
      return (await this.root.requestPermission(opts)) === 'granted';
    },

    async setRoot(h) {
      this.root = h;
      // 兼容选择 atlas-core 根目录（含 pic/）或直接选 pic/
      let base = h;
      try {
        base = await h.getDirectoryHandle('pic');
      } catch (_) { }
      // 确认至少存在一个流水线目录
      let found = false;
      for (const st of STAGES) {
        try { await base.getDirectoryHandle(st); found = true; break; } catch (_) { }
      }
      if (!found) {
        throw new Error(STAGES.includes(h.name)
          ? `选中的「${h.name}」是流水线子文件夹，请改为选择它的上一级 pic 文件夹`
          : `「${h.name}」下没有 01_pending / 02_waiting / 03_published，请选择 atlas-core 的 pic 文件夹（或包含 pic 的根目录）`);
      }
      this.picRoot = base;
      this.label = h.name + (base !== h ? '/pic' : '');
    },

    async stageDir(stage) {
      if (!this.picRoot) throw new Error('未连接文件夹');
      return await this.picRoot.getDirectoryHandle(stage)
        .catch(() => { throw new Error(`已连接的「${this.label}」里没有 ${stage} 文件夹`); });
    },

    async dirFromPath(parts, base) {
      let dir = base || this.picRoot;
      for (const p of parts) dir = await dir.getDirectoryHandle(p);
      return dir;
    },

    async resolveFile(rel) {
      const parts = String(rel).split('/').filter(Boolean);
      if (parts.some(p => p === '..')) throw new Error('非法路径');
      const name = parts.pop();
      const dir = await this.dirFromPath(parts);
      return { dir, name, fh: await dir.getFileHandle(name) };
    },

    // ---------- 与 ServerAdapter 相同的接口 ----------
    async listStage(stage) {
      if (!this.picRoot) return [];  // 尚未连接（遮罩层下点页签，无需报错）
      const stageDir = await this.stageDir(stage);  // 缺目录会抛出明确错误
      const items = [];
      const walk = async (dir, sub) => {
        const stems = new Map(); // stem -> entry
        const mds = [];
        for await (const [name, h] of dir.entries()) {
          if (h.kind !== 'file') continue;
          const ext = name.split('.').pop().toLowerCase();
          const stem = name.slice(0, -(ext.length + 1));
          if (IMAGE_EXTS.has(ext)) stems.set(stem, { name, h });
          else if (ext === 'md') mds.push({ name, h, stem });
        }
        for (const [stem, e] of stems) {
          const imageRel = `${stage}${sub ? '/' + sub : ''}/${e.name}`;
          const file = await e.h.getFile();
          const md = mds.find(m => m.stem === stem);
          const item = {
            stem, displayName: stem,
            folder: sub || '',
            imageRel,
            mdRel: md ? `${stage}${sub ? '/' + sub : ''}/${md.name}` : null,
            hasMd: !!md,
            mtime: file.lastModified,
          };
          if (md) {
            try {
              const text = await (await md.h.getFile()).text();
              const { fields } = MD.parseMdText(text);
              item.id = fields.id || '';
              item.title = fields.title || stem;
              item.hero = String(fields.hero || 'no').toLowerCase() === 'yes';
            } catch (_) { }
          }
          items.push(item);
        }
        for await (const [name, h] of dir.entries()) {
          if (h.kind === 'directory') await walk(h, sub ? `${sub}/${name}` : name);
        }
      };
      await walk(stageDir, '');
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    async getEntry(rel) {
      const { fh } = await this.resolveFile(rel);
      const file = await fh.getFile();
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.md')) {
        const raw = await file.text();
        const dirRel = rel.split('/').slice(0, -1).join('/');
        const stem = file.name.replace(/\.md$/i, '');
        const items = await this.listStage(dirRel.split('/')[0]);  // 复用扫描找配对图
        const paired = items.find(it => it.stem === stem && it.folder === dirRel.split('/').slice(1).join('/'));
        const imageRel = paired ? paired.imageRel : null;
        const { fields, body, ok } = MD.parseMdText(raw);
        if (!ok) throw new Error('MD 缺少 frontmatter（--- ... ---）');
        let imageInfo = null;
        if (imageRel) imageInfo = await this.imageInfoOf(imageRel);
        return { isDraft: false, mdRel: rel, imageRel, fields, body, imageInfo, raw };
      }
      // 图片
      const imageInfo = await this.imageInfoOf(rel);
      const stem = file.name.replace(/\.[^.]+$/, '');
      const dirRel = rel.split('/').slice(0, -1).join('/');
      const items = await this.listStage(dirRel.split('/')[0]);
      const paired = items.find(it => it.stem === stem && it.folder === dirRel.split('/').slice(1).join('/'));
      if (paired && paired.hasMd) {
        const raw = await (await (await this.resolveFile(paired.mdRel)).fh.getFile()).text();
        const { fields, body, ok } = MD.parseMdText(raw);
        if (!ok) throw new Error('MD 缺少 frontmatter');
        return { isDraft: false, mdRel: paired.mdRel, imageRel: rel, fields, body, imageInfo, raw };
      }
      const palette = await IMGINFO.extractPalette(file).catch(() => []);
      imageInfo.fileName = file.name;
      const { fields, body } = MD.buildDraft(stem, imageInfo, palette);
      return { isDraft: true, mdRel: `${dirRel}/${stem}.md`, imageRel: rel, fields, body, imageInfo, raw: '' };
    },

    async imageInfoOf(rel) {
      const { fh } = await this.resolveFile(rel);
      const file = await fh.getFile();
      const info = await IMGINFO.readInfo(file);
      info.fileName = file.name;
      return info;
    },

    async getPalette(rel) {
      const { fh } = await this.resolveFile(rel);
      return await IMGINFO.extractPalette(await fh.getFile());
    },

    async writeText(rel, text) {
      const parts = String(rel).split('/').filter(Boolean);
      if (parts.some(p => p === '..')) throw new Error('非法路径');
      const name = parts.pop();
      const dir = await this.dirFromPath(parts);
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    },

    async thumbUrl(rel) {
      if (thumbCache.has(rel)) return thumbCache.get(rel);
      const { fh } = await this.resolveFile(rel);
      const file = await fh.getFile();
      let bmp;
      try {
        bmp = await createImageBitmap(file, { resizeWidth: 1024, resizeQuality: 'medium' });
      } catch (_) {
        bmp = await createImageBitmap(file);
      }
      const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const cnv = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
      cnv.getContext('2d').drawImage(bmp, 0, 0, cnv.width, cnv.height);
      bmp.close();
      const url = URL.createObjectURL(await cnv.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
      thumbCache.set(rel, url);
      return url;
    },

    async imageUrl(rel) {
      if (urlCache.has(rel)) return urlCache.get(rel);
      const { fh } = await this.resolveFile(rel);
      const url = URL.createObjectURL(await fh.getFile());
      urlCache.set(rel, url);
      return url;
    },
  };

  return A;
})();
