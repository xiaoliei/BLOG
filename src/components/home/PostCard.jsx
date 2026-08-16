import { IconClock } from "./icons.jsx";

/* 文章卡片：整个卡片是可点击按钮（键盘可聚焦），点击打开详情弹层
   module 信息由 API 随文章返回（moduleSlug/moduleTitle/moduleAccent*），
   静态数据源时同样字段由 api.js 补齐，卡片无需感知数据来源 */
export default function PostCard({ post, module, onOpen }) {
	const accent = post.moduleAccent ?? module?.accent;
	const accentDark = post.moduleAccentDark ?? module?.accentDark;
	const moduleTitle = post.moduleTitle ?? module?.title;

	return (
		<button
			type="button"
			className="post-card reveal"
			style={{
				"--mod-accent": accent,
				"--mod-accent-dark": accentDark,
			}}
			onClick={() => onOpen(post, module)}
		>
			<span className="post-card__badge">{moduleTitle}</span>
			<span className="post-card__title">{post.title}</span>
			<span className="post-card__meta">
				<IconClock />
				<span>{post.date}</span>
				<span className="post-card__dot">·</span>
				<span>{post.readTime} 分钟</span>
			</span>
			<span className="post-card__excerpt">{post.excerpt}</span>
			<span className="post-card__tags">
				{(post.tags ?? []).map((tag) => (
					<span key={tag} className="post-card__tag">
						{tag}
					</span>
				))}
			</span>
		</button>
	);
}
