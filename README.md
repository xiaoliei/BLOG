# BLOG_OS — 个人博客（正式版 / React）

基于 React + Vite 重构的个人博客启动页，视觉风格与交互效果继承自 `demo/` 的
Minecraft 体素 × 赛博科技风格（深蓝夜空、呼吸星空、3D 头颅、像素月球、HUD、
扫描线、开机动画）。本文档只描述正式版；旧静态 demo 保留在 `demo/` 目录中作为参考。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器（默认 http://localhost:5173）
npm run build      # 生产构建到 dist/
npm run preview    # 预览生产构建
```

## 技术栈

- React 19 + Vite 8
- Three.js（npm 依赖，替代 demo 中 1.2MB 的本地 vendor 文件）
- 原生 CSS（按作用域拆分三个文件，无预处理器）

## 页面结构

```
┌ 启动页 LandingPage（星空 + 3D 头颅 + 开机动画）
│     点击进入（BootOverlay 打印日志）
▼
┌ 世界地图 WorldMap（主页 / 文章索引）
│     2D 俯视像素大陆：地形、迷雾、地标
│     点击任意处，小人直行前往；点击地标 → 方块式场景切换
▼
┌ 地标场景 SceneView（模块详情页）
      8 个地标 = 8 个博客模块，文章列表 + 传送点 + 战利品箱
```

视图通过 URL hash 驱动，支持深链与浏览器前进/后退：

- `/#world` 世界地图主页
- `/#scene/<地标id>` 直达某地标场景（如 `/#scene/castle`）

## 世界地图（方块大陆）

主页是一张 64×64 格的确定性像素大陆（种子固定，每次生成一致），包含：

- 生物群系：海洋 / 河流 / 沙滩 / 平原 / 森林 / 山地 / 雪原 / 沙漠
- 8 个地标：橡木镇、幽语图书馆、石峰城堡、迷雾森林营地、深红矿洞、
  珊瑚灯塔、烈焰工坊、旧日遗迹，各自对应一个博客模块
- 自由移动：点击地图任意位置，玩家角色即沿直线直行前往（点地标则
  在到达后触发方块式场景切换动画）
- 迷雾探索：探索完地标后，按与邻近地标之间的实际距离点亮 Voronoi
  区域（两地标之间点亮到一半距离；边界方向仅有该地标时一直亮到地图
  边缘），探索进度显示在 HUD 并保存在 `localStorage`
  （`blogos-overworld-v1`），可用“重置探索”清空
- HUD：坐标 / 群系 / 探索率、小地图、图例、平移缩放提示

操作：点击任意处让小人直行前往，拖拽或 WASD 平移，滚轮或 `+`/`-` 缩放，
`R` 回出生点，`L` 开图例，`Esc` 取消移动。`prefers-reduced-motion` 下移动
与迷雾直接完成。

## 目录结构

```
├── index.html                  # Vite 入口（字体、meta、favicon）
├── public/
│   ├── favicon.svg
│   └── models/mc_head.glb      # 启动页 3D 头颅模型
└── src/
    ├── main.jsx                # React 入口
    ├── App.jsx                 # 应用根组件（启动页 / 地图 / 场景 三态路由）
    ├── config/
    │   ├── site.js             # 站点文案 / 版本 / 开机动画文案
    │   └── world.js            # 世界配置：地标 / 连接关系 / 文章数据 / 调色板
    ├── hooks/useSystemClock.js # 时钟、坐标漂移、网络速率（每秒刷新）
    ├── lib/
    │   ├── scene.js            # Three.js 场景辅助（渲染器 / 相机 / GLB 加载）
    │   ├── stars.js            # 2D 星空粒子控制器
    │   ├── rand.js             # 确定性随机 / 值噪声 / fBm
    │   ├── terrain.js          # 世界地形生成（群系 + 河流 + 装饰）
    │   └── sprites.js          # 像素精灵定义（字符串网格 → SVG/Canvas）
    ├── components/landing/
    │   ├── LandingPage.jsx     # 启动页编排 + 进入交互（点击/滚动/按键）
    │   ├── HeadViewer.jsx      # 3D 头颅场景 + 像素月球（自包含，含资源清理）
    │   ├── Starfield.jsx       # 星空画布
    │   ├── ScreenOverlays.jsx  # 扫描线 + 暗角
    │   ├── HudCorners.jsx      # 左上/右上 HUD 角标
    │   ├── LandingClock.jsx    # 大号数字时钟 + 日期
    │   ├── StatusBar.jsx       # 底部系统状态栏
    │   └── BootOverlay.jsx     # 开机动画（逐行打印后跳转）
    ├── components/map/
    │   ├── WorldMap.jsx        # 世界地图主页（地形/迷雾/寻路/HUD）
    │   ├── Minimap.jsx         # 右下角小地图
    │   └── PixelSprite.jsx     # 像素图标 SVG 渲染
    ├── components/scenes/
    │   └── SceneView.jsx       # 地标场景详情页（文章列表）
    ├── components/SceneTransition.jsx # 方块式场景切换动画
    └── styles/
        ├── tokens.css          # 设计令牌（颜色 / 字体 / 尺寸变量）
        ├── base.css            # 全局重置与布局
        ├── landing.css         # 启动页专属样式
        ├── map.css             # 世界地图样式
        └── scene.css           # 场景页 + 切换动画样式
```

