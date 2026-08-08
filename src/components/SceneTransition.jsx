/* ============================================================
   SCHEME C 场景切换：方块聚合 / 飞散
   进入场景 = 192 个独立方块从四周飞入、自旋、拼成镐子塔；
   返回地图 = 方块从塔身飞散、淡出。动画由 onDone 驱动视图切换。
   ============================================================ */

import { useEffect, useRef } from 'react';
import { makeCamera, makeRenderer, resize } from '../lib/scene.js';
import {
  addGrid,
  addStageLights,
  buildVoxelCubes,
  clamp01,
  createLayerMeshes,
  EASE,
  frameTower,
  loadTowerData,
  THREE,
} from '../lib/tower.js';

const AGGREGATE_TOTAL = 1.55; // 聚合时长
const SCATTER_TOTAL = 1.3; // 方块散开时长
const COMPLETE_HOLD = 0.22; // 聚合完成后的完整展示停留
const SCATTER_FADE_START = 0.7; // 散开进行到 70% 时开始整体淡出

export default function SceneTransition({ mode, accent = '#0A101A', label = '', onDone }) {
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const pctRef = useRef(null);
  const barRef = useRef(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!mode) return undefined;
    doneRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    /* 减弱动态：跳过 WebGL 动画，短暂停留后直接切换 */
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const t = window.setTimeout(() => onDoneRef.current?.(), 260);
      return () => window.clearTimeout(t);
    }

    let disposed = false;
    let fallbackTimer = 0;

    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = makeCamera(1);
    resize(renderer, camera);
    addStageLights(scene);
    addGrid(scene);

    const clock = new THREE.Clock();
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    const IDENT = new THREE.Quaternion();

    let pivots = []; // 幽灵塔（低透明度剪影，聚合时可见）
    let blocks = []; // 独立方块 { pivot, scatter, quat, seed, center }
    let cubeMaterial = null;
    let phase = 'LOADING'; // LOADING → ANIM → HOLD → DONE
    let animStart = 0;
    let holdStart = 0;

    const setText = (t) => {
      if (textRef.current) textRef.current.textContent = t;
    };
    const setPct = (p) => {
      const v = clamp01(p);
      if (barRef.current) barRef.current.style.width = `${(v * 100).toFixed(1)}%`;
      if (pctRef.current) pctRef.current.textContent = `${Math.round(v * 100)}%`;
    };
    const finish = () => {
      if (disposed || doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current?.();
    };

    setText('LOADING TOWER DATA…');
    setPct(0);

    loadTowerData()
      .then((data) => {
        if (disposed) return;

        /* 幽灵塔剪影：聚合过程中显示低透明度目标轮廓 */
        pivots = createLayerMeshes(data, modelGroup);
        pivots.forEach((P) => {
          P.material.opacity = 0.03;
          P.material.emissiveIntensity = 0.15;
          P.material.transparent = true;
          P.material.depthWrite = false;
        });

        const built = buildVoxelCubes(data);
        cubeMaterial = built.material;
        blocks = built.pieces.map((pc) => {
          const mesh = new THREE.Mesh(pc.geometry, built.material);
          mesh.frustumCulled = false;
          const pivot = new THREE.Group();
          pivot.add(mesh);
          modelGroup.add(pivot);
          return { pivot, scatter: pc.scatter, quat: pc.quat, seed: pc.seed, center: pc.center };
        });

        frameTower(camera, data);

        if (mode === 'aggregate') {
          /* 聚合：方块从各自散射位飞入 */
          blocks.forEach((B) => {
            B.pivot.position.set(
              B.center[0] + B.scatter[0],
              B.center[1] + B.scatter[1],
              B.center[2] + B.scatter[2]
            );
            B.pivot.quaternion.copy(B.quat);
            B.pivot.scale.setScalar(0.35);
          });
        } else {
          /* 飞散：方块先拼成塔，再反向飞离 */
          blocks.forEach((B) => {
            B.pivot.position.set(B.center[0], B.center[1], B.center[2]);
            B.pivot.quaternion.identity();
            B.pivot.scale.setScalar(1);
          });
          pivots.forEach((P) => {
            P.material.opacity = 0;
          });
        }

        phase = 'ANIM';
        animStart = clock.getElapsedTime();
        setText(mode === 'aggregate' ? 'BLOCKS AGGREGATING 0%' : 'BLOCKS DISPERSING 0%');
      })
      .catch((err) => {
        console.error('SCHEME_C 过渡加载失败', err);
        fallbackTimer = window.setTimeout(finish, 600);
      });

    renderer.setAnimationLoop(() => {
      if (disposed) return;
      resize(renderer, camera);
      const t = clock.getElapsedTime();

      if (phase === 'ANIM' && blocks.length) {
        if (mode === 'aggregate') {
          const p = clamp01((t - animStart) / AGGREGATE_TOTAL);
          blocks.forEach((B) => {
            const pp = clamp01((p - 0.06 * B.seed) / 0.85);
            const e = EASE.outCubic(pp);
            B.pivot.position.set(
              B.center[0] + B.scatter[0] * (1 - e),
              B.center[1] + B.scatter[1] * (1 - e),
              B.center[2] + B.scatter[2] * (1 - e)
            );
            B.pivot.quaternion.slerpQuaternions(B.quat, IDENT, e);
            B.pivot.scale.setScalar(0.35 + 0.65 * e);
          });
          setPct(p);
          setText(`BLOCKS AGGREGATING ${Math.round(p * 100)}%`);
          if (p >= 1) {
            phase = 'HOLD';
            holdStart = t;
          }
        } else {
          const dp = clamp01((t - animStart) / SCATTER_TOTAL);
          blocks.forEach((B) => {
            const ep = clamp01((dp - 0.12 * B.seed) / 0.8);
            const e = EASE.inCubic(ep);
            B.pivot.position.set(
              B.center[0] + B.scatter[0] * e,
              B.center[1] + B.scatter[1] * e,
              B.center[2] + B.scatter[2] * e
            );
            B.pivot.quaternion.slerpQuaternions(IDENT, B.quat, e);
            B.pivot.scale.setScalar(1 - 0.65 * e);
          });
          /* 散开约 70% 后开始整体淡出，与最后收尾的散开重叠完成 */
          if (cubeMaterial) {
            cubeMaterial.opacity = 1 - clamp01((dp - SCATTER_FADE_START) / (1 - SCATTER_FADE_START));
          }
          setPct(dp);
          setText(`BLOCKS DISPERSING ${Math.round(dp * 100)}%`);
          if (dp >= 1) finish();
        }
      } else if (phase === 'HOLD') {
        if (t - holdStart > COMPLETE_HOLD) finish();
      }

      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      renderer.setAnimationLoop(null);
      blocks.forEach((B) => {
        B.pivot.children.forEach((m) => m.geometry.dispose());
      });
      pivots.forEach((P) => P.geometry.dispose());
      if (cubeMaterial) cubeMaterial.dispose();
      renderer.dispose();
    };
  }, [mode]);

  if (!mode) return null;

  return (
    <div
      className="scene-transition"
      style={{ '--trans-accent': accent }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
      <div className="scene-transition-tag">SCHEME C // 方块聚合 / 飞散</div>
      <div className="scene-transition-panel">
        <div className="t-title">
          {label ? `${label} // ${mode === 'aggregate' ? '场景加载中' : '返回地图'}` : 'SCENE TRANSITION'}
        </div>
        <div className="scene-transition-meta">
          <span className="trans-state">{mode === 'aggregate' ? 'AGGREGATE' : 'DISPERSAL'}</span>
          <span ref={pctRef} className="trans-pct">0%</span>
        </div>
        <div className="scene-transition-bar">
          <div ref={barRef} className="trans-fill" />
        </div>
        <div ref={textRef} className="scene-transition-text">…</div>
      </div>
    </div>
  );
}
