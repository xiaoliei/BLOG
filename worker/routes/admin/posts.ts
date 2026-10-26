import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { modules, posts } from "../../db/schema";
import { purgePostCache } from "../../lib/cache";
import { jsonErr, NO_STORE, now } from "../../lib/http";
import { postInput, postPatch } from "./schema";
import type { Env } from "../../env";

/* ============================================================
   文章 CRUD：列表/单篇/创建/更新/删除 + 状态流转（publish/unpublish）
   - slug 唯一（冲突 409）；写后失效公开文章缓存
   ============================================================ */

const postsApi = new Hono<{ Bindings: Env }>();

/* 列表：含草稿，status/moduleId 筛选，更新时间倒序 */
postsApi.get("/posts", async (c) => {
	const status = c.req.query("status");
	const moduleId = c.req.query("moduleId");

	const conditions = [];
	if (status === "draft" || status === "published") conditions.push(eq(posts.status, status));
	if (moduleId && /^\d+$/.test(moduleId)) conditions.push(eq(posts.moduleId, Number(moduleId)));

	const rows = await db(c.env)
		.select({
			id: posts.id,
			slug: posts.slug,
			moduleId: posts.moduleId,
			moduleTitle: modules.title,
			title: posts.title,
			date: posts.date,
			tags: posts.tags,
			readTime: posts.readTime,
			excerpt: posts.excerpt,
			status: posts.status,
			views: posts.views,
			publishedAt: posts.publishedAt,
			updatedAt: posts.updatedAt,
		})
		.from(posts)
		.innerJoin(modules, eq(posts.moduleId, modules.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(posts.updatedAt));

	return c.json(rows, 200, { "Cache-Control": NO_STORE });
});

/* 单篇（含正文） */
postsApi.get("/posts/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const row = (await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1))[0];
	if (!row) return jsonErr("文章不存在", 404);
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

/* 创建：slug 唯一 409，title 必填 400 */
postsApi.post("/posts", async (c) => {
	const parsed = postInput.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return jsonErr("请求体校验失败", 400, { fields: parsed.error.flatten().fieldErrors });
	}
	const input = parsed.data;

	const [mod] = await db(c.env).select().from(modules).where(eq(modules.id, input.moduleId)).limit(1);
	if (!mod) return jsonErr("栏目不存在", 400, { fields: { moduleId: ["栏目不存在"] } });

	const [dup] = await db(c.env).select({ id: posts.id }).from(posts).where(eq(posts.slug, input.slug)).limit(1);
	if (dup) return jsonErr("slug 已存在", 409, { field: "slug" });

	const ts = now();
	const [row] = await db(c.env)
		.insert(posts)
		.values({
			slug: input.slug,
			moduleId: input.moduleId,
			title: input.title,
			date: input.date ?? ts.slice(0, 10),
			tags: input.tags ?? [],
			readTime: input.readTime ?? 1,
			excerpt: input.excerpt ?? "",
			bodyMd: input.bodyMd ?? "",
			status: "draft",
			views: 0,
			createdAt: ts,
			updatedAt: ts,
		})
		.returning();
	return c.json(row, 201, { "Cache-Control": NO_STORE });
});

/* 更新 */
postsApi.patch("/posts/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const parsed = postPatch.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return jsonErr("请求体校验失败", 400, { fields: parsed.error.flatten().fieldErrors });
	}
	const input = parsed.data;
	if (Object.keys(input).length === 0) return jsonErr("空更新", 400);

	const [existing] = await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1);
	if (!existing) return jsonErr("文章不存在", 404);

	if (input.slug && input.slug !== existing.slug) {
		const [dup] = await db(c.env).select({ id: posts.id }).from(posts).where(eq(posts.slug, input.slug)).limit(1);
		if (dup) return jsonErr("slug 已存在", 409, { field: "slug" });
	}
	if (input.moduleId) {
		const [mod] = await db(c.env).select().from(modules).where(eq(modules.id, input.moduleId)).limit(1);
		if (!mod) return jsonErr("栏目不存在", 400, { fields: { moduleId: ["栏目不存在"] } });
	}

	const [row] = await db(c.env)
		.update(posts)
		.set({
			...(input.slug != null && { slug: input.slug }),
			...(input.moduleId != null && { moduleId: input.moduleId }),
			...(input.title != null && { title: input.title }),
			...(input.date != null && { date: input.date }),
			...(input.tags != null && { tags: input.tags }),
			...(input.readTime != null && { readTime: input.readTime }),
			...(input.excerpt != null && { excerpt: input.excerpt }),
			...(input.bodyMd != null && { bodyMd: input.bodyMd }),
			updatedAt: now(),
		})
		.where(eq(posts.id, id))
		.returning();

	await purgePostCache(c, existing.slug);
	if (input.slug && input.slug !== existing.slug) await purgePostCache(c, input.slug);
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

/* 删除：评论由 FK cascade 连带删除 */
postsApi.delete("/posts/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const [existing] = await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1);
	if (!existing) return jsonErr("文章不存在", 404);
	await db(c.env).delete(posts).where(eq(posts.id, id));
	await purgePostCache(c, existing.slug);
	return c.body(null, 204);
});

/* ---------- 状态流转：publish / unpublish ---------- */

postsApi.post("/posts/:id/publish", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const [existing] = await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1);
	if (!existing) return jsonErr("文章不存在", 404);
	const ts = now();
	const [row] = await db(c.env)
		.update(posts)
		.set({ status: "published", publishedAt: existing.publishedAt ?? ts, updatedAt: ts })
		.where(eq(posts.id, id))
		.returning();
	await purgePostCache(c, existing.slug);
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

postsApi.post("/posts/:id/unpublish", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const [existing] = await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1);
	if (!existing) return jsonErr("文章不存在", 404);
	const [row] = await db(c.env)
		.update(posts)
		.set({ status: "draft", updatedAt: now() })
		.where(eq(posts.id, id))
		.returning();
	await purgePostCache(c, existing.slug);
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

export default postsApi;
