import { useEffect, useRef } from "react";
import { getDevToken } from "../api.js";

/* ============================================================
   Vditor 编辑器封装（动态 import，仅 admin chunk）
   - props.value 只作初始值/加载后 setValue；此后内容实时存于 Vditor 实例
   - getValue/insertValue 经 ref 暴露给页面（collect 与图片插入用）
   - 上传走 /api/admin/upload（直连 fetch，带同源凭证与开发令牌）
   ============================================================ */

export default function VditorEditor({ value, onFlash, apiRef }) {
	const elRef = useRef(null);
	const vdRef = useRef(null);

	/* 剪贴板/拖拽图片 → /api/admin/upload → URL 插入 markdown */
	const upload = {
		accept: "image/*",
		max: 5 * 1024 * 1024,
		handler: (files) => {
			const uploadOne = async (file) => {
				const res = await fetch("/api/admin/upload", {
					method: "POST",
					credentials: "same-origin",
					headers: {
						"Content-Type": file.type,
						...(getDevToken() ? { "X-Admin-Token": getDevToken() } : {}),
					},
					body: file,
				});
				const payload = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(payload.message || `上传失败（${res.status}）`);
				return payload.url;
			};
			Promise.all([...files].map(uploadOne))
				.then((urls) => {
					const md = urls.map((u) => `![](${u})`).join("\n");
					vdRef.current?.insertValue(md);
					onFlash("ok", "图片已上传并插入");
				})
				.catch((e) => onFlash("err", e.message));
			return true; // 阻止默认上传行为
		},
	};

	useEffect(() => {
		let disposed = false;
		let vd = null;
		import("vditor")
			.then(({ default: Vditor }) => {
				if (disposed || !elRef.current) return;
				vd = new Vditor(elRef.current, {
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
						if (disposed) return;
						vdRef.current = vd;
						vd.setValue(value);
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
			apiRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return <div className="admin-editor" ref={elRef} />;
}
