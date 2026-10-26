import * as THREE from 'three';
import { localDateAtMinutes, localWorldTime } from '../lib/local-time.js';

// 光照装置：把「当前时刻 → 天空/雾色、太阳方位与颜色、环境光强度」收敛为独立职责块。
// update 默认 15 秒节流，仅在时间前进时重算；DEV 时间调试通过 setOverride 注入固定分钟数。
export function createLightingRig({ scene, frozenDate = null }) {
  const sky = new THREE.Color();
  const sunColor = new THREE.Color();
  const sunPosition = new THREE.Vector3(-40, 70, 90);
  const spaceLightColor = new THREE.Color('#ffffff');
  const spaceAmbientColor = new THREE.Color('#c6eeff');
  const localAmbientColor = new THREE.Color('#f0fcff');
  let lastUpdate = 0, overrideMinutes = null, current = null;

  function update(force = false) {
    const now = Date.now();
    if (!force && now - lastUpdate < 15000) return;
    lastUpdate = now;
    const at = frozenDate || new Date(now);
    current = localWorldTime(overrideMinutes === null ? at : localDateAtMinutes(overrideMinutes, at));
    sky.set(current.sky);scene.fog.color.copy(sky);
    sunColor.set(current.light);sunPosition.set(current.sunX, current.elevation, current.sunZ);
  }

  update(true);
  return {
    update,
    setOverride(minutes) { overrideMinutes = Number.isInteger(minutes) && minutes >= 0 && minutes < 1440 ? minutes : null; update(true); },
    get current() { return current; },
    sky, sunColor, sunPosition, spaceLightColor, spaceAmbientColor, localAmbientColor,
  };
}
