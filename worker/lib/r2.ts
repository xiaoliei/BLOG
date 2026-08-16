import type { Env } from "../env";

/* ============================================================
   R2 原生绑定客户端（图片存储平台耦合面收敛于此文件）
   ------------------------------------------------------------
   - 直接用 Workers R2 binding（env.IMAGES），不走 S3 协议
   - 换平台 = 替换本文件的 put/get 实现
   - 桶由 wrangler.toml / 后台 Bindings 的 IMAGES 绑定提供
   ============================================================ */

/** 生成不可预测的对象名：日期目录 + 随机 id + 受控扩展名 */
export function makeObjectName(ext: string): string {
	const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
	return `${new Date().toISOString().slice(0, 10)}/${rand}.${ext}`;
}

/** 上传对象；返回对象名 */
export async function r2Put(env: Env, name: string, body: ArrayBuffer, contentType: string) {
	await env.IMAGES.put(name, body, { httpMetadata: { contentType } });
	return name;
}

/** 读取对象；404 返回 null */
export async function r2Get(env: Env, name: string): Promise<R2ObjectBody | null> {
	return env.IMAGES.get(name);
}
