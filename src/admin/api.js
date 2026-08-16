/* ============================================================
   后台 admin API 客户端
   - 生产：CF Access 的 CF_Authorization cookie 自动随同域请求携带
   - 本地：读取 localStorage 的开发令牌，以 X-Admin-Token 头发送
     （wrangler dev 未配置 Access 团队域名时的回退路径）
   ============================================================ */

const TOKEN_KEY = "admin:dev-token";

export const getDevToken = () => {
	try {
		return localStorage.getItem(TOKEN_KEY) || "";
	} catch {
		return "";
	}
};

export const setDevToken = (t) => {
	try {
		t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* ignore */
	}
};

export async function adminFetch(path, { method = "GET", body } = {}) {
	const headers = {};
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
		const err = new Error("未授权：请先通过 Access 验证（或配置本地开发令牌）");
		err.status = 401;
		throw err;
	}
	if (!res.ok && res.status !== 204) {
		let payload = null;
		try {
			payload = await res.json();
		} catch {
			/* ignore */
		}
		const err = new Error(payload?.message || `请求失败（HTTP ${res.status}）`);
		err.status = res.status;
		err.payload = payload;
		throw err;
	}
	return res.status === 204 ? null : res.json();
}
