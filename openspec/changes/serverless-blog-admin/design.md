## Context

博客当前是纯静态 React 19 + Vite 8 SPA：启动页（3D 头颅 + 星空）→ 单页首页（Hero / 最新文章 / 栏目 / 关于 / 页脚），全部内容硬编码于 `src/config/blog.js`（309 行，MODULES→posts 两级结构，文章仅有 excerpt 无正文）。无任何后端、鉴权与构建钩子。部署目标为自有域名 + Cloudflare，读者主要在国内（可接受其延迟）。作者为单人，需要网页后台编辑器（Vditor）、草稿/发布流、评论与浏览量，未来加图片上传。

可移植性为已确认的约束：Hono（多平台适配器）、Drizzle ORM（D1/Turso/SQLite/PG/MySQL 同构）、R2 走 S3 协议客户端、鉴权收在单一中间件、前端只认 `/api/*` JSON——这四条是本设计的硬性决策，见 Decisions。

## Goals / Non-Goals

**Goals:**

- 单 Worker 全栈：静态资产 + `/api/public/*` + `/api/admin/*` 一个部署单元
- 作者零代码发布内容：`/admin` 网页后台 + Vditor 编辑器 + 草稿/发布状态机
- 动态能力：浏览量计数、评论（三层反垃圾）
- 可移植：数据层/存储层/鉴权层各自的平台耦合面收敛到最小（换平台 ≤ 1 天）
- 零成本运行在 Cloudflare 免费额度内（D1 读写、R2 存储、Workers 调用量级均按个人博客估算）

**Non-Goals:**

- 不做静态化/SSG/ISR（读路径全走 API + 边缘缓存即可，避免路线 C 的构建链复杂度）
- 不做自建用户系统（CF Access 邮箱 OTP 覆盖作者鉴权；读者侧无账号概念）
- 不做评论邮箱/Gravatar/回复嵌套（昵称 + 内容，P3 后再议）
- 不做定时发布、多协作者、多语言、全文搜索（远期，数据模型不阻挡即可）
- 不改启动页/3D/过渡动画与现有视觉体系

## Decisions

### D1. 平台与运行时：Cloudflare Workers（static assets 模式）单部署单元

**选择**：一个 Worker 同时服务静态资产（`dist/`）与 Hono API，自定义域名路由。
**理由**：免费额度对个人博客是降维打击（静态请求不计费、D1 5GB、R2 10GB、Workers 10 万请求/天）；单部署单元消除跨服务 CORS/缓存/版本漂移；已有自有域名（`*.workers.dev` 默认域名国内被污染，不可用）。
**替代方案**：Vercel/Netlify（国内访问更差 + 函数计费模型复杂）；腾讯云开发（数据层文档型范式、迁移最贵、月费 ~20 元）；Git-based CMS（无运行时，无法满足评论/浏览量/网页编辑器需求）。

### D2. API 框架：Hono + zod 校验

**选择**：Hono（Workers 原生、轻量）+ zod 做请求体/查询参数校验。
**理由**：Hono 官方提供 node/Vercel/Netlify/Deno 适配器——业务路由代码零改动可迁移；zod 与 Drizzle/TS 推导链路成熟。
**替代方案**：itty-router（更小但生态弱）；Express on Workers（不现实）。

### D3. 数据层：D1 + Drizzle ORM（可移植保险 #1）

**选择**：Drizzle schema 定义三张表，绑定 D1；查询全部走 Drizzle。
**理由**：同一套 schema/查询代码可跑 Turso/libSQL/SQLite/Postgres/MySQL——迁 Vercel=换 driver+连接串；D1 免费 500 万行读/天 + Time Travel 30 天备份。
**替代方案**：裸 D1 API（零抽象，换库=重写全部查询）；KV 做内容（无查询能力）或做计数（免费版 1000 写/天，远低于 D1 的 10 万）。
**Schema 草案**：

