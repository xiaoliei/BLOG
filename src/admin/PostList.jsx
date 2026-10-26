import { useCallback, useState } from "react";
import { adminFetch, adminQuery } from "./api.js";
import { useAsyncResource } from "../hooks/useAsyncResource.js";
import { Button } from "./components/Button.jsx";
import { ErrorText, HintText } from "./components/Feedback.jsx";
import { TabBar } from "./components/TabBar.jsx";

/* 文章列表页：标题/栏目/状态/日期/浏览量列 + 状态筛选 + 新建 */
const STATUS_TABS = [
	{ id: "", label: "全部" },
	{ id: "published", label: "已发布" },
	{ id: "draft", label: "草稿" },
];

export default function PostList({ guard, onEdit, onNew }) {
	const [status, setStatus] = useState("");
	const [busyId, setBusyId] = useState(null);

	/* 列表加载：status 变化自动重查（等价原 useCallback(load, [guard, status])） */
	const { data: rows, error, setError, refetch: load } = useAsyncResource({
		fetcher: () => guard(() => adminFetch(`/posts${adminQuery({ status })}`)),
		deps: [guard, status],
	});

	/* 通用行操作：执行后刷新列表，busyId 标记操作中的行 */
	const runOp = useCallback(
		async (row, makeOp) => {
			setBusyId(row.id);
			setError(null);
			try {
				await guard(makeOp());
				load();
			} catch (e) {
				setError(e.message);
			} finally {
				setBusyId(null);
			}
		},
		[guard, load, setError],
	);

	const togglePublish = (row) =>
		runOp(row, () =>
			adminFetch(`/posts/${row.id}/${row.status === "published" ? "unpublish" : "publish"}`, {
				method: "POST",
			}),
		);

	const remove = (row) => {
		if (!window.confirm(`删除「${row.title}」？关联评论将一并删除。`)) return;
		runOp(row, () => adminFetch(`/posts/${row.id}`, { method: "DELETE" }));
	};

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>文章管理</h1>
				<Button variant="primary" onClick={onNew}>
					＋ 新建文章
				</Button>
			</header>

			<TabBar tabs={STATUS_TABS} value={status} onChange={setStatus} />

			<ErrorText>{error}</ErrorText>

			{rows == null ? (
				<HintText>加载中…</HintText>
			) : rows.length === 0 ? (
				<HintText>暂无文章。</HintText>
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
									<Button small disabled={busyId === row.id} onClick={() => togglePublish(row)}>
										{row.status === "published" ? "下架" : "发布"}
									</Button>
									<Button small variant="danger" disabled={busyId === row.id} onClick={() => remove(row)}>
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
