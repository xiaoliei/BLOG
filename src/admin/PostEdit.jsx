import { useCallback, useEffect, useRef, useState } from "react";
import "vditor/dist/index.css";
import { adminFetch } from "./api.js";

/* ============================================================
   文章编辑页：表单 + Vditor（动态 import，仅 admin chunk）
   - 新建：initial = {}；编辑：initial = { id }
   - 保存草稿 / 发布 / 下架；失败时表单与编辑器内容保持不丢
   ============================================================ */

const EMPTY_FORM = {
	title: "",
	slug: "",
	moduleId: "",
	date: new Date().toISOString().slice(0, 10),
	tags: "",
	readTime: 3,
	excerpt: "",
	bodyMd: "",
};

export default function PostEdit({ initial, onBack, guard }) {
	const isNew = initial.id == null;
	const [form, setForm] = useState(EMPTY_FORM);
	const [status, setStatus] = useState("draft"); // 当前文章状态（编辑已有文章时加载）
	const [modules, setModules] = useState([]);
	const [toast, setToast] = useState(null); // { kind: 'ok' | 'err', text }
	const [saving, setSaving] = useState(false);
	const [notFound, setNotFound] = useState(false);

	const vdElRef = useRef(null);
	const vdRef = useRef(null); // Vditor 实例
	const savedIdRef = useRef(initial.id ?? null);

	const flash = useCallback((kind, text) => {
		setToast({ kind, text });
		window.setTimeout(() => setToast(null), 2600);
	}, []);

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
				if (vdRef.current) vdRef.current.setValue(post.bodyMd ?? "");
			})
			.catch((e) => {
				setNotFound(true);
				flash("err", e.message);
			});
	}, [isNew, initial.id, guard, flash]);

	/* Vditor 编辑器：动态 import，自托管资产 /vditor */
	useEffect(() => {
		let disposed = false;
		let vd = null;
		import("vditor")
			.then(({ default: Vditor }) => {
				if (disposed || !vdElRef.current) return;
				vd = new Vditor(vdElRef.current, {
					cdn: "/vditor",
					height: 460,
					mode: "ir",
					lang: "zh_CN",
					cache: { enable: false },
					placeholder: "在这里写下正文（Markdown）…",
					value: form.bodyMd,
					toolbar: [
						"headings",
						"bold",
						"italic",
						"strike",
						"|",
						"list",
						"ordered-list",
						"check",
						"quote",
						"line",
						"|",
						"link",
						"table",
						"code",
						"inline-code",
						"|",
						"undo",
						"redo",
						"|",
						"edit-mode",
						"preview",
						"fullscreen",
					],
					after: () => {
						if (disposed) return;
						vdRef.current = vd;
						vd.setValue(form.bodyMd);
					},
				});
			})
			.catch(() => flash("err", "编辑器加载失败，请刷新重试"));

		return () => {
			disposed = true;
			try {
				vd?.destroy?.();
			} catch {
				/* ignore */
			}
			vdRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

	/** 读取当前表单（编辑器内容实时取自 Vditor 实例） */
	const collect = useCallback(() => {
		const bodyMd = vdRef.current ? vdRef.current.getValue() : form.bodyMd;
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
				<p className="admin-hint">文章不存在或已删除。</p>
				<button type="button" className="admin-btn" onClick={onBack}>
					返回列表
				</button>
			</section>
		);
	}

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>{isNew ? "新建文章" : "编辑文章"}</h1>
				<div className="admin-page__ops">
					{toast && <span className={`admin-toast admin-toast--${toast.kind}`}>{toast.text}</span>}
					<span className={`admin-tag${status === "published" ? " admin-tag--ok" : ""}`}>
						{status === "published" ? "已发布" : "草稿"}
					</span>
					<button type="button" className="admin-btn" onClick={onBack} disabled={saving}>
						返回
					</button>
				</div>
			</header>

			<div className="admin-form">
				<div className="admin-form__row admin-form__row--2">
					<label className="admin-field">
						<span>标题 *</span>
						<input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="文章标题" />
					</label>
					<label className="admin-field">
						<span>Slug *（小写字母/数字/中划线）</span>
						<input value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="my-first-post" />
					</label>
				</div>
				<div className="admin-form__row admin-form__row--4">
					<label className="admin-field">
						<span>栏目 *</span>
						<select value={form.moduleId} onChange={(e) => setField("moduleId", e.target.value)}>
							<option value="">选择栏目…</option>
							{modules.map((m) => (
								<option key={m.id} value={m.id}>
									{m.title}
								</option>
							))}
						</select>
					</label>
					<label className="admin-field">
						<span>日期</span>
						<input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
					</label>
					<label className="admin-field">
						<span>标签（逗号分隔）</span>
						<input value={form.tags} onChange={(e) => setField("tags", e.target.value)} placeholder="日常, 家居" />
					</label>
					<label className="admin-field">
						<span>阅读时长（分钟）</span>
						<input
							type="number"
							min="1"
							max="600"
							value={form.readTime}
							onChange={(e) => setField("readTime", e.target.value)}
						/>
					</label>
				</div>
				<label className="admin-field">
					<span>摘要</span>
					<textarea
						rows="2"
						value={form.excerpt}
						onChange={(e) => setField("excerpt", e.target.value)}
						placeholder="列表卡片展示的摘要（至多 300 字）"
					/>
				</label>
			</div>

			<div className="admin-editor" ref={vdElRef} />

			<footer className="admin-edit__foot">
				<button type="button" className="admin-btn" onClick={handleSaveDraft} disabled={saving}>
					{saving ? "处理中…" : "保存草稿"}
				</button>
				{status !== "published" ? (
					<button type="button" className="admin-btn admin-btn--primary" onClick={handlePublish} disabled={saving}>
						发布
					</button>
				) : (
					<button type="button" className="admin-btn admin-btn--warn" onClick={handleUnpublish} disabled={saving}>
						下架
					</button>
				)}
			</footer>
		</section>
	);
}
