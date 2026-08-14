import { useEffect, useRef, useState } from 'react';
import { makeRenderer, resize, loadGLB, THREE } from '../../lib/scene';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import HomePage from './HomePage.jsx';

/* ============================================================
   BLOG_OS · 3D 房间主页
   ------------------------------------------------------------
   用 three.js 搭一间工作室：书桌 + 电脑（computer_head.glb）。
   显示器屏幕用「matrix3d 门户」方案：把博客 DOM 元素用
   matrix3d 单应性变换透视贴到屏幕四边形上——既融入 3D 模型
   （真透视），又是普通 DOM（任意距离可点击/滚动）。
   · WebGL 画房间/桌子/显示器本体
   · matrix3d 门户贴屏幕里的博客页面
   · 共享同一个 PerspectiveCamera，视角一致
   ============================================================ */

const DEG = Math.PI / 180;

/* ---------- 房间尺度（1 单位 ≈ 0.5m） ---------- */
const ROOM_W = 22; // 左右宽
const ROOM_D = 22; // 前后深
const ROOM_H = 7.4; // 墙高

/* ---------- 书桌 ---------- */
const DESK_W = 7.4; // 桌面宽
const DESK_D = 3.8; // 桌面深（放得下立方显示器 + 键盘）
const DESK_H = 1.5; // 桌面高
const DESK_Z = -8.6; // 桌子整体往后靠墙（前边缘 z ≈ -7.15）

/* ---------- 显示器：computer_head.glb（与 demo/head-display.html 同一模型） ----------
   模型未缩放半轴 ±4.25，正面 +Z=4.25；
   屏幕内容区未缩放 6.4 × 5.333，中心 y=+0.533（贴 computer.png 正面纹理）。 */
const HEAD_MODEL_URL = `${import.meta.env.BASE_URL}models/computer_head.glb`;
const HEAD_SCALE = 0.32; // 整体缩放 → 约 2.7 立方（桌面显示器尺寸）
const HEAD_HALF = 4.25 * HEAD_SCALE; // 缩放后半轴（≈1.36）
const SCREEN_HALF_W = 3.2 * HEAD_SCALE; // 屏幕半宽（6.4 / 2）
const SCREEN_HALF_H = 2.667 * HEAD_SCALE; // 屏幕半高（5.333 / 2）
const SCREEN_CY_OFFSET = 0.533 * HEAD_SCALE; // 屏幕中心相对模型中心的 y 偏移
const MON_CY = DESK_H + HEAD_HALF; // 模型底面贴桌面 → 中心 y
const MON_Z = DESK_Z - 0.5; // 模型中心 z（靠后，给键盘留出前沿）
const SCREEN_FACE_Z = MON_Z + HEAD_HALF; // 正面 +Z 世界 z
const SCREEN_CENTER_Y = MON_CY + SCREEN_CY_OFFSET; // 屏幕中心 y
const SCREEN_PX_W = 1200; // 屏幕内容 DOM 像素宽
const SCREEN_PX_H = 1000; // 屏幕内容 DOM 像素高（≈ 模型屏幕面比例 6.4:5.333）

/* ---------- 相机 ---------- */
const CAM_POS = new THREE.Vector3(2.0, 3.45, 3.5);
const CAM_TARGET = new THREE.Vector3(0, SCREEN_CENTER_Y - 0.15, MON_Z + 0.6);
/* 聚焦屏幕：正对显示器、拉近，让博客页面填满视野便于阅读 */
const FOCUS_DIST = 2.5;
/* 严格正对（相机 Y = 屏幕中心 Y），投影才是正矩形，DOM 面板才能严丝合缝贴住屏幕区 */
const FOCUS_POS = new THREE.Vector3(0, SCREEN_CENTER_Y, SCREEN_FACE_Z + FOCUS_DIST);
const FOCUS_TGT = new THREE.Vector3(0, SCREEN_CENTER_Y, SCREEN_FACE_Z);

