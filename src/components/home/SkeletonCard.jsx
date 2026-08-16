/* 骨架屏占位卡片：与 post-card / module-card 同构，shimmer 微光动画 */
export default function SkeletonCard({ className }) {
	return (
		<div className={`${className} ${className}--skeleton`} aria-hidden="true">
			<span className="skeleton-bar skeleton-bar--badge" />
			<span className="skeleton-bar skeleton-bar--lg" />
			<span className="skeleton-bar" />
			<span className="skeleton-bar skeleton-bar--sm" />
			<span className="skeleton-bar skeleton-bar--sm" />
		</div>
	);
}
