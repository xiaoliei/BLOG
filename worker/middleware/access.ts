import type { Context, Next } from "hono";
import type { Env } from "../env";

/* ============================================================
   Cloudflare Access JWT 鉴权中间件（平台耦合面收敛于此文件）
   ------------------------------------------------------------
   - 凭证来源：Cf-Access-Jwt-Assertion 头（程序调用）或
     CF_Authorization cookie（同域浏览器请求）
   - 用团队域名 JWKS 公钥验签（RS256），校验 iss/aud/exp
   - 本地开发：未配置团队域名时回退 X-Admin-Token（ADMIN_DEV_TOKEN）
   - 无效 → 401，不执行任何后续数据变更
   ============================================================ */

type JWKS = { keys: Array<{ kid: string; kty: string; alg?: string } & Record<string, unknown>> };

const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache: { url: string; keys: Map<string, JsonWebKey>; at: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
	const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
	const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

async function fetchJwks(teamDomain: string): Promise<Map<string, JsonWebKey>> {
	const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
	if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < JWKS_TTL_MS) {
		return jwksCache.keys;
	}
	const res = await fetch(url, { cf: { cacheTtl: 3600 } } as RequestInit);
	if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
	const data = (await res.json()) as JWKS;
	const keys = new Map<string, JsonWebKey>();
	for (const k of data.keys ?? []) {
		if (k.kid) keys.set(k.kid, k as unknown as JsonWebKey);
	}
	jwksCache = { url, keys, at: Date.now() };
	return keys;
}

/** RS256 验签 + 标准声明校验；失败返回 null */
async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<boolean> {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
	if (header.alg !== "RS256" || !header.kid) return false;

	const keys = await fetchJwks(teamDomain);
	const jwk = keys.get(header.kid);
	if (!jwk) return false;

	const cryptoKey = await crypto.subtle.importKey(
		"jwk",
		jwk,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["verify"],
	);
	const ok = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		b64urlToBytes(parts[2]),
		new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
	);
	if (!ok) return false;

	const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
	const now = Math.floor(Date.now() / 1000);
	const issOk = payload.iss === `https://${teamDomain}.cloudflareaccess.com`;
	const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
	return payload.exp > now && issOk && audOk && typeof payload.sub === "string";
}

/** /api/admin/* 全挂此中间件 */
export async function requireAccess(c: Context<{ Bindings: Env }>, next: Next) {
	const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, ADMIN_DEV_TOKEN: devToken } = c.env;

	/* 本地开发回退：未配置 Access 团队域名时用共享令牌（仅限本地） */
	if (!team || !aud) {
		if (devToken && c.req.header("X-Admin-Token") === devToken) return next();
		return c.json(
			{ error: "unauthorized", message: "本地开发请在 .dev.vars 配置 ADMIN_DEV_TOKEN 并携带 X-Admin-Token 头" },
			401,
			{ "Cache-Control": "no-store" },
		);
	}

	const token =
		c.req.header("Cf-Access-Jwt-Assertion") ||
		getCookie(c.req.raw, "CF_Authorization");
	if (!token) {
		return c.json({ error: "unauthorized" }, 401, { "Cache-Control": "no-store" });
	}

	try {
		const ok = await verifyAccessJwt(token, team, aud);
		if (!ok) {
			return c.json({ error: "unauthorized" }, 401, { "Cache-Control": "no-store" });
		}
	} catch (err) {
		console.error("[access] verify error:", err);
		return c.json({ error: "unauthorized" }, 401, { "Cache-Control": "no-store" });
	}

	return next();
}

function getCookie(req: Request, name: string): string | null {
	const raw = req.headers.get("Cookie");
	if (!raw) return null;
	for (const part of raw.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return decodeURIComponent(v.join("="));
	}
	return null;
}