/* ---------- 配色（呼应站点绿/蓝/羊毛） ---------- */
const COL = {
  floor: 0x8a6a45,
  floorDark: 0x6f5436,
  wall: 0xe7e0d0,
  wallAccent: 0x3f9d4b, // 背景墙强调绿（站点 hero green 调暗）
  baseboard: 0xd9cfb8,
  desk: 0x6b4a30,
  deskDark: 0x503722,
  metal: 0x2b2f36,
  monitor: 0x1a1c22,
  bezel: 0x0c0d11,
  rug: 0xb14a3a,
  lamp: 0xffd9a0,
  plant: 0x2f8f4b,
};

const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- 程序化纹理 ---------- */
function makeWoodTexture(baseHex, darkHex, plankCount = 8, vertical = false) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  const dark = new THREE.Color(darkHex);
  /* 底色 */
  ctx.fillStyle = `rgb(${base.r * 255 | 0},${base.g * 255 | 0},${base.b * 255 | 0})`;
  ctx.fillRect(0, 0, 512, 512);
  /* 木纹细条 */
  for (let i = 0; i < 260; i++) {
    const t = Math.random();
    const col = base.clone().lerp(dark, 0.2 + t * 0.6);
    ctx.strokeStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.25)`;
    ctx.lineWidth = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    const p = Math.random() * 512;
    if (vertical) {
      ctx.moveTo(p, 0);
      ctx.bezierCurveTo(p + (Math.random() - 0.5) * 18, 180, p + (Math.random() - 0.5) * 18, 340, p, 512);
    } else {
      ctx.moveTo(0, p);
      ctx.bezierCurveTo(180, p + (Math.random() - 0.5) * 18, 340, p + (Math.random() - 0.5) * 18, 512, p);
    }
    ctx.stroke();
  }
  /* 板缝 */
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  const step = 512 / plankCount;
  for (let i = 1; i < plankCount; i++) {
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, 512);
    } else {
      ctx.moveTo(0, i * step);
      ctx.lineTo(512, i * step);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeWallTexture(baseHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = `rgb(${base.r * 255 | 0},${base.g * 255 | 0},${base.b * 255 | 0})`;
  ctx.fillRect(0, 0, 256, 256);
  /* 细微噪点 */
  const img = ctx.getImageData(0, 0, 256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------- 几何工厂：带阴影的盒子 ---------- */
function box(w, h, d, material, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  return mesh;
}

/* 把「宽 W × 高 H 的矩形」映射到屏幕四边形（顺时针：左上、右上、右下、左下，像素坐标），
   返回 CSS matrix3d 字符串。用普通 DOM 元素 + 这个变换即可呈现真透视，且命中区域跟随四边形。 */
function quadToMatrix3d(x0, y0, x1, y1, x2, y2, x3, y3, W, H) {
  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  let a31 = 0;
  let a32 = 0;
  if (Math.abs(det) > 1e-10) {
    a31 = (dx3 * dy2 - dx2 * dy3) / det;
    a32 = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a11 = x1 - x0 + a31 * x1;
  const a12 = x3 - x0 + a32 * x3;
  const a13 = x0;
  const a21 = y1 - y0 + a31 * y1;
  const a22 = y3 - y0 + a32 * y3;
  const a23 = y0;
  return `matrix3d(${a11 / W},${a21 / W},0,${a31 / W},${a12 / H},${a22 / H},0,${a32 / H},0,0,1,0,${a13},${a23},0,1)`;
}

export default function RoomHome() {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(false);
  const apiRef = useRef(null);
  const portalRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;

    try {
    /* ---------- 渲染器 ---------- */
    const renderer = makeRenderer(canvas);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0e1018, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10131c);
    scene.fog = new THREE.Fog(0x10131c, 22, 46);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.copy(CAM_POS);

    /* ---------- 灯光 ---------- */
    scene.add(new THREE.HemisphereLight(0xfff3e0, 0x3a3326, 0.85));

    const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
    key.position.set(-6, 9, 5);
    key.target.position.set(0, 1, DESK_Z); // 瞄准桌椅物件簇，让阴影集中在物件上
    scene.add(key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.radius = 4; // 软阴影边缘，消除锯齿状毛刺
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbcd6ff, 0.35);
    fill.position.set(7, 4, 6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x8effc9, 0.25);
    rim.position.set(0, 5, -10);
    scene.add(rim);

    /* 显示器屏幕辉光（暖光从屏幕方向打到脸上/桌上） */
    const screenGlow = new THREE.PointLight(0xffe6c0, 0.6, 14, 1.6);
    screenGlow.position.set(0, SCREEN_CENTER_Y, SCREEN_FACE_Z + 0.6);
    scene.add(screenGlow);

    /* 台灯点光（只补光，不投影——避免与主光从不同角度形成重影/怪形状） */
    const lampLight = new THREE.PointLight(0xffd29a, 0.9, 8, 2);
    lampLight.position.set(-2.6, DESK_H + 0.55, DESK_Z + 0.9);
    scene.add(lampLight);

    /* ---------- 场景背景（已移除墙体/窗户/地板/天花板，只保留桌椅电脑等物件） ----------
       用一块不可见的 ShadowMaterial 平面接收阴影，给悬浮物件一点落地感。 */
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 }),
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    /* ---------- 书桌 ---------- */
    const deskGroup = new THREE.Group();
    deskGroup.position.set(0, 0, DESK_Z);
    scene.add(deskGroup);

    const deskTex = makeWoodTexture(COL.desk, COL.deskDark, 6);
    deskTex.repeat.set(2, 1);
    const deskMat = new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.7, metalness: 0.05 });
    const deskTop = box(DESK_W, 0.12, DESK_D, deskMat);
    deskTop.position.set(0, DESK_H, 0);
    deskGroup.add(deskTop);

    /* 桌腿 */
    const legMat = new THREE.MeshStandardMaterial({ color: COL.deskDark, roughness: 0.8 });
    const legW = 0.18;
    const legPos = [
      [DESK_W / 2 - legW, DESK_D / 2 - legW],
      [-(DESK_W / 2 - legW), DESK_D / 2 - legW],
      [DESK_W / 2 - legW, -(DESK_D / 2 - legW)],
      [-(DESK_W / 2 - legW), -(DESK_D / 2 - legW)],
    ];
    legPos.forEach(([x, z]) => {
      const leg = box(legW, DESK_H, legW, legMat);
      leg.position.set(x, DESK_H / 2, z);
      deskGroup.add(leg);
    });

    /* 抽屉柜（桌面下右侧，作为支撑柱；尺寸从地面顶到桌面下方） */
    const cabMat = new THREE.MeshStandardMaterial({ color: COL.desk, roughness: 0.75 });
    const cabinet = box(1.8, DESK_H - 0.06, DESK_D - 0.3, cabMat);
    cabinet.position.set(DESK_W / 2 - 1.0, (DESK_H - 0.06) / 2, 0);
    deskGroup.add(cabinet);

    /* 抽屉格正面：3 层抽屉面板 + 拉手，全部贴在柜子正面（不再悬空） */
    const drawerFrontMat = new THREE.MeshStandardMaterial({ color: COL.deskDark, roughness: 0.7 });
    const drawerHandleMat = new THREE.MeshStandardMaterial({ color: COL.metal, roughness: 0.4, metalness: 0.7 });
    const CAB_X = DESK_W / 2 - 1.0;
    const CAB_FACE_Z = (DESK_D - 0.3) / 2 + 0.01; // 柜子正面 + 微微外凸
    const cabH = DESK_H - 0.06;
    const drawerH = (cabH - 0.12) / 3; // 3 层，层间留缝
    for (let i = 0; i < 3; i++) {
      const cy = 0.06 + drawerH / 2 + i * (drawerH + 0.03); // 从底部往上排
      const front = box(1.6, drawerH, 0.02, drawerFrontMat, { cast: false });
      front.position.set(CAB_X, cy, CAB_FACE_Z);
      deskGroup.add(front);
      const pull = box(0.34, 0.04, 0.03, drawerHandleMat, { cast: false });
      pull.position.set(CAB_X, cy, CAB_FACE_Z + 0.04);
      deskGroup.add(pull);
    }

    /* ---------- 显示器（computer_head.glb，与 demo/head-display.html 一致） ---------- */
    const monGroup = new THREE.Group();
    monGroup.position.set(0, MON_CY, MON_Z); // 整组放在「模型中心」位置
    scene.add(monGroup);

    /* 金属材质（显示器之外的台灯/椅子也复用，先定义） */
    const standMat = new THREE.MeshStandardMaterial({ color: COL.metal, roughness: 0.35, metalness: 0.8 });

    let headModel = null;
    loadGLB(HEAD_MODEL_URL)
      .then((model) => {
        if (disposed) return;
        headModel = model;
        model.scale.setScalar(HEAD_SCALE);
        /* 自发光质感（参考 demo/js/head-display.js）：贴图微弱发光，暗部不发黑 */
        model.traverse((o) => {
          if (o.isMesh && o.material) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.material.emissive = new THREE.Color(0xffffff);
            o.material.emissiveMap = o.material.map;
            o.material.emissiveIntensity = 0.5;
            o.material.needsUpdate = true;
          }
        });
        monGroup.add(model);
      })
      .catch((err) => {
        console.error('computer_head.glb failed', err);
      });

    /* 屏幕外缘青色描边（贴在模型正面，作嵌入式屏幕边框，参考 head-display） */
    const bezel = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-SCREEN_HALF_W - 0.06, -SCREEN_HALF_H - 0.06, 0),
        new THREE.Vector3(SCREEN_HALF_W + 0.06, -SCREEN_HALF_H - 0.06, 0),
        new THREE.Vector3(SCREEN_HALF_W + 0.06, SCREEN_HALF_H + 0.06, 0),
        new THREE.Vector3(-SCREEN_HALF_W - 0.06, SCREEN_HALF_H + 0.06, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x1abc9c, transparent: true, opacity: 0.8 }),
    );
    /* 组内坐标：模型中心为原点，正面在 +HEAD_HALF，屏幕中心偏上 SCREEN_CY_OFFSET */
    bezel.position.set(0, SCREEN_CY_OFFSET, HEAD_HALF + 0.02);
    monGroup.add(bezel);

    /* ---------- 键盘 + 鼠标 ---------- */
    const kbMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.6 });
    const keyboard = box(1.9, 0.06, 0.62, kbMat);
    keyboard.position.set(0, DESK_H + 0.09, DESK_Z + 1.5);
    scene.add(keyboard);
    /* 键帽阵列（简化：一片浅色面） */
    const keysMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7 });
    const keys = box(1.78, 0.02, 0.5, keysMat, { cast: false });
    keys.position.set(0, DESK_H + 0.13, DESK_Z + 1.5);
    scene.add(keys);

    const mouseMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.6 });
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mouseMat);
    mouse.scale.set(1, 0.55, 1.6);
    mouse.position.set(1.4, DESK_H + 0.11, DESK_Z + 1.5);
    mouse.castShadow = true;
    scene.add(mouse);

    /* ---------- 台灯 ---------- */
    const lampBase = box(0.5, 0.04, 0.5, standMat);
    lampBase.position.set(-2.6, DESK_H + 0.08, DESK_Z + 0.9);
    scene.add(lampBase);
    const lampPole = box(0.05, 0.7, 0.05, standMat);
    lampPole.position.set(-2.6, DESK_H + 0.45, DESK_Z + 0.9);
    scene.add(lampPole);
    const lampShade = box(0.32, 0.22, 0.32, new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.6 }));
    lampShade.position.set(-2.6, DESK_H + 0.82, DESK_Z + 0.9);
    scene.add(lampShade);
    /* 灯泡发光面 */
    const bulb = box(0.24, 0.04, 0.24, new THREE.MeshStandardMaterial({ color: COL.lamp, emissive: COL.lamp, emissiveIntensity: 1.2 }), { cast: false });
    bulb.position.set(-2.6, DESK_H + 0.72, DESK_Z + 0.9);
    scene.add(bulb);

    /* ---------- 桌面杂物：咖啡杯 + 植物 ---------- */
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.5 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 18), mugMat);
    mug.position.set(2.4, DESK_H + 0.17, DESK_Z + 0.8);
    scene.add(mug);
    const coffee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.01, 18),
      new THREE.MeshStandardMaterial({ color: 0x3a2417, roughness: 0.4 }),
    );
    coffee.position.set(2.4, DESK_H + 0.28, DESK_Z + 0.8);
    scene.add(coffee);

    const potMat = new THREE.MeshStandardMaterial({ color: 0xb5572f, roughness: 0.8 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.28, 16), potMat);
    pot.position.set(3.0, DESK_H + 0.2, DESK_Z - 0.6);
    scene.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: COL.plant, roughness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(3.0 + Math.cos(a) * 0.12, DESK_H + 0.5 + Math.sin(i) * 0.08, DESK_Z - 0.6 + Math.sin(a) * 0.12);
      leaf.scale.set(1, 1.4, 1);
      scene.add(leaf);
    }

    /* ---------- 椅子 ---------- */
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7 });
    const seat = box(1.0, 0.1, 0.9, chairMat);
    seat.position.set(0, 0.95, DESK_Z + 3.0);
    scene.add(seat);
    const backrest = box(1.0, 1.0, 0.1, chairMat);
    backrest.position.set(0, 1.45, DESK_Z + 3.42);
    scene.add(backrest);
    const chairPole = box(0.1, 0.95, 0.1, standMat);
    chairPole.position.set(0, 0.47, DESK_Z + 3.0);
    scene.add(chairPole);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const caster = box(0.3, 0.06, 0.08, standMat);
      caster.position.set(Math.cos(a) * 0.3, 0.06, DESK_Z + 3.0 + Math.sin(a) * 0.3);
      caster.rotation.y = -a;
      scene.add(caster);
    }

    /* ---------- 轨道控制器 ---------- */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(CAM_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2.4;
    controls.maxDistance = 18;
    controls.minPolarAngle = 30 * DEG;
    controls.maxPolarAngle = Math.PI / 2; // 允许严格正对屏幕（聚焦时投影为正矩形）
    controls.minAzimuthAngle = -78 * DEG;
    controls.maxAzimuthAngle = 78 * DEG;
    controls.update();

    /* ---------- 自适应 ---------- */
    function doResize() {
      resize(renderer, camera);
    }
    doResize();
    window.addEventListener('resize', doResize);

    /* ---------- 入场：相机从远处推进 ---------- */
    const introMs = 1400;
    const introStart = performance.now();
    const camFrom = CAM_POS.clone().add(new THREE.Vector3(0.4, 1.0, 4.5));
    const camTo = CAM_POS.clone();
    camera.position.copy(camFrom);

    /* ---------- 视点切换：全景 ↔ 聚焦屏幕（平滑飞行动画） ---------- */
    let camAnim = null;
    function flyTo(toPos, toTgt, duration = 850, onComplete = null) {
      camAnim = {
        fromPos: camera.position.clone(),
        toPos: toPos.clone(),
        fromTgt: controls.target.clone(),
        toTgt: toTgt.clone(),
        start: performance.now(),
        duration,
        onComplete,
      };
      controls.enabled = false; // 飞行中禁用拖拽，避免抢夺镜头
    }
    apiRef.current = {
      /* 聚焦：相机飞到屏幕正前方阅读位（门户始终在，自动跟随填满视野，无需切换面板） */
      focus: () => flyTo(FOCUS_POS, FOCUS_TGT, 850, () => setFocused(true)),
      /* 返回：飞回全景 */
      unfocus: () => {
        setFocused(false);
        flyTo(CAM_POS, CAM_TARGET, 850);
      },
    };

    /* matrix3d 门户：把博客 DOM 元素用透视变换贴到屏幕四边形。
       每帧投影屏幕 4 角 → 算矩形→四边形单应性 → 写入 transform。任意距离均可点击。 */
    const _pv = new THREE.Vector3();
    const _portalCorners = [
      [-SCREEN_HALF_W, SCREEN_CENTER_Y + SCREEN_HALF_H], // 左上（世界 Y 最大 → 像素最上）
      [SCREEN_HALF_W, SCREEN_CENTER_Y + SCREEN_HALF_H], // 右上
      [SCREEN_HALF_W, SCREEN_CENTER_Y - SCREEN_HALF_H], // 右下
      [-SCREEN_HALF_W, SCREEN_CENTER_Y - SCREEN_HALF_H], // 左下
    ];
    function updatePortal() {
      const el = portalRef.current;
      if (!el) return;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const px = [];
      const py = [];
      for (const [cx, cy] of _portalCorners) {
        _pv.set(cx, cy, SCREEN_FACE_Z).project(camera);
        px.push((_pv.x * 0.5 + 0.5) * w);
        py.push((-_pv.y * 0.5 + 0.5) * h);
      }
      el.style.transform = quadToMatrix3d(
        px[0], py[0], px[1], py[1], px[2], py[2], px[3], py[3],
        SCREEN_PX_W, SCREEN_PX_H,
      );
      el.style.opacity = '1';
    }

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      doResize();
      const t = clock.getElapsedTime();

      if (camAnim) {
        /* 视点切换：相机位置 + 目标同步插值 */
        const p = Math.min(1, (performance.now() - camAnim.start) / camAnim.duration);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
        camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
        controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, e);
        if (p >= 1) {
          const cb = camAnim.onComplete;
          camAnim = null;
          controls.enabled = true;
          if (cb) cb();
        }
      } else {
        /* 入场推进 */
        const ip = Math.min(1, (performance.now() - introStart) / introMs);
        const ie = 1 - Math.pow(1 - ip, 3); // easeOutCubic
        if (ip < 1) {
          camera.position.lerpVectors(camFrom, camTo, ie);
        }
      }

      controls.update();

      /* 屏幕辉光呼吸 */
      screenGlow.intensity = 0.5 + Math.sin(t * 1.3) * 0.08;

      renderer.render(scene, camera);

      /* matrix3d 门户：每帧把博客透视贴到屏幕四边形 */
      updatePortal();
    });

    /* ---------- 清理 ---------- */
    return () => {
      disposed = true;
      apiRef.current = null;
      window.removeEventListener('resize', doResize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
    };
    } catch (e) {
      console.error('[RoomHome] init failed:', e);
      setError(e && e.message ? String(e.message) : String(e));
      return undefined;
    }
  }, []);

  if (error) {
    return (
      <div className="room-root room-root--error">
        <div className="room-error">
          <strong>ROOM_DISPLAY · 初始化失败</strong>
          <pre>{error}</pre>
          <p>请把这段错误（以及浏览器控制台的完整堆栈）反馈给开发者。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`room-root${focused ? ' is-focused' : ''}`}>
      <canvas ref={canvasRef} className="room-webgl" />

      {/* matrix3d 门户博客：透视变换贴在屏幕四边形上，任意距离可点击/滚动 */}
      <div ref={portalRef} className="room-portal">
        <HomePage />
      </div>

      {/* 房间全景态：聚焦按钮 */}
      {!focused && (
        <button
          type="button"
          className="room-focus-btn"
          onClick={() => apiRef.current?.focus()}
        >
          聚焦屏幕阅读 ▸
        </button>
      )}

      {/* 聚焦态：返回按钮（相机已飞到阅读位，门户自动跟随） */}
      {focused && (
        <button
          type="button"
          className="room-back-btn"
          onClick={() => apiRef.current?.unfocus()}
        >
          ◂ 返回全景
        </button>
      )}
    </div>
  );
}
