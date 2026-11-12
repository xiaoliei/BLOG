import { useEffect, useRef } from 'react';
import { startStars } from '../../lib/stars.ts';

export default function Starfield({ staticFrame = false }: { staticFrame?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    return startStars(canvas, { staticFrame });
  }, [staticFrame]);

  return <canvas ref={canvasRef} id="stars" />;
}
