# 小礼工坊 — 个人博客（React / Vite / Cloudflare Workers 全栈）

保留启动页（星空、3D 头颅、像素月球、开机动画），点击进入后到达正常的博客主页；
主页背景结构融合 `demo/xiaoli-home/`（草堂 GrassForum）的样式：
绿色 Hero 色带、浅色羊毛纹理、蓝色页脚色带。**不再使用游戏地图形式**，
首页就是常规的「导航 + Hero + 文章列表 + 栏目 + 关于 + 页脚」。

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
  ├─ /                前台 SPA（启动页 3D + 博客首页，懒加载）
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
- `src/config/blog.js` 保留初始内容快照（seed 源），Git 内可恢复

## 内容维护

- 日常发文/栏目/评论审核：访问 `域名/admin`（Access 验证后进入）
- 站点名/标语/邮箱/GitHub：`src/config/blog.js` 的 `SITE`（前端元信息）
- 启动页文案：`src/config/site.js`
- API 故障应急：浏览器控制台执行
  `localStorage.setItem('blog:data-source','static')` 切回静态数据源，
  删除该键恢复 API 模式

## 页面结构（启动页 → 博客首页）

### 0. 启动页 LandingPage（星空 + 3D 头颅 + 像素月球）

- 3D 头颅（`mc_head.glb`）待机摆动，左上角像素月球同步联动
- 点击任意处 / 滚轮 / 方向键触发：文本淡出 → 3D 头颅旋转放大至满屏 →
  **穿屏淡出**（头颅继续略微放大，同时启动层整体淡出，揭开下方博客首页，
  Hero 元素依次入场）
- `prefers-reduced-motion` 下跳过动画直接进入
- URL `#home` 可跳过启动页直达首页；刷新 `#home` 同样直达

### 1. 博客首页（单页，数据来自 API）

1. **绿色 Hero**（xiaoli-home 同款 `#4CAF50` + 底部羊毛饰条）
   - 顶部透明导航（最新文章 / 文章栏目 / 关于我）
   - 站名、标语、CTA（浏览最新文章 / 查看栏目）、栏目与文章统计
2. **最新文章**：按日期倒序展示 6 篇（骨架屏加载占位），白色卡片
   （模块色侧条、日期、标签、摘要）；点击卡片打开详情弹层
   （markdown 正文渲染 + 评论区 + 浏览量计数，`Esc` / 遮罩关闭）
3. **文章栏目**：栏目卡片点击可筛选该栏目文章
4. **关于我**：作者卡片 + 联系 CTA（邮件 / GitHub）
5. **蓝色页脚**（xiaoli-home 同款 `#0E77A4` + 顶部羊毛饰条）

### 2. 后台 `/admin`（Access 保护，独立懒加载 chunk）

- 文章管理：列表（状态筛选/浏览量）、Vditor 编辑（贴图直接上传 R2）、
  草稿/发布/下架，失败保稿
- 栏目管理：增删改（非空栏目删除需先迁移文章）
- 评论审核：pending/approved/rejected 队列，一键放行/拒绝/删除

## 目录结构

```
├── index.html                  # 入口（中文字体、meta、theme-color #4CAF50）
├── wrangler.toml               # Worker 配置（只声明绑定名称，资源/值在 Cloudflare 后台）
├── .dev.vars.example           # 环境变量模板（本地复制为 .dev.vars，已 gitignore）
├── drizzle.config.ts           # Drizzle Kit 配置（SQLite → D1）
├── drizzle/                    # 生成的 SQL 迁移（wrangler d1 migrations）
├── worker/                     # Cloudflare Worker（Hono API）
│   ├── index.ts                # 入口：路由挂载、静态资产兜底、全局错误
│   ├── env.d.ts                # Env 类型（DB/ASSETS/IMAGES/ACCESS_*/R2_*）
│   ├── db/schema.ts            # modules/posts/comments 三表 schema
│   ├── routes/public.ts        # /api/public/*（栏目/文章/详情/浏览量/评论）
│   ├── routes/admin.ts         # /api/admin/*（文章/栏目/评论 CRUD）
│   ├── routes/images.ts        # /img/* 公开读 + /api/admin/upload 上传
│   ├── middleware/access.ts    # CF Access JWT 验证（本地 X-Admin-Token 回退）
│   └── lib/                    # db / cache（边缘缓存失效）/ r2（原生 binding）
├── scripts/
│   ├── seed.mjs                # blog.js 快照 → D1（幂等，行数比对报告）
│   ├── copy-vditor.mjs         # vditor dist → public/vditor（自托管）
│   └── backup.sh               # wrangler d1 export 定期备份
├── public/
│   ├── wool/                   # xiaoli-home 羊毛背景图（3 张 PNG）
│   └── models/mc_head.glb      # 启动页 3D 头颅模型
└── src/
    ├── main.jsx                # React 入口（样式导入 + admin.css）
    ├── App.jsx                 # /admin 前缀分流 + landing→home 三阶段
    ├── admin/                  # 后台 SPA（独立 chunk：列表/编辑/栏目/评论）
    ├── config/blog.js          # SITE 元信息 + 静态回退数据快照（seed 源）
    ├── config/site.js          # 启动页系统文案（BOOT / 版本 / 状态栏数据）
    ├── hooks/useBlogData.js    # modules/posts 数据 hooks（骨架/错误/重试）
    ├── lib/api.js              # API 客户端 + SWR 缓存 + 浏览/评论提交
    ├── components/home/
    │   ├── HomePage.jsx        # 首页编排（骨架屏 + 错误重试）
    │   ├── PostCard.jsx        # 文章卡片
    │   ├── ArticleModal.jsx    # 详情弹层（markdown + 评论区）
    │   ├── MarkdownBody.jsx    # react-markdown + gfm + sanitize
    │   ├── SkeletonCard.jsx    # 骨架占位卡片
    │   └── icons.jsx           # SVG 图标集（Lucide 风格，无 emoji）
    ├── components/landing/     # 启动页组件（3D 头颅/星空/时钟/扫描线）
    ├── lib/                    # scene.js / stars.js（Three.js 工具）
    └── styles/                 # tokens/base/home/room/landing/admin
```

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
