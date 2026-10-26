import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { comments, posts } from "../../db/schema";
import { purgeCommentsCache } from "../../lib/cache";
import { jsonErr, NO_STORE } from "../../lib/http";
import { reviewAction } from "./schema";
import type { Env } from "../../env";

/* ============================================================
   评论审核
   ============================================================ */

const commentsApi = new Hono<{ Bindings: Env }>();

/** 列表：按状态筛选，含文章标题，时间倒序 */
commentsApi.get("/comments", async (c) => {
	const status = c.req.query("status");
	const conditions = [];
	if (status === "pending" || status === "approved" || status === "rejected") {
		conditions.push(eq(comments.status, status));
	}
	const rows = await db(c.env)
		.select({
			id: comments.id,
			postId: comments.postId,
			postTitle: posts.title,
			postSlug: posts.slug,
			author: comments.author,
			body: comments.body,
			status: comments.status,
			ipHash: comments.ipHash,
			createdAt: comments.createdAt,
		})
		.from(comments)
		.innerJoin(posts, eq(comments.postId, posts.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(comments.createdAt))
		.limit(200);
	return c.json(rows, 200, { "Cache-Control": NO_STORE });
});

/** 审核：approve / reject */
commentsApi.patch("/comments/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const parsed = reviewAction.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return jsonErr("action 必须是 approve 或 reject", 400);

	const [existing] = await db(c.env)
		.select({ id: comments.id, slug: posts.slug })
		.from(comments)
		.innerJoin(posts, eq(comments.postId, posts.id))
		.where(eq(comments.id, id))
		.limit(1);
	if (!existing) return jsonErr("评论不存在", 404);

	const [row] = await db(c.env)
		.update(comments)
		.set({ status: parsed.data.action === "approve" ? "approved" : "rejected" })
		.where(eq(comments.id, id))
		.returning();
	await purgeCommentsCache(c, existing.slug);
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

/** 删除：返回 204 */
commentsApi.delete("/comments/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const [existing] = await db(c.env)
		.select({ id: comments.id, slug: posts.slug })
		.from(comments)
		.innerJoin(posts, eq(comments.postId, posts.id))
		.where(eq(comments.id, id))
		.limit(1);
	if (!existing) return jsonErr("评论不存在", 404);
	await db(c.env).delete(comments).where(eq(comments.id, id));
	await purgeCommentsCache(c, existing.slug);
	return c.body(null, 204);
});

export default commentsApi;
