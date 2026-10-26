import { z } from "zod";
import { SLUG_RE } from "../../lib/http";

/* ============================================================
   /api/admin/* 请求体 zod 校验 schema（posts / modules / comments / settings）
   ============================================================ */

/* ---------- 文章 ---------- */

export const postInput = z.object({
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

export const postPatch = postInput.partial().extend({
	moduleId: z.number().int().positive().optional(),
});

/* ---------- 栏目 ---------- */

export const moduleInput = z.object({
	slug: z.string().trim().min(1).max(60).regex(SLUG_RE, "slug 只能包含小写字母、数字与中划线"),
	title: z.string().trim().min(1, "标题必填").max(60),
	accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
	accentDark: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
	icon: z.string().trim().max(30).optional(),
	blurb: z.string().max(200).optional(),
	sort: z.number().int().min(0).optional(),
});

export const modulePatch = moduleInput.partial();

/* ---------- 评论审核 ---------- */

/** 审核 action：approve / reject */
export const reviewAction = z.object({ action: z.enum(["approve", "reject"]) });

/* ---------- 站点设置（部分更新，缺失字段取默认值） ---------- */

export const settingsPatch = z
	.object({
		name: z.string().trim().min(1, "站名必填").max(60),
		tagline: z.string().trim().max(120),
		islandName: z.string().trim().min(1, "岛屿名必填").max(30),
		islandTagline: z.string().trim().max(60),
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
