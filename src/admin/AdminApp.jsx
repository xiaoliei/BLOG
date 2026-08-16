import { useCallback, useEffect, useState } from "react";
import { adminFetch, getDevToken, setDevToken } from "./api.js";
import PostList from "./PostList.jsx";
import PostEdit from "./PostEdit.jsx";
import ModuleManage from "./ModuleManage.jsx";
import CommentReview from "./CommentReview.jsx";
import SiteSettings from "./SiteSettings.jsx";

/* ============================================================
   /admin 后台壳：内部视图切换（posts / modules / comments）
   Vditor 只会在 PostEdit（admin chunk 内）动态引入
   ============================================================ */

const NAV = [
	{ id: "posts", label: "文章" },
	{ id: "modules", label: "栏目" },
	{ id: "comments", label: "评论" },
	{ id: "settings", label: "站点设置" },
];

export default function AdminApp() {
	const [view, setView] = useState("posts"); // posts | modules | comments
	const [editing, setEditing] = useState(null); // null | { id? } 新建无 id
	const [authError, setAuthError] = useState(null);
	const [tokenInput, setTokenInput] = useState("");
	const hasToken = Boolean(getDevToken());

	const guard = useCallback(async (fn) => {
		try {
			setAuthError(null);
			return await fn();
		} catch (err) {
			if (err.status === 401) setAuthError(err.message);
			throw err;
		}
	}, []);

	/* 退出：清本地令牌并回前台 */
	const handleLogout = useCallback(() => {
		setDevToken("");
		window.location.href = "/";
	}, []);

	useEffect(() => {
		document.title = "后台 · 小礼工坊";
	}, []);

	const openList = useCallback(() => {
		setEditing(null);
		setView("posts");
	}, []);

	return (
		<div className="admin-root">
			<aside className="admin-side">
				<div className="admin-side__brand">
					<span className="admin-side__mark">礼</span>
					小礼工坊 · 后台
				</div>
				<nav className="admin-side__nav">
					{NAV.map((n) => (
						<button
							key={n.id}
							type="button"
							className={`admin-side__item${view === n.id && !editing ? " is-active" : ""}`}
							onClick={() => {
								setEditing(null);
								setView(n.id);
							}}
						>
							{n.label}
						</button>
					))}
				</nav>
				<div className="admin-side__foot">
					<a className="admin-side__item" href="/">
						◂ 回到前台
					</a>
					<button type="button" className="admin-side__item" onClick={handleLogout}>
						退出
					</button>
				</div>
			</aside>

			<main className="admin-main">
				{authError && (
					<div className="admin-auth">
						<p className="admin-auth__msg">{authError}</p>
						{!hasToken && (
							<form
								className="admin-auth__form"
								onSubmit={(e) => {
									e.preventDefault();
									setDevToken(tokenInput.trim());
									window.location.reload();
								}}
							>
								<input
									type="password"
									placeholder="本地开发令牌（.dev.vars 的 ADMIN_DEV_TOKEN）"
									value={tokenInput}
									onChange={(e) => setTokenInput(e.target.value)}
								/>
								<button type="submit" className="admin-btn">
									保存令牌
								</button>
							</form>
						)}
					</div>
				)}

				{view === "posts" &&
					(editing ? (
						<PostEdit key={editing.id ?? "new"} initial={editing} onBack={openList} guard={guard} />
					) : (
						<PostList guard={guard} onEdit={(id) => setEditing({ id })} onNew={() => setEditing({})} />
					))}
				{view === "modules" && <ModuleManage guard={guard} />}
				{view === "comments" && <CommentReview guard={guard} />}
				{view === "settings" && <SiteSettings guard={guard} />}
			</main>
		</div>
	);
}
