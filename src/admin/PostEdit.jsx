import { useCallback, useEffect, useRef, useState } from "react";
import "vditor/dist/index.css";
import { adminFetch } from "./api.js";
import { localDate } from "../lib/local-time.js";
import { useFlash } from "../hooks/useFlash.js";
import { Button } from "./components/Button.jsx";
import { HintText, StatusTag, Toasts } from "./components/Feedback.jsx";
import PostFormFields from "./components/PostFormFields.jsx";
import VditorEditor from "./components/VditorEditor.jsx";

/* ============================================================
   文章编辑页：表单 + Vditor（动态 import，仅 admin chunk）
   - 新建：initial = {}；编辑：initial = { id }
   - 保存草稿 / 发布 / 下架；失败时表单与编辑器内容保持不丢
   ============================================================ */

const EMPTY_FORM = {
	title: "",
	slug: "",
	moduleId: "",
	date: "",
	tags: "",
	readTime: 3,
	excerpt: "",
	bodyMd: "",
};

export default function PostEdit({ initial, onBack, guard }) {
	const isNew = initial.id == null;
	const [form, setForm] = useState(() => ({ ...EMPTY_FORM, date: localDate() }));
	const [status, setStatus] = useState("draft"); // 当前文章状态（编辑已有文章时加载）
	const [modules, setModules] = useState([]);
	const [saving, setSaving] = useState(false);
	const [notFound, setNotFound] = useState(false);
	const { toast, flash } = useFlash();

	const editorApi = useRef(null); // VditorEditor 暴露的 getValue/insertValue
	const savedIdRef = useRef(initial.id ?? null);

	/* 加载栏目 + 已有文章 */
	useEffect(() => {
		guard(() => adminFetch("/modules"))
			.then(setModules)
			.catch((e) => flash("err", e.message));
		if (isNew) return;

		guard(() => adminFetch(`/posts/${initial.id}`))
			.then((post) => {
				savedIdRef.current = post.id;
				setStatus(post.status);
				setForm({
					title: post.title,
					slug: post.slug,
					moduleId: String(post.moduleId),
					date: post.date,
					tags: (post.tags ?? []).join(", "),
					readTime: post.readTime,
					excerpt: post.excerpt ?? "",
					bodyMd: post.bodyMd ?? "",
				});
				editorApi.current?.onReady?.((vd) => vd.setValue(post.bodyMd ?? ""));
			})
			.catch((e) => {
				setNotFound(true);
				flash("err", e.message);
			});
	}, [isNew, initial.id, guard, flash]);

	const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

	/** 读取当前表单（编辑器内容实时取自 Vditor 实例） */
	const collect = useCallback(() => {
		const bodyMd = editorApi.current ? (editorApi.current.getValue() ?? form.bodyMd) : form.bodyMd;
		return {
			title: form.title.trim(),
			slug: form.slug.trim(),
			moduleId: Number(form.moduleId),
			date: form.date,
			tags: form.tags
				.split(/[,，]/)
				.map((t) => t.trim())
				.filter(Boolean),
			readTime: Number(form.readTime) || 1,
			excerpt: form.excerpt.trim(),
			bodyMd,
		};
	}, [form]);

	/** 保存（新建→draft；已有→更新字段）。返回文章 id */
	const save = useCallback(async () => {
		const payload = collect();
		if (!payload.title) throw new Error("标题不能为空");
		if (!payload.slug) throw new Error("slug 不能为空");
		if (!payload.moduleId) throw new Error("请选择栏目");

		if (savedIdRef.current == null) {
			const created = await guard(() => adminFetch("/posts", { method: "POST", body: payload }));
			savedIdRef.current = created.id;
			setStatus(created.status);
			return created.id;
		}
		const updated = await guard(() =>
			adminFetch(`/posts/${savedIdRef.current}`, { method: "PATCH", body: payload }),
		);
		setStatus(updated.status);
		return updated.id;
	}, [collect, guard]);

	const handleSaveDraft = async () => {
		setSaving(true);
		try {
			await save();
			flash("ok", "已保存");
		} catch (e) {
			flash("err", `保存失败：${e.message}（内容未丢失，可重试）`);
		} finally {
			setSaving(false);
		}
	};

	const handlePublish = async () => {
		setSaving(true);
		try {
			const id = await save();
			await guard(() => adminFetch(`/posts/${id}/publish`, { method: "POST" }));
			setStatus("published");
			flash("ok", "已发布，前台可见");
		} catch (e) {
			flash("err", `发布失败：${e.message}（内容未丢失，可重试）`);
		} finally {
			setSaving(false);
		}
	};

	const handleUnpublish = async () => {
		setSaving(true);
		try {
			const id = await save();
			await guard(() => adminFetch(`/posts/${id}/unpublish`, { method: "POST" }));
			setStatus("draft");
			flash("ok", "已下架");
		} catch (e) {
			flash("err", `下架失败：${e.message}`);
		} finally {
			setSaving(false);
		}
	};

	if (notFound) {
		return (
			<section className="admin-page">
				<HintText>文章不存在或已删除。</HintText>
				<Button onClick={onBack}>返回列表</Button>
			</section>
		);
	}

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>{isNew ? "新建文章" : "编辑文章"}</h1>
				<div className="admin-page__ops">
					<Toasts toast={toast} as="span" />
					<StatusTag ok={status === "published"}>{status === "published" ? "已发布" : "草稿"}</StatusTag>
					<Button onClick={onBack} disabled={saving}>
						返回
					</Button>
				</div>
			</header>

			<div className="admin-form">
				<PostFormFields form={form} setField={setField} modules={modules} />
			</div>

			<VditorEditor value={form.bodyMd} onFlash={flash} apiRef={editorApi} />

			<footer className="admin-edit__foot">
				<Button onClick={handleSaveDraft} disabled={saving}>
					{saving ? "处理中…" : "保存草稿"}
				</Button>
				{status !== "published" ? (
					<Button variant="primary" onClick={handlePublish} disabled={saving}>
						发布
					</Button>
				) : (
					<Button variant="warn" onClick={handleUnpublish} disabled={saving}>
						下架
					</Button>
				)}
			</footer>
		</section>
	);
}
