/* ============================================================
   图片响应的安全头
   ------------------------------------------------------------
   - 页面与静态资源的安全头（含 CSP）写在 public/_headers：
     静态请求不经过 Worker（wrangler.toml 的 run_worker_first），
     只有 /img/* 由 Worker 生成响应，需要在这里单独加。
   ============================================================ */

/** 仅图片的 CSP：即使对象内容被伪装，也不能在这个源下当脚本或文档执行 */
export const IMAGE_CSP = "default-src 'none'; sandbox";

/** 图片响应的其余安全头 */
export const IMAGE_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": IMAGE_CSP,
};
