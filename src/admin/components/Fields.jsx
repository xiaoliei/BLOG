/* ============================================================
   表单原子组件：受控字段的统一封装
   - 均以 <label className="admin-field"><span>标签</span>…</label> 结构输出
   - onChange 一律回调「值」而不是事件对象，简化页面侧写入
   - DOM 结构与重构前手写的字段完全一致（样式类不变）
   ============================================================ */

/** 单行输入（type 可传 text/date/number/color 等）；min/max 透传给 number 场景 */
export function TextField({ label, value, onChange, type = "text", placeholder, disabled, min, max }) {
	return (
		<label className="admin-field">
			<span>{label}</span>
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				min={min}
				max={max}
			/>
		</label>
	);
}

/** 多行文本 */
export function TextareaField({ label, value, onChange, rows = 3, placeholder, disabled }) {
	return (
		<label className="admin-field">
			<span>{label}</span>
			<textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
		</label>
	);
}

/** 下拉选择：options 为 [{ value, label }] */
export function SelectField({ label, value, onChange, options }) {
	return (
		<label className="admin-field">
			<span>{label}</span>
			<select value={value} onChange={(e) => onChange(e.target.value)}>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</label>
	);
}

/** 表单横排字段容器：cols 对应 --2 / --4 两种列数 */
export function FormRow({ cols = 2, children }) {
	return <div className={`admin-form__row admin-form__row--${cols}`}>{children}</div>;
}
