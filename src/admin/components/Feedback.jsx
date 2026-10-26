/* ============================================================
   状态/提示条：错误、加载、空态、toast、标签的统一渲染
   - 类名与重构前各页面手写节点完全一致（.admin-error 等）
   ============================================================ */

/** 错误提示条（.admin-error） */
export function ErrorText({ children }) {
	if (!children) return null;
	return <p className="admin-error">{children}</p>;
}

/** 加载/空态提示（.admin-hint） */
export function HintText({ children }) {
	return <p className="admin-hint">{children}</p>;
}

/** toast 提示条：渲染 useFlash 返回的单条 toast，元素/标签可指定 */
export function Toasts({ toast, as = "span" }) {
	if (!toast) return null;
	const Tag = as;
	return <Tag className={`admin-toast admin-toast--${toast.kind}`}>{toast.text}</Tag>;
}

/** 状态标签（.admin-tag，ok 变体为绿） */
export function StatusTag({ ok, children }) {
	return <span className={`admin-tag${ok ? " admin-tag--ok" : ""}`}>{children}</span>;
}
