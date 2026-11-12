/* ============================================================
   后台 admin API 客户端
   - 生产：CF Access 的 CF_Authorization cookie 自动随同域请求携带
   - 本地：读取 localStorage 的开发令牌，以 X-Admin-Token 头发送
     （wrangler dev 未配置 Access 团队域名时的回退路径）
   - 错误解析与查询串拼接复用 src/lib/http.ts（与公开 API 共用）
   ============================================================ */

import { ApiError, buildQuery, firstPayloadMessage } from "../lib/http.ts";
import type { QueryParams } from "../lib/http.ts";

const TOKEN_KEY = "admin:dev-token";

export const getDevToken = (): string => {
	try {
		return localStorage.getItem(TOKEN_KEY) || "";
	} catch {
		return "";
	}
};

export const setDevToken = (t: string): void => {
	try {
		t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* ignore */
	}
};

export interface AdminFetchOptions { method?: string; body?: unknown; }

/** 失败时抛 ApiError（status + payload）。
 *  - 显式传 T（读取类接口）：后端保证有 JSON 响应体，返回 T。
 *  - 不传 T（删除等写操作）：后端可能回 204，返回 null。
 *  不要用「不传 T + 期望拿到对象」的写法——那会被解析成后一个重载并返回 null。 */
export function adminFetch<T>(path: string, options?: AdminFetchOptions): Promise<T>;
export function adminFetch(path: string, options?: AdminFetchOptions): Promise<null>;
export async function adminFetch<T>(path: string, { method = "GET", body }: AdminFetchOptions = {}): Promise<T | null> {
	const headers: Record<string, string> = {};
	if (body !== undefined) headers["Content-Type"] = "application/json; charset=utf-8";
	const token = getDevToken();
	if (token) headers["X-Admin-Token"] = token;

	const res = await fetch(`/api/admin${path}`, {
		method,
		headers,
		credentials: "same-origin",
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (res.status === 401) {
		throw new ApiError(401, null, "未授权：请先通过 Access 验证（或配置本地开发令牌）");
	}
	if (!res.ok && res.status !== 204) {
		let payload: unknown = null;
		try {
			payload = await res.json();
		} catch {
			/* ignore */
		}
		throw new ApiError(res.status, payload, firstPayloadMessage(payload, `请求失败（HTTP ${res.status}）`));
	}
	return res.status === 204 ? null : ((await res.json()) as T);
}

/** 列表类 GET 的查询串（如 ?status=draft）；无参数返回空串 */
export const adminQuery = buildQuery as (params?: QueryParams) => string;
