/* ============================================================
   前后台 API 客户端共享的纯工具
   - buildQuery：把可选参数拼成查询串（无参数返回空串）
   - firstPayloadMessage：从后端错误响应体里取第一条可读消息
   - ApiError：带 status / payload 的 fetch 错误
   纯函数、无副作用，供 src/lib/api.ts 与 src/admin/api.ts 复用
   ============================================================ */

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** 可选参数 → 查询串：null/undefined 的项跳过；返回 "" 或 "?a=1&b=2" */
export function buildQuery(params: QueryParams = {}): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value != null) search.set(key, String(value));
	}
	const qs = search.toString();
	return qs ? `?${qs}` : "";
}

/** 后端错误响应体：{ error, message, fields?: { field: [msg, ...] }, field? } */
export interface ErrorPayload {
	error?: string;
	message?: string;
	fields?: Record<string, string[]>;
	field?: string;
}

/** fetch 失败时抛出：err.status 为 HTTP 状态码，err.payload 为解析后的响应体 */
export class ApiError extends Error {
	status: number;
	payload: unknown;
	constructor(status: number, payload: unknown, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.payload = payload;
	}
	/** 错误体里的字段校验表（若有）。 */
	get fields(): Record<string, string[]> | undefined {
		const p = this.payload as ErrorPayload | undefined;
		return p && typeof p === 'object' ? p.fields : undefined;
	}
}

/**
 * 从错误响应体提取可读消息：
 * - fields 校验表（{ field: [msg, ...] }）取第一条字段错误
 * - 否则取 payload.message
 * 都没有则返回 fallback
 */
export function firstPayloadMessage(payload: unknown, fallback = "请求失败"): string {
	const p = payload as ErrorPayload | undefined;
	const first = p?.fields ? Object.values(p.fields)[0]?.[0] : null;
	return first || (typeof p?.message === 'string' ? p.message : null) || fallback;
}