```sql
modules:  id(pk), slug(unique), title, accent, accent_dark, icon, blurb, sort
posts:    id(pk), slug(unique), module_id(fk), title, date, tags(json),
          read_time, excerpt, body_md, status('draft'|'published'),
          views(int default 0), published_at, created_at, updated_at
comments: id(pk), post_id(fk, cascade), author, body,
          status('pending'|'approved'|'rejected'),
          ip_hash, created_at
```

**约束**：cascade delete 使"删文章连带删评论"由 FK 保证；`ip_hash` 存 SHA-256 截断（限频与审计用，不存明文 IP）。

### D4. 鉴权：Cloudflare Access + 单中间件（可移植保险 #3）

**选择**：`/admin/*`（页面与静态 chunk）挂 CF Access 应用（邮箱 OTP）；Worker 端一个 Hono 中间件验 `Cf-Access-Jwt-Assertion`（用 Access 公钥验签）。
**理由**：免费版 50 用户；作者侧零登录代码（无注册/密码/session/找回）；编辑器代码物理上不被未验证者下载。
**替代方案**：自写密码 + JWT（多写 ~200 行 + 密码托管责任）；GitHub OAuth Worker（还得自己管 token）。
**代价**：换平台 = 重写这一个中间件文件（~30 行）+ 自建登录。已接受。

### D5. 浏览量计数：D1 原子 UPDATE + 客户端去重

**选择**：`UPDATE posts SET views = views + 1`（单语句原子）；去重靠客户端 60s sessionStorage 标记（规范层面"同一客户端 60 秒内不重复计数"）。
**理由**：个人博客浏览量是统计信号不是计费数据，客户端去重足够；避免引入 KV/DO 的额外状态管理。
**替代方案**：Durable Objects 严格去重（免费版 DO 有额度，但为个位数写入/秒引入 DO 是过度设计）。
**已知妥协**：清缓存/换设备可刷量——接受。

### D6. 评论反垃圾：蜜罐 + IP 限频 + 默认待审

**选择**：表单隐藏蜜罐字段（非空→静默丢弃返回伪 201）；同 IP 30s 1 条（D1 查 `ip_hash` 最近评论时间或 KV 计数窗）；全部评论默认 pending，后台人工放行。
**理由**：三层纯逻辑防线，零第三方依赖、零验证码，拦住绝大多数爬虫脚本灌水；人工审核兜底一切漏网。
**替代方案**：Turnstile（CF 免费验证码，体验受损，作为 P3 上线后若垃圾量大再启用的后手）。

### D7. 图片存储：R2 + aws4fetch S3 协议客户端（可移植保险 #2）

**选择**：上传走 Worker presigned 或直传；对象操作用 aws4fetch（S3 v4 签名），不用 Workers 原生 R2 binding API。
**理由**：换 OSS/COS/B2/S3 = 改 endpoint + 密钥；R2 免费额度（10GB 存储 + 出站流量免费）足够。
**替代方案**：原生 R2 binding（最快但绑定是 CF 方言）。
**实现要点**：公开读走 Worker `/img/*` 路由（缓存头 immutable + 不可预测文件名），不做桶公开直连——保持"读写都经 Worker"的单一鉴权面。

### D8. 前台数据流：SWR 模式 + 骨架屏

**选择**：前台 fetch 封装实现 stale-while-revalidate（内存 + localStorage 双层缓存，TTL 5 分钟），加载态用与卡片同构的骨架屏。
**理由**：国内访问 CF 边缘 RTT 150-350ms，SWR 掩盖二次访问延迟；不引 react-query（站点极简，自封装 ~100 行足够，少一个依赖）。
**替代方案**：SWR/react-query 库（可选，若封装复杂度失控则降级用库）。

### D9. 正文渲染：react-markdown + remark-gfm + rehype-sanitize

**选择**：react-markdown（组件化渲染）+ remark-gfm（表格/任务列表）+ rehype-sanitize（白名单过滤防 XSS）。
**理由**：react-markdown 不走 `dangerouslySetInnerHTML`，默认安全面小；sanitize 白名单兜底（评论区渲染与正文同一管线）。
**替代方案**：marked + DOMPurify（字符串 HTML，需要手动管样式作用域）。

