import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../lib/db";
import { comments, modules, posts } from "../db/schema";
import { siteSettings } from "../db/schema";
import { purgePostCache, purgeCommentsCache, purgeSettingsCache } from "../lib/cache";
import { settingsFromRow, settingsValues } from "../lib/settings";
import { requireAccess } from "../middleware/access";
import type { Env } from "../env";

/* ============================================================
   作者侧管理 API：/api/admin/*（全部经 Access 鉴权）
   ============================================================ */

const adminApi = new Hono<{ Bindings: Env }>();
adminApi.use("*", requireAccess);

const now = () => new Date().toISOString();
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const jsonErr = (message: string, status: 400 | 404 | 409 | 422, extra: object = {}) =>
	new Response(JSON.stringify({ error: "validation_error", message, ...extra }), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
	});

/* ---------- 校验 schema ---------- */

const postInput = z.object({
	title: z.string().trim().min(1, "标题必填").max(200),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.regex(SLUG_RE, "slug 只能包含小写字母、数字与中划线"),
	moduleId: z.number().int().positive(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式 YYYY-MM-DD").optional(),
	tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
	readTime: z.number().int().min(1).max(600).optional(),
	excerpt: z.string().max(300).optional(),
	bodyMd: z.string().max(200_000).optional(),
});

const postPatch = postInput.partial().extend({
	moduleId: z.number().int().positive().optional(),
});

const moduleInput = z.object({
	slug: z.string().trim().min(1).max(60).regex(SLUG_RE, "slug 只能包含小写字母、数字与中划线"),
	title: z.string().trim().min(1, "标题必填").max(60),
	accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
	accentDark: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
	icon: z.string().trim().max(30).optional(),
	blurb: z.string().max(200).optional(),
	sort: z.number().int().min(0).optional(),
});

const modulePatch = moduleInput.partial();

/* ---------- 站点设置（部分更新，缺失字段取默认值） ---------- */

const settingsPatch = z
	.object({
		name: z.string().trim().min(1, "站名必填").max(60),
		tagline: z.string().trim().max(120),
		since: z.number().int().min(1900, "开始时间为 1900–2100 的四位年份").max(2100),
		description: z.string().trim().max(300),
		author: z.string().trim().max(60),
		email: z.email("邮箱格式不正确").max(120),
		github: z.url("GitHub 链接格式不正确").max(200),
		latestSub: z.string().trim().max(200),
		modulesSub: z.string().trim().max(200),
		aboutTitle: z.string().trim().max(60),
		aboutText: z.string().trim().max(2000),
		footerBrand: z.string().trim().max(60),
		footerTagline: z.string().trim().max(120),
		footerNavTitle: z.string().trim().max(60),
		footerContactTitle: z.string().trim().max(60),
		footerBottom: z.string().trim().max(200),
	})
	.partial();

/* ============================================================
   站点设置：单行读取 + 部分更新（首次更新自动建行，写后失效缓存）
   ============================================================ */

adminApi.get("/settings", async (c) => {
	const row = (
		await db(c.env)
			.select()
			.from(siteSettings)
			.where(eq(siteSettings.id, 1))
			.limit(1)
	)[0];
	return c.json(settingsFromRow(row), 200, { "Cache-Control": "no-store" });
});

adminApi.patch("/settings", async (c) => {
	const parsed = settingsPatch.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return jsonErr("请求体校验失败", 400, { fields: parsed.error.flatten().fieldErrors });
	}
	const input = parsed.data;
	const existing = (
		await db(c.env)
			.select()
			.from(siteSettings)
			.where(eq(siteSettings.id, 1))
			.limit(1)
	)[0];
	const ts = now();
	let row;
	if (!existing) {
		[row] = await db(c.env)
			.insert(siteSettings)
			.values({ ...settingsValues(input), id: 1, updatedAt: ts })
			.returning();
	} else {
		[row] = await db(c.env)
			.update(siteSettings)
			.set({ ...input, updatedAt: ts })
			.where(eq(siteSettings.id, 1))
			.returning();
	}
	await purgeSettingsCache(c);
	return c.json(settingsFromRow(row), 200, { "Cache-Control": "no-store" });
});

/* ============================================================
   文章 CRUD
   ============================================================ */

/* 列表：含草稿，status/moduleId 筛选，更新时间倒序 */
adminApi.get("/posts", async (c) => {
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

	return c.json(rows, 200, { "Cache-Control": "no-store" });
});

