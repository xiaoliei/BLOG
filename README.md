# BLOG_OS — Minecraft 体素 × 赛博科技风博客

一个纯静态、零构建、可离线运行的个人博客站点。深色藏青底 `#0A101A`、古铜橙 `#E67E22`、青蓝 `#1ABC9C`，全站等宽 / 像素字体，模拟终端档案系统（HUD、网格、扫描线、系统状态栏）。

## 页面

| 页面 | 文件 | 说明 |
| --- | --- | --- |
| 启动页 | `index.html` | 深蓝径向渐变夜空 + 300 颗呼吸闪烁星点 + 缓慢往复旋转的 Minecraft 头颅（mcheads.ru 地球头皮肤）+ 左上角像素月球 + 数字时钟；点击 / 滚动 / 任意键进入主页 |
| 主控台 | `archive.html` | 三栏：文章列表 / 3D 体素材料集群（慢自转）/ 属性面板 + 终端数据流 |
| 文章详情 | `article.html?id=CU_04` | 三栏：面包屑 + 正文 + 高亮代码块 / 具体方块 3D + 橙色线框 / 属性 + NAV_ASSIST 快捷键 |

底部导航：`A` 文章 / `R` 代码 / `M` 我的世界 / `C` 联系（后三个为占位模块，会弹出 `MODULE_NOT_FOUND`）。

## 运行

```bash
node scripts/dev-server.js        # http://localhost:8000
```

ES Modules 与 `importmap` 需要 HTTP 服务，不能直接用 `file://` 打开。

## 验证

使用本机 Edge + puppeteer-core 做无头回归（32 项断言：控制台无错、DOM 注入、3D 渲染像素、点击/快捷键交互、移动端布局）：

```powershell
npm install --prefix "$env:TEMP\blog-verify" puppeteer-core pngjs
node scripts/dev-server.js   # 先启动
node scripts/verify.mjs
```

`preview/` 目录保存了三页面的无头渲染截图，可快速查看整体效果。

## 重新生成 3D 模型

所有 `.glb` 由零依赖 Node 脚本生成（Minecraft 头颅、体素化地球、材料集群、5 种方块）：

```bash
node scripts/generate-models.js
node scripts/generate-head.js   # 头颅：读取 mjha_head/skin.png，输出 assets/models/mc_head.glb
```

输出到 `assets/models/`。Three.js 与 GLTFLoader 已本地化于 `vendor/`，离线可用。

## 头颅贴图来源

`mjha_head/` 中的 `skin.png` 爬取自 [mcheads.ru 地球头页面](https://mcheads.ru/en/decoration/mjha)（页面 3D 视图所用的 64×64 皮肤贴图，与 Mojang 官方纹理一致）。`generate-head.js` 按 Minecraft 头颅标准 UV 布局将其嵌入 `assets/models/mc_head.glb`：

- **两层结构**：底层头（8×8×8）+ 帽子叠加层（8.5×8.5×8.5，使用 hat 区域 UV，`alphaMode: MASK`），与 skinview3d 的两层头部渲染一致；
- **NEAREST 采样**：与 skinview3d 一致，不生成 mipmap，保证放大后像素锐利、不模糊。

## 目录

```
├── index.html / archive.html / article.html
├── css/styles.css              # 主题、网格、面板、HUD、响应式
├── js/
│   ├── data.js                 # 文章档案（正文、属性、代码）
│   ├── common.js               # 时钟 / 坐标 / 网络 / boot / 导航
│   ├── scene.js                # Three.js 场景、灯光、线框、GLB 加载
│   ├── stars.js                # 启动页星空粒子
│   ├── highlight.js            # GLSL / C++ 代码高亮
│   ├── landing.js / archive.js / article.js
├── assets/models/*.glb         # 体素模型
├── vendor/                     # three.module.js + GLTFLoader
└── scripts/                    # 模型生成器 + 静态服务器
```
