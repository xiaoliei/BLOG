/* ============================================================
   站点设置默认值（单一来源）
   ------------------------------------------------------------
   消费方：
   1. 前台静态回退（src/lib/api.js getStaticSettings）
   2. Worker `site_settings` 表为空时的内置回退（worker/lib/settings.ts）
   3. seed 脚本首次灌库的初始数据（scripts/seed.mjs）
   ⚠ 保持纯数据：不 import 任何模块、不触碰浏览器/Node API，
   以便 Vite 与 Worker esbuild 都能直接打包。
   运行期以 D1 `site_settings` 表为准，后台「站点设置」页可编辑。
   ============================================================ */

export const DEFAULT_SETTINGS = {
	/* ---------- 站点信息 ---------- */
	name: "小礼工坊",
	tagline: "用代码、文字与像素，记录这个世界的存档点。",
	since: 2019,
	description:
		"前端开发者 / 像素爱好者 / 游戏玩家。这里记录我如何用代码一砖一瓦搭出自己的世界。",
	author: "小礼",
	email: "xiaolimc@foxmail.com",
	github: "https://github.com/xiaoliei",
	/* ---------- 首页区块文案 ---------- */
	latestSub: "按时间倒序，先看最近更新的 6 篇。",
	modulesSub: "八个栏目，八块拼图。点击任意栏目查看其中的文章。",
	/* ---------- 关于我 ---------- */
	aboutTitle: "关于我",
	aboutText:
		"这里是小礼工坊的建造者 小礼。从 2019 年写下第一篇文章开始，我一直在用代码一砖一瓦地搭自己的世界：前端、像素、游戏与设计，所有认真做过的事都会在这里留下记录。",
	/* ---------- 页脚 ---------- */
	footerBrand: "小礼工坊",
	footerTagline: "用代码、文字与像素，记录这个世界的存档点。",
	footerNavTitle: "快速导航",
	footerContactTitle: "联系",
	footerBottom: "© 2026 小礼工坊 · 由 小礼 维护",
};
