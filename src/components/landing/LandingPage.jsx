import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSystemClock } from '../../hooks/useSystemClock';
import HeadViewer from './HeadViewer.jsx';
import LandingClock from './LandingClock.jsx';
import ScreenOverlays from './ScreenOverlays.jsx';
import Starfield from './Starfield.jsx';

const ENTER_KEYS = ['Enter', ' ', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
const FADE_MS = 380; // 时间文本淡出时长：淡完后再开启动画

/* 启动页调试模式：显示角度面板 + 拖拽调角度 + 手动跳转（?landingDebug=1 开启，默认关闭走自动过渡） */
const LANDING_DEBUG = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('landingDebug') === '1'
  : false;

/* 点击进入 → 文本淡出 → 3D 头颅缩放旋转至交接点 → 交接给房间（聚焦飞行从指定起点起飞）→ reveal 淡出 */
export default function LandingPage({ revealing = false, onZoomHalf, onRevealDone }) {
  const clock = useSystemClock();
  const [phase, setPhase] = useState('idle'); // idle → leaving（文本淡出）→ active（缩放动画）
  const [copied, setCopied] = useState(false); // 调试面板复制反馈
  const viewerApiRef = useRef(null); // HeadViewer 暴露的调试 API
  const debugRef = useRef(null); // 调试面板内容
  const progressRef = useRef(null); // 过渡进度条
  const progressDraggingRef = useRef(false); // 拖拽中不反向覆盖滑块值
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  /* 重复触发是幂等的：仅 idle 状态接受进入 */
  const enter = useCallback(() => {
    setPhase((p) => (p === 'idle' ? 'leaving' : p));
  }, []);

  /* 文本淡出完成后才启动缩放动画 */
  useEffect(() => {
    if (phase !== 'leaving') return undefined;
    const t = window.setTimeout(() => setPhase('active'), reducedMotion ? 0 : FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase, reducedMotion]);

  useEffect(() => {
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > 4) enter();
    };
    const onKeyDown = (e) => {
      if (ENTER_KEYS.includes(e.key)) enter();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enter]);

  /* 调试面板：每 100ms 轮询 HeadViewer 的当前角度/进度 */
  useEffect(() => {
    if (!LANDING_DEBUG) return undefined;
    const timer = window.setInterval(() => {
      const el = debugRef.current;
      const st = viewerApiRef.current?.getState();
      if (!el || !st) return;
      el.textContent =
        'HEAD · live\n' +
        `yaw ${st.yaw.toFixed(1)}°  pitch ${st.pitch.toFixed(1)}°  roll ${st.roll.toFixed(1)}°\n` +
        `zoom ${Math.round(st.e * 100)}%  started ${st.started}\n` +
        `wrap ${st.rect ? `${st.rect.w}×${st.rect.h} @ ${st.rect.left},${st.rect.top}` : '—'}`;
      const slider = progressRef.current;
      if (slider && !progressDraggingRef.current) slider.value = String(st.e);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  /* 复制当前角度信息 */
  const handleCopyDebug = useCallback(async () => {
    const text = debugRef.current?.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, []);

  /* 以当前角度手动触发过渡跳转到房间 */
  const handleJump = useCallback(() => {
    viewerApiRef.current?.jump();
  }, []);

  return (
    <div className={`landing-root${revealing ? ' is-revealing' : ''}`}>
      <Starfield />
      <ScreenOverlays />

      <main className="landing-stage" onClick={enter} onPointerDown={enter}>
        <HeadViewer
          active={phase === 'active'}
          revealing={revealing}
          onZoomHalf={onZoomHalf}
          onRevealDone={onRevealDone}
          debug={LANDING_DEBUG}
          viewerRef={viewerApiRef}
        />

        {/* 时钟淡出后保留占位（visibility:hidden），避免 flex 重排导致地球模型下移 */}
        <LandingClock
          time={clock.time}
          date={clock.date}
          className={phase !== 'idle' ? 'is-leaving' : ''}
        />
        <div className={`landing-hint${phase !== 'idle' ? ' is-leaving' : ''}`}>▸ 点击任意处进入 ◂</div>
      </main>

      {/* 调试面板：当前角度 + 复制 + 以当前角度过渡跳转到房间 */}
      {LANDING_DEBUG && (
        <div className="landing-debug" aria-hidden="true">
          <div className="landing-debug__head">
            <span>LANDING DEBUG</span>
            <button type="button" className="landing-debug__copy" onClick={handleCopyDebug}>
              {copied ? '已复制 ✓' : '复制'}
            </button>
          </div>
          <pre ref={debugRef} className="landing-debug__body" />
          <label className="landing-debug__progress">
            <span>进度</span>
            <input
              ref={progressRef}
              type="range"
              min="0"
              max="1"
              step="0.01"
              defaultValue="0"
              onPointerDown={() => {
                progressDraggingRef.current = true;
              }}
              onPointerUp={() => {
                progressDraggingRef.current = false;
              }}
              onInput={(e) => viewerApiRef.current?.seek(Number(e.target.value))}
            />
          </label>
          <button type="button" className="landing-debug__jump" onClick={handleJump}>
            当前角度过渡跳转到房间 ▸
          </button>
        </div>
      )}
    </div>
  );
}
