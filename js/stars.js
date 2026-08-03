/* 2D starfield for the landing page */

export function startStars(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let raf = 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const COLORS = ['#CFE4FF', '#9FB8E0', '#1ABC9C', '#EAF2FB', '#E67E22'];

  function makeStar(initial) {
    return {
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.6,
      color: COLORS[Math.floor(Math.random() * (initial ? COLORS.length : COLORS.length - 1))],
      drift: 0.002 + Math.random() * 0.006,
    };
  }

  const stars = Array.from({ length: 210 }, () => makeStar(true));
  let shooting = null;

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnShooting() {
    shooting = {
      x: Math.random() * w * 0.8 + w * 0.1,
      y: Math.random() * h * 0.3,
      vx: 2.2 + Math.random() * 2.2,
      vy: 0.8 + Math.random() * 1.0,
      life: 1,
    };
  }

  let lastShoot = 0;

  function frame(t) {
    const sec = t / 1000;
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(sec * s.speed + s.phase));
      s.y += s.drift * 0.01;
      if (s.y > 1.02) s.y = -0.02;
      ctx.globalAlpha = tw * 0.85;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
      // 主星周围 1 像素辉光
      ctx.globalAlpha = tw * 0.18;
      ctx.fillRect(s.x * w - s.r * 2.4, s.y * h - 0.5, s.r * 4.8, 1);
      ctx.fillRect(s.x * w - 0.5, s.y * h - s.r * 2.4, 1, s.r * 4.8);
    }

    // 偶尔的流星
    if (sec - lastShoot > 6 + Math.random() * 5 && !shooting) {
      spawnShooting();
      lastShoot = sec;
    }
    if (shooting) {
      shooting.life -= 0.012;
      shooting.x += shooting.vx;
      shooting.y += shooting.vy;
      const grad = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x - shooting.vx * 16, shooting.y - shooting.vy * 16);
      grad.addColorStop(0, `rgba(207, 228, 255, ${Math.max(0, shooting.life) * 0.9})`);
      grad.addColorStop(1, 'rgba(207, 228, 255, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(shooting.x, shooting.y);
      ctx.lineTo(shooting.x - shooting.vx * 16, shooting.y - shooting.vy * 16);
      ctx.stroke();
      if (shooting.life <= 0) shooting = null;
    }

    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return () => cancelAnimationFrame(raf);
}