/* 单篇（含正文） */
adminApi.get("/posts/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const row = (await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1))[0];
	if (!row) return jsonErr("文章不存在", 404);
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

/* 创建：slug 唯一 409，title 必填 400 */
adminApi.post("/posts", async (c) => {
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
	return c.json(row, 201, { "Cache-Control": "no-store" });
});

/* 更新 */
adminApi.patch("/posts/:id", async (c) => {
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
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

/* 删除：评论由 FK cascade 连带删除 */
adminApi.delete("/posts/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const [existing] = await db(c.env).select().from(posts).where(eq(posts.id, id)).limit(1);
	if (!existing) return jsonErr("文章不存在", 404);
	await db(c.env).delete(posts).where(eq(posts.id, id));
	await purgePostCache(c, existing.slug);
	return c.body(null, 204);
});

/* ---------- 状态流转：publish / unpublish ---------- */

adminApi.post("/posts/:id/publish", async (c) => {
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
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

adminApi.post("/posts/:id/unpublish", async (c) => {
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
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

/* ============================================================
   栏目 CRUD
   ============================================================ */

adminApi.get("/modules", async (c) => {
	const rows = await db(c.env)
		.select({
			id: modules.id,
			slug: modules.slug,
			title: modules.title,
			accent: modules.accent,
			accentDark: modules.accentDark,
			icon: modules.icon,
			blurb: modules.blurb,
			sort: modules.sort,
			postCount: sql<number>`(
				select count(*) from posts p
				where p.module_id = modules.id
			)`,
		})
		.from(modules)
		.orderBy(asc(modules.sort));
	return c.json(rows, 200, { "Cache-Control": "no-store" });
});

adminApi.get("/modules/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const row = (await db(c.env).select().from(modules).where(eq(modules.id, id)).limit(1))[0];
	if (!row) return jsonErr("栏目不存在", 404);
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

adminApi.post("/modules", async (c) => {
	const parsed = moduleInput.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return jsonErr("请求体校验失败", 400, { fields: parsed.error.flatten().fieldErrors });
	}
	const input = parsed.data;
	const [dup] = await db(c.env).select({ id: modules.id }).from(modules).where(eq(modules.slug, input.slug)).limit(1);
	if (dup) return jsonErr("slug 已存在", 409, { field: "slug" });
	const [row] = await db(c.env)
		.insert(modules)
		.values({
			slug: input.slug,
			title: input.title,
			accent: input.accent ?? "#3F9D4B",
			accentDark: input.accentDark ?? "#2E7D32",
			icon: input.icon ?? "feather",
			blurb: input.blurb ?? "",
			sort: input.sort ?? 0,
		})
		.returning();
	await purgePostCache(c);
	return c.json(row, 201, { "Cache-Control": "no-store" });
});

adminApi.patch("/modules/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const parsed = modulePatch.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return jsonErr("请求体校验失败", 400, { fields: parsed.error.flatten().fieldErrors });
	}
	const input = parsed.data;
	if (Object.keys(input).length === 0) return jsonErr("空更新", 400);

	const [existing] = await db(c.env).select().from(modules).where(eq(modules.id, id)).limit(1);
	if (!existing) return jsonErr("栏目不存在", 404);
	if (input.slug && input.slug !== existing.slug) {
		const [dup] = await db(c.env).select({ id: modules.id }).from(modules).where(eq(modules.slug, input.slug)).limit(1);
		if (dup) return jsonErr("slug 已存在", 409, { field: "slug" });
	}

	const [row] = await db(c.env)
		.update(modules)
		.set({
			...(input.slug != null && { slug: input.slug }),
			...(input.title != null && { title: input.title }),
			...(input.accent != null && { accent: input.accent }),
			...(input.accentDark != null && { accentDark: input.accentDark }),
			...(input.icon != null && { icon: input.icon }),
			...(input.blurb != null && { blurb: input.blurb }),
			...(input.sort != null && { sort: input.sort }),
		})
		.where(eq(modules.id, id))
		.returning();
	await purgePostCache(c);
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

/* 删除：非空栏目 409 + 迁移提示 */
adminApi.delete("/modules/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const [existing] = await db(c.env).select().from(modules).where(eq(modules.id, id)).limit(1);
	if (!existing) return jsonErr("栏目不存在", 404);

	const [{ n }] = (
		await db(c.env)
			.select({ n: sql<number>`count(*) as n` })
			.from(posts)
			.where(eq(posts.moduleId, id))
	);
	if (n > 0) {
		return jsonErr(`栏目下仍有 ${n} 篇文章，请先在后台将文章迁移到其他栏目后再删除`, 409, { postCount: n });
	}

	await db(c.env).delete(modules).where(eq(modules.id, id));
	await purgePostCache(c);
	return c.body(null, 204);
});

/* ============================================================
   评论审核
   ============================================================ */

/** 列表：按状态筛选，含文章标题，时间倒序 */
adminApi.get("/comments", async (c) => {
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
	return c.json(rows, 200, { "Cache-Control": "no-store" });
});

/** 审核：approve / reject */
const reviewAction = z.object({ action: z.enum(["approve", "reject"]) });

adminApi.patch("/comments/:id", async (c) => {
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
	return c.json(row, 200, { "Cache-Control": "no-store" });
});

/** 删除：返回 204 */
adminApi.delete("/comments/:id", async (c) => {
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

export default adminApi;
