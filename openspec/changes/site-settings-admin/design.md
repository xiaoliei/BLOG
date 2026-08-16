## Context

现状（见 proposal.md - Why）：站点级文案硬编码在 `src/config/blog.js` 的 `SITE`
与 `src/components/home/HomePage.jsx` 内；数据层为 D1 + Drizzle 三表
（modules/posts/comments），公开/管理 API 均在单个 Hono Worker
（`worker/routes/public.ts`、`worker/routes/admin.ts`），后台为同仓 SPA
（`src/admin/`），前台经 `src/lib/api.js`（SWR）拉取公开数据。本次改动沿用
同一套架构：D1 表 + 公开/管理端点 + admin 页面 + 前台运行时消费。

## Goals / Non-Goals

**Goals:**

- 站点元信息（站名/标语/开始时间/描述/作者/邮箱/GitHub）、关于我、页脚文案全部落库并可在后台编辑
- 公开 API 与前台消费沿用现有缓存/SWR 约定（`s-maxage=60`、5 分钟客户端缓存、默认值兜底）
- 默认值单一来源，前台、Worker、seed 三方一致

**Non-Goals:**

- 不改 LandingPage 启动页文案（`src/config/site.js` 职责不变）
- 不把页脚导航链接（最新文章/文章栏目/关于我）做成可配置项——它们是结构性锚点，保持硬编码
- 不做设置历史/版本回滚/多语言（远期，数据模型不阻挡）

## Decisions

### D1. 数据模型：单行 `site_settings` 表（显式列）

**选择**：新增 `site_settings` 表，`id` 固定为 1 的唯一行，列为全部已知设置项
（snake_case），Drizzle 定义在 `worker/db/schema.ts`。
**理由**：字段集合已知且需要逐项 zod 校验；显式列与现有 modules/posts/comments
风格一致，类型推导、迁移、seed 都比 key-value 表简单。
**替代方案**：`settings(key, value)` KV 表——灵活但失去类型校验与列级默认值，
对「已知字段集」的收益不成立。

**字段**：`name`、`tagline`、`since`(integer 年份)、`description`、`author`、
`email`、`github`、`latest_sub`、`modules_sub`、`about_title`、`about_text`、`footer_brand`、
`footer_tagline`、`footer_nav_title`、`footer_contact_title`、`footer_bottom`、
`updated_at`。

### D2. 默认值单一来源：`src/config/site-settings.js`

**选择**：新建 `src/config/site-settings.js`，导出 `DEFAULT_SETTINGS`（camelCase
纯数据对象，无任何 import），三个消费者共用：
- 前台：数据未返回/失败时的静态默认值（`getStaticSettings()`）
- Worker：`site_settings` 表为空时公开/管理 GET 的内置回退
- seed：首次灌库的初始 INSERT 数据

**理由**：规范要求「内置默认值与 seed 一致」，单一来源消除三方漂移。
**替代方案**：worker 与前端各维护一份默认值——省一次跨目录 import，但必然漂移。
**约束**：该文件保持纯数据（不引用 Vite/浏览器 API），Worker esbuild 与 Vite
均可直接打包。

### D3. API 契约与校验

**选择**：公开 `GET /api/public/settings` 与后台 `GET /api/admin/settings` 返回
camelCase 设置对象（表为空时返回默认值）；`PATCH /api/admin/settings` 接受
部分更新（zod `partial`），校验：文本长度上限、`since` 为 1900–2100 四位年份、
`email` 用 `z.email()`、`github` 用 `z.url()`；保存走 upsert（`id=1`），
成功后写 `updated_at` 并失效设置缓存。
**理由**：部分更新让 admin 表单按组保存；camelCase 是现有前后端 JSON 惯例。

### D4. 缓存失效：新增 settings 专用 purge

**选择**：`worker/lib/cache.ts` 增加 `purgeSettingsCache(c)`，删除
`/api/public/settings` 缓存键；`PATCH /api/admin/settings` 成功后调用。
**理由**：settings 是单键、确定性路径，可完全失效，不依赖 `s-maxage=60`
自然过期（后者作为兜底）。

### D5. 前台消费：settings hook + 默认值首帧渲染

**选择**：`src/lib/api.js` 增加 `getSettings()`（走现有 `swr`，key=`settings`；
静态数据源返回 `DEFAULT_SETTINGS`）；`src/hooks/useBlogData.js` 增加
`useSettings()`；HomePage 以 `settings ?? DEFAULT_SETTINGS` 渲染 Hero /
「最新文章」「文章栏目」区块描述 / 关于我 / 页脚，数据到达后原位更新
（无骨架屏，避免布局跳动）；`document.title` 跟随 `settings.name`。
**理由**：站点文本量小且首帧必须完整可读，默认值渲染比骨架屏更平滑，
与现有「启动页 → 首页」动效不冲突。

### D6. 后台界面：独立「站点设置」页

**选择**：新增 `src/admin/SiteSettings.jsx`，后台导航增加「站点设置」；
页面按「站点信息 / 关于我 / 页脚」分组，加载 `GET /api/admin/settings`，
保存 `PATCH`，成功/失败均有反馈，失败不丢已填内容。
**理由**：沿用现有 admin 页（ModuleManage 等）的写法与 `adminFetch`，无新依赖。

## Risks / Trade-offs

- [Worker 打包引入 `src/config/site-settings.js`] → 该文件为纯数据、零依赖，
  只导出对象；如未来引入浏览器 API 会破坏 Worker 构建，已在 D2 设约束
- [默认值与 DB 值漂移] → 单一来源（D2）+ seed upsert 幂等；后台编辑后以 DB 为准
- [前台文本随设置更新引起轻微 reflow] → 字段宽度由 CSS 决定、文案量级很小，
  影响可忽略；不采用骨架屏以保证首帧可读
- [远程 DB 未 seed settings] → `npm run db:migrate:remote` + 更新后的 seed
  脚本在部署时执行（随现有部署收尾）

## Migration Plan

1. `drizzle-kit generate` 生成 `site_settings` 迁移，`npm run db:migrate` 应用到本地 D1
2. 更新 `scripts/seed.mjs`：settings 以 upsert 方式独立写入（不阻塞已 seed 的库），
   行数比对报告追加 settings 一行
3. 依次实现 worker 公开/管理端点 → 前台运行时 → 后台页面
4. 本地 `wrangler dev` 全流程验收：公开 GET、admin PATCH、前台渲染、缓存失效
5. 远程部署（`npm run deploy` 含迁移）随现有生产收尾任务统一执行

回滚：`wrangler rollback` 回退版本；`site_settings` 为新增非破坏性表，
旧版本 Worker 不读该表，互不阻塞。

## Open Questions

无——字段集合与行为契约已在 specs 中固定，实现层无可延迟决策项。
