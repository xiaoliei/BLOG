import { useCallback, useEffect, useRef, useState } from "react";
import "vditor/dist/index.css";
import { adminFetch } from "./api.ts";
import { ApiError } from "../lib/http.ts";
import { localDate } from "../lib/local-time.ts";
import { useFlash } from "../hooks/useFlash.ts";
import { Button } from "./components/Button.tsx";
import { HintText, StatusTag, Toasts } from "./components/Feedback.tsx";
import PostFormFields from "./components/PostFormFields.tsx";
import type { PostFormState } from "./components/PostFormFields.tsx";
import VditorEditor from "./components/VditorEditor.tsx";
import type { VditorApi } from "./components/VditorEditor.tsx";
import type { Guard, EditingPost } from "./AdminApp.tsx";
import type { AdminPostDetail, AdminPostRecord, ModuleSummary, PostStatus } from "../types/api.ts";

/* ============================================================
   文章编辑页：表单 + Vditor（动态 import，仅 admin chunk）
   - 新建：initial = {}；编辑：initial = { id }
   - 保存草稿 / 发布 / 下架；失败时表单与编辑器内容保持不丢
   ============================================================ */

const EMPTY_FORM: PostFormState & { bodyMd: string } = {
	title: "",
	slug: "",
	moduleId: "",
	date: "",
	tags: "",
	readTime: "3",
	excerpt: "",
	bodyMd: "",
};

/** POST/PATCH /posts 的请求体（moduleId/readTime 在此处转数值） */
interface PostPayload {
	title: string;
	slug: string;
	moduleId: number;
	date: string;
	tags: string[];
	readTime: number;
	excerpt: string;
	bodyMd: string;
}

interface PostEditProps {
	initial: EditingPost;
	onBack: () => void;
	guard: Guard;
}

export default function PostEdit({ initial, onBack, guard }: PostEditProps) {
	const isNew = initial.id == null;
	const [form, setForm] = useState<PostFormState & { bodyMd: string }>(() => ({ ...EMPTY_FORM, date: localDate() }));
	const [status, setStatus] = useState<PostStatus>("draft"); // 当前文章状态（编辑已有文章时加载）
	const [modules, setModules] = useState<ModuleSummary[]>([]);
	const [saving, setSaving] = useState(false);
	const [notFound, setNotFound] = useState(false);
	/* 非 404 的加载失败（401 / 网络）：不能当成"文章不存在"，也不能留在空表单上——
	   此时点保存会把线上文章覆盖成空白。单独进错误态，只给重试和返回。 */
	const [loadFailed, setLoadFailed] = useState<string | null>(null);
	const [loadRetry, setLoadRetry] = useState(0);
	const { toast, flash } = useFlash();

	const editorApi = useRef<VditorApi | null>(null); // VditorEditor 暴露的 getValue/insertValue
	const savedIdRef = useRef<number | null>(initial.id ?? null);

	/* 加载栏目 + 已有文章 */
	useEffect(() => {
		guard(() => adminFetch<ModuleSummary[]>("/modules"))
			.then(setModules)
			.catch((e: Error) => flash("err", e.message));
		if (isNew) return;

		guard(() => adminFetch<AdminPostDetail>(`/posts/${initial.id}`))
			.then((post) => {
				savedIdRef.current = post.id;
				setStatus(post.status);
				setForm({
					title: post.title,
					slug: post.slug,
					moduleId: String(post.moduleId),
					date: post.date,
					tags: (post.tags ?? []).join(", "),
					readTime: String(post.readTime),
					excerpt: post.excerpt ?? "",
					bodyMd: post.bodyMd ?? "",
				});
				editorApi.current?.onReady?.((vd) => vd.setValue(post.bodyMd ?? ""));
			})
			.catch((e: Error) => {
				if (e instanceof ApiError && e.status === 404) setNotFound(true);
				else setLoadFailed(e.message || "文章加载失败");
			});
	}, [isNew, initial.id, guard, flash, loadRetry]);

	const setField = (k: keyof PostFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

	/** 读取当前表单（编辑器内容实时取自 Vditor 实例） */
	/** 读取当前表单并校验（编辑器内容实时取自 Vditor 实例）。
	 *  校验失败直接 throw，由 save() 的 catch 转成 flash 提示。 */
	const collect = useCallback((): PostPayload => {
		const bodyMd = editorApi.current ? (editorApi.current.getValue() ?? form.bodyMd) : form.bodyMd;
		/* 后端 readTime 要求 1..600 的整数。空串或非数字不能静默回落成 1，
		   否则用户清空输入框后会被悄悄存成 1 分钟阅读时长。 */
		const readTime = Number(form.readTime);
		if (form.readTime.trim() === "" || !Number.isInteger(readTime) || readTime < 1 || readTime > 600) {
			throw new Error("阅读时长需为 1–600 的整数分钟");
		}
		return {
			title: form.title.trim(),
			slug: form.slug.trim(),
			moduleId: Number(form.moduleId),
			date: form.date,
			tags: form.tags
				.split(/[,，]/)
				.map((t) => t.trim())
				.filter(Boolean),
			readTime,
			excerpt: form.excerpt.trim(),
			bodyMd,
		};
	}, [form]);

	/** 保存（新建→draft；已有→更新字段）。返回文章 id */
	const save = useCallback(async (): Promise<number> => {
		const payload = collect();
		if (!payload.title) throw new Error("标题不能为空");
		if (!payload.slug) throw new Error("slug 不能为空");
		if (!payload.moduleId) throw new Error("请选择栏目");

		if (savedIdRef.current == null) {
			const created = await guard(() => adminFetch<AdminPostDetail>("/posts", { method: "POST", body: payload }));
			savedIdRef.current = created.id;
			setStatus(created.status);
			return created.id;
		}
		const updated = await guard(() =>
			adminFetch<AdminPostDetail>(`/posts/${savedIdRef.current}`, { method: "PATCH", body: payload }),
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
			flash("err", `保存失败：${(e as Error).message}（内容未丢失，可重试）`);
		} finally {
			setSaving(false);
		}
	};

	const handlePublish = async () => {
		setSaving(true);
		try {
			const id = await save();
			await guard(() => adminFetch<AdminPostRecord>(`/posts/${id}/publish`, { method: "POST" }));
			setStatus("published");
			flash("ok", "已发布，前台可见");
		} catch (e) {
			flash("err", `发布失败：${(e as Error).message}（内容未丢失，可重试）`);
		} finally {
			setSaving(false);
		}
	};

	const handleUnpublish = async () => {
		setSaving(true);
		try {
			const id = await save();
			await guard(() => adminFetch<AdminPostRecord>(`/posts/${id}/unpublish`, { method: "POST" }));
			setStatus("draft");
			flash("ok", "已下架");
		} catch (e) {
			flash("err", `下架失败：${(e as Error).message}`);
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

	if (loadFailed) {
		return (
			<section className="admin-page">
				<HintText>文章加载失败：{loadFailed}</HintText>
				<div className="admin-edit__foot">
					<Button
						onClick={() => {
							setLoadFailed(null);
							setLoadRetry((n) => n + 1);
						}}
					>
						重新载入
					</Button>
					<Button onClick={onBack}>返回列表</Button>
				</div>
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
