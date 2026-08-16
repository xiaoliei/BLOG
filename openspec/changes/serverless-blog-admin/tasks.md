## 1. P1 基础设施与数据层

- [x] 1.1 安装依赖：hono、drizzle-orm、drizzle-kit、wrangler、zod、vditor、react-markdown、remark-gfm、rehype-sanitize；package.json 增加 `db:generate`、`db:migrate`、`seed`、`deploy` 脚本
- [x] 1.2 编写 wrangler.toml：Worker 名、D1 绑定（DB）、R2 绑定（IMAGES，P4 用）、static assets 配置（dist/ 目录 + not_found_handling 单页回退）
- [x] 1.3 Drizzle schema：modules / posts / comments 三表（含 FK cascade、ip_hash、status、views 默认值），`drizzle.config.ts` 指向 D1
- [x] 1.4 生成并执行迁移到本地 D1（wrangler d1 migrations apply），验证三表结构与索引（posts.slug 唯一、posts.module_id、comments.post_id、comments.status）
- [x] 1.5 seed 脚本：读 `src/config/blog.js` 导出数据灌入 D1（slug 生成、excerpt 作为正文占位、全部 published），执行后输出行数比对报告

## 2. P1 公开 API 与前台切换

- [x] 2.1 Worker 入口（worker/index.ts）：Hono app、静态资产服务、`/api/public` 路由挂载、全局错误处理（500 JSON）、404 兜底
- [x] 2.2 公开读端点：`GET /api/public/modules`（sort 升序 + 文章数）、`GET /api/public/posts`（limit≤50、moduleId 筛选、日期倒序、不含正文）、`GET /api/public/posts/:slug`（仅 published，含 bodyMd）
- [x] 2.3 公开端点边缘缓存：GET 响应 s-maxage=60；POST 与 404 不缓存
- [x] 2.4 前台 fetch 层：`src/lib/api.js`（getModules/getPosts/getPost），SWR 缓存封装（内存 + localStorage、TTL 5min）、错误重试
- [x] 2.5 HomePage/PostCard/ArticleModal 数据源切换：移除 `blog.js` import，改用 fetch + 骨架屏占位（保留 `blog.js` 作为 feature flag 回退开关）
- [x] 2.6 ArticleModal 正文渲染：react-markdown + remark-gfm + rehype-sanitize，样式接入现有 tokens（代码块、表格、图片懒加载）
- [ ] 2.7 P1 联调验收：`wrangler dev` 本地全流程（seed → API → 前台渲染无回归）已通过；部署到 CF 并绑自定义域名待 `wrangler login`（收尾统一处理）

## 3. P2 后台鉴权与管理 API

- [ ] 3.1 Access 配置：CF Zero Trust 建应用保护 `/admin/*`，邮箱 OTP，自用邮箱为唯一用户
- [ ] 3.2 admin 鉴权中间件（`worker/middleware/access.ts`）：验 `Cf-Access-Jwt-Assertion`（团队域名公钥验签），无效返回 401；`/api/admin/*` 全挂
- [ ] 3.3 文章 CRUD 端点（zod 校验）：列表（含草稿、status/moduleId 筛选）、单篇、创建（slug 唯一 409、title 必填 400）、更新、删除（cascade 评论）
- [ ] 3.4 文章状态流转：publish / unpublish 端点，published_at 记录，写后失效边缘缓存（Cache API 删键或接受 ≤60s 延迟）
- [ ] 3.5 栏目 CRUD 端点：增删改查 + sort 更新，非空栏目删除返回 409 迁移提示
- [ ] 3.6 P2 生产验收：Access 拦截未验证请求（401 重定向验证页），有效 OTP 后 API 正常

## 4. P2 后台界面

- [ ] 4.1 admin 路由骨架：`/admin` lazy chunk（React.lazy + 路由前缀），Vditor 仅 admin chunk 引入（dynamic import），后台导航（文章/栏目/评论/退出）
- [ ] 4.2 文章列表页：标题/栏目/状态/日期/浏览量列，状态筛选，新建按钮
- [ ] 4.3 编辑页（Vditor）：表单（标题/slug/栏目/标签/摘要/阅读时长）+ 编辑器 + 保存草稿/发布/下架按钮，操作反馈与失败保稿（提示 + 内容不丢）
- [ ] 4.4 栏目管理页：列表 + 文章数 + 新增/编辑/删除（非空提示迁移）
- [ ] 4.5 P2 生产验收：网页登录后台 → 新建文章 → Vditor 编辑 → 发布 → 前台可见全流程

## 5. P3 互动功能

- [ ] 5.1 浏览量：`POST /api/public/posts/:slug/views`（D1 原子 +1，draft 404），前台详情弹层打开时提交（sessionStorage 60s 去重）
- [ ] 5.2 评论提交：`POST /api/public/posts/:slug/comments`（zod：昵称 1-24、内容 1-500，draft 404，默认 pending）
- [ ] 5.3 反垃圾三层：蜜罐字段（非空静默丢弃伪 201）、同 IP 30s 1 条（429）、后台人工审核兜底
- [ ] 5.4 评论公开读取：`GET /api/public/posts/:slug/comments` 仅 approved、时间正序、不暴露 ip_hash 与状态
- [ ] 5.5 后台评论审核 API + 界面：`GET /api/admin/comments?status=`、approve/reject/删除，审核队列 UI（pending/approved/rejected 筛选）
- [ ] 5.6 ArticleModal 评论区：approved 列表 + 提交表单（昵称+内容+蜜罐），提交后「待审核」提示并清空
- [ ] 5.7 P3 联调验收：游客评论 → 后台放行 → 前台可见；蜜罐/限频/429 全路径验证

## 6. P4 图片与运维

- [ ] 6.1 R2 绑定与图片路由：`/img/*` 公开读（immutable 长缓存），aws4fetch S3 客户端封装（D7）
- [ ] 6.2 上传端点：`POST /api/admin/upload`（Access 鉴权，类型 jpeg/png/gif/webp、≤5MB，413/400），返回公开 URL（不可预测文件名）
- [ ] 6.3 Vditor 贴图上传对接：剪贴板/拖拽图片 → 上传端点 → URL 插入 markdown
- [ ] 6.4 备份脚本：`wrangler d1 export` 定期导出（scripts/backup.sh + 说明）
- [ ] 6.5 P4 验收 + 收尾：贴图发文全流程、`blog.js` 退役清理（SITE 保留）、README 更新架构说明
