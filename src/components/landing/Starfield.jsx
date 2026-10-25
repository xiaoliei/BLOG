import { useEffect, useRef } from 'react';
import { startStars } from '../../lib/stars';

export default function Starfield({ staticFrame = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    return startStars(canvas, { staticFrame });
  }, [staticFrame]);

  return <canvas ref={canvasRef} id="stars" />;
}
