/* 标签页切换条（.admin-tabs）：与原 PostList/CommentReview 手写结构一致 */

export interface TabItem { id: string; label: string; }

/** tabs: [{ id, label }]；id 为 "" 表示"全部" */
export function TabBar({ tabs, value, onChange }: { tabs: TabItem[]; value: string; onChange: (id: string) => void }) {
	return (
		<div className="admin-tabs">
			{tabs.map((t) => (
				<button
					key={t.id}
					type="button"
					className={`admin-tabs__item${value === t.id ? " is-active" : ""}`}
					onClick={() => onChange(t.id)}
				>
					{t.label}
				</button>
			))}
		</div>
	);
}
