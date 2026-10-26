import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { modules, posts } from "../../db/schema";
import { purgePostCache } from "../../lib/cache";
import { jsonErr, NO_STORE } from "../../lib/http";
import { moduleInput, modulePatch } from "./schema";
import type { Env } from "../../env";

/* ============================================================
   栏目 CRUD
   ============================================================ */

const modulesApi = new Hono<{ Bindings: Env }>();

modulesApi.get("/modules", async (c) => {
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
	return c.json(rows, 200, { "Cache-Control": NO_STORE });
});

modulesApi.get("/modules/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return jsonErr("无效 id", 400);
	const row = (await db(c.env).select().from(modules).where(eq(modules.id, id)).limit(1))[0];
	if (!row) return jsonErr("栏目不存在", 404);
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

modulesApi.post("/modules", async (c) => {
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
	return c.json(row, 201, { "Cache-Control": NO_STORE });
});

modulesApi.patch("/modules/:id", async (c) => {
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
	return c.json(row, 200, { "Cache-Control": NO_STORE });
});

/* 删除：非空栏目 409 + 迁移提示 */
modulesApi.delete("/modules/:id", async (c) => {
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

export default modulesApi;
