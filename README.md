# 小礼工坊 — 个人博客（React / Vite / Cloudflare Workers 全栈）

启动页保留星空、方形地球和时钟。点击进入后，同一 Three.js 渲染器驱动地球放大、穿过方块云层和港镇落地。港镇有书店、工坊、河岸小屋、旅行车站和山坡天文台，点击建筑自动聚焦并阅读文章摘要。前台采用用户确认的明亮卡通像素风。`#home` 可直接打开世界，`#home/<地点>` 可直达对应地点。`prefers-reduced-motion` 会跳过飞行。WebGL 不可用时提供静态概念图与地点目录。`design/concepts/harbor-panorama-v2-cartoon.png` 是概念参考，不是网页截图。`npm run build` 只构建，不自动部署。

内容（栏目/文章/评论）存储在 Cloudflare D1，由 `/admin` 网页后台
（Vditor 编辑器）管理；前台运行时经 `/api/public/*` 拉取。

## 快速开始

```bash
npm install
npm run db:migrate    # 本地 D1 建表（迁移在 drizzle/）
npm run seed          # 首次：把 src/config/blog.js 快照灌入本地 D1
npm run dev           # 前端开发（Vite，默认 5173，纯静态无 API）
npm run dev:worker    # 全栈本地开发（wrangler dev，API + dist 资产）
npm run build         # 生产构建到 dist/
npm run deploy        # 构建并部署到 Cloudflare Workers
```

本地开发 admin API：复制 `.dev.vars.example` 为 `.dev.vars`，
按需修改 `ADMIN_DEV_TOKEN`；后台页面在 `/admin` 首次 401 时粘贴该令牌。

## 架构

```
浏览器
  ├─ /                前台 SPA（启动页 → 3D 像素港镇，懒加载）
  ├─ /admin/*         后台 SPA（独立 chunk：Vditor 编辑器/栏目/评论审核）
  └─ /api/public/*    读者 API（Hono，s-maxage=60 边缘缓存）
  └─ /api/admin/*     管理 API（Cloudflare Access JWT 鉴权）
  └─ /img/*           R2 图片公开读（immutable 缓存）
Cloudflare Worker（单部署单元：静态资产 + API）
  ├─ D1   modules / posts / comments（Drizzle ORM，drizzle/ 迁移）
  └─ R2   blog-images（原生 binding，worker/lib/r2.ts）
```

- **鉴权**：Cloudflare Access（邮箱 OTP）保护 `/admin` 与 `/api/admin/*`；
  Worker 内 `worker/middleware/access.ts` 验 `Cf-Access-Jwt-Assertion`（RS256 JWKS）
- **可移植性**：Hono 路由 + Drizzle ORM + 单鉴权中间件，
  平台耦合面收敛在上述四点，迁移换 driver 即可
- **评论反垃圾**：蜜罐字段 + IP 30s 限频（ip_hash 截断哈希）+ 后台人工审核
- **浏览量**：D1 原子 +1，客户端 60s sessionStorage 去重
- **前台缓存**：SWR（内存 + localStorage，TTL 5min）+ API 边缘缓存 60s，
  admin 写操作后 Cache API 主动失效

## 首次部署（Cloudflare）

`wrangler.toml` 只声明绑定与部署结构，**不含任何资源 ID 和值**；
Worker 名、自定义域名、D1/R2 资源绑定与全部环境变量都在 Cloudflare 后台维护。

1. `wrangler login`
2. 创建资源：`wrangler d1 create blog-db`、`wrangler r2 bucket create blog-images`
3. Cloudflare 后台 Worker → Settings → **Bindings** 添加绑定：
   - D1：`DB` → `blog-db`
   - R2：`IMAGES` → `blog-images`
4. Cloudflare 后台 Worker → Settings → **Variables and Secrets** 配置：
   - **Variables**：`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`
   （图片存储走 R2 原生绑定，无需 S3 密钥）
5. `npm run db:migrate:remote && npm run seed:remote`
6. Zero Trust 控制台 → Access → Applications，建**一个** Access 应用，
   Include 规则同时覆盖两个路径：
   - `域名/admin/*`（后台页面）
   - `域名/api/admin/*`（后台写接口）
   给该应用配两条策略：
   - **Email OTP**：用户为你的自用邮箱——浏览器访问 `/admin` 登录后，
     `CF_Authorization` cookie 自动随同域 `/api/admin/*` 请求携带，
     Worker 中间件验 cookie（或 `Cf-Access-Jwt-Assertion` 头）放行；
   - **Service Auth**：创建 Service Token——脚本/curl 调写接口时带
     `Cf-Access-Client-Id` 与 `Cf-Access-Client-Secret` 请求头，免交互登录。
   最后把团队域名（`https://<team>.cloudflareaccess.com` 的 `<team>`）
   与应用 AUD 填到第 4 步的 Variables（`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`）。
   注意：Worker 中间件只校验一个 AUD，两个路径必须在**同一个**应用里；
   不要建两个 Access 应用，否则两套 AUD 互相不认、后台会 401。