## 从 demo 迁移了什么 / 排除了什么

### 已迁移（仅启动页必需）

- `index.html` 结构与文案 → React 组件化
- `js/landing.js` → `HeadViewer` + `LandingPage`（交互逻辑）
- `js/scene.js` → `src/lib/scene.js`（只保留启动页用到的辅助函数）
- `js/stars.js` → `src/lib/stars.js`（并修复了 cleanup：取消动画帧 + 移除 resize 监听）
- `js/common.js` → 拆分为 `useSystemClock`（时钟）与 `BootOverlay`（开机动画）
- `css/styles.css` → 按作用域拆分为 `tokens / base / landing`
- `assets/favicon.svg`、`assets/models/mc_head.glb` → `public/`

### 已排除（文章列表 / 详情页相关，后续重新设计）

- `archive.html`、`article.html` 及 `js/archive.js`、`js/article.js`、`js/data.js`、`js/highlight.js`
- `assets/models/` 中除头颅外的全部模型（cluster、earth、方块等）
- CSS 中面板 / 文章列表 / 3D 查看器 / 属性面板 / 数据流 / 代码块 / 底部导航等样式
- `vendor/`（Three.js 本地库，改用 npm 依赖）、`mjha_head/`、`preview/`、`scripts/`（模型生成与回归脚本）

## 后续集成其他页面

- 新增页面组件后，在 `App.jsx` 引入路由即可（如 react-router），
  启动页 `LandingPage` 无需改动。
- 启动页"点击进入"的目标地址集中在 `src/config/site.js` 的
  `BOOT_LINES` 文案中；进入后的世界地图主页由 `App.jsx` 的 hash 路由接管
  （`#world` / `#scene/<id>`）。
- 站点文案、版本号、开机动画台词也全部在 `src/config/site.js` 中维护。
- 地标、连接关系与文章数据集中在 `src/config/world.js`，新增地标只需
  添加一条配置（含 `posts`），地图与场景页会自动渲染。
- 3D 场景的相机 / 灯光 / 模型加载逻辑全部封装在 `HeadViewer` 内，
  卸载时会停止渲染循环并释放 WebGL 资源。

## 验证情况

已用无头 Edge + puppeteer 验证（`npm run build` 后对 `vite preview` 测试）：

- 桌面端（1440×900）与移动端（390×844）均正常渲染，无控制台错误
- 3D 头颅像素渲染与非背景色占比与 demo 截图数值一致（背景 RGB 完全相同）
- 时钟 / 日期 / 坐标漂移 / 网络速率 / HUD / 状态栏均在刷新
- 点击进入 → 开机动画逐行打印 → 进入 `#world` 世界地图
- 世界地图 33 项端到端断言全部通过：地形 / 迷雾 / 8 地标 / 直行移动 /
  地标半程与边界点亮 / 场景切换 / 深链 / 移动端 / 减弱动态偏好 /
  无控制台错误
