/* ============================================================
   前后台 API 客户端共享的纯工具
   - buildQuery：把可选参数拼成查询串（无参数返回空串）
   - firstPayloadMessage：从后端错误响应体里取第一条可读消息
   纯函数、无副作用，供 src/lib/api.js 与 src/admin/api.js 复用
   ============================================================ */

/** 可选参数 → 查询串：null/undefined 的项跳过；返回 "" 或 "?a=1&b=2" */
export function buildQuery(params = {}) {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value != null) search.set(key, String(value));
	}
	const qs = search.toString();
	return qs ? `?${qs}` : "";
}

/**
 * 从错误响应体提取可读消息：
 * - fields 校验表（{ field: [msg, ...] }）取第一条字段错误
 * - 否则取 payload.message
 * 都没有则返回 fallback
 */
export function firstPayloadMessage(payload, fallback = "请求失败") {
	const first = payload?.fields ? Object.values(payload.fields)[0]?.[0] : null;
	return first || payload?.message || fallback;
}