7. 部署：CI 由 Workers Builds 项目设置部署到 Worker `blog`：
   后台 Worker → `blog` → **Settings → Build**，把 **Deploy command** 设为
   `npm run deploy`（Build command 可留空；`npm run deploy` 会先构建，
   再自动执行远程迁移，最后 `wrangler deploy`）。
   本地部署直接 `npm run deploy`（wrangler.toml 已声明 `name = "blog"`）。
   自定义域名在后台项目设置中配置，国内不可用 workers.dev。

> **配置约定**：`wrangler.toml` 声明绑定名称（DB / IMAGES / ASSETS）、
> 资源名（`blog-db` / `blog-images`）与 Worker 名（`blog`）；资源 ID、
> 路由与全部运行环境变量都在 Cloudflare 后台；
> 本地开发用 `.dev.vars`（模板 `.dev.vars.example`），值不进 git。

## 备份与恢复

- `bash scripts/backup.sh`：`wrangler d1 export` 远程库到 `backups/`
  （gzip，保留 30 份；建议 crontab 每日执行）
- D1 自带 Time Travel 30 天点恢复
- `src/config/blog.js` 存有初始内容快照（seed 源），Git 内可恢复

## 内容维护

- 日常发文/栏目/评论审核：访问 `域名/admin`（Access 验证后进入）
- 站点名/标语/开始时间/描述/邮箱/GitHub/首页区块文案/关于我/页脚：
  后台「站点设置」页（D1 `site_settings` 表）；前台显示站名与关于作者内容，本期不展示旧首页区块
- 静态回退默认值：`src/config/site-settings.js` 的 `DEFAULT_SETTINGS`（与 seed 一致）
- 启动页文案：`src/config/site.js`
- API 故障应急：浏览器控制台执行
  `localStorage.setItem('blog:data-source','static')` 切回静态数据源，
  删除该键恢复 API 模式

## 前台体验

- **启动页**：保留地球模型、星空、时钟与扫描线；点击、滚轮或键盘进入。加载场景时显示等待提示。
- **入场**：同一 WebGL 画布与动画时钟，地球放大、方块云遮挡尺度交接、镜头落到港镇全景，约 4.2 秒。
- **港镇**：五个可点击地点、鼠标选取、地点目录、返回全景和返回星球。桌面为侧边面板，手机为底部面板。文章从现有 API 获取；API 不可用时明确标注静态示例摘要并允许重试。
- **兼容性**：直接链接 `#home` / `#home/books` / `#home/workshop` / `#home/cottage` / `#home/station` / `#home/observatory`；浏览器返回、键盘 Esc、减少动态效果。WebGL 失败展示静态港镇与可用目录。
- **管理**：`/admin` 独立加载，文章、栏目、评论与站点设置以及 Worker 路由、D1 和 R2 结构继续保留。

## 主要文件

- `src/components/world/WorldApp.jsx`：前台界面、地点内容与路由
- `src/components/world/createWorld.js`：单渲染器、相机、转场与点击
- `src/components/world/buildTown.js`：体素港镇与动态道具
- `src/components/world/places.js`：地点、栏目和聚焦镜头配置
- `src/components/landing/`：星空、时钟及启动页装饰组件
- `src/lib/api.js`：公开内容 API 与静态示例回退
- `src/admin/`、`worker/`、`drizzle/`：保留的后台和数据服务
- `public/models/mc_head.glb`：启动页方形地球
- `public/world/harbor-preview.webp`：WebGL 降级预览

## 验证

运行 `node --test tests/world.test.mjs` 验证地点直达、动画缓动、场景实例化和点击范围；运行 `npm run build` 验证前后端打包。已在本地浏览器检查桌面及 390×844 手机全景、五个地点内容面板、键盘返回与浏览器历史。实景图保存在 `.impeccable/review/`；浏览器渲染帧率会显示在画布的 `data-fps` 调试属性中。构建与本地预览不会触发部署。
