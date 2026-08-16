import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./api.js";

/* 栏目管理页：列表 + 文章数 + 新增/编辑/删除（非空 409 迁移提示） */

const EMPTY = { slug: "", title: "", accent: "#3F9D4B", accentDark: "#2E7D32", icon: "feather", blurb: "", sort: 0 };

export default function ModuleManage({ guard }) {
	const [rows, setRows] = useState(null);
	const [editing, setEditing] = useState(null); // null | { ...EMPTY } | { id, ... }
	const [error, setError] = useState(null);
	const [toast, setToast] = useState(null);

	const flash = useCallback((kind, text) => {
		setToast({ kind, text });
		window.setTimeout(() => setToast(null), 2600);
	}, []);

	const load = useCallback(() => {
		guard(() => adminFetch("/modules"))
			.then(setRows)
			.catch((e) => setError(e.message));
	}, [guard]);

	useEffect(load, [load]);

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
				<button
					type="button"
					className="admin-btn admin-btn--primary"
					onClick={() => setEditing({ ...EMPTY })}
				>
					＋ 新增栏目
				</button>
			</header>

			{error && <p className="admin-error">{error}</p>}
			{toast && <p className={`admin-toast admin-toast--${toast.kind}`}>{toast.text}</p>}

			{editing && (
				<div className="admin-modal-form">
					<div className="admin-form__row admin-form__row--2">
						<label className="admin-field">
							<span>Slug *（小写字母/数字/中划线）</span>
							<input
								value={editing.slug}
								onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
								disabled={editing.id != null}
							/>
						</label>
						<label className="admin-field">
							<span>标题 *</span>
							<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
						</label>
					</div>
					<div className="admin-form__row admin-form__row--4">
						<label className="admin-field">
							<span>主题色</span>
							<input type="color" value={editing.accent} onChange={(e) => setEditing({ ...editing, accent: e.target.value })} />
						</label>
						<label className="admin-field">
							<span>深主题色</span>
							<input
								type="color"
								value={editing.accentDark}
								onChange={(e) => setEditing({ ...editing, accentDark: e.target.value })}
							/>
						</label>
						<label className="admin-field">
							<span>图标名</span>
							<input value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} />
						</label>
						<label className="admin-field">
							<span>排序（小→大）</span>
							<input
								type="number"
								min="0"
								value={editing.sort}
								onChange={(e) => setEditing({ ...editing, sort: e.target.value })}
							/>
						</label>
					</div>
					<label className="admin-field">
						<span>简介</span>
						<input value={editing.blurb} onChange={(e) => setEditing({ ...editing, blurb: e.target.value })} />
					</label>
					<div className="admin-modal-form__ops">
						<button type="button" className="admin-btn admin-btn--primary" onClick={save}>
							保存
						</button>
						<button type="button" className="admin-btn" onClick={() => setEditing(null)}>
							取消
						</button>
					</div>
				</div>
			)}

			{rows == null ? (
				<p className="admin-hint">加载中…</p>
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
									<button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing({ ...row })}>
										编辑
									</button>
									<button
										type="button"
										className="admin-btn admin-btn--sm admin-btn--danger"
										onClick={() => remove(row)}
									>
										删除
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}
