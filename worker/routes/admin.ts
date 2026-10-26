import { Hono } from "hono";
import { requireAccess } from "../middleware/access";
import postsApi from "./admin/posts";
import modulesApi from "./admin/modules";
import commentsApi from "./admin/comments";
import settingsApi from "./admin/settings";
import type { Env } from "../env";

/* ============================================================
   作者侧管理 API：/api/admin/*（挂载入口）
   - 全部路由经 requireAccess（Cloudflare Access 鉴权）后才可访问
   - 具体路由按资源域拆分：posts / modules / comments / settings
   - /upload 在 images.ts 中直接挂到本实例（保持原状）
   ============================================================ */

const adminApi = new Hono<{ Bindings: Env }>();
adminApi.use("*", requireAccess);

adminApi.route("/", postsApi);
adminApi.route("/", modulesApi);
adminApi.route("/", commentsApi);
adminApi.route("/", settingsApi);

export default adminApi;
