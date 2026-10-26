import * as THREE from 'three';

// 相机相关纯函数：全景/地点取景、入场飞行的移动目标跟踪、地点标签投影。
// 只读入参、返回纯数据，不持有任何引擎状态，便于独立理解与复测。

// 全景（home）取景：inspection 调试视图为固定机位，否则按纵横比与缩放推算轨道机位。
export function computeHomePose({ inspectionView, aspect, zoom, yaw }) {
  if (inspectionView) {
    const poses = { top: [0, 130, .001], front: [0, 55, 100], east: [100, 55, 0], back: [0, 55, -100], west: [-100, 55, 0] };
    return { position: poses[inspectionView] || poses.front, target: [0, 5, 0] };
  }
  const mobile = aspect < .85;
  const distance = (mobile ? 85 / aspect : 82) * zoom;
  const angle = .28 + yaw;
  return { position: [Math.sin(angle) * distance, mobile ? distance * .63 : 51, Math.cos(angle) * distance], target: [0, 6, 0] };
}

// 地点取景：优先使用存档里为该地点配置的机位偏移与焦点。
// Leave the right third (desktop) or bottom third (phone) for real DOM content.
export function computePlacePose(place, aspect) {
  const [x, y, z] = place.position;
  const mobile = aspect < .85;
  const offset = mobile ? place.camera?.mobileOffset : place.camera?.desktopOffset;
  const focus = mobile ? place.camera?.mobileTarget : place.camera?.desktopTarget;
  return {
    position: [x + (offset?.[0] ?? (mobile ? 17 : 15)), y + (offset?.[1] ?? (mobile ? 23 : 17)), z + (offset?.[2] ?? (mobile ? 49 : 29))],
    target: [x + (focus?.[0] ?? (mobile ? 0 : 6)), y + (focus?.[1] ?? (mobile ? 1 : 4)), z + (focus?.[2] ?? 0)],
  };
}

// 入场/离场飞行中，目标点随星球自转移动：保持同一球面视角方向与距离追踪真实岛屿，
// 而不是把镜头对准空气中的一点。
export function trackedFlightTargets(entryWorld, entryDestination, entryTarget) {
  const movingTarget = entryWorld ? entryWorld.worldPoint(entryTarget) : entryTarget;
  const movingDestination = entryDestination.clone().sub(entryTarget).add(movingTarget);
  return { movingTarget, movingDestination };
}

// 地点标签投影到屏幕坐标，并给出视锥内可见性判定。
export function projectLabels(town, entryWorld, camera, width, height) {
  return Object.values(town.placeMap).map(p => {
    const point = new THREE.Vector3(...p.label);
    const v = (entryWorld ? entryWorld.worldPoint(point) : point).project(camera);
    return { id: p.id, x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2, visible: v.z < 1 && v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 };
  });
}
