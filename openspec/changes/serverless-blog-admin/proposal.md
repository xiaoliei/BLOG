## Why

博客全部内容（栏目、文章、标签）硬编码在 `src/config/blog.js` 中，修改一个错别字也需要改代码、重新构建、重新部署；文章没有正文（只有摘要），也没有评论、浏览量等动态能力。需要一个网页后台编辑器，让作者不碰代码即可管理内容，并为站点补上动态功能，同时保持零成本运行。

## What Changes

- 新增 Cloudflare Worker（Hono）全栈服务：托管现有 SPA 静态资源 + 提供 `/api/public/*` 与 `/api/admin/*` JSON API
- 新增 D1（SQLite）数据库：modules / posts / comments 三张表，含草稿状态与浏览量计数字段；一次性 seed 脚本将 `blog.js` 现有内容迁入，之后 `blog.js` 退役
- 新增 Cloudflare Access（邮箱 OTP）保护 `/admin` 后台路由与写接口鉴权，不自建登录系统
- 新增 `/admin` 网页后台（SPA 懒加载路由）：文章管理（Vditor 编辑器、草稿/发布）、栏目管理、评论审核
- 前台改造：HomePage 数据源从 `import blog.js` 改为 API 拉取（SWR 缓存 + 加载骨架）；ArticleModal 增加 markdown 正文渲染、评论区、浏览量计数
- 评论能力：游客昵称 + 内容（无邮箱字段），蜜罐 + IP 限频 + 默认待审的三层反垃圾
- 新增 R2 图片存储（P4 阶段）：S3 协议客户端访问，编辑器内直接上传贴图
- **BREAKING**：`src/config/blog.js` 的 MODULES/SITE 内容数据源被 API 取代（SITE 站点元信息仍保留在前端）

## Capabilities

### New Capabilities

- `public-content-api`: 读者侧只读 API——栏目、已发布文章列表与详情（含正文）、浏览量计数自增
- `admin-content-management`: 作者侧内容管理——Access 鉴权的文章/栏目增删改查、Vditor 编辑、草稿与发布状态流转
- `comment-system`: 游客评论提交（昵称 + 内容、蜜罐、IP 限频、默认待审）与后台审核放行
- `admin-console`: `/admin` 网页后台界面——文章列表、编辑器、栏目管理、评论审核队列的 UI 壳
- `image-asset-management`: R2 图片上传、存储与公网访问（S3 协议，P4 交付）
- `front-content-runtime`: 前台内容运行时——从静态 import 切换到 API 拉取、markdown 正文渲染、加载骨架与缓存策略

### Modified Capabilities

（无——当前 `openspec/specs/` 为空，所有能力均为新增）

## Impact

- **代码**：`src/components/home/HomePage.jsx`、`PostCard.jsx`、`ArticleModal.jsx`（数据源 + 正文渲染 + 评论区）；新增 `worker/`（Hono API + Drizzle schema + seed 脚本）、`src/admin/`（后台 SPA 路由）；`src/config/blog.js` 退役为 seed 数据源
- **依赖**：新增 hono、drizzle-orm、drizzle-kit、vditor、react-markdown(+remark-gfm)、swr；package.json 增加 deploy/db seed 脚本
- **基础设施**：Cloudflare Workers（静态资产 + API）、D1、R2、Access 配置；wrangler.toml 新增
- **部署**：自有域名绑定 Worker 路由（国内可用的前提）；`*.workers.dev` 域名不可用
- **不受影响**：LandingPage 启动页、3D 场景、zoom/transition、styles 体系
