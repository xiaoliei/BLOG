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
	/** 本地开发 admin 令牌（仅本地回退） */
	ADMIN_DEV_TOKEN?: string;
	/** R2 S3 协议密钥（P4） */
	R2_ACCOUNT_ID: string;
	R2_ACCESS_KEY_ID?: string;
	R2_SECRET_ACCESS_KEY?: string;
};
