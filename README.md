# BLOG_OS — Minecraft 体素 × 赛博科技风博客

一个纯静态、零构建、可离线运行的个人博客站点。深色藏青底 `#0A101A`、古铜橙 `#E67E22`、青蓝 `#1ABC9C`，全站等宽 / 像素字体，模拟终端档案系统（HUD、网格、扫描线、系统状态栏）。

## 页面

| 页面 | 文件 | 说明 |
| --- | --- | --- |
| 启动页 | `index.html` | 星空粒子 + 缓慢往复旋转的体素地球 + 数字时钟；点击 / 滚动 / 任意键进入主页 |
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

所有 `.glb` 由零依赖 Node 脚本生成（体素化地球、材料集群、5 种方块）：

```bash
node scripts/generate-models.js
```

输出到 `assets/models/`。Three.js 与 GLTFLoader 已本地化于 `vendor/`，离线可用。

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
