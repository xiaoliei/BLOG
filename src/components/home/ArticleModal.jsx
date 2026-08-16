import { useCallback, useEffect, useRef, useState } from "react";
import { getComments, getPost, submitComment, submitViewOnce } from "../../lib/api.js";
import MarkdownBody from "./MarkdownBody.jsx";
import { IconClock, IconClose, IconTag } from "./icons.jsx";

/* 文章详情弹层：Esc / 点击遮罩关闭，打开时锁定页面滚动
   - API 数据源：按 slug 拉取详情（含 markdown 正文）与最新浏览量
   - 打开即提交浏览计数（60s 去重）
   - 评论区：approved 列表 + 提交表单（昵称 + 内容 + 蜜罐）
   - 静态数据源：无正文与评论，展示摘要 + 归档提示（原行为回退） */

const EMPTY_FORM = { author: "", body: "", website: "" };

export default function ArticleModal({ post, module, onClose }) {
	const closeRef = useRef(null);
	const [detail, setDetail] = useState(null);
	const [failed, setFailed] = useState(false);
	const [views, setViews] = useState(null);

	const [commentList, setCommentList] = useState(null); // null=加载中 []=无
	const [form, setForm] = useState(EMPTY_FORM);
	const [submitState, setSubmitState] = useState(null); // 'ok' | { error }
	const [sending, setSending] = useState(false);

	useEffect(() => {
		const prevActive = document.activeElement;
		const onKey = (e) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		closeRef.current?.focus();
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = prevOverflow;
			prevActive?.focus?.();
		};
	}, [onClose]);

	/* 拉取正文详情 + 浏览计数 + 评论列表（静态数据源时 getPost 返回 null） */
	useEffect(() => {
		let disposed = false;
		setDetail(null);
		setFailed(false);
		setViews(null);
		setCommentList(null);
		if (!post.slug) return undefined;

		getPost(post.slug)
			.then((d) => {
				if (!disposed && d) setDetail(d);
			})
			.catch(() => {
				if (!disposed) setFailed(true);
			});

		/* 浏览计数：打开即提交（60s 去重），成功则展示最新值 */
		submitViewOnce(post.slug)
			.then((v) => {
				if (!disposed && typeof v === "number") setViews(v);
			})
			.catch(() => {});

		getComments(post.slug)
			.then((list) => {
				if (!disposed) setCommentList(list);
			})
			.catch(() => {
				if (!disposed) setCommentList([]);
			});

		return () => {
			disposed = true;
		};
	}, [post.slug]);

	const handleCommentSubmit = useCallback(
		async (e) => {
			e.preventDefault();
			if (!post.slug || sending) return;
			setSending(true);
			setSubmitState(null);
			try {
				await submitComment(post.slug, form);
				setForm(EMPTY_FORM);
				setSubmitState("ok");
				/* 重新拉取 approved 列表（新评论还在审核，不会出现） */
				getComments(post.slug).then(setCommentList).catch(() => {});
			} catch (err) {
				setSubmitState({ error: err.message });
			} finally {
				setSending(false);
			}
		},
		[post.slug, form, sending],
	);

	const accent = post.moduleAccent ?? module?.accent;
	const accentDark = post.moduleAccentDark ?? module?.accentDark;
	const moduleTitle = post.moduleTitle ?? module?.title;
	const shownViews = views ?? detail?.views ?? post.views;

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title"
				onClick={(e) => e.stopPropagation()}
				style={{ "--mod-accent": accent, "--mod-accent-dark": accentDark }}
			>
				<button ref={closeRef} type="button" className="modal__close" aria-label="关闭" onClick={onClose}>
					<IconClose />
				</button>
				<span className="modal__badge">{moduleTitle}</span>
				<h2 id="modal-title" className="modal__title">
					{post.title}
				</h2>
				<div className="modal__meta">
					<span>
						<IconClock /> {post.date}
					</span>
					<span>{post.readTime} 分钟阅读</span>
					{typeof shownViews === "number" && <span>{shownViews} 次浏览</span>}
				</div>
				<div className="modal__tags">
					<IconTag />
					{(post.tags ?? []).map((tag) => (
						<span key={tag} className="modal__tag">
							{tag}
						</span>
					))}
				</div>

				{detail?.bodyMd ? (
					<MarkdownBody md={detail.bodyMd} />
				) : (
					<>
						<p className="modal__excerpt">{post.excerpt}</p>
						<p className="modal__note">
							{failed
								? "正文加载失败，先读读摘要，稍后重试。"
								: "完整正文正在整理归档，先读读摘要吧。"}
						</p>
					</>
				)}

				{/* ---------- 评论区 ---------- */}
				<section className="comments" aria-labelledby="comments-title">
					<h3 id="comments-title" className="comments__title">
						评论 {commentList ? `· ${commentList.length}` : ""}
					</h3>

					{commentList === null ? (
						<p className="comments__hint">评论加载中…</p>
					) : commentList.length === 0 ? (
						<p className="comments__hint">还没有评论，来说第一句吧。</p>
					) : (
						<ul className="comments__list">
							{commentList.map((cm) => (
								<li key={cm.id} className="comments__item">
									<div className="comments__head">
										<span className="comments__author">{cm.author}</span>
										<span className="comments__time">
											{String(cm.createdAt ?? "").slice(0, 16).replace("T", " ")}
										</span>
									</div>
									<p className="comments__body">{cm.body}</p>
								</li>
							))}
						</ul>
					)}

					<form className="comments__form" onSubmit={handleCommentSubmit}>
						{/* 蜜罐：人类不可见，机器人会填 */}
						<input
							type="text"
							name="website"
							value={form.website}
							onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
							className="comments__honeypot"
							tabIndex={-1}
							autoComplete="off"
							aria-hidden="true"
						/>
						<input
							className="comments__input comments__input--author"
							placeholder="昵称（至多 24 字）"
							maxLength={24}
							value={form.author}
							onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
						/>
						<textarea
							className="comments__input comments__input--body"
							placeholder="写下评论（至多 500 字）…"
							maxLength={500}
							rows={3}
							value={form.body}
							onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
						/>
						<div className="comments__form-foot">
							{submitState === "ok" && (
								<span className="comments__ok">已提交，审核通过后会展示。</span>
							)}
							{submitState?.error && (
								<span className="comments__err">{submitState.error}</span>
							)}
							<button type="submit" className="btn btn--solid comments__submit" disabled={sending}>
								{sending ? "提交中…" : "提交评论"}
							</button>
						</div>
					</form>
				</section>
			</div>
		</div>
	);
}
