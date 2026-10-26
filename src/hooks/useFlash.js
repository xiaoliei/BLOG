import { useCallback, useRef, useState } from "react";

/* ============================================================
   轻量瞬时提示（toast）hook
   - flash("ok"|"err", 文案)：显示提示，单槽：新提示顶掉旧提示
   - 2600ms 后自动消失（与原各页面内联实现一致）
   ============================================================ */

const FLASH_MS = 2600;

export function useFlash() {
	const [toast, setToast] = useState(null); // null | { kind, text }
	const timerRef = useRef(null);

	const flash = useCallback((kind, text) => {
		setToast({ kind, text });
		/* 重置倒计时：连发时以最后一次为准，且不会被上一次的计时器提前清掉 */
		if (timerRef.current != null) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => setToast(null), FLASH_MS);
	}, []);

	return { toast, flash };
}
