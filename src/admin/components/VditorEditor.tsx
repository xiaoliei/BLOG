import { useEffect, useRef } from "react";
import { getDevToken } from "../api.ts";

/* ============================================================
   Vditor 编辑器封装（动态 import，仅 admin chunk）
   - props.value 只作初始值/加载后 setValue；此后内容实时存于 Vditor 实例
   - getValue/insertValue 经 ref 暴露给页面（collect 与图片插入用）
   - 上传走 /api/admin/upload（直连 fetch，带同源凭证与开发令牌）
   ============================================================ */

/**
 * vditor 包的类型声明把 IUpload/IVditor 留在内部 d.ts，未从包入口导出。
 * 这里按 dist/types/index.d.ts 的原样签名最小镜像本用到的字段。
 */
interface VditorInstance {
	setValue(value: string): void;
	getValue(): string;
	insertValue(value: string, render?: boolean): void;
	destroy(): void;
}

interface VditorUploadOptions {
	accept?: string;
	max?: number;
	/** 返回 null 表示走默认行为；返回错误串或 true（阻断默认）按 vditor 约定。 */
	handler?: (files: File[]) => string | null | boolean | Promise<string> | Promise<null> | Promise<boolean>;
}

interface VditorConstructorOptions {
	cdn?: string;
	height?: number | string;
	mode?: 'sv' | 'wysiwyg' | 'ir';
	lang?: string;
	cache?: { enable?: boolean };
	placeholder?: string;
	value?: string;
	upload?: VditorUploadOptions;
	toolbar?: string[];
	after?: () => void;
}

type VditorConstructor = new (el: HTMLElement, options?: VditorConstructorOptions) => VditorInstance;

/** 页面经 apiRef 持有的编辑器能力面 */
export interface VditorApi {
	getValue: () => string | undefined;
	insertValue: (md: string) => void;
	onReady: (fn: (vd: VditorInstance) => void) => void;
}

export default function VditorEditor({ value, onFlash, apiRef }: {
	value: string;
	onFlash: (kind: "ok" | "err", text: string) => void;
	apiRef: { current: VditorApi | null };
}) {
	const elRef = useRef<HTMLDivElement | null>(null);
	const vdRef = useRef<VditorInstance | null>(null);
	/* onReady 在编辑器未就绪时排队，after: 里统一补调（避免文章先于编辑器加载完成时丢 setValue） */
	const readyQueueRef = useRef<((vd: VditorInstance) => void)[]>([]);

	/* 剪贴板/拖拽图片 → /api/admin/upload → URL 插入 markdown */
	const upload: VditorUploadOptions = {
		accept: "image/*",
		max: 5 * 1024 * 1024,
		handler: (files) => {
			const uploadOne = async (file: File): Promise<string> => {
				const res = await fetch("/api/admin/upload", {
					method: "POST",
					credentials: "same-origin",
					headers: {
						"Content-Type": file.type,
						...(getDevToken() ? { "X-Admin-Token": getDevToken() } : {}),
					},
					body: file,
				});
				const payload: { message?: string; url?: string } = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(payload.message || `上传失败（${res.status}）`);
				if (!payload.url) throw new Error("上传响应缺少 url");
				return payload.url;
			};
			Promise.all([...files].map(uploadOne))
				.then((urls) => {
					const md = urls.map((u) => `![](${u})`).join("\n");
					vdRef.current?.insertValue(md);
					onFlash("ok", "图片已上传并插入");
				})
				.catch((e: unknown) => onFlash("err", (e as Error).message));
			return true; // 阻止默认上传行为
		},
	};

	useEffect(() => {
		let disposed = false;
		let vd: VditorInstance | null = null;
		import("vditor")
			.then((module) => {
				const VditorCtor = module.default as VditorConstructor;
				if (disposed || !elRef.current) return;
				vd = new VditorCtor(elRef.current, {
					cdn: "/vditor",
					height: 460,
					mode: "ir",
					lang: "zh_CN",
					cache: { enable: false },
					placeholder: "在这里写下正文（Markdown）…",
					value,
					upload,
					toolbar: [
						"headings",
						"bold",
						"italic",
						"strike",
						"|",
						"list",
						"ordered-list",
						"check",
						"quote",
						"line",
						"|",
						"link",
						"table",
						"code",
						"inline-code",
						"|",
						"undo",
						"redo",
						"|",
						"edit-mode",
						"preview",
						"fullscreen",
					],
					after: () => {
						if (disposed || !vd) return;
						vdRef.current = vd;
						vd.setValue(value);
						/* 补调文章加载早于编辑器就绪时排队的 onReady 回调 */
						const queued = readyQueueRef.current;
						readyQueueRef.current = [];
						for (const fn of queued) fn(vd);
					},
				});
			})
			.catch(() => onFlash("err", "编辑器加载失败，请刷新重试"));

		/* 向页面暴露实例能力（getValue/insertValue/就绪回调） */
		apiRef.current = {
			getValue: () => vdRef.current?.getValue(),
			insertValue: (md) => vdRef.current?.insertValue(md),
			onReady: (fn) => {
				if (vdRef.current) fn(vdRef.current);
				else readyQueueRef.current.push(fn);
			},
		};

		return () => {
			disposed = true;
			try {
				vd?.destroy?.();
			} catch {
				/* ignore */
			}
			vdRef.current = null;
			readyQueueRef.current = [];
			apiRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return <div className="admin-editor" ref={elRef} />;
}
