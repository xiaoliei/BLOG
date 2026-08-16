/* 把 node_modules/vditor/dist 复制到 public/vditor/dist，
   供编辑器运行时自托管加载（国内访问 unpkg CDN 不可靠），构建前执行。
   注意 Vditor 内部始终在 cdn 后追加 /dist/（i18n/lute/图标/主题等），
   因此文件必须位于 /vditor/dist/...，而不是 /vditor/... */
import { cpSync, existsSync, rmSync } from "node:fs";

const SRC = "node_modules/vditor/dist";
const DEST = "public/vditor/dist";

if (!existsSync(SRC)) {
	console.error("[copy-vditor] 未找到 " + SRC + "，请先 npm install");
	process.exit(1);
}
/* 整体清空 public/vditor，避免历史布局（/vditor/js 等）残留 */
rmSync("public/vditor", { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });
console.log("[copy-vditor] vditor dist → public/vditor/dist 完成");
