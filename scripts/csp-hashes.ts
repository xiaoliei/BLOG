/* ============================================================
   构建后处理：把 Vditor「内联执行」的几个文件的内容哈希写进 dist/_headers 的 CSP
   ------------------------------------------------------------
   Vditor 取回下列文件后，以同步 XHR + 内联 <script> 的方式执行：
     - js/icons/*.js          工具栏/界面图标精灵表
     - js/mathjax/*.js        公式渲染库 MathJax
   页面 CSP 不开 unsafe-inline，只能按内容哈希逐一放行；升级 Vditor 后哈希自动跟着变。
   必须在 `vite build` 之后运行（public/_headers 先被复制进 dist，再做替换）；
   所以部署请走 `npm run build` / `npm run deploy`，不要单独执行 `vite build`。
   ============================================================ */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VDITOR_JS = "public/vditor/dist/js";
const HEADERS = "dist/_headers";
const PLACEHOLDER = "'__VDITOR_INLINE_SHA256__'";

const sha256 = (path: string): string =>
	`'sha256-${createHash("sha256").update(readFileSync(path)).digest("base64")}'`;

const icons = readdirSync(join(VDITOR_JS, "icons")).filter((name) => name.endsWith(".js")).map((name) => join(VDITOR_JS, "icons", name));
const mathjax = readdirSync(join(VDITOR_JS, "mathjax")).filter((name) => name.endsWith(".js")).map((name) => join(VDITOR_JS, "mathjax", name));
const files = [...icons, ...mathjax];
if (!files.length) throw new Error("[csp] 未找到 Vditor 脚本，请先运行 npm run build（会先复制 vditor）");

const hashes = files.map(sha256).join(" ");
const source = readFileSync(HEADERS, "utf8");
if (!source.includes(PLACEHOLDER)) {
	/* 已替换过（重复运行）就直接退出；既没有占位符也没有哈希说明模板被改坏 */
	if (source.includes("'sha256-")) process.exit(0);
	throw new Error(`[csp] ${HEADERS} 里没有 ${PLACEHOLDER} 占位符，请检查 public/_headers`);
}
writeFileSync(HEADERS, source.replaceAll(PLACEHOLDER, hashes));
console.log(`[csp] 已放行 ${files.length} 个 Vditor 内联脚本的内容哈希 → ${HEADERS}`);