### D10. 后台前端：同仓 SPA 懒加载路由（`/admin/*`）

**选择**：admin 为独立 lazy chunk（React.lazy + 路由前缀 `/admin`），Vditor 仅在 admin chunk 内引入。
**理由**：读者不下载编辑器代码（约 300KB+）；同仓复用设计 tokens 与部署管线，不引第二个前端工程。
**替代方案**：独立子工程（部署两份资产、CORS、版本对齐成本，不值）。

### D11. 内容迁移：blog.js → D1 一次性 seed 脚本

**选择**：node 脚本读 `blog.js` 导出数据，经 Drizzle 灌入 D1（本地 wrangler d1 execute 或远程一次性执行）。
**理由**：现有 8 栏目 + 全部文章作为初始数据集完整保留；`blog.js` 之后退役为 seed 源（SITE 元信息仍在前端使用）。
**风险**：`blog.js` 内 posts 无 body——seed 时 excerpt 复制为正文占位，作者后续在后台补写。

### D12. API 边缘缓存：公开 GET 加 s-maxage，写后主动失效

**选择**：`/api/public/*` GET 响应 `Cache-Control: s-maxage=60`（CF 边缘缓存）；admin 写操作后用 Cache API 删对应边缘缓存键（或接受至多 60s 延迟）。
**理由**：读多写少的个人博客，60s 缓存把 D1 读压到接近零；发布/下架的生效延迟上限 = 缓存 TTL，符合 specs 的 60 秒约定。
**替代方案**：零缓存（D1 免费额度其实也扛得住，缓存是留给增长的余量）。

## Risks / Trade-offs

- [国内延迟 150-350ms] → SWR + 骨架屏掩盖；静态资产全部边缘缓存；P1 上线后实测决定是否需要更激进策略
- [CF Access 单点依赖] → 中间件隔离（D4）；最坏情况换平台补写登录，核心资产（SQLite 数据/静态前端）不受影响
- [D1 无直连外网备份] → Time Travel 30 天 + 定期 `wrangler d1 export` 脚本（P4 交付）+ Git 里保留 seed 源
- [Vditor 体积大且依赖 window] → 仅 admin chunk 引入 + dynamic import；读者侧零成本
- [评论 spam 升级] → 预留 Turnstile 开关（D6 后手），数据模型无需变更
- [seed 迁移丢数据] → seed 前置校验（slug 唯一性检查）+ 迁移后行数比对输出报告
- [单 Worker 免费额度上限 10 万请求/天] → 边缘缓存（D12）+ 静态请求不计费；超限时考虑 $5/月 Paid，架构不变

## Migration Plan

分四期，每期独立可上线（详见 tasks.md 的分节）：

1. **P1 基础设施 + 公开 API + 前台切换**：D1 建表 → seed → Worker + Hono 骨架 → public API → 前台 fetch 化 + 骨架屏。验收：前台数据来自 API，视觉无回归
2. **P2 后台编辑器**：Access 配置 → admin 中间件 → admin CRUD API → `/admin` SPA（文章/栏目管理 + Vditor）。验收：网页端写文章并发布
3. **P3 互动**：浏览量计数 + 评论区（提交/限频/蜜罐 + 审核队列）。验收：游客可评论、后台可放行
4. **P4 图片与打磨**：R2 + 上传 + 编辑器贴图 + d1 export 备份脚本。验收：贴图发文全流程

回滚策略：每期为独立部署版本（wrangler rollback 一键回退）；P1 前台切换保留 `blog.js` 数据源开关（feature flag），API 故障可即时切回静态数据。

## Open Questions

- 评论 IP 限频的存储选型（D1 查询最近评论 vs KV 30s 窗口）在 P3 实现时定，不影响契约（30s/条不变）
- R2 上传走 presigned URL 直传还是经 Worker 中转，P4 实现时按 Vditor 上传接口形态定
