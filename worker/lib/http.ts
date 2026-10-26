/* ============================================================
   通用 HTTP 响应 helper 与常量（admin/public 路由共用）
   ------------------------------------------------------------
   - jsonErr：校验类错误的统一 JSON 错误响应（no-store）
   - NO_STORE / CACHE_GET：Cache-Control 头常量
   - now()：UTC ISO 时间戳；SLUG_RE：slug 格式约束
   ============================================================ */

/** Cache-Control：禁止缓存（错误响应、写操作响应） */
export const NO_STORE = "no-store";

/** Cache-Control：公开 GET（CF 边缘缓存 60s，见设计 D12） */
export const CACHE_GET = "public, max-age=0, s-maxage=60";

/** 当前时间，UTC ISO 8601 字符串（用于 createdAt/updatedAt） */
export const now = () => new Date().toISOString();

/** slug 格式：小写字母、数字与中划线 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 统一错误响应：`{ error: "validation_error", message, ...extra }`，
 * Content-Type 固定、Cache-Control: no-store
 */
export const jsonErr = (
	message: string,
	status: 400 | 404 | 409 | 422,
	extra: object = {},
) =>
	new Response(JSON.stringify({ error: "validation_error", message, ...extra }), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": NO_STORE,
		},
	});
