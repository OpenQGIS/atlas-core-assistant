/* 图像元信息纯 JS 读取：尺寸/DPI/EXIF 日期（PNG pHYs、JPEG JFIF/EXIF）
   + canvas 主色提取。GitHub Pages 模式下替代 PIL。 */
'use strict';
window.IMGINFO = (() => {

  async function readInfo(file) {
    const info = {
      width: null, height: null, format: null, dpi: null,
      exifDate: null, fileTime: null, mtime: 0, sizeMB: null,
      cmW: null, cmH: null, suggestedComposition: null, fileName: file.name,
    };
    info.sizeMB = Math.round(file.size / 1048576 * 10) / 10;
    info.mtime = file.lastModified;
    const d = new Date(file.lastModified);
    const pad = n => String(n).padStart(2, '0');
    info.fileTime = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    try {
      const buf = await file.slice(0, 1 << 20).arrayBuffer();  // 头部 1MB 足够
      const dv = new DataView(buf);
      const b0 = dv.getUint8(0), b1 = dv.getUint8(1);
      if (b0 === 0x89 && b1 === 0x50) readPng(dv, info);
      else if (b0 === 0xFF && b1 === 0xD8) readJpeg(dv, info);
    } catch (_) { /* 头部解析失败时用位图兜底 */ }
    if (!info.width || !info.height) {
      try {
        const bmp = await createImageBitmap(file);
        info.width = bmp.width; info.height = bmp.height;
        info.format = (file.type.split('/')[1] || '').toUpperCase();
        bmp.close();
      } catch (_) { return info; }
    }
    const eff = info.dpi || 300;
    info.cmW = Math.round(info.width / eff * 2.54 * 10) / 10;
    info.cmH = Math.round(info.height / eff * 2.54 * 10) / 10;
    info.suggestedComposition = MD.suggestComposition(info.width, info.height);
    return info;
  }

  function readPng(dv, info) {
    info.format = 'PNG';
    info.width = dv.getUint32(16);
    info.height = dv.getUint32(20);
    let off = 8;
    while (off < dv.byteLength - 12) {
      const len = dv.getUint32(off);
      const type = String.fromCharCode(dv.getUint8(off + 4), dv.getUint8(off + 5), dv.getUint8(off + 6), dv.getUint8(off + 7));
      if (type === 'pHYs') {
        const ppm = dv.getUint32(off + 8);
        const unit = dv.getUint8(off + 16);
        if (unit === 1 && ppm > 1) info.dpi = Math.round(ppm * 0.0254 * 10) / 10;
        break;
      }
      if (type === 'IDAT' || type === 'IEND') break;
      off += 12 + len;
    }
  }

  function readJpeg(dv, info) {
    info.format = 'JPEG';
    let off = 2;
    while (off < dv.byteLength - 4) {
      if (dv.getUint8(off) !== 0xFF) break;
      const marker = dv.getUint8(off + 1);
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { off += 2; continue; }
      if (marker === 0xDA) break; // SOS，后面是压缩数据
      const len = dv.getUint16(off + 2);
      if ((marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        info.height = dv.getUint16(off + 5);
        info.width = dv.getUint16(off + 7);
      } else if (marker === 0xE0 && len >= 16) {
        // JFIF APP0：密度单位在 +11，xdensity 在 +12
        const units = dv.getUint8(off + 11);
        const xd = dv.getUint16(off + 12);
        if (units === 1 && xd > 1) info.dpi = xd;
        else if (units === 2 && xd > 1) info.dpi = Math.round(xd * 2.54 * 10) / 10;
      } else if (marker === 0xE1 && len > 10) {
        if (dv.getUint32(off + 4) === 0x45786966 && dv.getUint8(off + 8) === 0) {
          try { info.exifDate = parseExifDate(dv, off + 10); } catch (_) { }
        }
      }
      off += 2 + len;
    }
  }

  function parseExifDate(dv, base) {
    // 最小 TIFF 解析：IFD0 → ExifIFD(0x8769) → DateTimeOriginal(0x9003)
    const little = dv.getUint16(base) === 0x4949;
    const u16 = o => dv.getUint16(o, little);
    const u32 = o => dv.getUint32(o, little);
    if (u16(base + 2) !== 0x2A) return null;
    const ifd0 = base + u32(base + 4);
    let exifIfd = null;
    const n0 = u16(ifd0);
    for (let i = 0; i < n0; i++) {
      const e = ifd0 + 2 + i * 12;
      if (u16(e) === 0x8769) { exifIfd = base + u32(e + 8); break; }
    }
    const targets = exifIfd ? [exifIfd, ifd0] : [ifd0];
    for (const ifd of targets) {
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        const tag = u16(e);
        if (tag === 0x9003 || tag === 0x0132) {  // DateTimeOriginal / DateTime
          const count = u32(e + 4);
          const off = count > 4 ? base + u32(e + 8) : e + 8;
          let s = '';
          for (let k = 0; k < Math.min(count, 20); k++) s += String.fromCharCode(dv.getUint8(off + k));
          s = s.replace(/\0+$/, '').trim();
          if (/^\d{4}:\d{2}:\d{2}/.test(s)) return s;
        }
      }
    }
    return null;
  }

  async function extractPalette(file, n = 5) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { resizeWidth: 240, resizeQuality: 'medium' });
    } catch (_) {
      bmp = await createImageBitmap(file);
    }
    const scale = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
    const W = Math.max(1, Math.round(bmp.width * scale));
    const H = Math.max(1, Math.round(bmp.height * scale));
    const cnv = new OffscreenCanvas(W, H);
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, W, H);
    bmp.close();
    const d = ctx.getImageData(0, 0, W, H).data;
    // 4bit/通道桶量化，取均值，再按差异去重
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const e = buckets.get(k) || { r: 0, g: 0, b: 0, c: 0 };
      e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2]; e.c++;
      buckets.set(k, e);
    }
    const ranked = [...buckets.values()].sort((a, b) => b.c - a.c)
      .map(e => [Math.round(e.r / e.c), Math.round(e.g / e.c), Math.round(e.b / e.c)]);
    const out = [];
    for (const c of ranked) {
      if (out.length >= n) break;
      if (!out.some(o => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) + Math.abs(o[2] - c[2]) < 48)) out.push(c);
    }
    for (const c of ranked) {
      if (out.length >= n) break;
      if (!out.some(o => o[0] === c[0] && o[1] === c[1] && o[2] === c[2])) out.push(c);
    }
    return out.map(c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase());
  }

  return { readInfo, extractPalette };
})();
