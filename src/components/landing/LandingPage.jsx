import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSystemClock } from '../../hooks/useSystemClock';
import HeadViewer from './HeadViewer.jsx';
import LandingClock from './LandingClock.jsx';
import ScreenOverlays from './ScreenOverlays.jsx';
import Starfield from './Starfield.jsx';

const ENTER_KEYS = ['Enter', ' ', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
const FADE_MS = 380; // 时间文本淡出时长：淡完后再开启动画

/* 点击进入 → 文本淡出 → 3D 头颅缩放旋转至满屏 → reveal 淡出露出博客首页 */
export default function LandingPage({ revealing = false, onZoomDone, onRevealDone }) {
  const clock = useSystemClock();
  const [phase, setPhase] = useState('idle'); // idle → leaving（文本淡出）→ active（缩放动画）
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

  return (
    <div className={`landing-root${revealing ? ' is-revealing' : ''}`}>
      <Starfield />
      <ScreenOverlays />

      <main className="landing-stage" onClick={enter} onPointerDown={enter}>
        <HeadViewer
          active={phase === 'active'}
          revealing={revealing}
          onZoomDone={onZoomDone}
          onRevealDone={onRevealDone}
        />

        {/* 时钟淡出后保留占位（visibility:hidden），避免 flex 重排导致地球模型下移 */}
        <LandingClock
          time={clock.time}
          date={clock.date}
          className={phase !== 'idle' ? 'is-leaving' : ''}
        />
        <div className={`landing-hint${phase !== 'idle' ? ' is-leaving' : ''}`}>▸ 点击任意处进入 ◂</div>
      </main>
    </div>
  );
}
