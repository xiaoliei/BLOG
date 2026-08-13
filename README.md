# BLOG_OS — 个人博客（React / Vite）

保留启动页（星空、3D 头颅、像素月球、开机动画），点击进入后到达正常的博客主页；
主页背景结构融合 `demo/xiaoli-home/`（草堂 GrassForum）的样式：
绿色 Hero 色带、浅色羊毛纹理、蓝色页脚色带。**不再使用游戏地图形式**，
首页就是常规的「导航 + Hero + 文章列表 + 栏目 + 关于 + 页脚」。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器（默认 http://localhost:5173）
npm run build      # 生产构建到 dist/
npm run preview    # 预览生产构建
```

## 技术栈

- React 19 + Vite 8 + Three.js（启动页 3D 头颅）
- 原生 CSS（四个文件：`tokens / base / home / landing`，无预处理器）

## 页面结构（启动页 → 博客首页）

### 0. 启动页 LandingPage（星空 + 3D 头颅 + 像素月球）

- 3D 头颅（`mc_head.glb`）待机摆动，左上角像素月球同步联动
- 点击任意处 / 滚轮 / 方向键触发：文本淡出 → 3D 头颅旋转放大至满屏 →
  **穿屏淡出**（头颅继续略微放大，同时启动层整体淡出，揭开下方博客首页，
  Hero 元素依次入场）
- `prefers-reduced-motion` 下跳过动画直接进入
- URL `#home` 可跳过启动页直达首页；刷新 `#home` 同样直达

### 1. 博客首页（单页）

1. **绿色 Hero**（xiaoli-home 同款 `#4CAF50` + 底部羊毛饰条）
   - 顶部透明导航（最新文章 / 文章栏目 / 关于我）
   - 站名、标语、CTA（浏览最新文章 / 查看栏目）、栏目与文章统计
2. **最新文章**：按日期倒序展示 6 篇，白色卡片（模块色侧条、日期、标签、摘要）；
   点击卡片打开详情弹层（`Esc` / 点击遮罩关闭）
3. **文章栏目**：8 个栏目卡片（生活杂记 / 读书笔记 / 项目作品 / 游记见闻 /
   技术深潜 / 关于我 / 创意实验 / 归档），点击可筛选该栏目文章
4. **关于我**：作者卡片 + 联系 CTA（邮件 / GitHub）
5. **蓝色页脚**（xiaoli-home 同款 `#0E77A4` + 顶部羊毛饰条）：
   站点信息、快速导航、联系方式、版权行

## 背景样式（xiaoli-home 融合）

与 `demo/xiaoli-home/` 保持一致的三层背景 + 自定义滚动条：

```css
/* Hero：绿色色带 + 底部羊毛饰条 */
.hero {
  background: url('/wool/hero-bottom-lightwool.png') bottom #4caf50 repeat-x;
  padding-bottom: 30px;
}

/* 中部：浅色羊毛纹理平铺 */
body {
  background: url('/wool/bg-wool-light.png') repeat #e9e9e9;
}

/* 页脚：蓝色色带 + 顶部羊毛饰条（固定 85px 内边距） */
.site-footer {
  background: url('/wool/footer-top-lightwool.png') #0e77a4 repeat-x;
  padding-top: 85px;
}

/* 自定义滚动条：10px 宽，滑块 #0e77a4，轨道 #e8ecf3 */
```

三张背景图从 `demo/xiaoli-home/assets/` 复制到 `public/wool/`。

## 目录结构

