import { useCallback, useEffect, useMemo, useState } from 'react';
import HomePage from './components/home/HomePage.jsx';
import LandingPage from './components/landing/LandingPage.jsx';

const initialHash = typeof window !== 'undefined' ? window.location.hash : '';

/* 三阶段：landing（启动页）→ revealing（主页在头颅下挂载并淡入）→ home
   hash '#home' 可跳过启动页直达首页 */
export default function App() {
  const [phase, setPhase] = useState(initialHash === '#home' ? 'home' : 'landing');

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  /* 头颅缩放旋转覆盖全屏完成：挂载主页（在其下方），启动层开始淡出 */
  const handleZoomDone = useCallback(() => {
    if (reducedMotion) {
      window.location.hash = '#home';
      setPhase('home');
    } else {
      setPhase('revealing');
    }
  }, [reducedMotion]);

  /* reveal 淡出完成：卸载启动层，只保留博客首页 */
  const handleRevealDone = useCallback(() => {
    window.location.hash = '#home';
    setPhase('home');
  }, []);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      if (h === '#home') setPhase('home');
      else if (h === '') setPhase('landing');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      {phase !== 'landing' && <HomePage />}
      {phase !== 'home' && (
        <LandingPage
          revealing={phase === 'revealing'}
          onZoomDone={handleZoomDone}
          onRevealDone={handleRevealDone}
        />
      )}
    </>
  );
}
