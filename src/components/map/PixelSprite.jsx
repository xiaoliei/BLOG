import { useMemo } from 'react';
import { SPRITES } from '../../lib/sprites.js';

/* 把像素精灵渲染为 SVG（crispEdges，任意尺寸清晰） */
export default function PixelSprite({ name, sprite, size = 32, className = '', title }) {
  const def = useMemo(() => {
    const s = sprite || SPRITES[name];
    if (!s) return null;
    const rects = [];
    for (let y = 0; y < s.rows.length; y += 1) {
      const row = s.rows[y];
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x];
        const color = s.palette[ch];
        if (!color) continue;
        rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />);
      }
    }
    return { w: s.rows[0].length, h: s.rows.length, rects };
  }, [name, sprite]);

  if (!def) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${def.w} ${def.h}`}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {def.rects}
    </svg>
  );
}
