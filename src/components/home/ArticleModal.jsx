import { useEffect, useRef, useState } from "react";
import { getPost } from "../../lib/api.js";
import MarkdownBody from "./MarkdownBody.jsx";
import { IconClock, IconClose, IconTag } from "./icons.jsx";

/* 文章详情弹层：Esc / 点击遮罩关闭，打开时锁定页面滚动
   - API 数据源：按 slug 拉取详情（含 markdown 正文）与最新浏览量
   - 静态数据源：无正文，展示摘要 + 归档提示（原行为回退） */
export default function ArticleModal({ post, module, onClose }) {
	const closeRef = useRef(null);
	const [detail, setDetail] = useState(null);
	const [failed, setFailed] = useState(false);

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

	/* 拉取正文详情（静态数据源时 getPost 返回 null） */
	useEffect(() => {
		let disposed = false;
		setDetail(null);
		setFailed(false);
		if (!post.slug) return undefined;
		getPost(post.slug)
			.then((d) => {
				if (!disposed && d) setDetail(d);
			})
			.catch(() => {
				if (!disposed) setFailed(true);
			});
		return () => {
			disposed = true;
		};
	}, [post.slug]);

	const accent = post.moduleAccent ?? module?.accent;
	const accentDark = post.moduleAccentDark ?? module?.accentDark;
	const moduleTitle = post.moduleTitle ?? module?.title;
	const views = detail?.views ?? post.views;

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
					{typeof views === "number" && <span>{views} 次浏览</span>}
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
			</div>
		</div>
	);
}
