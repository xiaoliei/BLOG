import { useCallback, useEffect, useRef, useState } from "react";
import { makeRenderer, resize, loadGLB, THREE } from "../../lib/scene";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HEAD_TRANSITION } from "../landing/HeadViewer.jsx";
import HomePage from "./HomePage.jsx";

/* ============================================================
   小礼工坊 · 3D 房间主页
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

/* ============================================================
   ★ 聚焦飞行相机配置（动画从哪里开始 → 到哪里结束）★
   ------------------------------------------------------------
   启动页地球放大/旋转到交接点后，启动层淡出，房间以全景视角
   （REVEAL_POS）露出；随后聚焦飞行从该全景位起跑，与点击
   “聚焦屏幕阅读”按钮的动画完全一致：摄像机相对显示器旋转并
   zoom-in 到屏幕，直达聚焦阅读位。
   直接改下面的坐标 / 朝向即可微调动画起点与终点。

   · 坐标单位：1 ≈ 0.5m
   · 屏幕中心参考：(0, 3.03, -7.74) 即 (0, SCREEN_CENTER_Y, SCREEN_FACE_Z)
   · position：相机位置 [x, y, z]
   · lookAt  ：相机看向的点 [x, y, z]（俯仰/偏航角度由它决定）
   ============================================================ */
const FOCUS_FLY = {
	/* 过渡入场位（兜底停放点）：屏幕正前方稍远处，正对屏幕中心。
     实际聚焦飞行从 REVEAL_POS 全景位起跑 */
	start: {
		position: [0, SCREEN_CENTER_Y, SCREEN_FACE_Z + 4.2], // [0, 3.03, -3.54]
		lookAt: [0, SCREEN_CENTER_Y, SCREEN_FACE_Z],
		roll: 0,
	},
	/* 动画终点：聚焦阅读位，正对屏幕（当前坐标 [0, 3.03, -5.24]） */
	end: {
		position: [0, SCREEN_CENTER_Y, SCREEN_FACE_Z + 2.5],
		lookAt: [0, SCREEN_CENTER_Y, SCREEN_FACE_Z],
		roll: 0,
	},
};

const ENTRY_POS = new THREE.Vector3(...FOCUS_FLY.start.position);
const FOCUS_POS = new THREE.Vector3(...FOCUS_FLY.end.position);
const FOCUS_TGT = new THREE.Vector3(...FOCUS_FLY.end.lookAt);
/* 过渡到主页后的初始全景视角（调试定位的 CAM · live 状态）：
   聚焦飞行从这里起跑，摄像机相对显示器旋转并 zoom-in 到屏幕 */
const REVEAL_POS = new THREE.Vector3(5.22, 6.36, -0.15);
const REVEAL_TGT = CAM_TARGET.clone();
/* 飞行一半时的相机位：用于向启动页暴露屏幕投影矩形（地球缩放对齐参考） */
const MID_POS = ENTRY_POS.clone().lerp(FOCUS_POS, 0.5);

/* 调试：在网页角落实时显示相机坐标/角度与 FOCUS_FLY 配置（改 true/false 开关） */
const SHOW_CAMERA_DEBUG = false;
const RAD2DEG = 180 / Math.PI;

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

/* ---------- 缓动与速度衔接 ---------- */
const easeInOutCubic = (t) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeInOutCubicInverse = (e) =>
	e < 0.5 ? Math.cbrt(e / 4) : (2 - Math.cbrt(2 * (1 - e))) / 2;
const easeInOutCubicSlope = (p) => 12 * (p < 0.5 ? p * p : (1 - p) * (1 - p));
/* 带初始速度的三次缓动：e(0)=0、e(1)=1、e'(0)=startSlope、e'(1)=0 */
const easeFromSlope = (t, s) =>
	(s - 2) * t * t * t + (3 - 2 * s) * t * t + s * t;

/* 地球缩放缓动在交接点的瞬时速度（eased 进度/毫秒）：
   过渡聚焦飞行以该速度起步，保证“过渡后不从 0 重新加速” */
const HANDOFF_P = easeInOutCubicInverse(HEAD_TRANSITION.handoffAt);
const HANDOFF_SLOPE_PER_MS =
	easeInOutCubicSlope(HANDOFF_P) / HEAD_TRANSITION.durationMs;

