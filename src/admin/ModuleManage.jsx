import { useState } from "react";
import { adminFetch } from "./api.js";
import { useAsyncResource } from "../hooks/useAsyncResource.js";
import { useFlash } from "../hooks/useFlash.js";
import { Button } from "./components/Button.jsx";
import { ErrorText, HintText, Toasts } from "./components/Feedback.jsx";
import { FormRow, TextField } from "./components/Fields.jsx";

/* 栏目管理页：列表 + 文章数 + 新增/编辑/删除（非空 409 迁移提示） */

const EMPTY = { slug: "", title: "", accent: "#3F9D4B", accentDark: "#2E7D32", icon: "feather", blurb: "", sort: 0 };

export default function ModuleManage({ guard }) {
	const [editing, setEditing] = useState(null); // null | { ...EMPTY } | { id, ... }
	const { toast, flash } = useFlash();

	/* 列表加载/刷新统一走 useAsyncResource */
	const { data: rows, error, setError, refetch: load } = useAsyncResource({
		fetcher: () => guard(() => adminFetch("/modules")),
		deps: [guard],
	});

	const save = async () => {
		setError(null);
		if (!editing.slug.trim() || !editing.title.trim()) {
			setError("slug 与标题必填");
			return;
		}
		const body = {
			slug: editing.slug.trim(),
			title: editing.title.trim(),
			accent: editing.accent,
			accentDark: editing.accentDark,
			icon: editing.icon.trim() || "feather",
			blurb: editing.blurb.trim(),
			sort: Number(editing.sort) || 0,
		};
		try {
			if (editing.id == null) {
				await guard(() => adminFetch("/modules", { method: "POST", body }));
			} else {
				await guard(() => adminFetch(`/modules/${editing.id}`, { method: "PATCH", body }));
			}
			setEditing(null);
			flash("ok", "栏目已保存");
			load();
		} catch (e) {
			setError(e.message);
		}
	};

	const remove = async (row) => {
		if (!window.confirm(`删除栏目「${row.title}」？`)) return;
		setError(null);
		try {
			await guard(() => adminFetch(`/modules/${row.id}`, { method: "DELETE" }));
			flash("ok", "栏目已删除");
			load();
		} catch (e) {
			setError(e.message);
		}
	};

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>栏目管理</h1>
				<Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>
					＋ 新增栏目
				</Button>
			</header>

			<ErrorText>{error}</ErrorText>
			<Toasts toast={toast} as="p" />

			{editing && (
				<div className="admin-modal-form">
					<FormRow cols={2}>
						<TextField
							label="Slug *（小写字母/数字/中划线）"
							value={editing.slug}
							onChange={(v) => setEditing({ ...editing, slug: v })}
							disabled={editing.id != null}
						/>
						<TextField label="标题 *" value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })} />
					</FormRow>
					<FormRow cols={4}>
						<TextField label="主题色" type="color" value={editing.accent} onChange={(v) => setEditing({ ...editing, accent: v })} />
						<TextField
							label="深主题色"
							type="color"
							value={editing.accentDark}
							onChange={(v) => setEditing({ ...editing, accentDark: v })}
						/>
						<TextField label="图标名" value={editing.icon} onChange={(v) => setEditing({ ...editing, icon: v })} />
						<TextField
							label="排序（小→大）"
							type="number"
							min="0"
							value={editing.sort}
							onChange={(v) => setEditing({ ...editing, sort: v })}
						/>
					</FormRow>
					<TextField label="简介" value={editing.blurb} onChange={(v) => setEditing({ ...editing, blurb: v })} />
					<div className="admin-modal-form__ops">
						<Button variant="primary" onClick={save}>
							保存
						</Button>
						<Button onClick={() => setEditing(null)}>取消</Button>
					</div>
				</div>
			)}

			{rows == null ? (
				<HintText>加载中…</HintText>
			) : (
				<table className="admin-table">
					<thead>
						<tr>
							<th>排序</th>
							<th>标题</th>
							<th>Slug</th>
							<th>主题色</th>
							<th>文章数</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.id}>
								<td className="admin-table__mono">{row.sort}</td>
								<td>
									<span className="admin-module-dot" style={{ background: row.accent }} />
									{row.title}
								</td>
								<td className="admin-table__mono">{row.slug}</td>
								<td className="admin-table__mono">{row.accent}</td>
								<td className="admin-table__mono">{row.postCount}</td>
								<td className="admin-table__ops">
									<Button small onClick={() => setEditing({ ...row })}>
										编辑
									</Button>
									<Button small variant="danger" onClick={() => remove(row)}>
										删除
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}
