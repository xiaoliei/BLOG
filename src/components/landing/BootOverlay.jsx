import { useEffect, useState } from 'react';

const FIRST_DELAY = 160;
const LINE_DELAY = 190;
const NAV_EXTRA = 700;

/* 开机动画：逐行打印启动日志，结束后跳转到目标地址 */
export default function BootOverlay({ lines, destination }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const timers = lines.map((_, i) =>
      setTimeout(() => setShown(i + 1), FIRST_DELAY + i * LINE_DELAY)
    );
    const navTimer = setTimeout(
      () => window.location.assign(destination),
      FIRST_DELAY + lines.length * LINE_DELAY + NAV_EXTRA
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(navTimer);
    };
  }, [lines, destination]);

  return (
    <div id="boot" className="on">
      {lines.slice(0, shown).map((line, i) => (
        <div key={i} className="boot-line">
          {line.before}
          {line.bold && <b>{line.bold}</b>}
          {line.after}
          <span className="ok">OK</span>
        </div>
      ))}
    </div>
  );
}
