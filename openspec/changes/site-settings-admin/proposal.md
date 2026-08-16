## Why

站点级文案（站名、标语、开始时间、描述、关于我、页脚）仍硬编码在前端
`src/config/blog.js` 的 `SITE` 与 HomePage 组件里，改一个字也要改代码、
重新构建、重新部署；后台目前只能管理文章、栏目与评论。作者需要一个
「站点设置」入口，把页面级文本也变成后台可配置内容。

## What Changes

- 新增 D1 `site_settings` 单行表：站点元信息（name/tagline/since/description/author/email/github）、
  首页区块描述（latest_sub / modules_sub）、关于我模块（about_title/about_text）、
  页脚模块（footer_brand/footer_tagline/footer_nav_title/footer_contact_title/footer_bottom）
- seed 脚本将现有 `SITE` 与 HomePage 硬编码文案灌入 `site_settings`，之后这些文本以数据库为准
- 新增公开端点 `GET /api/public/settings`（`s-maxage=60`，沿用现有公开 GET 缓存约定）
- 新增后台端点 `GET /api/admin/settings`、`PATCH /api/admin/settings`
  （Access 鉴权 + zod 校验 + 写后主动失效 settings 边缘缓存）
- `/admin` 后台新增「站点设置」页：分组表单（站点信息 / 关于我 / 页脚），保存并反馈
- 前台 HomePage 的 Hero / 「最新文章」「文章栏目」区块描述 / 关于我 / 页脚改为消费 `settings`（API + SWR），
  数据到达前先用静态默认值渲染避免布局跳动，`document.title` 同步站名
- **BREAKING**：`src/config/blog.js` 的 `SITE` 与 HomePage 内硬编码文案不再是运行期数据源
  （保留为 API 故障时的静态回退默认值）

## Capabilities

### New Capabilities

- `site-settings`: 站点级可配置文本的存储、公开读取、后台管理与前台应用（站点元信息 / 关于我 / 页脚）

### Modified Capabilities

（无——`openspec/specs/` 当前为空，能力均以新增 delta spec 声明）

## Impact

- **代码**：`worker/db/schema.ts`、`worker/routes/public.ts`、`worker/routes/admin.ts`、
  `worker/lib/cache.ts`、`src/lib/api.js`、`src/hooks/useBlogData.js`、
  `src/components/home/HomePage.jsx`、`src/admin/AdminApp.jsx`；新增 `src/admin/SiteSettings.jsx`；
  `scripts/seed.mjs` 增加 settings 初始数据
- **基础设施**：D1 新增 `site_settings` 表（drizzle 迁移，本地与远程各执行一次）
- **依赖**：无新增
- **不受影响**：LandingPage 启动页与 3D 场景、文章/栏目/评论数据流、Access 鉴权体系