```
├── index.html                  # 入口（中文字体、meta、theme-color #4CAF50）
├── public/
│   ├── wool/                   # xiaoli-home 羊毛背景图（3 张 PNG）
│   └── models/mc_head.glb      # 启动页 3D 头颅模型
└── src/
    ├── main.jsx                # React 入口（导入 tokens/base/home/landing 样式）
    ├── App.jsx                 # 三阶段：landing → revealing → home（hash 驱动）
    ├── config/blog.js          # 站点信息 + 8 栏目 + 23 篇文章（内容数据）
    ├── config/site.js          # 启动页系统文案（BOOT / 版本 / 状态栏数据）
    ├── hooks/useSystemClock.js # 启动页时钟 / 坐标漂移 / 网络速率
    ├── components/home/
    │   ├── HomePage.jsx        # 首页编排（Hero/文章/栏目/关于/页脚/筛选）
    │   ├── PostCard.jsx        # 文章卡片（可点击）
    │   ├── ArticleModal.jsx    # 文章详情弹层
    │   └── icons.jsx           # SVG 图标集（Lucide 风格，无 emoji）
    ├── components/landing/
    │   ├── LandingPage.jsx     # 启动页编排 + 进入交互
    │   ├── HeadViewer.jsx      # 3D 头颅 + 像素月球 + 缩放转场
    │   ├── LandingClock.jsx    # 大号时钟
    │   ├── Starfield.jsx       # 星空画布
    │   └── ScreenOverlays.jsx  # 扫描线 + 暗角
    ├── lib/
    │   ├── scene.js            # Three.js 渲染器 / 相机 / GLB 加载
    │   ├── stars.js            # 星空粒子
    └── styles/
        ├── tokens.css          # 设计令牌（xiaoli 三色带 / 启动页作用域令牌）
        ├── base.css            # 重置、容器、焦点环、滚动条
        ├── home.css            # 首页全部组件样式（含响应式）
        └── landing.css         # 启动页样式（暗色夜空 / HUD / 开机动画）
```

## 内容维护

- 博客站点名称、标语、邮箱、GitHub 等集中在 `src/config/blog.js` 的 `SITE`。
- 栏目与文章都在 `src/config/blog.js`：新增文章只需在对应栏目的 `posts`
  数组加一条 `{ title, date, tags, readTime, excerpt }`，首页会自动渲染。
- 栏目主题色 `accent / accentDark` 控制卡片侧条、徽章与图标底色。
- 启动页文案（版本、会话号、系统数据）在 `src/config/site.js` 维护。

## 设计系统

由 ui-ux-pro-max 技能生成并持久化：

- `design-system/blog_os/MASTER.md` — 全局设计规则
- `design-system/blog_os/pages/home.md` — 首页覆盖规则（xiaoli-home 融合版）

## 验证情况

`npm run build` 后由无头 Chrome 验证（`.shots/capture-boot-flow.mjs` +
`.shots/capture-home.mjs`）：

- 启动页流程：3D 场景正常渲染（像素采样非背景亮点充足）、点击后开机动画
  （区块图 + 进度）已移除；点击后 3D 头颅缩放转场启动，覆盖全屏后主页在
  启动层下方挂载、启动层淡出揭开首页；桌面 / 移动 / 减弱动态偏好 /
  直达 `#home` 四种路径均无控制台错误
- 桌面 1440×900 与移动 390×844 均正常渲染，无控制台错误
- 像素级采样确认：Hero 绿 `rgb(76,175,80)`、页脚蓝 `rgb(14,119,164)`、
  两处羊毛饰条与中部羊毛纹理均正确显示
- 最新文章 6 篇 / 栏目 8 个；点击文章卡打开弹层（`Esc` 关闭）；
  点击栏目筛选（如「技术深潜」→ 4 篇），清除筛选恢复 6 篇
- 滚动淡入全部触发；桌面与移动端均无横向滚动

## 变更记录（从游戏地图版重构）

- **保留**启动页与全部 3D 效果（星空 / 3D 头颅 / 像素月球），点击进入后
  通过「头颅旋转放大 → 穿屏淡出」过渡揭开正常博客首页（原为世界地图）
- **移除**点击后的开机动画（区块图 + 进度条），启动层在过渡完成时淡出卸载
- **移除**世界地图首页、地标场景、方块过场与地图相关工具
  （`voronoi / tower / sprites` 等，git 中可恢复）
- 首页改为正常博客主页，背景融合 xiaoli-home 羊毛样式
- 文章数据从 `world.js` 迁移至 `blog.js`，内容原样保留
- 旧游戏形态的 demo 仍保留在 `demo/` 目录作为参考
