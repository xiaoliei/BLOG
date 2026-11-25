import { Hono } from "hono";
import type { Env } from "./env";
import adminApi from "./routes/admin";
import imagesApi from "./routes/images";
import publicApi from "./routes/public";

/* ============================================================
   小礼工坊 Worker 入口
   - /api/public/*：读者侧只读 API（静态资产之外的动态面）
   - /api/admin/*、/img/*：管理 API 与图片读写
   - 其余路径委托 ASSETS 静态资产（dist/，SPA 回退由 assets 配置处理）；
     静态请求默认不经过 Worker（见 wrangler.toml 的 run_worker_first），
     页面的安全响应头与 CSP 写在 public/_headers
   ============================================================ */

const app = new Hono<{ Bindings: Env }>();

app.route("/api/public", publicApi);
app.route("/api/admin", adminApi);
app.route("/", imagesApi);

/* 未知 API 路径：直接 404 JSON，不能落到下面的 SPA 兜底（否则会返回首页 HTML + 200） */
app.all("/api", (c) =>
	c.json({ error: "not_found" }, 404, { "Cache-Control": "no-store" }),
);

app.all("/api/*", (c) =>
	c.json({ error: "not_found" }, 404, { "Cache-Control": "no-store" }),
);

/* 静态资产兜底：worker 被命中且非 API 路径时，委托给资产绑定 */
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

/* 404（兜底，正常不应到达：API 由上面的 /api/* 接管，其余路径交给 SPA） */
app.notFound((c) =>
	c.json({ error: "not_found" }, 404, { "Cache-Control": "no-store" }),
);

/* 全局错误处理：500 JSON，不泄露堆栈 */
app.onError((err, c) => {
	console.error("[worker] unhandled error:", err);
	return c.json(
		{ error: "internal_error", message: "服务开小差了，请稍后再试" },
		500,
		{ "Cache-Control": "no-store" },
	);
});

export default {
	fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
		app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
