import type { Context } from "hono";
import type { Env } from "../env";

/* ============================================================
   边缘缓存失效：admin 写操作后删除对应公开缓存键
   （Cache API；删不掉的组合键接受 ≤60s TTL 自然过期，见设计 D12）
   ============================================================ */

const PUBLIC_ORIGIN_KEYS = [
	"/api/public/modules",
	"/api/public/posts",
	"/api/public/posts?limit=6",
];

export async function purgePostCache(c: Context<{ Bindings: Env }>, slug?: string) {
	const cache = caches.default;
	const url = new URL(c.req.url);
	const origin = `${url.protocol}//${url.host}`;
	const keys = [...PUBLIC_ORIGIN_KEYS];
	if (slug) keys.push(`/api/public/posts/${encodeURIComponent(slug)}`);
	await Promise.allSettled(
		keys.map(async (path) => {
			/* moduleId 组合键无法枚举：模块级变更接受 ≤60s 延迟 */
			const target = new URL(origin + path);
			if (!(await cache.delete(target, { ignoreMethod: true }))) {
				/* 未命中也正常（本地 dev 无边缘缓存） */
			}
		}),
	);
}

/** 评论审核后失效某文章的公开评论缓存 */
export async function purgeCommentsCache(c: Context<{ Bindings: Env }>, slug: string) {
	const cache = caches.default;
	const url = new URL(c.req.url);
	const target = new URL(`${url.protocol}//${url.host}/api/public/posts/${encodeURIComponent(slug)}/comments`);
	await cache.delete(target, { ignoreMethod: true }).catch(() => {});
}