/* ---------- 程序化纹理 ---------- */
function makeWoodTexture(baseHex, darkHex, plankCount = 8, vertical = false) {
	const c = document.createElement("canvas");
	c.width = 512;
	c.height = 512;
	const ctx = c.getContext("2d");
	const base = new THREE.Color(baseHex);
	const dark = new THREE.Color(darkHex);
	/* 底色 */
	ctx.fillStyle = `rgb(${(base.r * 255) | 0},${(base.g * 255) | 0},${(base.b * 255) | 0})`;
	ctx.fillRect(0, 0, 512, 512);
	/* 木纹细条 */
	for (let i = 0; i < 260; i++) {
		const t = Math.random();
		const col = base.clone().lerp(dark, 0.2 + t * 0.6);
		ctx.strokeStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0.25)`;
		ctx.lineWidth = 0.6 + Math.random() * 1.4;
		ctx.beginPath();
		const p = Math.random() * 512;
		if (vertical) {
			ctx.moveTo(p, 0);
			ctx.bezierCurveTo(
				p + (Math.random() - 0.5) * 18,
				180,
				p + (Math.random() - 0.5) * 18,
				340,
				p,
				512,
			);
		} else {
			ctx.moveTo(0, p);
			ctx.bezierCurveTo(
				180,
				p + (Math.random() - 0.5) * 18,
				340,
				p + (Math.random() - 0.5) * 18,
				512,
				p,
			);
		}
		ctx.stroke();
	}
	/* 板缝 */
	ctx.strokeStyle = "rgba(0,0,0,0.28)";
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
	const c = document.createElement("canvas");
	c.width = 256;
	c.height = 256;
	const ctx = c.getContext("2d");
	const base = new THREE.Color(baseHex);
	ctx.fillStyle = `rgb(${(base.r * 255) | 0},${(base.g * 255) | 0},${(base.b * 255) | 0})`;
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

export default function RoomHome({ autoFocus = false, beginFocus = false }) {
	const canvasRef = useRef(null);
	const [error, setError] = useState(null);
	const [focused, setFocused] = useState(false);
	const [autoFocusing, setAutoFocusing] = useState(autoFocus); // 过渡入场：自动聚焦飞行中
	const [copied, setCopied] = useState(false); // 调试面板复制反馈
	const apiRef = useRef(null);
	const portalRef = useRef(null);
	const debugRef = useRef(null);

	/* 复制调试面板内容（剪贴板不可用时回退 execCommand） */
	const handleCopyDebug = useCallback(async () => {
		const text = debugRef.current?.textContent;
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			ta.remove();
		}
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	}, []);

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
			const deskMat = new THREE.MeshStandardMaterial({
				map: deskTex,
				roughness: 0.7,
				metalness: 0.05,
			});
			const deskTop = box(DESK_W, 0.12, DESK_D, deskMat);
			deskTop.position.set(0, DESK_H, 0);
			deskGroup.add(deskTop);

			/* 桌腿 */
			const legMat = new THREE.MeshStandardMaterial({
				color: COL.deskDark,
				roughness: 0.8,
			});
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
			const cabMat = new THREE.MeshStandardMaterial({
				color: COL.desk,
				roughness: 0.75,
			});
			const cabinet = box(1.8, DESK_H - 0.06, DESK_D - 0.3, cabMat);
			cabinet.position.set(DESK_W / 2 - 1.0, (DESK_H - 0.06) / 2, 0);
			deskGroup.add(cabinet);

			/* 抽屉格正面：3 层抽屉面板 + 拉手，全部贴在柜子正面（不再悬空） */
			const drawerFrontMat = new THREE.MeshStandardMaterial({
				color: COL.deskDark,
				roughness: 0.7,
			});
			const drawerHandleMat = new THREE.MeshStandardMaterial({
				color: COL.metal,
				roughness: 0.4,
				metalness: 0.7,
			});
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
			const standMat = new THREE.MeshStandardMaterial({
				color: COL.metal,
				roughness: 0.35,
				metalness: 0.8,
			});

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
					console.error("computer_head.glb failed", err);
				});

			/* 屏幕外缘青色描边（贴在模型正面，作嵌入式屏幕边框，参考 head-display） */
			const bezel = new THREE.LineLoop(
				new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(-SCREEN_HALF_W - 0.06, -SCREEN_HALF_H - 0.06, 0),
					new THREE.Vector3(SCREEN_HALF_W + 0.06, -SCREEN_HALF_H - 0.06, 0),
					new THREE.Vector3(SCREEN_HALF_W + 0.06, SCREEN_HALF_H + 0.06, 0),
					new THREE.Vector3(-SCREEN_HALF_W - 0.06, SCREEN_HALF_H + 0.06, 0),
				]),
				new THREE.LineBasicMaterial({
					color: 0x1abc9c,
					transparent: true,
					opacity: 0.8,
				}),
			);
			/* 组内坐标：模型中心为原点，正面在 +HEAD_HALF，屏幕中心偏上 SCREEN_CY_OFFSET */
			bezel.position.set(0, SCREEN_CY_OFFSET, HEAD_HALF + 0.02);
			monGroup.add(bezel);

			/* ---------- 键盘 + 鼠标 ---------- */
			const kbMat = new THREE.MeshStandardMaterial({
				color: 0x1c1e24,
				roughness: 0.6,
			});
			const keyboard = box(1.9, 0.06, 0.62, kbMat);
			keyboard.position.set(0, DESK_H + 0.09, DESK_Z + 1.5);
			scene.add(keyboard);
			/* 键帽阵列（简化：一片浅色面） */
			const keysMat = new THREE.MeshStandardMaterial({
				color: 0x2a2e36,
				roughness: 0.7,
			});
			const keys = box(1.78, 0.02, 0.5, keysMat, { cast: false });
			keys.position.set(0, DESK_H + 0.13, DESK_Z + 1.5);
			scene.add(keys);

			const mouseMat = new THREE.MeshStandardMaterial({
				color: 0x1c1e24,
				roughness: 0.6,
			});
			const mouse = new THREE.Mesh(
				new THREE.SphereGeometry(0.13, 16, 12),
				mouseMat,
			);
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
			const lampShade = box(
				0.32,
				0.22,
				0.32,
				new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.6 }),
			);
			lampShade.position.set(-2.6, DESK_H + 0.82, DESK_Z + 0.9);
			scene.add(lampShade);
			/* 灯泡发光面 */
			const bulb = box(
				0.24,
				0.04,
				0.24,
				new THREE.MeshStandardMaterial({
					color: COL.lamp,
					emissive: COL.lamp,
					emissiveIntensity: 1.2,
				}),
				{ cast: false },
			);
			bulb.position.set(-2.6, DESK_H + 0.72, DESK_Z + 0.9);
			scene.add(bulb);

			/* ---------- 桌面杂物：咖啡杯 + 植物 ---------- */
			const mugMat = new THREE.MeshStandardMaterial({
				color: 0xeaeaea,
				roughness: 0.5,
			});
			const mug = new THREE.Mesh(
				new THREE.CylinderGeometry(0.13, 0.11, 0.22, 18),
				mugMat,
			);
			mug.position.set(2.4, DESK_H + 0.17, DESK_Z + 0.8);
			scene.add(mug);
			const coffee = new THREE.Mesh(
				new THREE.CylinderGeometry(0.12, 0.12, 0.01, 18),
				new THREE.MeshStandardMaterial({ color: 0x3a2417, roughness: 0.4 }),
			);
			coffee.position.set(2.4, DESK_H + 0.28, DESK_Z + 0.8);
			scene.add(coffee);

			const potMat = new THREE.MeshStandardMaterial({
				color: 0xb5572f,
				roughness: 0.8,
			});
			const pot = new THREE.Mesh(
				new THREE.CylinderGeometry(0.18, 0.14, 0.28, 16),
				potMat,
			);
			pot.position.set(3.0, DESK_H + 0.2, DESK_Z - 0.6);
			scene.add(pot);
			const leafMat = new THREE.MeshStandardMaterial({
				color: COL.plant,
				roughness: 0.8,
			});
			for (let i = 0; i < 6; i++) {
				const leaf = new THREE.Mesh(
					new THREE.SphereGeometry(0.22, 10, 8),
					leafMat,
				);
				const a = (i / 6) * Math.PI * 2;
				leaf.position.set(
					3.0 + Math.cos(a) * 0.12,
					DESK_H + 0.5 + Math.sin(i) * 0.08,
					DESK_Z - 0.6 + Math.sin(a) * 0.12,
				);
				leaf.scale.set(1, 1.4, 1);
				scene.add(leaf);
			}

			/* ---------- 椅子 ---------- */
			const chairMat = new THREE.MeshStandardMaterial({
				color: 0x2b2f36,
				roughness: 0.7,
			});
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
				caster.position.set(
					Math.cos(a) * 0.3,
					0.06,
					DESK_Z + 3.0 + Math.sin(a) * 0.3,
				);
				caster.rotation.y = -a;
				scene.add(caster);
			}

			/* ---------- 轨道控制器 ---------- */
			const controls = new OrbitControls(camera, renderer.domElement);
			controls.target.copy(CAM_TARGET);
			controls.enableDamping = true;
			controls.dampingFactor = 0.08;
			controls.enablePan = false;
			controls.minDistance = 0.5; // 允许过渡起点等近距离机位（起点到其看向点约 1.0）
			controls.maxDistance = 18;
			controls.minPolarAngle = 30 * DEG;
			controls.maxPolarAngle = Math.PI / 2; // 允许严格正对屏幕（聚焦时投影为正矩形）
			controls.minAzimuthAngle = -78 * DEG;
			controls.maxAzimuthAngle = 78 * DEG;
			controls.update();

			/* ---------- 自适应 ---------- */
			let portalReady = false; // 门户四角/投影工具就绪后才刷新 data-mid-rect
			function doResize() {
				/* 画布尺寸不变时跳过，避免每帧重设投影矩阵 */
				const w = canvas.clientWidth || 1;
				const h = canvas.clientHeight || 1;
				if (
					canvas.width !== w * renderer.getPixelRatio() ||
					canvas.height !== h * renderer.getPixelRatio()
				) {
					resize(renderer, camera);
					/* 视口变化：刷新聚焦飞行中点的屏幕投影矩形，供启动页地球缩放目标对齐 */
					if (portalReady) {
						const rect = portalRectAt(MID_POS, FOCUS_TGT);
						portalRef.current?.parentElement?.setAttribute(
							"data-mid-rect",
							JSON.stringify(rect),
						);
					}
				}
			}
			doResize();
			window.addEventListener("resize", doResize);

			/* ---------- 入场：相机从远处推进 ---------- */
			const introMs = 1400;
			const introStart = performance.now();
			const camFrom = CAM_POS.clone().add(new THREE.Vector3(0.4, 1.0, 4.5));
			const camTo = CAM_POS.clone();
			camera.position.copy(camFrom);

			/* ---------- 视点切换：全景 ↔ 聚焦屏幕（平滑飞行动画） ---------- */
			let camAnim = null;
			function flyTo(
				toPos,
				toTgt,
				duration = 850,
				onComplete = null,
				rollDeg = 0,
				startSlope = 0,
			) {
				camAnim = {
					fromPos: camera.position.clone(),
					toPos: toPos.clone(),
					fromTgt: controls.target.clone(),
					toTgt: toTgt.clone(),
					fromUp: camera.up.clone(),
					toUp: new THREE.Vector3(0, 1, 0).applyAxisAngle(
						new THREE.Vector3().subVectors(toPos, toTgt).normalize(),
						rollDeg * DEG,
					),
					start: performance.now(),
					duration,
					startSlope,
					onComplete,
				};
				controls.enabled = false; // 飞行中禁用拖拽，避免抢夺镜头
			}

			/* 过渡入场位：页面加载即预渲染并停在全景视角（REVEAL_POS），
       启动层淡出后由 beginFocus 触发聚焦飞行（与点击聚焦按钮同动画） */
			const placeEntry = () => {
				camAnim = null;
				camera.up.set(0, 1, 0);
				camera.position.copy(REVEAL_POS);
				controls.target.copy(REVEAL_TGT);
				controls.enabled = true;
				controls.update();
				setFocused(false);
				setAutoFocusing(true);
			};
			const finishFocus = () => {
				setFocused(true);
				setAutoFocusing(false);
			};
			apiRef.current = {
				placeEntry,
				/* 聚焦：相机从当前全景位飞到屏幕正前方阅读位（门户始终在，自动跟随填满视野） */
				focus: () =>
					flyTo(FOCUS_POS, FOCUS_TGT, 850, finishFocus, FOCUS_FLY.end.roll),
				/* 过渡聚焦：地球交接瞬间从全景位起跑（与 reveal 淡出重叠，渐变过渡），
         与“聚焦屏幕阅读”按钮相同的旋转 + zoom-in 动画，并以地球交接点的
         瞬时速度起步，保持过渡速度连续、不从 0 重新加速 */
				focusFromEntry: () =>
					flyTo(
						FOCUS_POS,
						FOCUS_TGT,
						850,
						finishFocus,
						FOCUS_FLY.end.roll,
						HANDOFF_SLOPE_PER_MS * 850, // 初始速度 = 地球交接点速度（eased/ms × 飞行时长）
					),
				/* 返回：飞回全景 */
				unfocus: () => {
					setFocused(false);
					camera.up.set(0, 1, 0);
					flyTo(CAM_POS, CAM_TARGET, 850);
				},
			};

			if (autoFocus) placeEntry();

			/* matrix3d 门户：把博客 DOM 元素用透视变换贴到屏幕四边形。
       每帧投影屏幕 4 角 → 算矩形→四边形单应性 → 写入 transform。任意距离均可点击。 */
			const _pv = new THREE.Vector3();
			const _portalCorners = [
				[-SCREEN_HALF_W, SCREEN_CENTER_Y + SCREEN_HALF_H], // 左上（世界 Y 最大 → 像素最上）
				[SCREEN_HALF_W, SCREEN_CENTER_Y + SCREEN_HALF_H], // 右上
				[SCREEN_HALF_W, SCREEN_CENTER_Y - SCREEN_HALF_H], // 右下
				[-SCREEN_HALF_W, SCREEN_CENTER_Y - SCREEN_HALF_H], // 左下
			];
			portalReady = true;
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
					px[0],
					py[0],
					px[1],
					py[1],
					px[2],
					py[2],
					px[3],
					py[3],
					SCREEN_PX_W,
					SCREEN_PX_H,
				);
				if (el.style.opacity !== "1") el.style.opacity = "1";
			}

			/* 计算指定相机位下屏幕的投影矩形（临时移动相机，算完还原），
       用于向启动页暴露聚焦阅读位矩形做位置对齐 */
			function portalRectAt(pos, tgt) {
				const prevPos = camera.position.clone();
				const prevTgt = controls.target.clone();
				camera.position.copy(pos);
				controls.target.copy(tgt);
				controls.update();
				camera.updateMatrixWorld();
				camera.updateProjectionMatrix();
				const w = canvas.clientWidth || 1;
				const h = canvas.clientHeight || 1;
				const px = [];
				const py = [];
				for (const [cx, cy] of _portalCorners) {
					_pv.set(cx, cy, SCREEN_FACE_Z).project(camera);
					px.push((_pv.x * 0.5 + 0.5) * w);
					py.push((-_pv.y * 0.5 + 0.5) * h);
				}
				camera.position.copy(prevPos);
				controls.target.copy(prevTgt);
				controls.update();
				return {
					left: Math.min(...px),
					top: Math.min(...py),
					width: Math.max(...px) - Math.min(...px),
					height: Math.max(...py) - Math.min(...py),
				};
			}

			/* 暴露聚焦飞行一半时屏幕的投影矩形（.room-root[data-mid-rect]），
       启动页据此对齐地球交接尺寸——交接瞬间地球矩形 = 屏幕实际位置 */
			const midRect = portalRectAt(MID_POS, FOCUS_TGT);
			portalRef.current?.parentElement?.setAttribute(
				"data-mid-rect",
				JSON.stringify(midRect),
			);

			const clock = new THREE.Clock();
			const dbgEuler = new THREE.Euler();
			let lastCamDebugAt = 0;
			renderer.setAnimationLoop(() => {
				if (disposed) return;
				doResize();
				const t = clock.getElapsedTime();

				if (camAnim) {
					/* 视点切换：相机位置 + 目标同步插值 */
					const p = Math.min(
						1,
						(performance.now() - camAnim.start) / camAnim.duration,
					);
					/* 缓动：过渡聚焦带初始速度（startSlope = 地球交接点速度），
           按钮聚焦仍用 easeInOutCubic 从静止平滑起步 */
					const e =
						camAnim.startSlope > 0
							? easeFromSlope(p, camAnim.startSlope)
							: easeInOutCubic(p);
					camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
					controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, e);
					camera.up.lerpVectors(camAnim.fromUp, camAnim.toUp, e);
					if (p >= 1) {
						const cb = camAnim.onComplete;
						camAnim = null;
						controls.enabled = true;
						if (cb) cb();
					}
				} else if (!autoFocus) {
					/* 入场推进 */
					const ip = Math.min(1, (performance.now() - introStart) / introMs);
					const ie = 1 - (1 - ip) ** 3; // easeOutCubic
					if (ip < 1) {
						camera.position.lerpVectors(camFrom, camTo, ie);
					}
				}

				controls.update();

				/* 调试面板：实时相机坐标/角度 + 聚焦飞行配置 */
				const dbg = debugRef.current;
				if (dbg && performance.now() - lastCamDebugAt > 100) {
					lastCamDebugAt = performance.now();
					dbgEuler.setFromQuaternion(camera.quaternion, "YXZ");
					dbg.textContent =
						"CAM · live\n" +
						`pos ${camera.position.x.toFixed(2)} ${camera.position.y.toFixed(2)} ${camera.position.z.toFixed(2)}\n` +
						`yaw ${(dbgEuler.y * RAD2DEG).toFixed(1)}°  pitch ${(dbgEuler.x * RAD2DEG).toFixed(1)}°  roll ${(dbgEuler.z * RAD2DEG).toFixed(1)}°\n` +
						"FLY · config\n" +
						`start [${FOCUS_FLY.start.position.map((v) => Number(v).toFixed(2)).join(", ")}]  roll ${FOCUS_FLY.start.roll}°\n` +
						`end   [${FOCUS_FLY.end.position.map((v) => Number(v).toFixed(2)).join(", ")}]  roll ${FOCUS_FLY.end.roll}°`;
				}

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
				window.removeEventListener("resize", doResize);
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
			console.error("[RoomHome] init failed:", e);
			setError(e && e.message ? String(e.message) : String(e));
			return undefined;
		}
	}, []);

	/* 从主页返回启动页再次进入时，相机先回到过渡入场位 */
	useEffect(() => {
		if (autoFocus) apiRef.current?.placeEntry();
	}, [autoFocus]);

	/* 地球交接瞬间即从全景位起跑聚焦飞行：
     reveal 淡出与飞行重叠，形成渐变过渡——而不是先切到静止房间再开启动画 */
	const prevBeginFocus = useRef(beginFocus);
	useEffect(() => {
		if (beginFocus && !prevBeginFocus.current) {
			apiRef.current?.focusFromEntry();
		}
		prevBeginFocus.current = beginFocus;
	}, [beginFocus]);

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
		<div className={`room-root${focused ? " is-focused" : ""}`}>
			<canvas ref={canvasRef} className="room-webgl" />

			{/* matrix3d 门户博客：透视变换贴在屏幕四边形上，任意距离可点击/滚动 */}
			<div ref={portalRef} className="room-portal">
				<HomePage />
			</div>

			{/* 房间全景态：聚焦按钮 */}
			{!focused && !autoFocusing && (
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

			{/* 调试面板：实时相机坐标/角度与聚焦飞行配置 + 复制按钮 */}
			{SHOW_CAMERA_DEBUG && (
				<div className="cam-debug" aria-hidden="true">
					<div className="cam-debug__head">
						<span>CAMERA DEBUG</span>
						<button
							type="button"
							className="cam-debug__copy"
							onClick={handleCopyDebug}
						>
							{copied ? "已复制 ✓" : "复制"}
						</button>
					</div>
					<pre ref={debugRef} className="cam-debug__body" />
				</div>
			)}
		</div>
	);
}
