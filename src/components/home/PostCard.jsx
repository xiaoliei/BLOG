import { IconClock } from './icons.jsx';

/* 文章卡片：整个卡片是可点击按钮（键盘可聚焦），点击打开详情弹层 */
export default function PostCard({ post, module, onOpen }) {
  return (
    <button
      type="button"
      className="post-card reveal"
      style={{
        '--mod-accent': module.accent,
        '--mod-accent-dark': module.accentDark,
      }}
      onClick={() => onOpen(post, module)}
    >
      <span className="post-card__badge">{module.title}</span>
      <span className="post-card__title">{post.title}</span>
      <span className="post-card__meta">
        <IconClock />
        <span>{post.date}</span>
        <span className="post-card__dot">·</span>
        <span>{post.readTime} 分钟</span>
      </span>
      <span className="post-card__excerpt">{post.excerpt}</span>
      <span className="post-card__tags">
        {post.tags.map((tag) => (
          <span key={tag} className="post-card__tag">
            {tag}
          </span>
        ))}
      </span>
    </button>
  );
}
