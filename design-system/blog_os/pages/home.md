# Home Page Overrides — 正常博客主页（xiaoli-home 融合版）

> **PROJECT:** blog_os
> **Page Type:** 个人博客首页 / Personal Blog Homepage
> **生成方式：** ui-ux-pro-max 设计系统 + 参考 `demo/xiaoli-home/`（草堂 GrassForum 背景样式）

> ⚠️ **IMPORTANT:** 本文件规则**覆盖** `design-system/blog_os/MASTER.md`。构建首页时优先遵循本文件。

---

## 页面模式（Pattern）

**Content-First（内容优先）**：Hero → 最新文章 → 文章栏目 → 关于我 → 页脚。
主 CTA 位于 Hero（浏览最新文章 / 查看栏目），页脚提供联系方式。

## 布局（Layout Overrides）

- **Max Width:** 1120px（内容容器统一 `--content-w`，避免混用不同容器宽度）
- **结构：**
  1. 绿色 Hero 色带（导航栏置顶于 Hero 内，透明底）
  2. 最新文章（白色卡片网格，按日期倒序）
  3. 文章栏目（8 个模块卡片网格，模块主题色区分）
  4. 关于我（白底面板 + 联系 CTA）
  5. 蓝色页脚色带（顶部羊毛饰条）
- 页面整页纵向滚动，无游戏地图 / 启动页 / 场景页

## 颜色（Color Overrides — 沿用 xiaoli-home）

| Role | Hex | 用途 |
|------|-----|------|
| Hero 绿 | `#4CAF50` | Hero 色带（原站 themePrimaryColor） |
| 页脚蓝 | `#0E77A4` | 页脚色带 + 滚动条滑块 |
| 羊毛底 | `#E9E9E9` + `bg-wool-light.png` 平铺 | 页面中部背景 |
| 文字 | `#1F2937` | 正文（羊毛底上对比度 > 12:1） |
| 卡片 | `#FFFFFF` | 文章卡 / 模块卡 / 面板 |
| 链接强调 | `#2E7D32` | 正文链接、小号标签（白字对比 > 5:1） |

## 字体（Typography Overrides — 中文优先）

- **标题：** `Noto Serif SC`（衬线，博客感）+ 回退 `Songti SC / SimSun / serif`
- **正文：** `Noto Sans SC` + 回退 `PingFang SC / Microsoft YaHei / sans-serif`
- **元信息（日期/标签/时长）：** `JetBrains Mono`（延续原有编程气质）

## 关键组件（Component Specs）

- **导航：** Hero 内透明导航，白字；锚点 `#latest / #modules / #about`
- **文章卡：** 白底圆角卡片，模块主题色侧条/徽章，标题 + 日期 + 标签 + 摘要；
  hover 上浮 2px + 阴影加深（200ms），`cursor: pointer`，点击打开详情弹层
- **模块卡：** 图标（SVG，非 emoji）+ 模块名 + 简介 + 文章数，主题色软底图标
- **按钮：** 圆角胶囊按钮；Hero 主按钮白底绿字（对比 > 7:1），描边按钮白字描边
- **弹层：** 文章详情，`aria-modal`，Esc 关闭，背景遮罩 + 恢复滚动锁定
- **滚动条：** 10px 宽，滑块 `#0E77A4`，轨道 `#E8ECF3`（同原站）

## 动效（Effects）

- 滚动进入视口淡入上浮（IntersectionObserver，`prefers-reduced-motion` 下直接显示）
- hover 过渡统一 150–300ms，禁止引起布局位移的 scale

## 禁用项（Anti-Patterns）

- ❌ 游戏地图 / 启动页 / 体素 HUD 等游戏化形态
- ❌ emoji 作为图标（一律 SVG）
- ❌ 低对比度正文（灰字 #94A3B8 等禁用）
- ❌ 无可见焦点环、无 `cursor: pointer`、无 `prefers-reduced-motion` 处理
