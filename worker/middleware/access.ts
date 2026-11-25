import type { Context, Next } from "hono";
import type { Env } from "../env";

/* ============================================================
   Cloudflare Access JWT 鉴权中间件（平台耦合面收敛于此文件）
   ------------------------------------------------------------
   - 凭证来源：Cf-Access-Jwt-Assertion 头（程序调用）或
     CF_Authorization cookie（同域浏览器请求）
   - 用团队域名 JWKS 公钥验签（RS256），校验 iss/aud/exp
   - 本地开发：显式配置 ADMIN_AUTH_MODE=dev-token 时，回退 X-Admin-Token
     （ADMIN_DEV_TOKEN）；不配置则一律 401，避免生产漏配 Access 时静默放开。
     注意：该模式一旦开启就只认开发令牌，即使 Access 变量齐全也不会走 Access 鉴权，
     所以生产环境绝不能配置它
   - 跨站防护：浏览器发起的写请求必须同源（CSRF）
   - 无效 → 401 / 403，不执行任何后续数据变更
   ============================================================ */

type JWKS = { keys: Array<{ kid: string; kty: string; alg?: string } & Record<string, unknown>> };

const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_FORCE_MIN_INTERVAL_MS = 60 * 1000;
let jwksForcedAt = 0;
let jwksCache: { url: string; keys: Map<string, JsonWebKey>; at: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
	const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
	const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

async function fetchJwks(teamDomain: string, force = false): Promise<Map<string, JsonWebKey>> {
	const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
	const cached = jwksCache && jwksCache.url === url ? jwksCache : null;
	if (cached && !force && Date.now() - cached.at < JWKS_TTL_MS) {
		return cached.keys;
	}
	/* 强制刷新有最小间隔：未知 kid 可能来自任何未鉴权请求，不节流的话
	   每个带随机 kid 的垃圾请求都能让 Worker 出网一次。节流窗口内直接用现有公钥判定。 */
	const now = Date.now();
	if (force && now - jwksForcedAt < JWKS_FORCE_MIN_INTERVAL_MS) {
		return cached ? cached.keys : new Map<string, JsonWebKey>();
	}
	if (force) jwksForcedAt = now;
	try {
		const res = await fetch(url, { cf: { cacheTtl: 3600 } } as RequestInit);
		if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
		const data = (await res.json()) as JWKS;
		if (!Array.isArray(data?.keys)) throw new Error("jwks malformed");
		const keys = new Map<string, JsonWebKey>();
		for (const k of data.keys) {
			if (k.kid) keys.set(k.kid, k as unknown as JsonWebKey);
		}
		jwksCache = { url, keys, at: Date.now() };
		return keys;
	} catch (err) {
		/* 拉取失败时退回旧公钥集（哪怕已过 TTL），避免证书端点抖动把后台整体打成 401 */
		if (cached) {
			console.error("[access] jwks refresh failed, using cached keys:", err);
			return cached.keys;
		}
		throw err;
	}
}

/** RS256 验签 + 标准声明校验；失败返回 false */
async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<boolean> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return false;
		const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as {
			alg?: string;
			kid?: string;
		};
		if (header.alg !== "RS256" || !header.kid) return false;

		let keys = await fetchJwks(teamDomain);
		let jwk = keys.get(header.kid);
		/* 未知 kid：Cloudflare 轮换了签名密钥，绕过缓存刷新（fetchJwks 内部有 60 秒节流） */
		if (!jwk) {
			keys = await fetchJwks(teamDomain, true);
			jwk = keys.get(header.kid);
		}
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

		const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as {
			exp?: number;
			iss?: string;
			aud?: string | string[];
			sub?: unknown;
		};
		const now = Math.floor(Date.now() / 1000);
		const issOk = payload.iss === `https://${teamDomain}.cloudflareaccess.com`;
		const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
		return typeof payload.exp === "number" && payload.exp > now && issOk && audOk && typeof payload.sub === "string";
	} catch (err) {
		/* 解析/验签过程中的异常（base64、JSON 不合法等）来自畸形令牌，属预期内的 401，只记 warn；
		   JWKS 拉取失败的 error 日志在 fetchJwks 里单独记录。 */
		console.warn("[access] token rejected:", err);
		return false;
	}
}

/** 定长比较，避免逐字节比较泄露令牌前缀 */
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
	const a = new TextEncoder().encode(presented);
	const b = new TextEncoder().encode(expected);
	if (a.length !== b.length) return false;
	return crypto.subtle.timingSafeEqual(a, b);
}

/** 跨站请求判定：浏览器写请求必须同源。
 *  纯程序调用不带 Origin / Sec-Fetch-Site（例如脚本带 Cf-Access-Jwt-Assertion 头），
 *  它们本来就不依赖 cookie，不构成 CSRF，放行。 */
function isCrossSite(c: Context<{ Bindings: Env }>): boolean {
	const fetchSite = c.req.header("Sec-Fetch-Site");
	if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none";
	const origin = c.req.header("Origin");
	if (!origin) return false;
	try {
		return new URL(origin).host !== new URL(c.req.url).host;
	} catch {
		return true;
	}
}

/** /api/admin/* 全挂此中间件 */
export async function requireAccess(c: Context<{ Bindings: Env }>, next: Next) {
	const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, ADMIN_AUTH_MODE: authMode, ADMIN_DEV_TOKEN: devToken } = c.env;

	const method = c.req.method.toUpperCase();
	if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && isCrossSite(c)) {
		return c.json({ error: "csrf_rejected", message: "跨站请求已被拒绝" }, 403, { "Cache-Control": "no-store" });
	}

	/* 本地开发回退：必须显式声明 ADMIN_AUTH_MODE=dev-token，否则即使配了令牌也一律 401 */
	if (authMode === "dev-token") {
		if (devToken && (await tokenMatches(c.req.header("X-Admin-Token") ?? "", devToken))) return next();
		return c.json(
			{ error: "unauthorized", message: "本地开发请在 .dev.vars 配置 ADMIN_AUTH_MODE=dev-token 与 ADMIN_DEV_TOKEN，并携带 X-Admin-Token 头" },
			401,
			{ "Cache-Control": "no-store" },
		);
	}

	if (!team || !aud) {
		console.error("[access] ACCESS_TEAM_DOMAIN / ACCESS_AUD 未配置，且未声明 ADMIN_AUTH_MODE=dev-token");
		return c.json({ error: "unauthorized", message: "管理接口鉴权未配置" }, 401, { "Cache-Control": "no-store" });
	}

	const token =
		c.req.header("Cf-Access-Jwt-Assertion") ||
		getCookie(c.req.raw, "CF_Authorization");
	if (!token) {
		return c.json({ error: "unauthorized" }, 401, { "Cache-Control": "no-store" });
	}

	if (!(await verifyAccessJwt(token, team, aud))) {
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
