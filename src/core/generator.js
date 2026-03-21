import { BIOME_DEFS, MODIFIER_DEFS } from "../data/content.js";
import { clamp, createRng, lerp, normalize, pickOne, TAU } from "./utils.js";

export function samplePath(points, t, closed = true) {
  const count = points.length;
  const scaled = ((t % 1) + 1) % 1 * count;
  const i0 = Math.floor(scaled) % count;
  const i1 = closed ? (i0 + 1) % count : Math.min(count - 1, i0 + 1);
  const mix = scaled - Math.floor(scaled);
  return {
    x: lerp(points[i0].x, points[i1].x, mix),
    y: lerp(points[i0].y, points[i1].y, mix),
  };
}

export function nearestPathInfo(track, x, y) {
  let best = {
    distance: Infinity,
    index: 0,
    t: 0,
    point: track.points[0],
    tangent: { x: 1, y: 0 },
  };
  const maxIndex = track.type === "circuit" ? track.points.length : track.points.length - 1;
  for (let i = 0; i < maxIndex; i += 1) {
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = x - a.x;
    const apy = y - a.y;
    const denom = abx * abx + aby * aby || 1;
    const proj = clamp((apx * abx + apy * aby) / denom, 0, 1);
    const px = a.x + abx * proj;
    const py = a.y + aby * proj;
    const distance = Math.hypot(x - px, y - py);
    if (distance < best.distance) {
      best = {
        distance,
        index: i,
        t: (i + proj) / track.points.length,
        point: { x: px, y: py },
        tangent: normalize(abx, aby),
      };
    }
  }
  return best;
}

function createControlPoints(event, rng) {
  const points = [];
  if (event.type === "circuit") {
    const count = 10 + Math.floor(rng() * 4);
    const baseRadius = 760 + rng() * 120;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * TAU;
      const radius = baseRadius + (rng() - 0.5) * 320;
      points.push({
        x: Math.cos(angle) * radius * (0.9 + rng() * 0.25),
        y: Math.sin(angle) * radius * (0.7 + rng() * 0.28),
      });
    }
  } else {
    const count = 12;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      points.push({
        x: lerp(-1100, 1100, t),
        y: (rng() - 0.5) * 900 + Math.sin(t * TAU * 1.5) * 260,
      });
    }
  }
  return points;
}

function smoothPoints(controlPoints, event) {
  const points = [];
  const segmentsPer = event.type === "circuit" ? 18 : 15;
  const loopCount = controlPoints.length - (event.type === "circuit" ? 0 : 1);
  for (let i = 0; i < loopCount; i += 1) {
    const prev = controlPoints[(i - 1 + controlPoints.length) % controlPoints.length];
    const a = controlPoints[i];
    const b = controlPoints[(i + 1) % controlPoints.length];
    const next = controlPoints[(i + 2) % controlPoints.length];
    for (let s = 0; s < segmentsPer; s += 1) {
      const t = s / segmentsPer;
      const t2 = t * t;
      const t3 = t2 * t;
      points.push({
        x:
          0.5 *
          ((2 * a.x) +
            (-prev.x + b.x) * t +
            (2 * prev.x - 5 * a.x + 4 * b.x - next.x) * t2 +
            (-prev.x + 3 * a.x - 3 * b.x + next.x) * t3),
        y:
          0.5 *
          ((2 * a.y) +
            (-prev.y + b.y) * t +
            (2 * prev.y - 5 * a.y + 4 * b.y - next.y) * t2 +
            (-prev.y + 3 * a.y - 3 * b.y + next.y) * t3),
      });
    }
  }
  if (event.type === "sprint") points.push({ ...controlPoints[controlPoints.length - 1] });
  return points;
}

function buildSectors(points, event, rng) {
  const sectorCount = event.type === "circuit" ? 6 : 5;
  const baseTags = event.type === "circuit"
    ? ["high-speed", "technical", "recovery", "hazard", "high-speed", "technical"]
    : ["recovery", "high-speed", "technical", "hazard", "high-speed"];
  return baseTags.map((tag, index) => {
    const start = index / sectorCount;
    const end = (index + 1) / sectorCount;
    return {
      id: `${tag}-${index}`,
      start,
      end,
      tag,
      gripMultiplier: tag === "technical" ? 1.08 : tag === "high-speed" ? 0.94 : tag === "recovery" ? 1.12 : 0.98,
      speedBias: tag === "high-speed" ? 1.08 : tag === "hazard" ? 0.95 : 1,
      hazardBias: tag === "hazard" ? 1.5 : tag === "recovery" ? 0.6 : 1,
      pickupBias: tag === "recovery" ? 1.2 : tag === "high-speed" ? 1.1 : 1,
      lookAheadBias: 0.01 + rng() * 0.008,
    };
  });
}

function getSectorForT(track, t) {
  return track.sectors.find((sector) => t >= sector.start && t < sector.end) || track.sectors[track.sectors.length - 1];
}

