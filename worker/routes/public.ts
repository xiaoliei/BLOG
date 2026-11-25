import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../lib/db";
import { comments, modules, posts } from "../db/schema";
import { siteSettings } from "../db/schema";
import { settingsFromRow } from "../lib/settings";
import { CACHE_GET, NO_STORE } from "../lib/http";
import type { Env } from "../env";

/* ============================================================
   读者侧公开 API：/api/public/*
   - GET 响应 s-maxage=60（CF 边缘缓存）
   - 404 / POST / 错误一律 no-store
   - 浏览量计数：D1 原子 +1（客户端 60s sessionStorage 去重，设计 D5）
   - 评论：蜜罐 + IP 限频（30s/条，条件 INSERT 原子落库）+ 默认 pending（设计 D6）
   ============================================================ */

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

/* ---------- 站点设置：单行读取，表空回退默认值 ---------- */
publicApi.get("/settings", async (c) => {
	const row = (
		await db(c.env)
			.select()
			.from(siteSettings)
			.where(eq(siteSettings.id, 1))
			.limit(1)
	)[0];
	return c.json(settingsFromRow(row), 200, { "Cache-Control": CACHE_GET });
});

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

/* ---------- 工具：已发布文章查找 ---------- */

async function findPublishedPost(env: Env, slug: string) {
	return (
		await db(env)
			.select({ id: posts.id, slug: posts.slug, views: posts.views })
			.from(posts)
			.where(and(eq(posts.slug, slug), eq(posts.status, "published")))
			.limit(1)
	)[0];
}

/** 提交 IP 指纹：SHA-256 截断 16 hex（不存明文 IP） */
async function hashIp(req: Request): Promise<string> {
	const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
	return [...new Uint8Array(digest)]
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** 浏览量限频：绑定缺失或调用出错时放行（只影响计数准确性，不能阻断阅读） */
async function overViewLimit(c: Context<{ Bindings: Env }>, postId: number): Promise<boolean> {
	if (!c.env.RATE_LIMITER) return false;
	try {
		const key = `${postId}:${await hashIp(c.req.raw)}`;
		return !(await c.env.RATE_LIMITER.limit({ key })).success;
	} catch (err) {
		console.error("[views] rate limiter error:", err);
		return false;
	}
}

/* ---------- 浏览量自增：原子 +1（draft 404），不缓存 ---------- */
publicApi.post("/posts/:slug/views", async (c) => {
	const slug = c.req.param("slug");
	const post = await findPublishedPost(c.env, slug);
	if (!post) {
		return c.json({ error: "not_found", message: "文章不存在或未发布" }, 404, {
			"Cache-Control": NO_STORE,
		});
	}
	/* 限频：同 IP 对同文章每分钟至多 10 次（wrangler.toml [[ratelimits]]）。
	   超限不报错，直接回当前计数，客户端无感。 */
	if (await overViewLimit(c, post.id)) {
		return c.json({ views: post.views }, 200, { "Cache-Control": NO_STORE });
	}
	const [row] = await db(c.env)
		.update(posts)
		.set({ views: sql`${posts.views} + 1` })
		.where(eq(posts.id, post.id))
		.returning({ views: posts.views });
	return c.json({ views: row.views }, 200, { "Cache-Control": NO_STORE });
});

/* ---------- 评论公开读取：仅 approved，时间正序，不暴露 ip_hash/status ---------- */
publicApi.get("/posts/:slug/comments", async (c) => {
	const slug = c.req.param("slug");
	const post = await findPublishedPost(c.env, slug);
	if (!post) {
		return c.json({ error: "not_found", message: "文章不存在或未发布" }, 404, {
			"Cache-Control": NO_STORE,
		});
	}
	const rows = await db(c.env)
		.select({
			id: comments.id,
			author: comments.author,
			body: comments.body,
			createdAt: comments.createdAt,
		})
		.from(comments)
		.where(and(eq(comments.postId, post.id), eq(comments.status, "approved")))
		.orderBy(asc(comments.createdAt));
	return c.json(rows, 200, { "Cache-Control": CACHE_GET });
});

/* ---------- 评论提交：zod 校验 + 蜜罐 + IP 限频（30s/条）+ 默认 pending ---------- */

const commentInput = z.object({
	author: z.string().trim().min(1, "昵称必填").max(24, "昵称至多 24 字符"),
	body: z.string().trim().min(1, "内容必填").max(500, "内容至多 500 字符"),
	/** 蜜罐：对人类隐藏的字段，机器人填了即丢弃 */
	website: z.string().optional(),
});

publicApi.post("/posts/:slug/comments", async (c) => {
	const slug = c.req.param("slug");
	const post = await findPublishedPost(c.env, slug);
	if (!post) {
		return c.json({ error: "not_found", message: "文章不存在或未发布" }, 404, {
			"Cache-Control": NO_STORE,
		});
	}

	const parsed = commentInput.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json(
			{ error: "validation_error", message: "校验失败", fields: parsed.error.flatten().fieldErrors },
			400,
			{ "Cache-Control": NO_STORE },
		);
	}
	const input = parsed.data;

	/* 蜜罐命中：伪装成功，不落库 */
	if (input.website) {
		return c.json({ ok: true, message: "提交成功，审核通过后会展示" }, 201, {
			"Cache-Control": NO_STORE,
		});
	}

	const ipHash = await hashIp(c.req.raw);

	/* 落库与限频合并为一条带条件的 INSERT，不单独做"先查后插"的预检查：
	   "该 ip_hash 最近 30 秒没有记录"才插入。单条语句在 D1 内原子执行，
	   并发请求不会同时穿过"先查后插"的空隙。
	   changes 为 0 即视为超限。 */
	const ts = new Date().toISOString();
	const cutoff = new Date(Date.now() - 30_000).toISOString();
	const inserted = await c.env.DB.prepare(
		`INSERT INTO comments (post_id, author, body, status, ip_hash, created_at)
		 SELECT ?, ?, ?, 'pending', ?, ?
		 WHERE NOT EXISTS (SELECT 1 FROM comments WHERE ip_hash = ? AND created_at > ?)`,
	)
		.bind(post.id, input.author, input.body, ipHash, ts, ipHash, cutoff)
		.run();
	if (inserted.meta.changes === 0) {
		return c.json(
			{ error: "rate_limited", message: "评论太频繁了，请 30 秒后再试" },
			429,
			{ "Cache-Control": NO_STORE, "Retry-After": "30" },
		);
	}

	return c.json({ ok: true, message: "提交成功，审核通过后会展示" }, 201, {
		"Cache-Control": NO_STORE,
	});
});

export default publicApi;
