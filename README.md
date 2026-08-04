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

## 目录结构

```
├── index.html                  # Vite 入口（字体、meta、favicon）
├── public/
│   ├── favicon.svg
│   └── models/mc_head.glb      # 启动页 3D 头颅模型
└── src/
    ├── main.jsx                # React 入口
    ├── App.jsx                 # 应用根组件（当前仅挂载启动页）
    ├── config/site.js          # 站点文案 / 版本 / 进入地址 / 开机动画文案
    ├── hooks/useSystemClock.js # 时钟、坐标漂移、网络速率（每秒刷新）
    ├── lib/
    │   ├── scene.js            # Three.js 场景辅助（渲染器 / 相机 / GLB 加载）
    │   └── stars.js            # 2D 星空粒子控制器
    ├── components/landing/
    │   ├── LandingPage.jsx     # 启动页编排 + 进入交互（点击/滚动/按键）
    │   ├── HeadViewer.jsx      # 3D 头颅场景 + 像素月球（自包含，含资源清理）
    │   ├── Starfield.jsx       # 星空画布
    │   ├── ScreenOverlays.jsx  # 扫描线 + 暗角
    │   ├── HudCorners.jsx      # 左上/右上 HUD 角标
    │   ├── LandingClock.jsx    # 大号数字时钟 + 日期
    │   ├── StatusBar.jsx       # 底部系统状态栏
    │   └── BootOverlay.jsx     # 开机动画（逐行打印后跳转）
    └── styles/
        ├── tokens.css          # 设计令牌（颜色 / 字体 / 尺寸变量）
        ├── base.css            # 全局重置与布局
        └── landing.css         # 启动页专属样式
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
  `ENTER_DESTINATION`，文章列表页设计完成后改成正式路由（当前默认 `/archive`）。
- 站点文案、版本号、开机动画台词也全部在 `src/config/site.js` 中维护。
- 3D 场景的相机 / 灯光 / 模型加载逻辑全部封装在 `HeadViewer` 内，
  卸载时会停止渲染循环并释放 WebGL 资源。

## 验证情况

已用无头 Edge + puppeteer 验证（`npm run build` 后对 `vite preview` 测试）：

- 桌面端（1440×900）与移动端（390×844）均正常渲染，无控制台错误
- 3D 头颅像素渲染与非背景色占比与 demo 截图数值一致（背景 RGB 完全相同）
- 时钟 / 日期 / 坐标漂移 / 网络速率 / HUD / 状态栏均在刷新
- 点击进入 → 开机动画逐行打印 → 约 2.1s 后跳转 `/archive`
