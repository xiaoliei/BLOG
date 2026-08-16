import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { modules, posts } from "../db/schema";
import type { Env } from "../env";

/* ============================================================
   读者侧公开只读 API：/api/public/*
   - GET 响应 s-maxage=60（CF 边缘缓存）
   - 404 / 错误一律 no-store
   ============================================================ */

const CACHE_GET = "public, max-age=0, s-maxage=60";
const NO_STORE = "no-store";

/** 文章列表选择列（不含正文 bodyMd） */
const listColumns = {
	id: posts.id,
	slug: posts.slug,
	moduleId: posts.moduleId,
	moduleSlug: modules.slug,
	moduleTitle: modules.title,
	moduleAccent: modules.accent,
	moduleAccentDark: modules.accentDark,
	title: posts.title,
	date: posts.date,
	tags: posts.tags,
	readTime: posts.readTime,
	excerpt: posts.excerpt,
	views: posts.views,
};

const publicApi = new Hono<{ Bindings: Env }>();

/* ---------- 栏目列表：sort 升序 + 已发布文章数 ---------- */
publicApi.get("/modules", async (c) => {
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
					and p.status = 'published'
			)`,
		})
		.from(modules)
		.orderBy(asc(modules.sort));
	return c.json(rows, 200, { "Cache-Control": CACHE_GET });
});

/* ---------- 已发布文章列表：limit≤50、moduleId/slug 筛选、日期倒序、不含正文 ---------- */
publicApi.get("/posts", async (c) => {
	const moduleIdParam = c.req.query("moduleId");
	const limitParam = c.req.query("limit");

	const conditions = [eq(posts.status, "published")];

	if (moduleIdParam) {
		const mod = /^\d+$/.test(moduleIdParam)
			? (
					await db(c.env)
						.select()
						.from(modules)
						.where(eq(modules.id, Number(moduleIdParam)))
						.limit(1)
				)[0]
			: (
					await db(c.env)
						.select()
						.from(modules)
						.where(eq(modules.slug, moduleIdParam))
						.limit(1)
				)[0];
		/* 栏目不存在（或尚未创建）→ 空列表，可缓存 */
		if (!mod) return c.json([], 200, { "Cache-Control": CACHE_GET });
		conditions.push(eq(posts.moduleId, mod.id));
	}

	let query = db(c.env)
		.select(listColumns)
		.from(posts)
		.innerJoin(modules, eq(posts.moduleId, modules.id))
		.where(and(...conditions))
		.orderBy(desc(posts.date))
		.$dynamic();

	/* limit 缺省 = 全部匹配；上限 50 */
	const limitNum = Number(limitParam);
	if (limitParam != null && Number.isFinite(limitNum) && limitNum > 0) {
		query = query.limit(Math.min(Math.floor(limitNum), 50));
	}

	const rows = await query;
	return c.json(rows, 200, { "Cache-Control": CACHE_GET });
});

/* ---------- 文章详情：仅 published，含正文 ---------- */
publicApi.get("/posts/:slug", async (c) => {
	const slug = c.req.param("slug");
	const row = (
		await db(c.env)
			.select({
				...listColumns,
				bodyMd: posts.bodyMd,
				status: posts.status,
				publishedAt: posts.publishedAt,
			})
			.from(posts)
			.innerJoin(modules, eq(posts.moduleId, modules.id))
			.where(and(eq(posts.slug, slug), eq(posts.status, "published")))
			.limit(1)
	)[0];

	if (!row) {
		return c.json({ error: "not_found", message: "文章不存在或未发布" }, 404, {
			"Cache-Control": NO_STORE,
		});
	}
	return c.json(row, 200, { "Cache-Control": CACHE_GET });
});

export default publicApi;
