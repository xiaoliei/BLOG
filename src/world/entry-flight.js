import { Vector3 } from 'three';

export const ENTRY_DURATION = 4.6;
export const ENTRY_ORIENTATION_DURATION = 3.2;
export const smootherstep = value => {
  const t = Math.max(0, Math.min(1, value));
  if(t===0||t===1)return t;
  return Math.max(0,Math.min(1,t * t * t * (t * (t * 6 - 15) + 10)));
};

export function createEntryFlight(position, target, destination, destinationTarget) {
  const offset = position.clone().sub(target);
  return {
    position: position.clone(), target: target.clone(),
    direction: offset.clone().normalize(), distance: offset.length(),
    destination: destination.clone(), destinationTarget: destinationTarget.clone(),
  };
}

// Moving the focus never independently turns the camera: its position follows
// the same world-space focus, spherical direction and logarithmic distance.
export function sampleEntryFlight(flight, seconds, destination = flight.destination, destinationTarget = flight.destinationTarget) {
  const travel = smootherstep(seconds / ENTRY_DURATION);
  // Establish the overview angle before the final approach, so the island
  // becomes readable while the globe is still turning instead of edge-on.
  const orientation = smootherstep(seconds / ENTRY_ORIENTATION_DURATION);
  const focus = smootherstep((seconds - .35) / 2.1);
  const target = flight.target.clone().lerp(destinationTarget, focus);
  const endOffset = destination.clone().sub(destinationTarget);
  const endDirection = endOffset.clone().normalize();
  const cosine = Math.max(-1, Math.min(1, flight.direction.dot(endDirection)));
  const angle = Math.acos(cosine);
  let direction;
  if (angle < 1e-6) direction = flight.direction.clone().lerp(endDirection, orientation).normalize();
  else if (Math.PI - angle < 1e-6) {
    const axis = new Vector3(0, 1, 0).cross(flight.direction);
    if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
    direction = flight.direction.clone().applyAxisAngle(axis.normalize(), angle * orientation);
  } else {
    direction = flight.direction.clone().multiplyScalar(Math.sin((1 - orientation) * angle) / Math.sin(angle))
      .addScaledVector(endDirection, Math.sin(orientation * angle) / Math.sin(angle)).normalize();
  }
  const distance = Math.exp(Math.log(flight.distance) * (1 - travel) + Math.log(endOffset.length()) * travel);
  return { position: target.clone().addScaledVector(direction, distance), target, direction, distance };
}

export function entryVisuals(seconds) {
  return {
    seconds,
    ui: 1 - smootherstep(seconds / .45),
    atmosphere: smootherstep((seconds - .9) / 1.65),
    header: smootherstep((seconds - 4.15) / .25),
    labels: smootherstep((seconds - 4.22) / .3),
    navigation: smootherstep((seconds - 4.3) / .3),
  };
}


