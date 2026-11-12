import { useState } from "react";
import { adminFetch, adminQuery } from "./api.ts";
import { useAsyncResource } from "../hooks/useAsyncResource.ts";
import { useFlash } from "../hooks/useFlash.ts";
import { localDateTime } from "../lib/local-time.ts";
import { Button } from "./components/Button.tsx";
import { ErrorText, HintText, Toasts } from "./components/Feedback.tsx";
import { TabBar } from "./components/TabBar.tsx";
import type { Guard } from "./AdminApp.tsx";
import type { AdminCommentRow } from "../types/api.ts";

/* 评论审核队列：pending / approved / rejected 筛选，放行 / 拒绝 / 删除 */

const STATUS_TABS = [
	{ id: "pending", label: "待审核" },
	{ id: "approved", label: "已放行" },
	{ id: "rejected", label: "已拒绝" },
	{ id: "", label: "全部" },
];

type ReviewAction = "approve" | "reject" | "delete";

export default function CommentReview({ guard }: { guard: Guard }) {
	const [status, setStatus] = useState("pending");
	const [busyId, setBusyId] = useState<number | null>(null);
	const { toast, flash } = useFlash();

	/* 列表加载：status 变化自动重查（等价原 useCallback(load, [guard, status])） */
	const { data: rows, error, setError, refetch: load } = useAsyncResource({
		fetcher: () => guard(() => adminFetch<AdminCommentRow[]>(`/comments${adminQuery({ status })}`)),
		deps: [guard, status],
	});

	const act = async (row: AdminCommentRow, action: ReviewAction) => {
		setBusyId(row.id);
		setError(null);
		try {
			if (action === "delete") {
				if (!window.confirm(`删除「${row.author}」的评论？`)) return;
				await guard(() => adminFetch(`/comments/${row.id}`, { method: "DELETE" }));
				flash("ok", "已删除");
			} else {
				await guard(() => adminFetch(`/comments/${row.id}`, { method: "PATCH", body: { action } }));
				flash("ok", action === "approve" ? "已放行，前台可见" : "已拒绝");
			}
			load();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<section className="admin-page">
			<header className="admin-page__head">
				<h1>评论审核</h1>
				<Toasts toast={toast} as="span" />
			</header>

			<TabBar tabs={STATUS_TABS} value={status} onChange={setStatus} />

			<ErrorText>{error}</ErrorText>

			{rows == null ? (
				<HintText>加载中…</HintText>
			) : rows.length === 0 ? (
				<HintText>该状态下暂无评论。</HintText>
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
									{localDateTime(row.createdAt)}
								</span>
							</div>
							<p className="admin-review__body">{row.body}</p>
							<div className="admin-review__ops">
								{row.status !== "approved" && (
									<Button small variant="primary" disabled={busyId === row.id} onClick={() => act(row, "approve")}>
										放行
									</Button>
								)}
								{row.status === "pending" && (
									<Button small variant="warn" disabled={busyId === row.id} onClick={() => act(row, "reject")}>
										拒绝
									</Button>
								)}
								<Button small variant="danger" disabled={busyId === row.id} onClick={() => act(row, "delete")}>
									删除
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
