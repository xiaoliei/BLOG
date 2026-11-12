const pad2 = (value: number): string => String(value).padStart(2, '0');

// Calendar dates (such as a post's chosen publication date) are not instants.
export function localDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localDateTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${localDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function localDateAtMinutes(minutes: number, reference: Date = new Date()): Date {
  const date = new Date(reference);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

interface TimeKeyframe { hour: number; sky: string; ink: string; ambient: number; sun: number; light: string; elevation: number; }

const KEYFRAMES: TimeKeyframe[] = [
  { hour: 0, sky: '#182945', ink: '#f3f8ff', ambient: 0.95, sun: 0.35, light: '#a8c7ec', elevation: 16 },
  { hour: 5, sky: '#243c5c', ink: '#f3f8ff', ambient: 1.05, sun: 0.45, light: '#adc9e5', elevation: 18 },
  { hour: 7, sky: '#f5b879', ink: '#173d3e', ambient: 1.7, sun: 1.6, light: '#ffd5a0', elevation: 32 },
  { hour: 9, sky: '#82dafa', ink: '#173d3e', ambient: 2.25, sun: 2.4, light: '#fff2d3', elevation: 62 },
  { hour: 16, sky: '#82dafa', ink: '#173d3e', ambient: 2.25, sun: 2.4, light: '#fff2d3', elevation: 62 },
  { hour: 18, sky: '#f3a67c', ink: '#173d3e', ambient: 1.65, sun: 1.45, light: '#ffc799', elevation: 28 },
  { hour: 20, sky: '#253b5c', ink: '#f3f8ff', ambient: 1.05, sun: 0.45, light: '#b5c9e8', elevation: 17 },
  { hour: 24, sky: '#182945', ink: '#f3f8ff', ambient: 0.95, sun: 0.35, light: '#a8c7ec', elevation: 16 },
];

function mixColor(a: string, b: string, t: number): string {
  // 通道值必须转回十六进制再补零：补零针对的是十六进制位宽，
  // 直接补十进制会把 #82dafa 变成非法的 #130218250，three.js 会拒绝并沿用旧色。
  const channel = (offset: number): number => Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - t) + parseInt(b.slice(offset, offset + 2), 16) * t);
  const hex2 = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${[1, 3, 5].map((offset): string => hex2(channel(offset))).join('')}`;
}

export type WorldTimePhase = 'morning' | 'day' | 'evening' | 'night';
export interface WorldTime {
  phase: WorldTimePhase;
  sky: string;
  ink: string;
  light: string;
  ambient: number;
  sun: number;
  sunX: number;
  elevation: number;
  sunZ: number;
}

export function localWorldTime(date: Date = new Date()): WorldTime {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  // +X is east and -X is west in the harbor. Continue behind the town at night.
  const orbit = (hour - 6) * Math.PI / 12;
  const nextIndex = KEYFRAMES.findIndex(frame => frame.hour > hour);
  const end = KEYFRAMES[nextIndex] as TimeKeyframe;
  const start = KEYFRAMES[nextIndex - 1] as TimeKeyframe;
  const t = (hour - start.hour) / (end.hour - start.hour);
  const blend = (key: 'ambient' | 'sun' | 'elevation'): number => start[key] + (end[key] - start[key]) * t;
  return {
    phase: hour < 5 || hour >= 20 ? 'night' : hour < 9 ? 'morning' : hour < 16 ? 'day' : 'evening',
    sky: mixColor(start.sky, end.sky, t),
    ink: mixColor(start.ink, end.ink, t),
    light: mixColor(start.light, end.light, t),
    ambient: blend('ambient'),
    sun: blend('sun'),
    sunX: Math.cos(orbit) * 80,
    elevation: blend('elevation'),
    sunZ: Math.sin(orbit) * 40,
  };
}
