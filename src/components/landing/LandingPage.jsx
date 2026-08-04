import { useCallback, useEffect, useState } from 'react';
import { BOOT_LINES, SITE } from '../../config/site';
import { useSystemClock } from '../../hooks/useSystemClock';
import BootOverlay from './BootOverlay.jsx';
import HeadViewer from './HeadViewer.jsx';
import HudCorners from './HudCorners.jsx';
import LandingClock from './LandingClock.jsx';
import ScreenOverlays from './ScreenOverlays.jsx';
import Starfield from './Starfield.jsx';
import StatusBar from './StatusBar.jsx';

const ENTER_KEYS = ['Enter', ' ', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];

export default function LandingPage({ onComplete }) {
  const clock = useSystemClock();
  const [booting, setBooting] = useState(false);

  /* 重复触发是幂等的：booting 已为 true 时再次 setState(true) 不会重渲染 */
  const enter = useCallback(() => setBooting(true), []);

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
    <div className="landing-root">
      <Starfield />
      <ScreenOverlays />
      <HudCorners version={SITE.version} session={SITE.session} />

      <main className="landing-stage" onClick={enter} onPointerDown={enter}>
        <div className="landing-bootline">[ LOADING VOXEL HEAD // 体素头颅 ]</div>
        <HeadViewer />
        <LandingClock time={clock.time} date={clock.date} />
        <div className="landing-hint">▸ CLICK ANYWHERE / SCROLL TO ENTER // 点击任意处进入 ◂</div>
      </main>

      <StatusBar {...clock} />

      {booting && <BootOverlay lines={BOOT_LINES} onComplete={onComplete} />}
    </div>
  );
}
