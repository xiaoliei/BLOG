/* ============================================================
   BLOG_OS 站点级配置
   启动页文案、版本号、进入目标地址等集中在这里，方便后续维护。
   ============================================================ */

export const SITE = {
  name: 'BLOG_OS',
  version: 'v2.0.4',
  session: '0x8F2A',
  mode: 'BOOT',
  timezone: 'UTC+8',
};

/* 状态栏初始系统数据（坐标会缓慢漂移，网络速率会抖动，与 demo 一致） */
export const SYS_INIT = {
  coords: { x: -128.42, y: 64.0, z: 92.17 },
  net: { state: 'ONLINE', up: 1.24 },
};

/* 开机动画逐行内容（与 demo 完全一致） */
export const BOOT_LINES = [
  { before: '> INITIALIZE ', bold: 'BLOG_OS', after: ' v2.0.4 ................ ' },
  { before: '> MOUNTING OVERWORLD ........................... ' },
  { before: '> SEED 20260804 · 64×64 TILES .................. ' },
  { before: '> GENERATE TERRAIN ............................ ' },
  { before: '> SCATTER 8 LANDMARKS ......................... ' },
  { before: '> SYNC FOG_OF_WAR ............................. ' },
  { before: '> AUTH SESSION ', bold: '0x8F2A', after: ' ....................... ' },
  { before: '> ENTERING 方块大陆 ............................ ' },
];
