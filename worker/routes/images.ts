import { Hono } from "hono";
import type { Env } from "../env";
import { makeObjectName, r2Get, r2Put } from "../lib/r2";
import adminApi from "./admin";

/* ============================================================
   图片：/img/* 公开读（immutable 长缓存）+ /api/admin/upload 上传
   读写都经 Worker，保持单一鉴权面；公开路径仅支持读取
   ============================================================ */

const ALLOWED_TYPES: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/** 文件名 → Content-Type（按扩展名兜底） */
const EXT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
};

const images = new Hono<{ Bindings: Env }>();

/* ---------- 公开读：/img/:date/:name（immutable 长缓存） ---------- */
images.get("/img/*", async (c) => {
	const name = c.req.path.replace(/^\/img\//, "");
	if (!/^[\w-]+\/[\w.-]+$/.test(name)) {
		return c.text("bad request", 400);
	}
	/* 目录穿越/枚举防护：只允许受控扩展名 */
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	if (!EXT_TYPES[ext]) return c.text("not found", 404);

	try {
		const obj = await r2Get(c.env, name);
		if (!obj) return c.text("not found", 404, { "Cache-Control": "no-store" });
		return new Response(obj.body, {
			headers: {
				"Content-Type": obj.httpMetadata?.contentType ?? EXT_TYPES[ext],
				"Cache-Control": "public, max-age=31536000, immutable",
				ETag: obj.httpEtag ?? "",
			},
		});
	} catch (err) {
		console.error("[img] fetch error:", err);
		return c.text("unavailable", 502);
	}
});

/* ---------- 上传：POST /api/admin/upload（Access 鉴权，表单 file 字段） ---------- */
adminApi.post("/upload", async (c) => {
	const contentType = c.req.header("Content-Type") ?? "";
	if (!contentType.startsWith("image/")) {
		return c.json(
			{ error: "validation_error", message: "仅支持 jpeg / png / gif / webp 图片" },
			400,
		);
	}
	const ext = ALLOWED_TYPES[contentType];
	if (!ext) {
		return c.json(
			{ error: "validation_error", message: "仅支持 jpeg / png / gif / webp 图片" },
			400,
		);
	}

	const body = await c.req.arrayBuffer();
	if (body.byteLength > MAX_BYTES) {
		return c.json({ error: "payload_too_large", message: "图片至多 5MB" }, 413);
	}
	if (body.byteLength === 0) {
		return c.json({ error: "validation_error", message: "空文件" }, 400);
	}
	if (!c.env.IMAGES) {
		return c.json({ error: "internal_error", message: "图片存储未配置（R2 绑定缺失）" }, 500);
	}

	const name = makeObjectName(ext);
	await r2Put(c.env, name, body, contentType);

	const url = new URL(c.req.url);
	return c.json(
		{
			ok: true,
			url: `${url.protocol}//${url.host}/img/${name}`,
			key: name,
		},
		201,
		{ "Cache-Control": "no-store" },
	);
});

export default images;
