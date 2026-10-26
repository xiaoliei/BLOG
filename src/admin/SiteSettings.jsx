import { useState } from "react";
import { adminFetch } from "./api.js";
import { useAsyncResource } from "../hooks/useAsyncResource.js";
import { useFlash } from "../hooks/useFlash.js";
import { Button } from "./components/Button.jsx";
import { ErrorText, HintText, Toasts } from "./components/Feedback.jsx";
import { TextField, TextareaField } from "./components/Fields.jsx";

/* ============================================================
   站点设置页：站点信息 / 区块文案 / 关于我 / 页脚 分组表单
   - 加载 GET /api/admin/settings
   - 仅提交发生变更的字段（PATCH 部分更新）
   - 失败时保留已填内容并展示错误
   ============================================================ */

const GROUPS = [
	{
		title: "站点信息",
		fields: [
			["name", "站名 *", "input"],
			["tagline", "标语", "input"],
			["since", "开始年份（四位）", "number"],
			["description", "站点描述（关于我角色行）", "textarea"],
			["author", "作者名", "input"],
			["email", "邮箱", "input"],
			["github", "GitHub 链接", "input"],
		],
	},
	{
		title: "世界（岛屿）",
		fields: [
			["islandName", "岛屿名", "input"],
			["islandTagline", "岛屿副标语", "input"],
		],
	},
	{
		title: "区块文案",
		fields: [
			["latestSub", "「最新文章」下方描述", "textarea"],
			["modulesSub", "「文章栏目」下方描述", "textarea"],
		],
	},
	{
		title: "关于我",
		fields: [
			["aboutTitle", "模块标题", "input"],
			["aboutText", "介绍正文", "textarea"],
		],
	},
	{
		title: "页脚",
		fields: [
			["footerBrand", "品牌文本", "input"],
			["footerTagline", "标语", "input"],
			["footerNavTitle", "导航栏标题", "input"],
			["footerContactTitle", "联系栏标题", "input"],
			["footerBottom", "底部版权行", "textarea"],
		],
	},
];

export default function SiteSettings({ guard }) {
	const [form, setForm] = useState(null);
	const [dirty, setDirty] = useState({});
	const { toast, flash } = useFlash();

	/* 设置加载：成功后重置脏标记（等价原 useCallback(load, [guard])） */
	const { error, setError } = useAsyncResource({
		fetcher: () =>
			guard(() => adminFetch("/settings")).then((data) => {
				setForm(data);
				setDirty({});
			}),
		deps: [guard],
	});

	/* 写字段并标记脏（number 输入保留原 Number 转换） */
	const setFieldValue = (key, value) => {
		setForm((f) => ({ ...f, [key]: value }));
		setDirty((d) => ({ ...d, [key]: true }));
	};

	const dirtyCount = Object.keys(dirty).length;

	const save = async () => {
		setError(null);
		if (!dirtyCount) {
			flash("ok", "没有需要保存的修改");
			return;
		}
		const body = {};
		for (const k of Object.keys(dirty)) body[k] = form[k];
		try {
			const updated = await guard(() =>
				adminFetch("/settings", { method: "PATCH", body }),
			);
			setForm(updated);
			setDirty({});
			flash("ok", "站点设置已保存");
		} catch (e) {
			setError(e.message);
		}
	};

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>站点设置</h1>
				<div className="admin-page__ops">
					<Toasts toast={toast} as="p" />
					<Button variant="primary" onClick={save} disabled={!form || !dirtyCount}>
						保存修改
					</Button>
				</div>
			</header>

			<ErrorText>{error}</ErrorText>

			{!form ? (
				<HintText>加载中…</HintText>
			) : (
				GROUPS.map((group) => (
					<section key={group.title} className="admin-settings-group">
						<h2>{group.title}</h2>
						<div className="admin-form">
							{group.fields.map(([key, label, kind]) =>
								kind === "textarea" ? (
									<TextareaField
										key={key}
										label={label}
										rows={3}
										value={form[key] ?? ""}
										onChange={(v) => setFieldValue(key, v)}
									/>
								) : (
									/* kind 即输入类型（"input" 与原实现一致直传 type） */
									<TextField
										key={key}
										label={label}
										type={kind}
										min={kind === "number" ? 1900 : undefined}
										max={kind === "number" ? 2100 : undefined}
										value={form[key] ?? ""}
										onChange={(v) => setFieldValue(key, kind === "number" ? Number(v) : v)}
									/>
								),
							)}
						</div>
					</section>
				))
			)}
		</section>
	);
}
