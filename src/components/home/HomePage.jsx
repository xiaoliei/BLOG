import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_POSTS, MODULES, POST_COUNT, SITE } from "../../config/blog.js";
import ArticleModal from "./ArticleModal.jsx";
import PostCard from "./PostCard.jsx";
import {
	IconArrowRight,
	IconFeather,
	IconGithub,
	IconMail,
	MODULE_ICONS,
} from "./icons.jsx";

const LATEST_LIMIT = 6;

export default function HomePage() {
	const [activeModuleId, setActiveModuleId] = useState(null);
	const [selected, setSelected] = useState(null); // { post, module }

	const reducedMotion = useMemo(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);

	const activeModule = activeModuleId
		? MODULES.find((m) => m.id === activeModuleId)
		: null;

	const latestPosts = useMemo(() => {
		if (activeModule) {
			return ALL_POSTS.filter((p) => p.moduleId === activeModule.id);
		}
		return ALL_POSTS.slice(0, LATEST_LIMIT);
	}, [activeModule]);

	const handleModuleClick = useCallback(
		(moduleId) => {
			setActiveModuleId((prev) => (prev === moduleId ? null : moduleId));
			document.getElementById("latest")?.scrollIntoView({
				behavior: reducedMotion ? "auto" : "smooth",
			});
		},
		[reducedMotion],
	);

	const handleOpen = useCallback(
		(post, module) => setSelected({ post, module }),
		[],
	);
	const handleClose = useCallback(() => setSelected(null), []);

	/* 滚动进入视口淡入（prefers-reduced-motion 下直接显示） */
	useEffect(() => {
		const els = Array.from(document.querySelectorAll(".reveal"));
		if (reducedMotion) {
			els.forEach((el) => el.classList.add("is-visible"));
			return undefined;
		}
		/* 已进入视口（或快速滚动跳过）的元素立即显示 */
		const inViewport = (el) => {
			const r = el.getBoundingClientRect();
			return r.top < window.innerHeight - 48 && r.bottom > 0;
		};
		els.filter(inViewport).forEach((el) => el.classList.add("is-visible"));
		const io = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						entry.target.classList.add("is-visible");
						io.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.1 },
		);
		els.forEach((el) => io.observe(el));
		const onScroll = () => {
			els.forEach((el) => {
				if (!el.classList.contains("is-visible") && inViewport(el)) {
					el.classList.add("is-visible");
				}
			});
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			io.disconnect();
			window.removeEventListener("scroll", onScroll);
		};
	}, [reducedMotion, activeModuleId]);

	return (
		<div className="blog-root">
			{/* ---------- 绿色 Hero 色带（xiaoli-home 样式，底部羊毛饰条） ---------- */}
			<header id="top" className="hero">
				<nav className="hero-nav container" aria-label="主导航">
					<a className="hero-logo" href="#top">
						<span className="hero-logo__mark">礼</span>
						小礼工坊
					</a>
					<div className="hero-nav__links">
						<a href="#latest">最新文章</a>
						<a href="#modules">文章栏目</a>
						<a href="#about">关于我</a>
					</div>
				</nav>

				<div className="hero-inner container">
					<p className="hero-eyebrow">PERSONAL BLOG · EST. {SITE.since}</p>
					<h1 className="hero-title">{SITE.name}</h1>
					<p className="hero-lead">{SITE.tagline}</p>
					<div className="hero-cta">
						<a className="btn btn--light" href="#latest">
							浏览最新文章
							<IconArrowRight />
						</a>
						<a className="btn btn--outline" href="#modules">
							查看栏目
						</a>
					</div>
					<ul className="hero-stats">
						<li>
							<strong>{MODULES.length}</strong>
							<span>个栏目</span>
						</li>
						<li>
							<strong>{POST_COUNT}</strong>
							<span>篇文章</span>
						</li>
						<li>
							<strong>{SITE.since}</strong>
							<span>年开始</span>
						</li>
					</ul>
				</div>
			</header>

			{/* ---------- 中部：浅色羊毛纹理背景 ---------- */}
			<main className="container">
				{/* 最新文章 */}
				<section id="latest" className="section" aria-labelledby="latest-title">
					<div className="section-head">
						<div>
							<h2 id="latest-title" className="section-title">
								{activeModule ? `栏目 · ${activeModule.title}` : "最新文章"}
							</h2>
							<p className="section-sub">
								{activeModule
									? activeModule.blurb
									: `按时间倒序，先看最近更新的 ${LATEST_LIMIT} 篇。`}
							</p>
						</div>
						{activeModule && (
							<button
								type="button"
								className="btn btn--ghost"
								onClick={() => setActiveModuleId(null)}
							>
								清除筛选
							</button>
						)}
					</div>

					{latestPosts.length > 0 ? (
						<div className="post-grid">
							{latestPosts.map((post) => (
								<PostCard
									key={`${post.moduleId}-${post.title}`}
									post={post}
									module={MODULES.find((m) => m.id === post.moduleId)}
									onOpen={handleOpen}
								/>
							))}
						</div>
					) : (
						<p className="empty-tip">这个栏目暂时没有文章。</p>
					)}
				</section>

				{/* 文章栏目 */}
				<section
					id="modules"
					className="section"
					aria-labelledby="modules-title"
				>
					<div className="section-head">
						<div>
							<h2 id="modules-title" className="section-title">
								文章栏目
							</h2>
							<p className="section-sub">
								八个栏目，八块拼图。点击任意栏目查看其中的文章。
							</p>
						</div>
					</div>

					<div className="module-grid">
						{MODULES.map((module) => {
							const Icon = MODULE_ICONS[module.icon] || IconFeather;
							return (
								<button
									key={module.id}
									type="button"
									className={`module-card reveal${activeModuleId === module.id ? " is-active" : ""}`}
									style={{
										"--mod-accent": module.accent,
										"--mod-accent-dark": module.accentDark,
									}}
									onClick={() => handleModuleClick(module.id)}
								>
									<span className="module-card__icon">
										<Icon />
									</span>
									<span className="module-card__body">
										<span className="module-card__title">{module.title}</span>
										<span className="module-card__blurb">{module.blurb}</span>
										<span className="module-card__count">
											{module.posts.length} 篇文章
										</span>
									</span>
								</button>
							);
						})}
					</div>
				</section>

				{/* 关于我 */}
				<section id="about" className="section" aria-labelledby="about-title">
					<div className="about-card reveal">
						<div className="about-avatar" aria-hidden="true">
							{SITE.author[0]}
						</div>
						<div className="about-body">
							<h2 id="about-title" className="section-title">
								关于我
							</h2>
							<p className="about-role">{SITE.description}</p>
							<p className="about-text">
								这里是小礼工坊的建造者 {SITE.author}。从 2019
								年写下第一篇文章开始，
								我一直在用代码一砖一瓦地搭自己的世界：前端、像素、游戏与设计，
								所有认真做过的事都会在这里留下记录。
							</p>
							<div className="about-links">
								<a className="btn btn--solid" href={`mailto:${SITE.email}`}>
									<IconMail />
									给我写信
								</a>
								<a
									className="btn btn--ghost"
									href={SITE.github}
									target="_blank"
									rel="noreferrer"
								>
									<IconGithub />
									GitHub
								</a>
							</div>
						</div>
					</div>
				</section>
			</main>

			{/* ---------- 蓝色页脚色带（xiaoli-home 样式，顶部羊毛饰条） ---------- */}
			<footer className="site-footer">
				<div className="container footer-grid">
					<div className="footer-brand">
						<p className="footer-logo">{SITE.name}</p>
						<p className="footer-tagline">{SITE.tagline}</p>
					</div>
					<nav className="footer-col" aria-label="页脚导航">
						<h3>快速导航</h3>
						<a href="#latest">最新文章</a>
						<a href="#modules">文章栏目</a>
						<a href="#about">关于我</a>
					</nav>
					<div className="footer-col">
						<h3>联系</h3>
						<a href={`mailto:${SITE.email}`}>
							<IconMail /> {SITE.email}
						</a>
						<a href={SITE.github} target="_blank" rel="noreferrer">
							<IconGithub /> GitHub
						</a>
					</div>
				</div>
				<div className="container footer-bottom">
					<span>
						© 2026 {SITE.name} · 由 {SITE.author} 维护
					</span>
				</div>
			</footer>

			{selected && (
				<ArticleModal
					post={selected.post}
					module={selected.module}
					onClose={handleClose}
				/>
			)}
		</div>
	);
}
