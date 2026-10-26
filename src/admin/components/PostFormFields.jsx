import { FormRow, SelectField, TextField, TextareaField } from "./Fields.jsx";

/* ============================================================
   文章表单字段区：PostEdit 顶部字段（标题/Slug/栏目/日期/标签/时长/摘要）
   - props 与页面状态一一对应，页面仍持有 form 状态
   - moduleId 以字符串存取（与 <select> 原生行为一致）
   ============================================================ */

export default function PostFormFields({ form, setField, modules }) {
	return (
		<>
			<FormRow cols={2}>
				<TextField
					label="标题 *"
					value={form.title}
					onChange={(v) => setField("title", v)}
					placeholder="文章标题"
				/>
				<TextField
					label="Slug *（小写字母/数字/中划线）"
					value={form.slug}
					onChange={(v) => setField("slug", v)}
					placeholder="my-first-post"
				/>
			</FormRow>
			<FormRow cols={4}>
				<SelectField
					label="栏目 *"
					value={form.moduleId}
					onChange={(v) => setField("moduleId", v)}
					options={[
						{ value: "", label: "选择栏目…" },
						...modules.map((m) => ({ value: m.id, label: m.title })),
					]}
				/>
				<TextField label="日期" type="date" value={form.date} onChange={(v) => setField("date", v)} />
				<TextField
					label="标签（逗号分隔）"
					value={form.tags}
					onChange={(v) => setField("tags", v)}
					placeholder="日常, 家居"
				/>
				<TextField
					label="阅读时长（分钟）"
					type="number"
					min="1"
					max="600"
					value={form.readTime}
					onChange={(v) => setField("readTime", v)}
				/>
			</FormRow>
			<TextareaField
				label="摘要"
				rows={2}
				value={form.excerpt}
				onChange={(v) => setField("excerpt", v)}
				placeholder="列表卡片展示的摘要（至多 300 字）"
			/>
		</>
	);
}
