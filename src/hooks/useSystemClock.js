import { useEffect, useState } from 'react';
import { SYS_INIT } from '../config/site';

const BOOT_AT = Date.now();
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/* 缓慢漂移的伪坐标 + 网络速率抖动，营造"系统在运行"的感觉（与 demo 一致） */
function drift(sys) {
  return {
    coords: {
      x: sys.coords.x + (Math.random() - 0.5) * 0.06,
      y: 64 + Math.sin(Date.now() / 9000) * 0.4,
      z: sys.coords.z + (Math.random() - 0.5) * 0.05,
    },
    net: {
      state: sys.net.state,
      up: Math.max(0.1, sys.net.up + (Math.random() - 0.5) * 0.35),
    },
  };
}

/* 每秒刷新一次系统时间与状态栏数据 */
export function useSystemClock() {
  const [state, setState] = useState(() => ({
    now: new Date(),
    sys: SYS_INIT,
  }));

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => ({
        now: new Date(),
        sys: drift(prev.sys),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const { now, sys } = state;
  return {
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${DAYS[now.getDay()]}`,
    coords: sys.coords,
    uptime: `UP ${fmtUptime(Date.now() - BOOT_AT)}`,
    upSpeed: `${sys.net.up.toFixed(2)} MB/s`,
  };
}
