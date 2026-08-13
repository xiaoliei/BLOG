# BLOG_OS — Minecraft 体素 × 赛博科技风博客

一个纯静态、零构建、可离线运行的个人博客站点。深色藏青底 `#0A101A`、古铜橙 `#E67E22`、青蓝 `#1ABC9C`，全站等宽 / 像素字体，模拟终端档案系统（HUD、网格、扫描线、系统状态栏）。

## 页面

| 页面 | 文件 | 说明 |
| --- | --- | --- |
| 启动页 | `index.html` | 深蓝径向渐变夜空 + 300 颗呼吸闪烁星点 + 缓慢往复旋转的 Minecraft 头颅（mcheads.ru 地球头皮肤）+ 左上角像素月球 + 数字时钟；点击 / 滚动 / 任意键进入主页 |
| 主控台 | `archive.html` | 三栏：文章列表 / 3D 体素材料集群（慢自转）/ 属性面板 + 终端数据流 |
| 文章详情 | `article.html?id=CU_04` | 三栏：面包屑 + 正文 + 高亮代码块 / 具体方块 3D + 橙色线框 / 属性 + NAV_ASSIST 快捷键 |
| 层级加载 | `pickaxe-tower.html` | 全屏 3D：`stone_pickaxe_tower.glb` 按体素方块行（每层 1 格）从下到上逐层构建（向上生长 + 淡入 + 辉光过渡，无过冲无尖刺），OrbitControls 旋转 / 缩放，进度面板 + REPLAY 重播 |
| 火焰方块 | `fire-cube.html` | 全屏 3D：把 `Fire.gif` 逐帧解码为动画贴图，`前/后/左/右` 四片外壁 + 中心两片十字交叉组成俯视「田」字格的动态火焰方块；透明镂空无黑色底，外壁可绕底部铰链向内倾斜（0–30°），火苗明暗驱动点光闪烁 |
| 旋转调参 | `head-rotation.html` | 启动页地球模型 XYZ 旋转坐标调参工具：场景/灯光/贴图与启动页完全一致，拖拽或滑杆自由旋转（X 俯仰 / Y 偏航 / Z 滚转），一键复制度数配置（HEAD_TRANSITION）或弧度坐标 |
| 头颅查看 | `computer-head.html` | 全屏 3D：`computer_head.glb`（由 `assets/computer.png` 经 `generate-head.cjs` 生成的两层 Minecraft 头颅）OrbitControls 轨道旋转 / 滚轮缩放 / 自动环绕 / 线框切换，古铜橙线框 bounding box + 呼吸青色点光 |
| 显示输出 | `computer-display.html` | 全屏 3D：程序化搭建体素显示器（机身 + 颈柱 + 底座 + 青色描边 + 电源灯），用 `CSS3DRenderer` 把 `xiaoli-home/index.html` 作为实时 `<iframe>` 贴在显示屏一侧（1600×900 / 16:9，可滚动点击交互）；WebGL 与 CSS3D 共享同一相机，转到背面自动隐藏 iframe 防穿透，POWER 键开关屏幕 |
| 过场方案 | `transitions.html` | 5 种页面跳转过场动画方案 A–E（逐层搭建/拆除、扫描聚能、粒子聚合/坍缩、错位对齐/坠落、纯 CSS 定妆照），每个方案都是「点击 → 加载动画 → 自动跳转目标页」的完整闭环 |
| 草堂背景 | `xiaoli-home/index.html` | 参考 [xiaoli.team](https://xiaoli.team/) 草堂论坛背景样式：纯背景演示页（无内容模块），复用其羊毛纹理背景图（`assets/` 内置副本）、绿色 Hero（底部羊毛饰条）、蓝色页脚（顶部羊毛饰条），纯 HTML/CSS 零依赖 |

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

## 过场动画方案（transitions.html）

方案总览页 `transitions.html` 汇总 5 种基于 `stone_pickaxe_tower.glb` 的跳转过场，各自独立成页：

| 方案 | 页面 | 加载动画 | 离场动画 | 性能 |
| --- | --- | --- | --- | --- |
| A 逐层搭建/拆除 | `transition-a.html` | 18 层从下到上生长 | 从顶部逐层拆除 | 轻 |
| B 扫描聚能 | `transition-b.html` | 全息塔 + 激光扫描框实体化 | 能量向中心收束 | 轻-中 |
| C 独立方块聚合/坍缩 | `transition-c.html` | 192 个独立方块飞入自旋，拼接成完整实体塔 | 方块再次飞散 | 轻-中 |
| D 错位对齐/坠落 | `transition-d.html` | 全息层错位逐层对齐 | 各层向下坠落 | 轻 |
| E 纯 CSS 定妆照 | `transition-e.html` | CSS 悬浮 + 扫描线 | 缩放 + 模糊淡出 | 极轻 |

共享数据层 `js/tower-layers.js` 负责 GLB 加载、按体素行切层、顶点粒子数据与贴图像素采样；`js/transition-common.js` 提供场景/灯光/缓动/进度 UI 与跳转状态机。方案 E 使用 `assets/tower_still.png`（无头渲染的透明塔图），完全不创建 WebGL。

## 重新生成 3D 模型

所有 `.glb` 由零依赖 Node 脚本生成（Minecraft 头颅、体素化地球、材料集群、5 种方块）。脚本为 CommonJS（`require`），在根 `package.json` 的 `"type": "module"` 下须用 `.cjs` 扩展名运行：

```bash
node scripts/generate-models.cjs
node scripts/generate-head.cjs                                              # 默认：mjha_head/skin.png → mc_head.glb
node scripts/generate-head.cjs assets/computer.png assets/models/computer_head.glb  # 自定义皮肤 → computer_head.glb
```

输出到 `assets/models/`。Three.js 与 GLTFLoader 已本地化于 `vendor/`，离线可用。

## 头颅贴图来源

`mjha_head/` 中的 `skin.png` 爬取自 [mcheads.ru 地球头页面](https://mcheads.ru/en/decoration/mjha)（页面 3D 视图所用的 64×64 皮肤贴图，与 Mojang 官方纹理一致）。`generate-head.cjs` 按 Minecraft 头颅标准 UV 布局将其嵌入 `assets/models/mc_head.glb`：

- **两层结构**：底层头（8×8×8）+ 帽子叠加层（8.5×8.5×8.5，使用 hat 区域 UV，`alphaMode: MASK`），与 skinview3d 的两层头部渲染一致；
- **NEAREST 采样**：与 skinview3d 一致，不生成 mipmap，保证放大后像素锐利、不模糊。

## 目录

```
├── index.html / archive.html / article.html
├── css/styles.css              # 主题、网格、面板、HUD、响应式
├── css/transition.css          # 过场方案共享样式（面板、进度、卡片、目标页）
├── js/
│   ├── data.js                 # 文章档案（正文、属性、代码）
│   ├── common.js               # 时钟 / 坐标 / 网络 / boot / 导航
│   ├── scene.js                # Three.js 场景、灯光、线框、GLB 加载
│   ├── gif-decoder.js          # 零依赖 GIF 解码器（逐帧 RGBA 合成，浏览器/Node 通用）
│   ├── fire-cube.js            # 田字格火焰方块：Fire.gif 逐帧纹理 + 内倾控制
│   ├── stars.js                # 启动页星空粒子
│   ├── highlight.js            # GLSL / C++ 代码高亮
│   ├── landing.js / archive.js / article.js / pickaxe-tower.js
│   ├── tower-layers.js          # 体素 GLB 加载 + 切层 + 粒子数据
│   ├── transition-common.js     # 过场共享：场景/灯光/缓动/进度状态机
│   └── transition-a.js … e.js   # 5 种过场方案
├── assets/models/*.glb         # 体素模型
├── assets/Fire.gif             # 火焰贴图（public/texture/Fire.gif 的副本，见下）
├── assets/tower_still.png      # 方案 E 透明定妆照
├── transitions.html / transition-target.html / transition-a.html … e.html
├── vendor/                     # three.module.js + GLTFLoader + OrbitControls + CSS3DRenderer
└── scripts/                    # 模型生成器 + 静态服务器
```

`assets/models/stone_pickaxe_tower.glb` 为 `public/models/stone_pickaxe_tower.glb` 的副本（demo 服务器以 `demo/` 为根，无法直接引用仓库根目录）。

`assets/Fire.gif` 同理为 `public/texture/Fire.gif` 的副本，`fire-cube.html` 在浏览器内实时解码其 32 帧（32×32，每帧 50ms）作为火焰方块六个面的动画贴图。
