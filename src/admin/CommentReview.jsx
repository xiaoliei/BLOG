import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./api.js";

/* 评论审核队列：pending / approved / rejected 筛选，放行 / 拒绝 / 删除 */

const STATUS_TABS = [
	{ id: "pending", label: "待审核" },
	{ id: "approved", label: "已放行" },
	{ id: "rejected", label: "已拒绝" },
	{ id: "", label: "全部" },
];

export default function CommentReview({ guard }) {
	const [rows, setRows] = useState(null);
	const [status, setStatus] = useState("pending");
	const [error, setError] = useState(null);
	const [toast, setToast] = useState(null);
	const [busyId, setBusyId] = useState(null);

	const flash = useCallback((kind, text) => {
		setToast({ kind, text });
		window.setTimeout(() => setToast(null), 2600);
	}, []);

	const load = useCallback(() => {
		guard(() => adminFetch(`/comments${status ? `?status=${status}` : ""}`))
			.then(setRows)
			.catch((e) => setError(e.message));
	}, [guard, status]);

	useEffect(load, [load]);

	const act = async (row, action) => {
		setBusyId(row.id);
		setError(null);
		try {
			if (action === "delete") {
				if (!window.confirm(`删除「${row.author}」的评论？`)) return;
				await guard(() => adminFetch(`/comments/${row.id}`, { method: "DELETE" }));
				flash("ok", "已删除");
			} else {
				await guard(() =>
					adminFetch(`/comments/${row.id}`, { method: "PATCH", body: { action } }),
				);
				flash("ok", action === "approve" ? "已放行，前台可见" : "已拒绝");
			}
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
				<h1>评论审核</h1>
				{toast && <span className={`admin-toast admin-toast--${toast.kind}`}>{toast.text}</span>}
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
				<p className="admin-hint">该状态下暂无评论。</p>
			) : (
				<ul className="admin-review">
					{rows.map((row) => (
						<li key={row.id} className="admin-review__item">
							<div className="admin-review__head">
								<span className="admin-review__author">{row.author}</span>
								<span className="admin-review__post">于「{row.postTitle}」</span>
								<span className={`admin-tag${row.status === "approved" ? " admin-tag--ok" : ""}`}>
									{row.status === "pending" ? "待审核" : row.status === "approved" ? "已放行" : "已拒绝"}
								</span>
								<span className="admin-review__time admin-table__mono">
									{String(row.createdAt).slice(0, 16).replace("T", " ")}
								</span>
							</div>
							<p className="admin-review__body">{row.body}</p>
							<div className="admin-review__ops">
								{row.status !== "approved" && (
									<button
										type="button"
										className="admin-btn admin-btn--sm admin-btn--primary"
										disabled={busyId === row.id}
										onClick={() => act(row, "approve")}
									>
										放行
									</button>
								)}
								{row.status === "pending" && (
									<button
										type="button"
										className="admin-btn admin-btn--sm admin-btn--warn"
										disabled={busyId === row.id}
										onClick={() => act(row, "reject")}
									>
										拒绝
									</button>
								)}
								<button
									type="button"
									className="admin-btn admin-btn--sm admin-btn--danger"
									disabled={busyId === row.id}
									onClick={() => act(row, "delete")}
								>
									删除
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
