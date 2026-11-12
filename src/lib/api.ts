/* ============================================================
   前台 API 层：public-content-api 客户端 + SWR 缓存
   ------------------------------------------------------------
   - getPosts / getPost：前台唯一数据入口
   - SWR：内存 + localStorage 双层缓存，TTL 5 分钟
     （命中新鲜缓存直接返回；过期则先返回旧值并后台刷新）
   - fetch 失败自动重试（最多 2 次，递增退避）
   - resolveDataSource：blog.ts 静态数据的 feature flag 回退开关
     localStorage.setItem("blog:data-source", "static") 可即时切回
   ============================================================ */

import { ALL_POSTS, MODULES } from "../config/blog.ts";
import type { StaticPost } from "../config/blog.ts";
import { DEFAULT_SETTINGS } from "../config/site-settings.ts";
import { buildQuery, firstPayloadMessage } from "./http.ts";
import type { ErrorPayload, QueryParams } from "./http.ts";
import type { PostListItem as ApiPostListItem, PostDetail, PublicComment, SiteSettingsWithMeta } from "../types/api.ts";

const API_BASE = "/api/public";
const TTL_MS = 5 * 60 * 1000;
const LS_PREFIX = "swr:";

/* ---------- SWR 缓存 ---------- */

interface CacheEntry<T = unknown> { data: T; at: number; }

const memo = new Map<string, CacheEntry>();

function readLS(key: string): CacheEntry | null {
	try {
		const raw = localStorage.getItem(LS_PREFIX + key);
		if (!raw) return null;
		const entry: unknown = JSON.parse(raw);
		if (!entry || typeof entry !== 'object' || !Number.isFinite((entry as CacheEntry).at)) return null;
		return entry as CacheEntry;
	} catch {
		return null;
	}
}

function writeLS(key: string, entry: CacheEntry): void {
	try {
		localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
	} catch {
		/* 隐私模式/配额：忽略 */
	}
}

function cache<T>(key: string, data: T): T {
	const entry: CacheEntry<T> = { data, at: Date.now() };
	memo.set(key, entry as CacheEntry);
	writeLS(key, entry as CacheEntry);
	return data;
}

/** stale-while-revalidate：新鲜直接返回；过期先给旧值再后台刷新；无缓存则联网 */
export function swr<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
	const entry = memo.get(key) ?? readLS(key);
	if (entry) {
		if (Date.now() - entry.at < TTL_MS) return Promise.resolve(entry.data as T);
		fetcher()
			.then((data) => cache(key, data))
			.catch(() => {});
		return Promise.resolve(entry.data as T);
	}
	return fetcher().then((data) => cache(key, data));
}

/** 失败重试的 JSON fetch */
async function fetchJSON<T>(path: string, { retries = 2 }: { retries?: number } = {}): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const res = await fetch(API_BASE + path);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json() as T;
		} catch (err) {
			lastErr = err;
			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
			}
		}
	}
	throw lastErr;
}

/* ---------- 数据源开关（feature flag 回退） ---------- */

export type DataSource = "static" | "api";

export function resolveDataSource(): DataSource {
	try {
		const v = localStorage.getItem("blog:data-source");
		if (v === "static" || v === "api") return v;
	} catch {
		/* ignore */
	}
	return import.meta.env?.VITE_BLOG_DATA_SOURCE === "static"
		? "static"
		: "api";
}

/* ---------- 静态回退数据（blog.ts，与 API 同构） ---------- */

export type { StaticPost };

/* 静态回退的摘要行：内置快照只有摘要字段，既没有数据库行 id，
 *  也没有正文，因此刻意不带 id/moduleId/slug/views 这些只对真实文章成立的字段。
 *  key 用「栏目/日期/标题」派生（内置快照里这三项组合唯一），
 *  不能用数组下标——同一篇文章在不同 moduleId 筛选下会拿到不同下标，
 *  React key 就会在筛选切换时错位。 */
export interface StaticPostItem {
	key: string;
	moduleSlug: string;
	moduleTitle: string;
	moduleAccent: string;
	moduleAccentDark: string;
	title: string;
	date: string;
	tags: string[];
	readTime: number;
	excerpt: string;
}

