import { useEffect, useRef } from 'react';
import { LANDMARKS, WORLD } from '../../config/world.js';

const MW = 152;
const MH = 152; // 64:64 正方形

export default function Minimap({
  world,
  view,
  viewport,
  visited,
  playerPos,
  revealTick,
  fogCanvasRef,
  terrainCanvasRef,
  terrainReady,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const terrain = terrainCanvasRef.current;
    const fog = fogCanvasRef.current;
    if (!canvas || !terrain || !fog || !terrainReady) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, MW, MH);
    ctx.drawImage(terrain, 0, 0, terrain.width, terrain.height, 0, 0, MW, MH);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(fog, 0, 0, fog.width, fog.height, 0, 0, MW, MH);
    ctx.globalAlpha = 1;

    const sx = (v) => (v / (WORLD.tilesX * WORLD.tileSize)) * MW;
    const sy = (v) => (v / (WORLD.tilesY * WORLD.tileSize)) * MH;

    // 视口矩形
    const vx = (-view.ox / view.scale / (WORLD.tilesX * WORLD.tileSize)) * MW;
    const vy = (-view.oy / view.scale / (WORLD.tilesY * WORLD.tileSize)) * MH;
    const vw = (viewport.w / view.scale / (WORLD.tilesX * WORLD.tileSize)) * MW;
    const vh = (viewport.h / view.scale / (WORLD.tilesY * WORLD.tileSize)) * MH;
    ctx.strokeStyle = 'rgba(245,243,220,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);

    // 地标
    for (const lm of LANDMARKS) {
      ctx.fillStyle = visited.has(lm.id) ? lm.accent : 'rgba(180,190,205,0.7)';
      ctx.fillRect(sx(lm.x * WORLD.tileSize) - 2, sy(lm.y * WORLD.tileSize) - 2, 4, 4);
    }

    // 玩家
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(sx(playerPos.x), sy(playerPos.y), 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0A101A';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [view, viewport, visited, playerPos, revealTick, fogCanvasRef, terrainCanvasRef, terrainReady]);

  return (
    <div className="world-minimap" data-nopan>
      <canvas ref={canvasRef} width={MW} height={MH} />
      <span className="world-minimap-label">MAP</span>
    </div>
  );
}
