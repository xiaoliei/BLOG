/* 把 node_modules/vditor/dist 复制到 public/vditor，
   供编辑器运行时自托管加载（国内访问 unpkg CDN 不可靠），构建前执行 */
import { cpSync, existsSync, rmSync } from "node:fs";

const SRC = "node_modules/vditor/dist";
const DEST = "public/vditor";

if (!existsSync(SRC)) {
	console.error("[copy-vditor] 未找到 " + SRC + "，请先 npm install");
	process.exit(1);
}
rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });
console.log("[copy-vditor] vditor dist → public/vditor 完成");
