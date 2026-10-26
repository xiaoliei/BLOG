/* 按钮原子组件：统一拼装 .admin-btn 及其变体类名（--primary / --warn / --danger / --sm） */

/** variant: 'primary' | 'warn' | 'danger'；small 附加 --sm；其余 props 透传给 <button> */
export function Button({ variant, small, type = "button", children, ...rest }) {
	const cls = ["admin-btn", small && "admin-btn--sm", variant && `admin-btn--${variant}`]
		.filter(Boolean)
		.join(" ");
	return (
		<button type={type} className={cls} {...rest}>
			{children}
		</button>
	);
}
