export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

export function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const rounded = Math.round(seconds * 100) / 100;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

export function createKey(...parts) {
  return parts.join("::");
}
