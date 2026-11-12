import LandingClock from '../components/landing/LandingClock.tsx';
import Starfield from '../components/landing/Starfield.tsx';
import ScreenOverlays from '../components/landing/ScreenOverlays.tsx';
import Moon from '../components/landing/Moon.tsx';
import type { SystemClock } from '../hooks/useSystemClock.ts';

interface LandingViewProps {
  active: boolean;
  leaving: boolean;
  entering: boolean;
  entryPreview: boolean;
  clock: SystemClock;
  ready: boolean;
  skipEarth: boolean;
  fallback: boolean;
  islandName: string;
  onEnter: (event?: { detail?: number } | MouseEvent) => void;
}

// 着陆页组合区：星空背景与「时钟 + 入场按钮」浮层。
// active 为真时渲染完整着陆页；离场（leaving）时仅保留星空背景，
// 与拆分前 WorldApp 中的两处条件渲染一一对应。
export default function LandingView({ active, leaving, entering, entryPreview, clock, ready, skipEarth, fallback, islandName, onEnter }: LandingViewProps) {
  if (!active && !leaving) return null;
  return <>
    <div className="landing-root world-landing-background" aria-hidden="true"><Starfield staticFrame={entryPreview} /><ScreenOverlays /></div>
    {active && <div className="landing-root world-landing-ui" inert={entering} aria-hidden={entering ? 'true' : undefined}>
      <Moon staticFrame={entryPreview} />
      <div className="world-clock"><LandingClock time={clock.time} date={clock.date} /></div>
      <button className="world-enter" disabled={!ready} onClick={onEnter}>{!ready ? '正在准备你的方块世界…' : skipEarth || fallback ? `直接浏览${islandName}` : '点击进入像素世界'}<span aria-hidden="true">↓</span></button>
    </div>}
  </>;
}
