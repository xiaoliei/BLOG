/* ============================================================
   前台 API 层：public-content-api 客户端 + SWR 缓存
   ------------------------------------------------------------
   - getModules / getPosts / getPost：唯一数据入口
   - SWR：内存 + localStorage 双层缓存，TTL 5 分钟
     （命中新鲜缓存直接返回；过期则先返回旧值并后台刷新）
   - fetch 失败自动重试（最多 2 次，递增退避）
   - resolveDataSource：blog.js 静态数据的 feature flag 回退开关
     localStorage.setItem("blog:data-source", "static") 可即时切回
   ============================================================ */

import { ALL_POSTS, MODULES } from "../config/blog.js";

const API_BASE = "/api/public";
const TTL_MS = 5 * 60 * 1000;
const LS_PREFIX = "swr:";

/* ---------- SWR 缓存 ---------- */

const memo = new Map(); // key -> { data, at }

function readLS(key) {
	try {
		const raw = localStorage.getItem(LS_PREFIX + key);
		if (!raw) return null;
		const entry = JSON.parse(raw);
		if (!entry || !Number.isFinite(entry.at)) return null;
		return entry;
	} catch {
		return null;
	}
}

function writeLS(key, entry) {
	try {
		localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
	} catch {
		/* 隐私模式/配额：忽略 */
	}
}

function cache(key, data) {
	const entry = { data, at: Date.now() };
	memo.set(key, entry);
	writeLS(key, entry);
	return data;
}

/** stale-while-revalidate：新鲜直接返回；过期先给旧值再后台刷新；无缓存则联网 */
export function swr(key, fetcher) {
	const entry = memo.get(key) ?? readLS(key);
	if (entry) {
		if (Date.now() - entry.at < TTL_MS) return Promise.resolve(entry.data);
		fetcher()
			.then((data) => cache(key, data))
			.catch(() => {});
		return Promise.resolve(entry.data);
	}
	return fetcher().then((data) => cache(key, data));
}

/** 失败重试的 JSON fetch */
async function fetchJSON(path, { retries = 2 } = {}) {
	let lastErr;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const res = await fetch(API_BASE + path);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
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

export function resolveDataSource() {
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

/* ---------- 静态回退数据（blog.js，与 API 同构） ---------- */

export function getStaticModules() {
	return MODULES.map((m, i) => ({
		id: m.id,
		slug: m.id,
		title: m.title,
		accent: m.accent,
		accentDark: m.accentDark,
		icon: m.icon,
		blurb: m.blurb,
		sort: i,
		postCount: m.posts.length,
	}));
}

function withModuleMeta(post) {
	const m = MODULES.find((mod) => mod.id === post.moduleId);
	return {
		...post,
		moduleSlug: m?.id,
		moduleTitle: m?.title,
		moduleAccent: m?.accent,
		moduleAccentDark: m?.accentDark,
	};
}

export function getStaticPosts({ moduleId } = {}) {
	let list = ALL_POSTS;
	if (moduleId) list = list.filter((p) => p.moduleId === moduleId);
	return list.map(withModuleMeta);
}

/* ---------- 公开 API 封装 ---------- */

export function getModules() {
	if (resolveDataSource() === "static") {
		return Promise.resolve(getStaticModules());
	}
	return swr("modules", () => fetchJSON("/modules"));
}

export function getPosts({ moduleId, limit } = {}) {
	if (resolveDataSource() === "static") {
		let list = getStaticPosts({ moduleId });
		if (limit != null) list = list.slice(0, limit);
		return Promise.resolve(list);
	}
	const params = new URLSearchParams();
	if (moduleId != null) params.set("moduleId", String(moduleId));
	if (limit != null) params.set("limit", String(limit));
	const qs = params.toString();
	return swr(`posts:${qs}`, () => fetchJSON(`/posts${qs ? `?${qs}` : ""}`));
}

export function getPost(slug) {
	/* 静态数据无正文：交给调用方展示摘要回退 */
	if (resolveDataSource() === "static") return Promise.resolve(null);
	return swr(`post:${slug}`, () =>
		fetchJSON(`/posts/${encodeURIComponent(slug)}`),
	);
}
