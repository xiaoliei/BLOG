import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { siteSettings } from "../../db/schema";
import { purgeSettingsCache } from "../../lib/cache";
import { settingsFromRow, settingsValues } from "../../lib/settings";
import { jsonErr, NO_STORE, now } from "../../lib/http";
import { settingsPatch } from "./schema";
import type { Env } from "../../env";

/* ============================================================
   站点设置：单行读取 + 部分更新（首次更新自动建行，写后失效缓存）
   ============================================================ */

const settingsApi = new Hono<{ Bindings: Env }>();

settingsApi.get("/settings", async (c) => {
	const row = (
		await db(c.env)
			.select()
			.from(siteSettings)
			.where(eq(siteSettings.id, 1))
			.limit(1)
	)[0];
	return c.json(settingsFromRow(row), 200, { "Cache-Control": NO_STORE });
});

settingsApi.patch("/settings", async (c) => {
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
	return c.json(settingsFromRow(row), 200, { "Cache-Control": NO_STORE });
});

export default settingsApi;
