import type { SiteSettingsRow } from "../db/schema";
import { DEFAULT_SETTINGS } from "../../src/config/site-settings.js";

/* ============================================================
   站点设置：行 <-> 公开 JSON 映射 + 默认值兜底
   - 表为空时公开/后台读取均回退 DEFAULT_SETTINGS（单一来源）
   - 后台 PATCH 部分更新：缺失字段取默认值后落库
   ============================================================ */

export type SiteSettings = typeof DEFAULT_SETTINGS;

export interface SiteSettingsWithMeta extends SiteSettings {
	updatedAt?: string;
}

/** 行（可能不存在）→ 公开 JSON；表为空时回退默认值 */
export function settingsFromRow(row?: SiteSettingsRow): SiteSettingsWithMeta {
	if (!row) return { ...DEFAULT_SETTINGS };
	return {
		name: row.name,
		tagline: row.tagline,
		since: row.since,
		description: row.description,
		author: row.author,
		email: row.email,
		github: row.github,
		latestSub: row.latestSub,
		modulesSub: row.modulesSub,
		aboutTitle: row.aboutTitle,
		aboutText: row.aboutText,
		footerBrand: row.footerBrand,
		footerTagline: row.footerTagline,
		footerNavTitle: row.footerNavTitle,
		footerContactTitle: row.footerContactTitle,
		footerBottom: row.footerBottom,
		updatedAt: row.updatedAt,
	};
}

/** 后台 PATCH 的部分输入 → 完整行值（缺失字段取默认值） */
export function settingsValues(input: Partial<SiteSettings>): SiteSettings {
	return {
		name: input.name ?? DEFAULT_SETTINGS.name,
		tagline: input.tagline ?? DEFAULT_SETTINGS.tagline,
		since: input.since ?? DEFAULT_SETTINGS.since,
		description: input.description ?? DEFAULT_SETTINGS.description,
		author: input.author ?? DEFAULT_SETTINGS.author,
		email: input.email ?? DEFAULT_SETTINGS.email,
		github: input.github ?? DEFAULT_SETTINGS.github,
		latestSub: input.latestSub ?? DEFAULT_SETTINGS.latestSub,
		modulesSub: input.modulesSub ?? DEFAULT_SETTINGS.modulesSub,
		aboutTitle: input.aboutTitle ?? DEFAULT_SETTINGS.aboutTitle,
		aboutText: input.aboutText ?? DEFAULT_SETTINGS.aboutText,
		footerBrand: input.footerBrand ?? DEFAULT_SETTINGS.footerBrand,
		footerTagline: input.footerTagline ?? DEFAULT_SETTINGS.footerTagline,
		footerNavTitle: input.footerNavTitle ?? DEFAULT_SETTINGS.footerNavTitle,
		footerContactTitle: input.footerContactTitle ?? DEFAULT_SETTINGS.footerContactTitle,
		footerBottom: input.footerBottom ?? DEFAULT_SETTINGS.footerBottom,
	};
}
