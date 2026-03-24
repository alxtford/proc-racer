import { buildTrack } from "./generator.js";
import { clamp } from "./utils.js";

export const ISO_PROJECTION = {
  xScale: 0.52,
  yScale: 0.28,
  heightScale: 1.06,
  roadDepth: 24,
};

export function worldToIso(x, y, z = 0, config = ISO_PROJECTION) {
  return {
    x: (x - y) * config.xScale,
    y: (x + y) * config.yScale - z * config.heightScale,
  };
}

export function projectIsoPoint(x, y, z, camera, viewport, scale = 1, config = ISO_PROJECTION) {
  const raw = worldToIso(x, y, z, config);
  const cam = worldToIso(camera.x, camera.y, camera.z || 0, config);
  return {
    x: viewport.x + (raw.x - cam.x) * scale,
    y: viewport.y + (raw.y - cam.y) * scale,
  };
}

function getTrackPoint(track, index) {
  const closed = track.type === "circuit";
  if (closed) return track.points[(index + track.points.length) % track.points.length];
  return track.points[clamp(index, 0, track.points.length - 1)];
}

export function getTrackFrameAtIndex(track, index) {
  const prev = getTrackPoint(track, index - 1);
  const current = getTrackPoint(track, index);
  const next = getTrackPoint(track, index + 1);
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const tangent = { x: dx / magnitude, y: dy / magnitude };
  return {
    point: current,
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
  };
}

export function buildIsoRibbon(track, camera, viewport, scale = 1, options = {}) {
  const config = options.config || ISO_PROJECTION;
  const width = options.width ?? track.width;
  const heightOffset = options.heightOffset || 0;
  const bankScale = options.bankScale ?? 1;
  const left = [];
  const right = [];
  for (let index = 0; index < track.points.length; index += 1) {
    const frame = getTrackFrameAtIndex(track, index);
    const point = frame.point;
    const bank = (point.bank || 0) * bankScale;
    const z = (point.z || 0) + heightOffset;
    left.push(projectIsoPoint(
      point.x + frame.normal.x * width * 0.5,
      point.y + frame.normal.y * width * 0.5,
      z + bank,
      camera,
      viewport,
      scale,
      config,
    ));
    right.push(projectIsoPoint(
      point.x - frame.normal.x * width * 0.5,
      point.y - frame.normal.y * width * 0.5,
      z - bank,
      camera,
      viewport,
      scale,
      config,
    ));
  }
  return { left, right };
}

export function buildIsoRibbonRaw(track, options = {}) {
  const config = options.config || ISO_PROJECTION;
  const width = options.width ?? track.width;
  const heightOffset = options.heightOffset || 0;
  const bankScale = options.bankScale ?? 1;
  const left = [];
  const right = [];
  for (let index = 0; index < track.points.length; index += 1) {
    const frame = getTrackFrameAtIndex(track, index);
    const point = frame.point;
    const bank = (point.bank || 0) * bankScale;
    const z = (point.z || 0) + heightOffset;
    left.push(worldToIso(
      point.x + frame.normal.x * width * 0.5,
      point.y + frame.normal.y * width * 0.5,
      z + bank,
      config,
    ));
    right.push(worldToIso(
      point.x - frame.normal.x * width * 0.5,
      point.y - frame.normal.y * width * 0.5,
      z - bank,
      config,
    ));
  }
  return { left, right };
}

