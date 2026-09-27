import { useEffect, useRef } from 'react';

/* ============================================================
   启动页像素月球（复原旧版启动页）
   ------------------------------------------------------------
   旧版（d739075）中月球钉在 3D 头颅（地球）的左上角，待机时
   以 sin(t * 0.9) 驱动垂直摆动，与地球待机摆动同相位；进入
   过渡时随进度淡出。当前启动页没有头颅 DOM，月球改由本组件
   独立驱动同样的摆动曲线，位置锚定在三维地球视口投影的
   左上角（见 landing.css 的 .world-moon-anchor）。
   ============================================================ */
export default function Moon() {
  const cubeRef = useRef(null);

  useEffect(() => {
    const cube = cubeRef.current;
    if (!cube) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const phase = Math.sin(((now - start) / 1000) * 0.9);
      const amp = cube.offsetWidth * 0.2;
      cube.style.transform = `rotate(8deg) translateY(${(phase * -amp).toFixed(2)}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="world-moon-anchor" aria-hidden="true">
      <div className="float-cube" ref={cubeRef} />
    </div>
  );
}
