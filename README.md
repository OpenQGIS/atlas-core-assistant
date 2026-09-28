# AtlasCore Assistant · 标注 MD 表单编辑器

为 [AtlasCore](../atlas-core) 图片分享项目打造的**双模式**跨平台标注编辑器：

- **GitHub Pages 模式**（推荐发布）：纯静态网页，打开链接 → 点「连接文件夹」授权本地
  `pic/` 目录 → 直接原位读写 MD 与图片。零安装、零后端，Windows / macOS 通用
  （需要 Chrome / Edge，基于 File System Access API）
- **本地服务模式**：运行 `editor.py`，除编辑外还提供服务端金字塔瓦片深焦查看
  （88MB 超长图缩放 100%+ 依然锐利、秒级响应）

两种模式同一个界面、同一套序列化规则（`static/md.js`），写出的 MD 完全一致。

## 发布到 GitHub Pages（一次性操作）

```bash
cd atlas-core-assistant
git init && git add -A && git commit -m "AtlasCore 标注编辑器"
# 在 GitHub 上新建仓库（建议名 atlas-core-assistant，Public），然后：
git remote add origin https://github.com/<你的用户名>/atlas-core-assistant.git
git branch -M main
git push -u origin main
```

再到仓库 **Settings → Pages → Build and deployment → Source** 二选一：

- **GitHub Actions**（推荐）：保存后到 Actions 页面把 `Deploy to GitHub Pages` 工作流
  Re-run 一次（或随便 push 一个提交），之后每次 push 自动部署；
- **Deploy from a branch**：分支 `main`、目录 `/ (root)`，保存即生效，不需要 Actions
  （此时可删除 `.github/workflows/pages.yml` 避免工作流报错）。

> 若工作流在 `actions/configure-pages` 一步失败（部分账号默认 Workflow 权限较严，
> GITHUB_TOKEN 无法自动创建 Pages 站点），按上面任一方式手动选择 Source 即可解决——
> 这是整个流程唯一需要手动的步骤。

保存后 1–2 分钟生效，地址为：

```
https://<你的用户名>.github.io/atlas-core-assistant/
```

使用时打开这个网址，点「📂 连接文件夹」，选择本地 atlas-core 的 **pic 文件夹**
（选 atlas-core 根目录也可以，会自动识别 `pic/`）。浏览器会记住授权，
下次打开点一下「连接文件夹」即可恢复。

> 注意：`config.json` 里只有本机路径，不含任何密钥，可安全公开。

## 本地服务模式

### Windows
双击 `editor.bat`（首次会自动安装 Pillow 并打开浏览器）。

### macOS
```bash
cd atlas-core-assistant
chmod +x editor.command     # 仅首次
./editor.command            # 或双击运行
```

### 命令行方式
```bash
python editor.py                                # 读取 config.json 中的路径
python editor.py --atlas /path/to/atlas-core    # 临时指定项目路径
python editor.py --port 8098 --no-browser
```

地址：<http://127.0.0.1:8098>（端口被占用时用 `--port` 换一个）。
URL 加 `?mode=fs` 可强制体验文件夹模式，`?mode=server` 强制本地服务模式。

## 功能

| 功能 | 说明 |
| --- | --- |
| 双模式 | GitHub Pages 静态模式（File System Access 直连本地文件夹）与本地服务模式自动切换 |
| 目录树导航 | 侧栏按多级文件夹渲染成目录树（展开/收起、数量统计），展开状态按阶段记忆；筛选时自动切为扁平列表 |
| 深焦查看 | Pages 模式：浏览器内位图金字塔；本地模式：服务端 256px 瓦片金字塔按需加载（与网站端 DZI 同源），14881px 超长图 100%+ 依然锐利 |
| 三池浏览 | 01_pending / 02_waiting / 03_published 任意切换，支持二级文件夹，按名称/id/标题筛选 |
| 表单编辑 | frontmatter 全部字段表单化：文本、日期、分类级联、标签 chips、色板取色器、工序滑杆 |
| 预设体系 | subCategory / topic 按《Gallery标签分类逻辑.md》级联联动；tags 五维预设一键填入 |
| 自动读取 | 像素尺寸、DPI（PNG pHYs / JPEG JFIF，纯 JS 解析）、EXIF 拍摄时间、文件时间；physicalSize 按 `px ÷ DPI × 2.54` 自动计算并推荐构图后缀 |
| 色板提取 | 一键量化提取 5 主色（服务端 median-cut / Pages 模式 canvas 桶量化），草稿模式自动预填 |
| 工序归一化 | QGIS/Ink/PS/GIMP/AI 滑杆，一键归一到 100% |
| 视觉语言要点 | `### 视觉语言与空间形态` 的 `**要点**：描述` 结构化增删排序 |
| 草稿生成 | 对没有 MD 的图片按模板预填草稿，保存即创建 MD |
| 保存校验 | 必填字段、色值格式、workflow 合计、image 配对；错误阻断、警告提示 |
| 源码模式 | 随时查看/直接编辑生成的 MD 文本，可反向解析回表单 |

## 深焦查看的性能设计

- **金字塔瓦片**：打开图片时按需请求当前视野的 256px 瓦片，看哪加载哪，不碰整图
- **三级工作副本**：1024 / 3200 缩略副本 + 原图，低层瓦片永远从最小副本切，避免解码大图
- **双层缓存**：瓦片落盘 `.cache/tiles/`（重启仍在）；解码后的原图驻留内存 LRU（最多 2 张，单张 >400MB 不缓存）
  —— 88MB PNG 冷启动首块约 2s，之后每块 3ms
- **即显垫底**：请求瓦片的同时先显示 1024 缩略图，瓦片就绪后淡出，无白屏等待

## 字段与预设的维护

- 分类 / 专题 / 标签预设写在 `static/app.js` 顶部的 `SUBTOPICS`、`TAG_PRESETS`，
  与《Gallery标签分类逻辑.md》保持同步即可。
- 序列化格式（字段顺序、引号规则、正文结构）在 `editor.py` 的
  `serialize_md()` 中，输出与 `03_published/` 现有文件风格一致。

## 目录

```
atlas-core-assistant/
├── editor.py          # 后端（解析/序列化/图像信息/瓦片/API）
├── editor.bat         # Windows 启动
├── editor.command     # macOS 启动
├── config.json        # atlas-core 根目录配置
├── static/            # 前端（无框架，原生三件套）
│   └── vendor/openseadragon.min.js   # 深焦查看内核（与 atlas 网站端同款）
└── .cache/            # 缩略图/瓦片缓存（自动生成，可整目录删除）
```