function buildCheckpoints(points, event) {
  const checkpoints = [];
  const checkpointCount = event.type === "circuit" ? 10 : 8;
  for (let i = 0; i < checkpointCount; i += 1) {
    const idx = Math.floor((i / checkpointCount) * points.length);
    checkpoints.push({ index: idx, ...points[idx], t: idx / points.length });
  }
  return checkpoints;
}

function choosePickupKind(event, sector, index) {
  if (sector.tag === "hazard" || event.modifierIds.includes("shield-drops")) {
    return index % 4 === 0 ? "shield" : index % 3 === 0 ? "pulse" : "boost";
  }
  if (event.modifierIds.includes("extra-pulse")) {
    return index % 2 === 0 ? "pulse" : "boost";
  }
  if (sector.tag === "recovery") {
    return index % 3 === 0 ? "shield" : "boost";
  }
  return index % 3 === 0 ? "pulse" : "boost";
}

function pickPropKind(biome, rng, side, index) {
  const pool = biome.propKinds?.length ? [...biome.propKinds] : ["stack"];
  if (side === "outer" && biome.id === "freeway") pool.push("gantry");
  if (side === "inner" && biome.id === "void") pool.push("ring");
  return pool[(index + Math.floor(rng() * pool.length)) % pool.length];
}

export function buildTrack(event) {
  const rng = createRng(event.seed);
  const biome = BIOME_DEFS[event.biomeId];
  const controlPoints = createControlPoints(event, rng);
  const points = smoothPoints(controlPoints, event);
  const width = event.type === "circuit" ? 180 + rng() * 24 : 170 + rng() * 20;
  const sectors = buildSectors(points, event, rng);
  const checkpoints = buildCheckpoints(points, event);
  const safeRespawnNodes = checkpoints.filter((checkpoint) => getSectorForT({ sectors }, checkpoint.t).tag !== "hazard");
  const pickupCount = event.modifierIds.includes("dense-pickups") ? 10 : 7;
  const pickups = [];
  for (let i = 0; i < pickupCount; i += 1) {
    let t = (i + 1) / (pickupCount + 1);
    if (event.guided && i === 0) t = 0.052;
    const point = samplePath(points, t, event.type === "circuit");
    const next = samplePath(points, t + 0.002, event.type === "circuit");
    const tangent = normalize(next.x - point.x, next.y - point.y);
    const normal = { x: -tangent.y, y: tangent.x };
    const sector = getSectorForT({ sectors }, t);
    const offset = event.guided && i === 0 ? 0 : (rng() - 0.5) * width * 0.45 * sector.pickupBias;
    pickups.push({
      x: point.x + normal.x * offset,
      y: point.y + normal.y * offset,
      t,
      kind: event.guided && i === 0 ? "shield" : choosePickupKind(event, sector, i),
      active: true,
      respawn: 0,
      guidedBeacon: event.guided && i === 0,
      sectorTag: sector.tag,
    });
  }

  const hazardCount = event.guided ? 0 : event.modifierIds.includes("high-damage-hazards") ? 7 : 4;
  const hazards = [];
  for (let i = 0; i < hazardCount; i += 1) {
    const sector = pickOne(rng, sectors.filter((item) => item.tag === "hazard" || item.tag === "technical"));
    const t = sector.start + rng() * (sector.end - sector.start);
    const point = samplePath(points, t, event.type === "circuit");
    hazards.push({
      x: point.x + (rng() - 0.5) * width * 0.45,
      y: point.y + (rng() - 0.5) * width * 0.45,
      radius: 18 + rng() * 16,
      damage: (8 + rng() * 5) * sector.hazardBias,
      t,
      sectorTag: sector.tag,
    });
  }

  const props = [];
  for (let i = 0; i < points.length; i += 8) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const tangent = normalize(b.x - a.x, b.y - a.y);
    const normal = { x: -tangent.y, y: tangent.x };
    const distanceOut = width * (0.7 + rng() * 0.45);
    props.push({
      x: a.x + normal.x * distanceOut,
      y: a.y + normal.y * distanceOut,
      size: 20 + rng() * 28,
      height: 28 + rng() * 38,
      rotation: rng() * TAU,
      kind: pickPropKind(biome, rng, "outer", i),
      alive: true,
      side: "outer",
    });
    props.push({
      x: a.x - normal.x * distanceOut,
      y: a.y - normal.y * distanceOut,
      size: 16 + rng() * 24,
      height: 24 + rng() * 32,
      rotation: rng() * TAU,
      kind: pickPropKind(biome, rng, "inner", i + 1),
      alive: true,
      side: "inner",
    });
  }

  const trackDescriptor = {
    eventId: event.id,
    type: event.type,
    width,
    theme: biome,
    points,
    checkpoints,
    pickups,
    hazards,
    props,
    sectors,
    safeRespawnNodes,
    modifiers: event.modifierIds.map((id) => MODIFIER_DEFS[id]),
    start: samplePath(points, event.type === "circuit" ? 0 : 0.03, event.type === "circuit"),
    finish: samplePath(points, event.type === "circuit" ? 0 : 0.97, event.type === "circuit"),
  };
  return trackDescriptor;
}

export function getSectorAtProgress(track, t) {
  return getSectorForT(track, t);
}
