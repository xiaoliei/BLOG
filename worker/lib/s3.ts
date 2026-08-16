import { AwsClient } from "aws4fetch";
import type { Env } from "../env";

/* ============================================================
   R2 S3 协议客户端（设计 D7：平台耦合面收敛在此文件）
   ------------------------------------------------------------
   - 用 aws4fetch（SigV4）走 R2 S3 兼容端点，不用原生 binding API
   - 换平台 = 改 endpoint + 密钥
   - 配置全部来自环境变量（本地 .dev.vars，生产后台 Variables and Secrets）：
       R2_ACCOUNT_ID      → 账户 ID（后台 Variables）
       R2_ACCESS_KEY_ID   → S3 密钥（后台 Secrets）
       R2_SECRET_ACCESS_KEY → S3 密钥（后台 Secrets）
   ============================================================ */

/** S3 兼容端点：账户 ID 来自环境变量，桶名与 wrangler.toml 的 R2 绑定保持一致 */
const R2_BASE_URL = (env: Env, name: string) =>
	`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/blog-images/${name}`;

export const R2_ENDPOINT = (env: Env) => R2_BASE_URL(env, "");

let cached: { keyId: string; client: AwsClient } | null = null;

export function s3Client(env: Env): AwsClient {
	const keyId = env.R2_ACCESS_KEY_ID!;
	if (cached && cached.keyId === keyId) return cached.client;
	const client = new AwsClient({
		accessKeyId: keyId,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
	});
	cached = { keyId, client };
	return client;
}

/** 生成不可预测的对象名：日期目录 + 随机 id + 受控扩展名 */
export function makeObjectName(ext: string): string {
	const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
	return `${new Date().toISOString().slice(0, 10)}/${rand}.${ext}`;
}

/** 上传对象（PutObject）；返回对象名 */
export async function s3Put(env: Env, name: string, body: ArrayBuffer, contentType: string) {
	const url = new URL(R2_BASE_URL(env, name));
	const res = await s3Client(env).fetch(url.toString(), {
		method: "PUT",
		body,
		headers: { "Content-Type": contentType },
	});
	if (!res.ok) {
		throw new Error(`s3 put failed: ${res.status}`);
	}
	return name;
}

/** 读取对象（GetObject）；404 返回 null */
export async function s3Get(env: Env, name: string): Promise<Response | null> {
	const url = new URL(R2_BASE_URL(env, name));
	const res = await s3Client(env).fetch(url.toString(), { method: "GET" });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`s3 get failed: ${res.status}`);
	return res;
}
