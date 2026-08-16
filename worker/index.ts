import { Hono } from "hono";
import type { Env } from "./env";
import publicApi from "./routes/public";

/* ============================================================
   小礼工坊 Worker 入口
   - /api/public/*：读者侧只读 API（静态资产之外的动态面）
   - 其余路径委托 ASSETS 静态资产（dist/，SPA 回退由 assets 配置处理）
   ============================================================ */

const app = new Hono<{ Bindings: Env }>();

app.route("/api/public", publicApi);

/* 静态资产兜底：worker 被命中且非 API 路径时，委托给资产绑定 */
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

/* 404（仅 /api/* 会走到这里） */
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
