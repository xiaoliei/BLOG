import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

/* ============================================================
   列表/资源加载 hook：统一「加载 → 数据 / 错误 / 刷新」模式
   - data 初始为 null（区分"加载中"与"空列表"）
   - 失败把 err.message 写入 error；成功不清除旧 error
     （与重构前各页面 load() 的行为逐字对齐，避免引入行为差异）
   - deps 由调用方声明（等价于原先 useCallback(load, [guard, status]) 的依赖），
     变化时自动重新加载；fetcher 始终取最新（ref 中转，不进依赖）
   - refetch 返回 Promise，便于写操作后串联刷新
   ============================================================ */

export interface AsyncResource<T> {
	data: T | null;
	error: string | null;
	setError: Dispatch<SetStateAction<string | null>>;
	refetch: () => Promise<void>;
}

export function useAsyncResource<T>({ fetcher, deps = [] }: { fetcher: () => T | Promise<T>; deps?: readonly unknown[] }): AsyncResource<T> {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fetcherRef = useRef(fetcher);
	fetcherRef.current = fetcher;

	const load = useCallback(
		() =>
			Promise.resolve(fetcherRef.current())
				.then(setData)
				.catch((e: unknown) => setError((e as Error)?.message || String(e))),
		[],
	);

	/* 首次挂载 + deps 变化时加载（deps 数组长度在调用处固定） */
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => { void load(); }, deps as React.DependencyList);

	return { data, error, setError, refetch: load };
}
