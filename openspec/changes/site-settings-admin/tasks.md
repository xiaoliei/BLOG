## 1. 数据层与默认值

- [x] 1.1 新建 `src/config/site-settings.js`：导出 `DEFAULT_SETTINGS` 纯数据对象（站点元信息 / 首页区块描述 / 关于我 / 页脚全字段，取值来自现有 SITE 与 HomePage 硬编码文案）
- [x] 1.2 `worker/db/schema.ts` 新增 `siteSettings` 表（Drizzle 定义 + 行类型），字段与 DEFAULT_SETTINGS 一一对应
- [x] 1.3 `npm run db:generate` 生成迁移，`npm run db:migrate` 应用到本地 D1，验证 `site_settings` 表结构
- [x] 1.4 更新 `scripts/seed.mjs`：settings 以 upsert 幂等写入（不阻塞已 seed 的库），行数比对报告追加 settings 行

## 2. Worker API

- [x] 2.1 公开端点 `GET /api/public/settings`：返回 camelCase 设置对象，表空时回退默认值，`s-maxage=60`
- [x] 2.2 后台端点 `GET /api/admin/settings` 与 `PATCH /api/admin/settings`：zod 部分更新校验（文本长度 / since 四位年份 / email / github URL）、upsert（id=1）、更新 `updated_at`
- [x] 2.3 `worker/lib/cache.ts` 新增 `purgeSettingsCache`，PATCH 成功后调用使公开设置缓存失效

## 3. 前台运行时

- [x] 3.1 `src/lib/api.js` 新增 `getSettings()`：走 SWR（key=settings），静态数据源返回 `DEFAULT_SETTINGS`
- [x] 3.2 `src/hooks/useBlogData.js` 新增 `useSettings()`
- [x] 3.3 HomePage：Hero / 「最新文章」「文章栏目」区块描述 / 关于我 / 页脚改为消费 settings（未返回/失败时用默认值首帧渲染），`document.title` 同步站名，移除对 `blog.js` SITE 的运行期依赖

## 4. 后台界面

- [x] 4.1 新增 `src/admin/SiteSettings.jsx`：按「站点信息 / 区块文案 / 关于我 / 页脚」分组表单，加载、保存、成功/失败反馈，失败不丢已填内容
- [x] 4.2 AdminApp 导航增加「站点设置」入口并挂载页面

## 5. 验收与收尾

- [x] 5.1 本地 `wrangler dev` 全流程验收：公开 GET settings → admin PATCH → 前台 Hero/关于我/页脚更新 → 缓存失效；`npm run build` 无错误
- [x] 5.2 `openspec validate` 通过；README「内容维护」小节更新（SITE 退役、站点设置在后台编辑）
