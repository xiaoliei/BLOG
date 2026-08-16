import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./api.js";

/* 文章列表页：标题/栏目/状态/日期/浏览量列 + 状态筛选 + 新建 */
const STATUS_TABS = [
	{ id: "", label: "全部" },
	{ id: "published", label: "已发布" },
	{ id: "draft", label: "草稿" },
];

export default function PostList({ guard, onEdit, onNew }) {
	const [rows, setRows] = useState(null);
	const [status, setStatus] = useState("");
	const [error, setError] = useState(null);
	const [busyId, setBusyId] = useState(null);

	const load = useCallback(() => {
		guard(() => adminFetch(`/posts${status ? `?status=${status}` : ""}`))
			.then(setRows)
			.catch((e) => setError(e.message));
	}, [guard, status]);

	useEffect(load, [load]);

	const togglePublish = async (row) => {
		setBusyId(row.id);
		setError(null);
		try {
			await guard(() =>
				adminFetch(`/posts/${row.id}/${row.status === "published" ? "unpublish" : "publish"}`, {
					method: "POST",
				}),
			);
			load();
		} catch (e) {
			setError(e.message);
		} finally {
			setBusyId(null);
		}
	};

	const remove = async (row) => {
		if (!window.confirm(`删除「${row.title}」？关联评论将一并删除。`)) return;
		setBusyId(row.id);
		setError(null);
		try {
			await guard(() => adminFetch(`/posts/${row.id}`, { method: "DELETE" }));
			load();
		} catch (e) {
			setError(e.message);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>文章管理</h1>
				<button type="button" className="admin-btn admin-btn--primary" onClick={onNew}>
					＋ 新建文章
				</button>
			</header>

			<div className="admin-tabs">
				{STATUS_TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						className={`admin-tabs__item${status === t.id ? " is-active" : ""}`}
						onClick={() => setStatus(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>

			{error && <p className="admin-error">{error}</p>}

			{rows == null ? (
				<p className="admin-hint">加载中…</p>
			) : rows.length === 0 ? (
				<p className="admin-hint">暂无文章。</p>
			) : (
				<table className="admin-table">
					<thead>
						<tr>
							<th>标题</th>
							<th>栏目</th>
							<th>状态</th>
							<th>日期</th>
							<th>浏览量</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.id}>
								<td className="admin-table__title">
									<button type="button" className="admin-link" onClick={() => onEdit(row.id)}>
										{row.title}
									</button>
								</td>
								<td>{row.moduleTitle}</td>
								<td>
									<span className={`admin-tag${row.status === "published" ? " admin-tag--ok" : ""}`}>
										{row.status === "published" ? "已发布" : "草稿"}
									</span>
								</td>
								<td className="admin-table__mono">{row.date}</td>
								<td className="admin-table__mono">{row.views}</td>
								<td className="admin-table__ops">
									<button
										type="button"
										className="admin-btn admin-btn--sm"
										disabled={busyId === row.id}
										onClick={() => togglePublish(row)}
									>
										{row.status === "published" ? "下架" : "发布"}
									</button>
									<button
										type="button"
										className="admin-btn admin-btn--sm admin-btn--danger"
										disabled={busyId === row.id}
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