export function getRawIsoBounds(track, options = {}) {
  const ribbon = buildIsoRibbonRaw(track, options);
  const points = [...ribbon.left, ...ribbon.right];
  return points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function traceRibbon(context, ribbon) {
  if (!ribbon.left.length) return;
  context.beginPath();
  context.moveTo(ribbon.left[0].x, ribbon.left[0].y);
  for (let index = 1; index < ribbon.left.length; index += 1) context.lineTo(ribbon.left[index].x, ribbon.left[index].y);
  for (let index = ribbon.right.length - 1; index >= 0; index -= 1) context.lineTo(ribbon.right[index].x, ribbon.right[index].y);
  context.closePath();
}

function drawPreviewLandmark(context, anchor, transform, theme) {
  const point = worldToIso(anchor.x, anchor.y, anchor.z || 0);
  const x = transform.offsetX + point.x * transform.scale;
  const y = transform.offsetY + point.y * transform.scale;
  const size = anchor.size * transform.scale * 0.42;
  const height = anchor.height * transform.scale * 0.42;
  context.save();
  context.translate(x, y);
  context.strokeStyle = anchor.sectorTag === "high-speed" ? "#ffd36e" : theme.decoA;
  context.fillStyle = "rgba(9, 13, 24, 0.72)";
  context.lineWidth = Math.max(1, transform.scale * 1.2);
  if (anchor.kind === "causeway" || anchor.kind === "forge-slab" || anchor.kind === "shard-plateau") {
    context.beginPath();
    context.moveTo(-size * 0.9, 0);
    context.lineTo(-size * 0.3, -height * 0.75);
    context.lineTo(size * 0.9, -height * 0.48);
    context.lineTo(size * 0.48, height * 0.2);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(0, -height);
    context.lineTo(size * 0.4, -height * 0.14);
    context.lineTo(0, height * 0.2);
    context.lineTo(-size * 0.42, -height * 0.12);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.restore();
}

export function drawIsometricTrackPreview(canvas, event) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = Math.max(1, Math.round(canvas.clientWidth || canvas.width));
  const cssHeight = Math.max(1, Math.round(canvas.clientHeight || canvas.height));
  const targetWidth = Math.round(cssWidth * dpr);
  const targetHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const track = buildTrack(event);
  const bounds = getRawIsoBounds(track);
  const width = cssWidth;
  const height = cssHeight;
  const padding = Math.max(18, Math.min(width, height) * 0.12);
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, bounds.maxX - bounds.minX),
    (height - padding * 2) / Math.max(1, bounds.maxY - bounds.minY),
  );
  const transform = {
    scale,
    offsetX: (width - (bounds.maxX - bounds.minX) * scale) * 0.5 - bounds.minX * scale,
    offsetY: (height - (bounds.maxY - bounds.minY) * scale) * 0.5 - bounds.minY * scale,
  };

  const topRibbon = buildIsoRibbonRaw(track);
  const baseRibbon = buildIsoRibbonRaw(track, { heightOffset: -ISO_PROJECTION.roadDepth, bankScale: 0.6 });

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(dpr, dpr);
  context.fillStyle = track.theme.inside;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.5, height * 0.44, 8, width * 0.5, height * 0.44, Math.max(width, height) * 0.72);
  glow.addColorStop(0, "rgba(255,255,255,0.12)");
  glow.addColorStop(0.34, track.theme.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  for (const anchor of track.landmarkAnchors || []) drawPreviewLandmark(context, anchor, transform, track.theme);

  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.scale, transform.scale);
  context.fillStyle = "rgba(0,0,0,0.28)";
  traceRibbon(context, baseRibbon);
  context.fill();
  context.fillStyle = track.theme.track;
  traceRibbon(context, topRibbon);
  context.fill();
  context.strokeStyle = track.theme.trackEdge;
  context.lineWidth = Math.max(4, track.width * 0.04);
  traceRibbon(context, topRibbon);
  context.stroke();

  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.lineWidth = Math.max(1.5, track.width * 0.012);
  context.beginPath();
  track.points.forEach((point, index) => {
    const iso = worldToIso(point.x, point.y, point.z || 0);
    if (index === 0) context.moveTo(iso.x, iso.y);
    else context.lineTo(iso.x, iso.y);
  });
  if (track.type === "circuit") context.closePath();
  context.stroke();

  const gate = track.startLine;
  const gateZ = gate.z || 0;
  const gateLeftIso = worldToIso(
    gate.x + gate.normal.x * gate.halfWidth,
    gate.y + gate.normal.y * gate.halfWidth,
    gateZ,
  );
  const gateRightIso = worldToIso(
    gate.x - gate.normal.x * gate.halfWidth,
    gate.y - gate.normal.y * gate.halfWidth,
    gateZ,
  );
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.lineWidth = Math.max(3, transform.scale * 7);
  context.beginPath();
  context.moveTo(gateLeftIso.x, gateLeftIso.y);
  context.lineTo(gateRightIso.x, gateRightIso.y);
  context.stroke();
  context.restore();

  context.restore();
}
