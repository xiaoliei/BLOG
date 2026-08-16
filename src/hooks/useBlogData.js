import { useCallback, useEffect, useState } from "react";
import { getModules, getPosts, resolveDataSource } from "../lib/api";

/* ============================================================
   博客数据 hooks：modules / posts 列表 + 加载/错误态 + 重试
   静态数据源（feature flag）时同步返回，无骨架态
   ============================================================ */

const STATIC = () => resolveDataSource() === "static";

export function useModules() {
	const [state, setState] = useState({
		data: null,
		loading: true,
		error: null,
	});

	const load = useCallback(() => {
		if (STATIC()) {
			getModules().then((data) =>
				setState({ data, loading: false, error: null }),
			);
			return;
		}
		setState((s) => ({ ...s, loading: s.data == null }));
		getModules()
			.then((data) => setState({ data, loading: false, error: null }))
			.catch(() =>
				setState((s) => ({
					data: s.data,
					loading: false,
					error: new Error("modules_failed"),
				})),
			);
	}, []);

	useEffect(load, [load]);
	return { ...state, retry: load };
}

export function usePosts({ moduleId, limit } = {}) {
	const key = `${moduleId ?? "all"}:${limit ?? "all"}`;
	const [state, setState] = useState({
		data: null,
		loading: true,
		error: null,
	});

	const load = useCallback(() => {
		if (STATIC()) {
			getPosts({ moduleId, limit }).then((data) =>
				setState({ data, loading: false, error: null }),
			);
			return;
		}
		setState((s) => ({
			data: null, /* 切换筛选时重挂骨架，避免串栏目内容 */
			loading: true,
			error: null,
		}));
		getPosts({ moduleId, limit })
			.then((data) => setState({ data, loading: false, error: null }))
			.catch(() =>
				setState({ data: null, loading: false, error: new Error("posts_failed") }),
			);
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(load, [load]);
	return { ...state, retry: load };
}
