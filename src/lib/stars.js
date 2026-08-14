/* 2D 星空粒子（启动页背景，300 颗呼吸闪烁星点 + 偶发流星） */

let paused = false;

/* 过渡重叠期暂停星空绘制（避免与 3D 头颅/房间双 WebGL 叠加抢帧） */
export function setStarsPaused(v) {
  paused = v;
}

export function startStars(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let raf = 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // 参考稿风格：白色系为主的呼吸闪烁星点，少量青蓝点缀
  const COLORS = ['#FFFFFF', '#EAF2FB', '#D6E4F5', '#C9DCF2', '#1ABC9C'];

  function makeStar() {
    return {
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.2 + 0.5, // 0.5 ~ 1.7
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 1.6, // 呼吸闪烁角速度 rad/s（周期约 2.6~7.8s）
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  }

  const stars = Array.from({ length: 300 }, () => makeStar());
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
    if (paused) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const sec = t / 1000;
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      // 呼吸闪烁：alpha 在 0 ~ 1 之间平滑起伏
      const tw = Math.abs(Math.sin(sec * s.speed + s.phase));
      ctx.globalAlpha = 0.08 + tw * 0.9;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 偶尔的白色流星（点缀）
    if (sec - lastShoot > 6 + Math.random() * 5 && !shooting) {
      spawnShooting();
      lastShoot = sec;
    }
    if (shooting) {
      shooting.life -= 0.012;
      shooting.x += shooting.vx;
      shooting.y += shooting.vy;
      const grad = ctx.createLinearGradient(
        shooting.x,
        shooting.y,
        shooting.x - shooting.vx * 16,
        shooting.y - shooting.vy * 16
      );
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

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