function withModuleMeta(post: StaticPost): StaticPostItem {
	const m = MODULES.find((mod) => mod.id === post.moduleId);
	return {
		key: `${post.moduleId}/${post.date}/${post.title}`,
		moduleSlug: post.moduleId,
		moduleTitle: m ? m.title : post.moduleId,
		moduleAccent: m ? m.accent : "",
		moduleAccentDark: m ? m.accentDark : "",
		title: post.title,
		date: post.date,
		tags: post.tags,
		readTime: post.readTime,
		excerpt: post.excerpt,
	};
}

export function getStaticPosts({ moduleId }: { moduleId?: string } = {}): StaticPostItem[] {
	const list = moduleId ? ALL_POSTS.filter((p) => p.moduleId === moduleId) : ALL_POSTS;
	return list.map(withModuleMeta);
}

/* ---------- 站点设置 ---------- */

export function getStaticSettings(): SiteSettingsWithMeta {
	return DEFAULT_SETTINGS;
}

export function getSettings(): Promise<SiteSettingsWithMeta> {
	if (resolveDataSource() === "static") return Promise.resolve(DEFAULT_SETTINGS);
	return swr("settings", () => fetchJSON<SiteSettingsWithMeta>("/settings"));
}

/* ---------- 公开 API 封装 ---------- */

/** 地点面板消费的列表行：API 行带正文入口，静态行只有摘要。
 *  两种来源的判别契约是「静态行没有 slug 键」，见 scripts/api.test.ts。
 *  后台栏目管理走 adminFetch，不经过这里（内置快照的栏目 id 是字符串 slug，
 *  与线上自增整数不同型，因此这里不提供 getModules）。 */
export type PostListItem = ApiPostListItem | StaticPostItem;

export function getPosts({ moduleId, limit }: { moduleId?: string; limit?: number } = {}): Promise<PostListItem[]> {
	if (resolveDataSource() === "static") {
		let list = getStaticPosts({ moduleId });
		if (limit != null) list = list.slice(0, limit);
		return Promise.resolve(list);
	}
	const qs = buildQuery({ moduleId, limit } satisfies QueryParams); // "" 或 "?moduleId=…&limit=…"
	return swr(`posts:${qs}`, () => fetchJSON<ApiPostListItem[]>(`/posts${qs}`));
}

export function getPost(slug: string): Promise<PostDetail | null> {
	/* 静态数据无正文：交给调用方展示摘要回退 */
	if (resolveDataSource() === "static") return Promise.resolve(null);
	return swr(`post:${slug}`, () =>
		fetchJSON<PostDetail>(`/posts/${encodeURIComponent(slug)}`),
	);
}

/* ---------- 互动（浏览量 / 评论）：直连，不走 SWR ---------- */

/** 浏览计数提交：同一文章 60s 内不重复提交（sessionStorage 标记） */
export async function submitViewOnce(slug: string, { windowMs = 60_000 }: { windowMs?: number } = {}): Promise<number | null> {
	if (resolveDataSource() === "static") return null;
	const key = `viewed:${slug}`;
	try {
		const at = Number(sessionStorage.getItem(key));
		if (Number.isFinite(at) && Date.now() - at < windowMs) return null;
	} catch {
		/* ignore */
	}
	const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(slug)}/views`, {
		method: "POST",
	});
	if (!res.ok) return null;
	try {
		sessionStorage.setItem(key, String(Date.now()));
	} catch {
		/* ignore */
	}
	return (await res.json() as { views?: number }).views ?? null;
}

/** 已放行评论列表（时间正序） */
export async function getComments(slug: string): Promise<PublicComment[]> {
	return fetchJSON<PublicComment[]>(`/posts/${encodeURIComponent(slug)}/comments`);
}

export interface CommentInput { author: string; body: string; website?: string; }

/** 提交评论（昵称 + 内容 + 蜜罐字段）；成功返回 true */
export async function submitComment(slug: string, { author, body, website = "" }: CommentInput): Promise<boolean> {
	const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(slug)}/comments`, {
		method: "POST",
		headers: { "Content-Type": "application/json; charset=utf-8" },
		body: JSON.stringify({ author, body, website }),
	});
	const payload: ErrorPayload | object = await res.json().catch(() => ({}));
	if (res.status === 429) throw new Error((payload as ErrorPayload).message || "评论太频繁，请稍后再试");
	if (!res.ok) {
		/* fields 校验表（{ field: [msg, ...] }）取第一条字段错误，其次 message */
		throw new Error(firstPayloadMessage(payload, "提交失败，请稍后再试"));
	}
	return true;
}
