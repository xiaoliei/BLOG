/// <reference types="@cloudflare/workers-types" />

export type Env = {
	/** D1 数据库 */
	DB: D1Database;
	/** 静态资产（dist/） */
	ASSETS: Fetcher;
	/** R2 图片桶（P4） */
	IMAGES: R2Bucket;
	/** Cloudflare Access 团队域名（如 "xiaoli"） */
	ACCESS_TEAM_DOMAIN: string;
	/** Access 应用 AUD */
	ACCESS_AUD: string;
	/** 本地开发 admin 令牌（仅 ADMIN_AUTH_MODE=dev-token 时生效） */
	ADMIN_DEV_TOKEN?: string;
	/** 鉴权模式：显式设为 "dev-token" 才允许本地令牌回退；缺省走 Cloudflare Access。
	 *  开启后只认开发令牌、不再走 Access 鉴权，生产环境不要配置。 */
	ADMIN_AUTH_MODE?: string;
	/** 浏览量限频（wrangler.toml [[ratelimits]]；未绑定时跳过限频） */
	RATE_LIMITER?: RateLimit;
};
