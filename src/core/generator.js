import { BIOME_DEFS, MODIFIER_DEFS } from "../data/content.js";
import { clamp, createRng, lerp, normalize, pickOne, TAU } from "./utils.js";

const SECTOR_NAME_BANK = {
  industrial: {
    "high-speed": ["Rail Burn", "Forge Sprint", "Hammer Straight"],
    technical: ["Clamp Knot", "Valve Chicane", "Breaker Elbow"],
    recovery: ["Coolant Run", "Breather Lane", "Reset Drift"],
    hazard: ["Smelter Killbox", "Spark Cage", "Furnace Crush"],
  },
  freeway: {
    "high-speed": ["Sunline Burst", "Sliprail Mile", "Overpass Burn"],
    technical: ["Median Snap", "Ramp Switch", "Glass Weave"],
    recovery: ["Shoulder Reset", "Wide Arc", "Breather Merge"],
    hazard: ["Traffic Crush", "Barrier Bloom", "Spine Gate"],
  },
  void: {
    "high-speed": ["Rift Surge", "Blackglass Burst", "Halo Run"],
    technical: ["Prism Twist", "Null Weave", "Shard Curl"],
    recovery: ["Quiet Channel", "Reset Halo", "Void Drift"],
    hazard: ["Rift Maw", "Pulse Grave", "Monolith Killbox"],
  },
};

const SECTOR_CALLOUTS = {
  "high-speed": { short: "Overdrive window", long: "Long sightline. Hold it flat and draft hard." },
  technical: { short: "Brake-turn sector", long: "Tight sequence. Clip apexes and guard the inside." },
  recovery: { short: "Reset window", long: "Open section. Rebuild speed and settle the chassis." },
  hazard: { short: "Killbox live", long: "Hazards ahead. Survive first, then attack the exit." },
};

const RACE_TIME_LIMITS = {
  min: 30,
  max: 105,
};

const TRACK_UNITS_PER_SECOND = {
  circuit: 168,
  sprint: 33,
};

export function samplePath(points, t, closed = true) {
  const count = points.length;
  const scaled = closed ? wrapT(t) * count : clamp(t, 0, 1) * Math.max(1, count - 1);
  const i0 = closed ? Math.floor(scaled) % count : clamp(Math.floor(scaled), 0, count - 1);
  const i1 = closed ? (i0 + 1) % count : Math.min(count - 1, i0 + 1);
  const mix = closed ? scaled - Math.floor(scaled) : scaled - i0;
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
        t: track.type === "circuit"
          ? (i + proj) / track.points.length
          : (i + proj) / Math.max(1, track.points.length - 1),
        point: { x: px, y: py },
        tangent: normalize(abx, aby),
      };
    }
  }
  return best;
}

function createControlPoints(event, rng, attempt = 0) {
  let points = [];
  const smoothingBias = Math.min(0.5, attempt * 0.06);
  if (event.type === "circuit") {
    const count = 9 + Math.floor(rng() * 3);
    const baseRadius = 760 + rng() * 120;
    const radialJitter = 320 * (1 - smoothingBias);
    const angleJitter = 0.045 * (1 - smoothingBias * 0.7);
    const angleWeights = Array.from({ length: count }, () => 0.78 + rng() * 0.72 + (rng() > 0.82 ? 0.36 : 0));
    const totalWeight = angleWeights.reduce((sum, weight) => sum + weight, 0) || count;
    let angleCursor = rng() * TAU;
    for (let i = 0; i < count; i += 1) {
      angleCursor += (angleWeights[i] / totalWeight) * TAU;
      const angle = angleCursor + (rng() - 0.5) * angleJitter;
      const radius = baseRadius + (rng() - 0.5) * radialJitter;
      points.push({
        x: Math.cos(angle) * radius * (0.9 + rng() * 0.25),
        y: Math.sin(angle) * radius * (0.7 + rng() * 0.28),
      });
    }
  } else {
    const count = 12;
    const laneSwing = 900 * (1 - smoothingBias * 0.7);
    const sineSwing = 260 * (1 - smoothingBias * 0.55);
    const maxStep = 240 - smoothingBias * 110;
    const xWeights = Array.from({ length: count - 1 }, () => 0.94 + rng() * 0.44);
    const totalWeight = xWeights.reduce((sum, weight) => sum + weight, 0) || count - 1;
    let xCursor = -1100;
    let previousY = 0;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const x = i === 0
        ? -1100
        : i === count - 1
          ? 1100
          : (xCursor += (xWeights[i - 1] / totalWeight) * 2200);
      const rawY = (rng() - 0.5) * laneSwing + Math.sin(t * TAU * 1.5) * sineSwing;
      const y = i === 0 || i === count - 1
        ? rawY * 0.35
        : clamp(rawY, previousY - maxStep, previousY + maxStep);
      points.push({
        x,
        y,
      });
      previousY = y;
    }
  }
  const motifs = buildMotifPlan(points, event, rng, attempt);
  if (motifs.length) {
    points = applyMotifs(points, event, motifs);
  }
  return points;
}

function getPointWithClamp(points, index) {
  return points[clamp(index, 0, points.length - 1)];
}

function getMotifFrame(points, event, centerIndex) {
  const closed = event.type === "circuit";
  const getPoint = (index) => (
    closed
      ? points[(index + points.length) % points.length]
      : getPointWithClamp(points, index)
  );
  const prev = getPoint(centerIndex - 1);
  const next = getPoint(centerIndex + 1);
  const tangent = normalize(next.x - prev.x, next.y - prev.y);
  return {
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
  };
}

function buildMotifPlan(points, event, rng, attempt = 0) {
  const plan = [];
  const count = points.length;
  const minIndex = event.type === "circuit" ? 0 : 2;
  const maxIndex = event.type === "circuit" ? count - 1 : count - 3;
  const minGap = event.type === "circuit" ? 4 : 4;
  const anchors = [];
  const desiredTypes = event.type === "circuit"
    ? (rng() > 0.5 ? ["hairpin", "chicane", "s-bend"] : ["hairpin", "s-bend", "chicane"])
    : (rng() > 0.5 ? ["chicane", "hairpin"] : ["s-bend", "chicane"]);
  const desiredCount = event.type === "circuit" ? 2 + (rng() > 0.7 ? 1 : 0) : 2;
  for (let i = 0; i < desiredCount; i += 1) {
    const type = desiredTypes[i];
    let chosen = -1;
    for (let tries = 0; tries < 24; tries += 1) {
      const candidate = minIndex + Math.floor(rng() * Math.max(1, maxIndex - minIndex + 1));
      const separated = anchors.every((anchor) => {
        const direct = Math.abs(anchor - candidate);
        const wrapped = event.type === "circuit" ? count - direct : direct;
        return Math.min(direct, wrapped) >= minGap;
      });
      if (separated) {
        chosen = candidate;
        break;
      }
    }
    if (chosen < 0) continue;
    anchors.push(chosen);
    const baseAmplitude = type === "hairpin"
      ? 124
      : type === "chicane"
        ? (event.type === "sprint" ? 118 : 104)
        : (event.type === "sprint" ? 102 : 92);
    const softenedAmplitude = baseAmplitude * (1 - Math.min(0.28, attempt * 0.025));
    plan.push({
      type,
      centerIndex: chosen,
      amplitude: softenedAmplitude + rng() * 22,
      direction: rng() > 0.5 ? 1 : -1,
    });
  }
  return plan;
}

function applyMotifs(points, event, motifs) {
  const shaped = points.map((point) => ({ ...point }));
  const closed = event.type === "circuit";
  for (const motif of motifs) {
    const centerIndex = clamp(motif.centerIndex, closed ? 0 : 2, shaped.length - (closed ? 1 : 3));
    const { tangent, normal } = getMotifFrame(shaped, event, centerIndex);
    const pattern = motif.type === "hairpin"
      ? [
        { step: -2, normal: -0.08, tangent: -0.12, x: -0.04, y: 0 },
        { step: -1, normal: 0.32, tangent: -0.16, x: -0.05, y: 0.20 },
        { step: 0, normal: 0.72, tangent: 0, x: 0, y: 0.44 },
        { step: 1, normal: 0.32, tangent: 0.16, x: 0.05, y: 0.20 },
        { step: 2, normal: -0.08, tangent: 0.12, x: 0.04, y: 0 },
      ]
      : motif.type === "chicane"
        ? [
          { step: -2, normal: -0.16, tangent: -0.06, y: -0.16, x: -0.04 },
          { step: -1, normal: 0.42, tangent: -0.08, y: 0.52, x: -0.05 },
          { step: 0, normal: -0.72, tangent: 0, y: -0.82, x: 0 },
          { step: 1, normal: 0.46, tangent: 0.08, y: 0.58, x: 0.05 },
          { step: 2, normal: -0.18, tangent: 0.06, y: -0.18, x: 0.04 },
        ]
        : [
          { step: -2, normal: -0.08, tangent: -0.03, y: -0.1, x: -0.03 },
          { step: -1, normal: 0.36, tangent: -0.06, y: 0.42, x: -0.03 },
          { step: 0, normal: 0.22, tangent: 0, y: 0.16, x: 0 },
          { step: 1, normal: -0.48, tangent: 0.06, y: -0.56, x: 0.03 },
          { step: 2, normal: -0.2, tangent: 0.03, y: -0.22, x: 0.03 },
        ];
    for (const entry of pattern) {
      const index = centerIndex + entry.step;
      if (!closed && (index <= 0 || index >= shaped.length - 1)) continue;
      const targetIndex = closed ? (index + shaped.length) % shaped.length : index;
      const point = shaped[targetIndex];
      if (closed) {
        point.x += normal.x * motif.amplitude * entry.normal * motif.direction + tangent.x * motif.amplitude * (entry.tangent || 0);
        point.y += normal.y * motif.amplitude * entry.normal * motif.direction + tangent.y * motif.amplitude * (entry.tangent || 0);
      } else {
        point.x += motif.amplitude * (entry.x || 0);
        point.y += motif.amplitude * (entry.y || 0) * motif.direction;
      }
    }
  }
  if (!closed) {
    for (let index = 1; index < shaped.length - 1; index += 1) {
      shaped[index].y = clamp(shaped[index].y, shaped[index - 1].y - 260, shaped[index - 1].y + 260);
    }
  }
  return shaped;
}

function smoothPoints(controlPoints, event) {
  const points = [];
  const closed = event.type === "circuit";
  const segmentsPer = event.type === "circuit" ? 18 : 15;
  const loopCount = controlPoints.length - (closed ? 0 : 1);
  const getPoint = (index) => (
    closed
      ? controlPoints[(index + controlPoints.length) % controlPoints.length]
      : controlPoints[clamp(index, 0, controlPoints.length - 1)]
  );
  for (let i = 0; i < loopCount; i += 1) {
    const prev = getPoint(i - 1);
    const a = getPoint(i);
    const b = getPoint(i + 1);
    const next = getPoint(i + 2);
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

function measurePathLength(points, closed) {
  let total = 0;
  const maxIndex = closed ? points.length : points.length - 1;
  for (let i = 0; i < maxIndex; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function getTargetRaceTime(event) {
  const fallback = event.type === "circuit" ? 84 : 90;
  return clamp(Number.isFinite(event.parTime) ? event.parTime : fallback, RACE_TIME_LIMITS.min, RACE_TIME_LIMITS.max);
}

function estimateRaceTime(pathLength, event) {
  const laps = event.type === "circuit" ? Math.max(1, event.laps || 1) : 1;
  const unitsPerSecond = TRACK_UNITS_PER_SECOND[event.type] || TRACK_UNITS_PER_SECOND.sprint;
  return (pathLength * laps) / unitsPerSecond;
}

function scalePointCloud(points, factor) {
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.01) return points;
  return points.map((point) => ({
    ...point,
    x: point.x * factor,
    y: point.y * factor,
  }));
}

function sampleCornerAngle(points, index, closed, gap = 4) {
  const maxIndex = points.length - 1;
  const prevIndex = closed ? (index - gap + points.length) % points.length : Math.max(0, index - gap);
  const nextIndex = closed ? (index + gap) % points.length : Math.min(maxIndex, index + gap);
  if (!closed && (prevIndex === index || nextIndex === index)) return 0;
  const prev = points[prevIndex];
  const current = points[index];
  const next = points[nextIndex];
  const inDir = normalize(current.x - prev.x, current.y - prev.y);
  const outDir = normalize(next.x - current.x, next.y - current.y);
  const dot = clamp(inDir.x * outDir.x + inDir.y * outDir.y, -1, 1);
  return Math.acos(dot);
}

function analyzeTrackGeometry(points, event) {
  const closed = event.type === "circuit";
  const validSwitchAngle = closed ? 0.46 : 0.42;
  const severeSwitchAngle = closed ? 0.58 : 0.52;
  let minSegmentLength = Infinity;
  let maxCornerAngle = 0;
  let totalCornerAngle = 0;
  let cornerSamples = 0;
  let sharpSamples = 0;
  let backToBackSharp = 0;
  let currentSharpRun = 0;
  let turnSwitches = 0;
  let switchbackCandidates = 0;
  let hairpinCandidates = 0;
  let chicaneCandidates = 0;
  const signGap = 3;
  const segmentStride = 3;
  const signedTurns = [];
  const loopMax = closed ? points.length : points.length - segmentStride;
  for (let i = 0; i < loopMax; i += 1) {
    const a = points[i];
    const b = points[(i + segmentStride) % points.length];
    minSegmentLength = Math.min(minSegmentLength, Math.hypot(b.x - a.x, b.y - a.y));
  }
  const start = closed ? 0 : 4;
  const end = closed ? points.length : points.length - 4;
  for (let i = start; i < end; i += 1) {
    const cornerAngle = sampleCornerAngle(points, i, closed);
    const prevIndex = closed ? (i - signGap + points.length) % points.length : Math.max(0, i - signGap);
    const nextIndex = closed ? (i + signGap) % points.length : Math.min(points.length - 1, i + signGap);
    const prev = points[prevIndex];
    const current = points[i];
    const next = points[nextIndex];
    const inDir = normalize(current.x - prev.x, current.y - prev.y);
    const outDir = normalize(next.x - current.x, next.y - current.y);
    const cross = inDir.x * outDir.y - inDir.y * outDir.x;
    const turnSign = Math.abs(cornerAngle) > 0.12 && Math.abs(cross) > 0.014 ? Math.sign(cross) : 0;
    signedTurns.push({ index: i, signedAngle: turnSign * cornerAngle, angle: cornerAngle });
    maxCornerAngle = Math.max(maxCornerAngle, cornerAngle);
    totalCornerAngle += cornerAngle;
    cornerSamples += 1;
    if (cornerAngle > (closed ? 0.8 : 0.7)) hairpinCandidates += 1;
    if (cornerAngle > 0.96) {
      sharpSamples += 1;
      currentSharpRun += 1;
      backToBackSharp = Math.max(backToBackSharp, currentSharpRun);
    } else {
      currentSharpRun = 0;
    }
  }

  const turnPeaks = [];
  for (let i = 0; i < signedTurns.length; i += 1) {
    const current = signedTurns[i];
    const currentAbs = Math.abs(current.signedAngle);
    if (currentAbs < 0.18) continue;
    const prevAbs = Math.abs(signedTurns[Math.max(0, i - 1)]?.signedAngle || 0);
    const nextAbs = Math.abs(signedTurns[Math.min(signedTurns.length - 1, i + 1)]?.signedAngle || 0);
    if (currentAbs < prevAbs || currentAbs <= nextAbs) continue;
    const lastPeak = turnPeaks[turnPeaks.length - 1];
    if (lastPeak && current.index - lastPeak.index < 3) {
      if (currentAbs > Math.abs(lastPeak.signedAngle)) turnPeaks[turnPeaks.length - 1] = current;
      continue;
    }
    turnPeaks.push(current);
  }

  for (let i = 1; i < turnPeaks.length; i += 1) {
    const prev = turnPeaks[i - 1];
    const current = turnPeaks[i];
    if (Math.sign(prev.signedAngle) === 0 || Math.sign(current.signedAngle) === 0) continue;
    if (Math.sign(prev.signedAngle) === Math.sign(current.signedAngle)) continue;
    turnSwitches += 1;
    const lesserAngle = Math.min(Math.abs(prev.signedAngle), Math.abs(current.signedAngle));
    if (lesserAngle >= validSwitchAngle) switchbackCandidates += 1;
    if (lesserAngle >= severeSwitchAngle) chicaneCandidates += 1;
  }

  return {
    minSegmentLength,
    maxCornerAngle,
    avgCornerAngle: cornerSamples ? totalCornerAngle / cornerSamples : 0,
    sharpSamples,
    backToBackSharp,
    turnSwitches,
    switchbackCandidates,
    softSwitchbacks: Math.max(0, turnSwitches - switchbackCandidates),
    hairpinCandidates,
    chicaneCandidates,
  };
}

function scoreGeometry(metrics, event, targetRaceTime) {
  const maxTarget = event.type === "circuit" ? 1.22 : 1.08;
  const sharpTarget = event.type === "circuit" ? 7 : 4;
  const rawSwitchMax = event.type === "circuit" ? 7 : 5;
  const switchTarget = 1;
  const chicaneTarget = event.type === "circuit" ? 1 : 0;
  const hairpinTarget = event.type === "circuit" ? 1 : 0;
  return (
    Math.max(0, maxTarget - metrics.minSegmentLength / 100) * 30 +
    Math.max(0, metrics.maxCornerAngle - maxTarget) * 240 +
    Math.max(0, metrics.sharpSamples - sharpTarget) * 10 +
    Math.max(0, metrics.backToBackSharp - 2) * 22 +
    Math.max(0, metrics.turnSwitches - rawSwitchMax) * 8 +
    metrics.softSwitchbacks * 7 +
    Math.max(0, switchTarget - metrics.switchbackCandidates) * 8 +
    Math.max(0, chicaneTarget - metrics.chicaneCandidates) * 3 +
    Math.max(0, hairpinTarget - metrics.hairpinCandidates) * 2 +
    metrics.avgCornerAngle * 10 +
    Math.abs((metrics.estimatedRaceTime ?? targetRaceTime) - targetRaceTime) * 2.4 +
    Math.max(0, RACE_TIME_LIMITS.min - (metrics.estimatedRaceTime ?? targetRaceTime)) * 10 +
    Math.max(0, (metrics.estimatedRaceTime ?? targetRaceTime) - RACE_TIME_LIMITS.max) * 10
  );
}

function isGeometryPlayable(metrics, event) {
  const maxCornerLimit = event.type === "circuit" ? 1.22 : 1.08;
  const minSegmentLimit = event.type === "circuit" ? 20 : 24;
  const sharpLimit = event.type === "circuit" ? 7 : 4;
  const sharpRunLimit = event.type === "circuit" ? 2 : 3;
  return (
    metrics.minSegmentLength >= minSegmentLimit &&
    metrics.maxCornerAngle <= maxCornerLimit &&
    metrics.sharpSamples <= sharpLimit &&
    metrics.backToBackSharp <= sharpRunLimit
  );
}

function isTimingPlayable(metrics) {
  return (
    (metrics.estimatedRaceTime ?? 0) >= RACE_TIME_LIMITS.min &&
    (metrics.estimatedRaceTime ?? Infinity) <= RACE_TIME_LIMITS.max
  );
}

function buildPlayablePath(event, rng) {
  let best = null;
  const targetRaceTime = getTargetRaceTime(event);
  for (let attempt = 0; attempt < 28; attempt += 1) {
    let controlPoints = createControlPoints(event, rng, attempt);
    let points = smoothPoints(controlPoints, event);
    let pathLength = measurePathLength(points, event.type === "circuit");
    let estimatedRaceTime = estimateRaceTime(pathLength, event);
    const durationScale = clamp(targetRaceTime / Math.max(1, estimatedRaceTime), 0.84, 1.42);
    if (Math.abs(durationScale - 1) > 0.03) {
      controlPoints = scalePointCloud(controlPoints, durationScale);
      points = scalePointCloud(points, durationScale);
      pathLength = measurePathLength(points, event.type === "circuit");
      estimatedRaceTime = estimateRaceTime(pathLength, event);
    }
    const metrics = analyzeTrackGeometry(points, event);
    metrics.pathLength = pathLength;
    metrics.estimatedRaceTime = estimatedRaceTime;
    metrics.estimatedLapTime = event.type === "circuit"
      ? estimatedRaceTime / Math.max(1, event.laps || 1)
      : estimatedRaceTime;
    const score = scoreGeometry(metrics, event, targetRaceTime);
    if (!best || score < best.score) {
      best = { controlPoints, points, metrics, score };
    }
    if (isGeometryPlayable(metrics, event) && isTimingPlayable(metrics)) break;
  }
  return best;
}

function buildSectorProfiles(points, event, sectorCount) {
  const closed = event.type === "circuit";
  const offsets = closed ? Array.from({ length: sectorCount }, (_, index) => index / (sectorCount * 2)) : [0];
  let best = null;
  for (const offset of offsets) {
    const profiles = Array.from({ length: sectorCount }, (_, index) => {
      const start = closed ? (index / sectorCount + offset) % 1 : index / sectorCount;
      const rawEnd = closed ? ((index + 1) / sectorCount + offset) % 1 : (index + 1) / sectorCount;
      const span = getSectorSpan({ start, end: rawEnd }, closed) || 1 / sectorCount;
      let totalTurn = 0;
      let peakTurn = 0;
      let samples = 0;
      for (let step = 1; step <= 10; step += 1) {
        const t = closed ? (start + (step / 11) * span) % 1 : start + (step / 11) * span;
        const pointIndex = clamp(Math.floor(t * (points.length - 1)), 0, points.length - 1);
        const turn = sampleCornerAngle(points, pointIndex, closed);
        totalTurn += turn;
        peakTurn = Math.max(peakTurn, turn);
        samples += 1;
      }
      return {
        index,
        start,
        end: closed ? rawEnd : start + span,
        avgTurn: samples ? totalTurn / samples : 0,
        peakTurn,
      };
    });
    const scores = profiles.map((profile) => profile.avgTurn + profile.peakTurn * 0.35);
    const spread = Math.max(...scores) - Math.min(...scores);
    if (!best || spread > best.spread) {
      best = { profiles, spread };
    }
  }
  return best?.profiles || [];
}

function claimSectorIndex(candidates, used, sectorCount, closed) {
  for (const index of candidates) {
    if (used.has(index)) continue;
    const left = index - 1;
    const right = index + 1;
    const leftUsed = closed ? used.has((left + sectorCount) % sectorCount) : used.has(left);
    const rightUsed = closed ? used.has(right % sectorCount) : used.has(right);
    if (!leftUsed && !rightUsed) {
      used.add(index);
      return index;
    }
  }
  for (const index of candidates) {
    if (!used.has(index)) {
      used.add(index);
      return index;
    }
  }
  return 0;
}

function buildSectors(points, event, rng, biome) {
  const sectorCount = event.type === "circuit" ? 6 : 5;
  const profiles = buildSectorProfiles(points, event, sectorCount);
  const used = new Set();
  const closed = event.type === "circuit";
  const byLowTurn = [...profiles].sort((a, b) => a.avgTurn - b.avgTurn).map((profile) => profile.index);
  const byHighTurn = [...profiles].sort((a, b) => b.avgTurn - a.avgTurn || b.peakTurn - a.peakTurn).map((profile) => profile.index);
  const tags = new Array(sectorCount).fill("recovery");
  const assign = (tag, index) => {
    tags[index] = tag;
  };

  const highSpeedCount = event.type === "circuit" ? 2 : 2;
  const technicalCount = event.type === "circuit" ? 2 : 1;
  for (let i = 0; i < highSpeedCount; i += 1) {
    assign("high-speed", claimSectorIndex(byLowTurn, used, sectorCount, closed));
  }
  for (let i = 0; i < technicalCount; i += 1) {
    assign("technical", claimSectorIndex(byHighTurn, used, sectorCount, closed));
  }
  assign("hazard", claimSectorIndex(byHighTurn.filter((index) => !used.has(index)), used, sectorCount, closed));
  assign("recovery", claimSectorIndex(byLowTurn.filter((index) => !used.has(index)), used, sectorCount, closed));
  for (let index = 0; index < sectorCount; index += 1) {
    if (!used.has(index)) {
      used.add(index);
      assign(index % 2 === 0 ? "recovery" : "technical", index);
    }
  }

  return profiles.map((profile, index) => {
    const tag = tags[index];
    const names = SECTOR_NAME_BANK[biome.id]?.[tag] || [`${biome.name} ${tag}`];
    const callout = SECTOR_CALLOUTS[tag] || SECTOR_CALLOUTS["high-speed"];
    const turnBias = clamp(profile.avgTurn / 1.05, 0, 1);
    return {
      id: `${tag}-${index}`,
      start: profile.start,
      end: profile.end,
      tag,
      name: names[index % names.length],
      shortCallout: callout.short,
      longCallout: callout.long,
      avgTurn: profile.avgTurn,
      peakTurn: profile.peakTurn,
      gripMultiplier: tag === "technical" ? 1.08 + turnBias * 0.08 : tag === "high-speed" ? 0.92 - turnBias * 0.03 : tag === "recovery" ? 1.1 : 0.98 + turnBias * 0.03,
      speedBias: tag === "high-speed" ? 1.06 + (1 - turnBias) * 0.05 : tag === "hazard" ? 0.94 : tag === "recovery" ? 1.01 : 0.98,
      hazardBias: tag === "hazard" ? 1.45 + turnBias * 0.18 : tag === "recovery" ? 0.58 : 1,
      pickupBias: tag === "recovery" ? 1.24 : tag === "high-speed" ? 1.1 : 1,
      lookAheadBias: 0.01 + rng() * 0.008,
    };
  });
}

function getSectorForT(track, t) {
  return track.sectors.find((sector) => (
    sector.start <= sector.end
      ? t >= sector.start && t < sector.end
      : t >= sector.start || t < sector.end
  )) || track.sectors[track.sectors.length - 1];
}

function getSectorSpan(sector, closed) {
  if (!sector) return 0;
  return closed
    ? ((sector.end - sector.start + 1) % 1 || 1)
    : Math.max(0, sector.end - sector.start);
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

function wrapT(t) {
  return ((t % 1) + 1) % 1;
}

function sampleSectorT(sector, mix, closed) {
  const span = getSectorSpan(sector, closed);
  const clampedMix = clamp(mix, 0, 1);
  return closed
    ? wrapT(sector.start + span * clampedMix)
    : clamp(sector.start + span * clampedMix, 0, 1);
}

function samplePathPose(points, t, closed = true) {
  const point = samplePath(points, t, closed);
  const next = samplePath(points, closed ? t + 0.003 : clamp(t + 0.003, 0, 1), closed);
  const tangent = normalize(next.x - point.x, next.y - point.y);
  return {
    ...point,
    t: closed ? wrapT(t) : clamp(t, 0, 1),
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
    angle: Math.atan2(tangent.y, tangent.x),
  };
}

function measureStraightness(points, t, closed, window = 0.03) {
  const step = 1 / Math.max(18, points.length);
  let total = 0;
  let peak = 0;
  let samples = 0;
  for (let offset = -window; offset <= window + 0.0001; offset += step * 2) {
    const sampleT = closed ? wrapT(t + offset) : clamp(t + offset, 0, 1);
    const pointIndex = clamp(Math.floor(sampleT * (points.length - 1)), 0, points.length - 1);
    const angle = sampleCornerAngle(points, pointIndex, closed);
    total += angle;
    peak = Math.max(peak, angle);
    samples += 1;
  }
  return {
    avg: samples ? total / samples : 0,
    peak,
  };
}

function pickStraightCandidate(points, closed, rangeStart, rangeEnd, preferredT = null) {
  const steps = closed ? 48 : 28;
  let best = null;
  for (let i = 0; i < steps; i += 1) {
    const mix = steps === 1 ? 0 : i / (steps - 1);
    const t = closed
      ? wrapT(rangeStart + (rangeEnd - rangeStart) * mix)
      : clamp(lerp(rangeStart, rangeEnd, mix), 0, 1);
    const straightness = measureStraightness(points, t, closed, closed ? 0.035 : 0.028);
    const distanceToPreferred = preferredT === null
      ? 0
      : closed
        ? Math.min(Math.abs(t - preferredT), 1 - Math.abs(t - preferredT))
        : Math.abs(t - preferredT);
    const score = straightness.avg * 1.45 + straightness.peak * 0.92 + distanceToPreferred * 0.34;
    if (!best || score < best.score) best = { t, score, straightness };
  }
  return best?.t ?? (preferredT ?? rangeStart);
}

function buildGate(points, t, closed, width, index, kind = "checkpoint") {
  const pose = samplePathPose(points, t, closed);
  return {
    id: `${kind}-${index}`,
    kind,
    index,
    x: pose.x,
    y: pose.y,
    t: pose.t,
    tangent: pose.tangent,
    normal: pose.normal,
    angle: pose.angle,
    halfWidth: width * 0.56,
  };
}

function chooseTrackAnchors(points, event, width) {
  const closed = event.type === "circuit";
  if (closed) {
    const startT = pickStraightCandidate(points, true, 0, 1, 0);
    const startLine = buildGate(points, startT, true, width, 0, "start");
    return {
      startT,
      finishT: startT,
      startLine,
      finishLine: startLine,
    };
  }
  const startT = pickStraightCandidate(points, false, 0.04, 0.16, 0.08);
  const finishT = pickStraightCandidate(points, false, 0.84, 0.96, 0.92);
  return {
    startT,
    finishT,
    startLine: buildGate(points, startT, false, width, 0, "start"),
    finishLine: buildGate(points, finishT, false, width, 1, "finish"),
  };
}

function buildOrderedCheckpoints(points, event, width, startT, finishT) {
  if (event.type === "circuit") {
    const checkpointCount = 10;
    return Array.from({ length: checkpointCount }, (_, index) => {
      const t = wrapT(startT + index / checkpointCount);
      return buildGate(points, t, true, width, index, index === 0 ? "start-finish" : "checkpoint");
    });
  }
  const checkpointCount = 8;
  const span = Math.max(0.18, finishT - startT);
  return Array.from({ length: checkpointCount }, (_, index) => {
    const t = clamp(startT + (span * index) / (checkpointCount - 1), 0, 1);
    const kind = index === 0 ? "start" : index === checkpointCount - 1 ? "finish" : "checkpoint";
    return buildGate(points, t, false, width, index, kind);
  });
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

function buildSurgeStrips(points, event, sectors, width, rng) {
  const circuit = event.type === "circuit";
  const candidates = sectors.filter((sector) => sector.tag === "high-speed" || sector.tag === "recovery");
  const targetCount = Math.min(candidates.length + (event.modifierIds.includes("dense-traffic") ? 1 : 0), circuit ? 4 : 3);
  const strips = [];
  for (let i = 0; i < targetCount; i += 1) {
    const sector = candidates[i % candidates.length];
    if (!sector) break;
    const sectorMix = sector.tag === "high-speed" ? 0.26 + (i % 2) * 0.28 : 0.48;
    const t = sampleSectorT(sector, clamp(sectorMix + (rng() - 0.5) * 0.12, 0.15, 0.82), circuit);
    const point = samplePath(points, t, circuit);
    const next = samplePath(points, t + 0.003, circuit);
    const tangent = normalize(next.x - point.x, next.y - point.y);
    const normal = { x: -tangent.y, y: tangent.x };
    const laneOffset = (rng() - 0.5) * width * (sector.tag === "high-speed" ? 0.34 : 0.2);
    strips.push({
      id: `surge-${sector.id}-${i}`,
      x: point.x + normal.x * laneOffset,
      y: point.y + normal.y * laneOffset,
      t,
      angle: Math.atan2(tangent.y, tangent.x),
      tangent,
      normal,
      laneOffset,
      length: sector.tag === "high-speed" ? 88 : 62,
      width: sector.tag === "high-speed" ? width * 0.34 : width * 0.24,
      sectorTag: sector.tag,
      color: sector.tag === "high-speed" ? "#5cf9ff" : "#5df3b0",
    });
  }
  return strips;
}

function getPointIndex(points, index, closed) {
  if (closed) return points[(index + points.length) % points.length];
  return points[clamp(index, 0, points.length - 1)];
}

function getLocalCurveMagnitude(points, index, closed) {
  const prev = getPointIndex(points, index - 1, closed);
  const current = getPointIndex(points, index, closed);
  const next = getPointIndex(points, index + 1, closed);
  const prevDir = normalize(current.x - prev.x, current.y - prev.y);
  const nextDir = normalize(next.x - current.x, next.y - current.y);
  return clamp(Math.abs(prevDir.x * nextDir.y - prevDir.y * nextDir.x), 0, 1);
}

function smoothSeries(values, closed, passes = 4) {
  let current = values.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((value, index) => {
      const prev = closed ? current[(index - 1 + current.length) % current.length] : current[Math.max(0, index - 1)];
      const next = closed ? current[(index + 1) % current.length] : current[Math.min(current.length - 1, index + 1)];
      return value * 0.56 + prev * 0.22 + next * 0.22;
    });
  }
  return current;
}

function clampElevationGrades(points, heights, closed, maxGrade = 0.2) {
  const limited = heights.slice();
  const maxIndex = closed ? limited.length : limited.length - 1;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 0; index < maxIndex; index += 1) {
      const nextIndex = closed ? (index + 1) % limited.length : index + 1;
      if (nextIndex >= limited.length) continue;
      const currentPoint = points[index];
      const nextPoint = points[nextIndex];
      const span = Math.max(1, Math.hypot(nextPoint.x - currentPoint.x, nextPoint.y - currentPoint.y));
      const maxDelta = span * maxGrade;
      const delta = limited[nextIndex] - limited[index];
      if (Math.abs(delta) <= maxDelta) continue;
      limited[nextIndex] = limited[index] + Math.sign(delta) * maxDelta;
    }
  }
  return limited;
}

function buildLandmarkAnchors(points, elevationSamples, event, biome, width, rng) {
  const closed = event.type === "circuit";
  const stride = biome.id === "freeway" ? 9 : biome.id === "industrial" ? 10 : 8;
  const anchors = [];
  for (let index = 0; index < elevationSamples.length; index += stride) {
    const sample = elevationSamples[index];
    const point = sample.point;
    const next = samplePath(points, closed ? sample.t + 0.01 : clamp(sample.t + 0.01, 0, 1), closed);
    const tangent = normalize(next.x - point.x, next.y - point.y);
    const normal = { x: -tangent.y, y: tangent.x };
    const side = sample.seed > 0.52 ? 1 : -1;
    const offset = width * (1.52 + sample.curveAbs * 0.36) + 96 + sample.seed * 88;
    anchors.push({
      id: `landmark-${index}`,
      kind: biome.landmarkKits[(index + Math.floor(sample.seed * biome.landmarkKits.length)) % biome.landmarkKits.length],
      x: point.x + normal.x * offset * side,
      y: point.y + normal.y * offset * side,
      z: sample.z + 12 + sample.seed * 34,
      size: 40 + sample.straightness * 26,
      height: 88 + sample.curveAbs * 42 + sample.seed * 24,
      rotation: Math.atan2(tangent.y, tangent.x) * (biome.id === "freeway" ? 0.06 : 0.1),
      side: side > 0 ? "outer" : "inner",
      sectorTag: sample.sectorTag,
    });
  }
  return anchors;
}

function buildElevationProfile(points, event, sectors, biome, width, rng) {
  const closed = event.type === "circuit";
  const settings = biome.elevationProfile || {};
  const amplitude = settings.amplitude || 72;
  const crestBias = settings.crestBias || 0.3;
  const bankBias = settings.bankBias || 0.75;
  const longWave = settings.longWave || 1.2;
  const shortWave = settings.shortWave || 2.1;
  const count = points.length;
  const phaseA = rng() * TAU;
  const phaseB = rng() * TAU;
  const phaseC = rng() * TAU;
  const rawHeights = Array.from({ length: count }, (_, index) => {
    const t = closed ? index / count : index / Math.max(1, count - 1);
    const sector = getSectorForT({ sectors }, t);
    const curveAbs = getLocalCurveMagnitude(points, index, closed);
    const longWaveSample = Math.sin(t * TAU * longWave + phaseA) * 0.55;
    const shortWaveSample = Math.sin(t * TAU * shortWave + phaseB) * 0.24;
    const biasWave = Math.cos(t * TAU * (0.58 + crestBias) + phaseC) * 0.18;
    const sectorLift = sector.tag === "hazard"
      ? 0.42
      : sector.tag === "technical"
        ? 0.26
        : sector.tag === "high-speed"
          ? 0.14
          : -0.08;
    const biomeLift = biome.id === "industrial"
      ? Math.sin(t * TAU * 0.8 + phaseA * 0.5) * 0.12
      : biome.id === "freeway"
        ? Math.cos(t * TAU * 0.56 + phaseB * 0.4) * 0.17
        : Math.sin(t * TAU * 0.94 + phaseC * 0.32) * 0.22;
    return (longWaveSample + shortWaveSample + biasWave + sectorLift + curveAbs * (0.22 + crestBias * 0.32) + biomeLift) * amplitude;
  });

  let heights = smoothSeries(rawHeights, closed, 5);
  heights = clampElevationGrades(points, heights, closed, biome.id === "void" ? 0.24 : 0.2);
  heights = smoothSeries(heights, closed, 2);

  const midpoint = heights.reduce((sum, value) => sum + value, 0) / Math.max(1, heights.length);
  heights = heights.map((value) => value - midpoint);
  if (!closed) {
    const startHeight = heights[0];
    const endHeight = heights[heights.length - 1];
    heights = heights.map((value, index) => {
      const t = heights.length <= 1 ? 0 : index / (heights.length - 1);
      return value - lerp(startHeight, endHeight * 0.35, t);
    });
    heights[0] = 0;
  }

  const samples = points.map((point, index) => {
    const t = closed ? index / count : index / Math.max(1, count - 1);
    const nextIndex = closed ? (index + 1) % count : Math.min(count - 1, index + 1);
    const prevIndex = closed ? (index - 1 + count) % count : Math.max(0, index - 1);
    const nextPoint = points[nextIndex];
    const prevPoint = points[prevIndex];
    const span = Math.max(1, Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y));
    const grade = (heights[nextIndex] - heights[index]) / span;
    const sector = getSectorForT({ sectors }, t);
    const tangent = normalize(nextPoint.x - prevPoint.x, nextPoint.y - prevPoint.y);
    const curveAbs = getLocalCurveMagnitude(points, index, closed);
    const straightness = 1 - clamp(curveAbs * 2.4, 0, 1);
    return {
      t,
      point,
      z: heights[index],
      height: heights[index],
      grade,
      bank: curveAbs * width * 0.08 * bankBias * (sector.tag === "technical" ? 1.12 : sector.tag === "high-speed" ? 0.82 : 0.94),
      sectorTag: sector.tag,
      tangent,
      curveAbs,
      straightness,
      seed: rng(),
    };
  });

  return {
    min: Math.min(...heights),
    max: Math.max(...heights),
    amplitude,
    samples,
    landmarkAnchors: buildLandmarkAnchors(points, samples, event, biome, width, rng),
  };
}

function sampleElevationSamples(samples, t, closed) {
  if (!samples?.length) return { z: 0, height: 0, grade: 0, bank: 0 };
  const count = samples.length;
  const scaled = closed ? wrapT(t) * count : clamp(t, 0, 1) * Math.max(1, count - 1);
  const index = closed ? Math.floor(scaled) % count : clamp(Math.floor(scaled), 0, count - 1);
  const nextIndex = closed ? (index + 1) % count : Math.min(count - 1, index + 1);
  const mix = closed ? scaled - Math.floor(scaled) : scaled - index;
  const a = samples[index];
  const b = samples[nextIndex];
  return {
    z: lerp(a.z, b.z, mix),
    height: lerp(a.height, b.height, mix),
    grade: lerp(a.grade, b.grade, mix),
    bank: lerp(a.bank, b.bank, mix),
  };
}

export function sampleTrackHeight(track, t) {
  return sampleElevationSamples(track?.elevationSamples || [], t, track?.type === "circuit").height;
}

export function sampleTrackBank(track, t) {
  return sampleElevationSamples(track?.elevationSamples || [], t, track?.type === "circuit").bank;
}

export function buildTrack(event) {
  const rng = createRng(event.seed);
  const biome = BIOME_DEFS[event.biomeId];
  const generatedPath = buildPlayablePath(event, rng);
  const { controlPoints, points, metrics } = generatedPath;
  const width = event.type === "circuit" ? 180 + rng() * 24 : 170 + rng() * 20;
  const anchors = chooseTrackAnchors(points, event, width);
  const sectors = buildSectors(points, event, rng, biome);
  const elevation = buildElevationProfile(points, event, sectors, biome, width, rng);
  const elevatedPoints = points.map((point, index) => ({
    ...point,
    z: elevation.samples[index]?.height || 0,
    grade: elevation.samples[index]?.grade || 0,
    bank: elevation.samples[index]?.bank || 0,
  }));
  const checkpoints = buildOrderedCheckpoints(points, event, width, anchors.startT, anchors.finishT);
  const safeRespawnNodes = checkpoints.filter((checkpoint) => getSectorForT({ sectors }, checkpoint.t).tag !== "hazard");
  const surgeStrips = buildSurgeStrips(points, event, sectors, width, rng);
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
    const height = sampleElevationSamples(elevation.samples, t, event.type === "circuit").height;
    pickups.push({
      x: point.x + normal.x * offset,
      y: point.y + normal.y * offset,
      z: height + 14,
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
    const t = sampleSectorT(sector, rng(), event.type === "circuit");
    const point = samplePath(points, t, event.type === "circuit");
    const height = sampleElevationSamples(elevation.samples, t, event.type === "circuit").height;
    hazards.push({
      x: point.x + (rng() - 0.5) * width * 0.45,
      y: point.y + (rng() - 0.5) * width * 0.45,
      z: height,
      radius: 18 + rng() * 16,
      damage: (8 + rng() * 5) * sector.hazardBias,
      t,
      sectorTag: sector.tag,
    });
  }

  const props = [];
  const propTrack = { points, type: event.type };
  const pushBeyondRoad = (candidateX, candidateY, pushNormal) => {
    const minDistance = width * 0.72;
    const placed = { x: candidateX, y: candidateY };
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const info = nearestPathInfo(propTrack, placed.x, placed.y);
      if (info.distance >= minDistance) break;
      const away = normalize(placed.x - info.point.x, placed.y - info.point.y);
      const direction = away.x || away.y ? away : pushNormal;
      const push = minDistance - info.distance + 8;
      placed.x += direction.x * push;
      placed.y += direction.y * push;
    }
    return placed;
  };
  for (let i = 0; i < points.length; i += 8) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const tangent = normalize(b.x - a.x, b.y - a.y);
    const normal = { x: -tangent.y, y: tangent.x };
    const outerDistance = width * (1.28 + rng() * 0.84);
    const innerDistance = width * (1.04 + rng() * 0.62);
    const sample = elevation.samples[i];
    const outerPlacement = pushBeyondRoad(a.x + normal.x * outerDistance, a.y + normal.y * outerDistance, normal);
    const innerPlacement = pushBeyondRoad(a.x - normal.x * innerDistance, a.y - normal.y * innerDistance, { x: -normal.x, y: -normal.y });
    props.push({
      x: outerPlacement.x,
      y: outerPlacement.y,
      z: (sample?.height || 0) + 4,
      size: 20 + rng() * 28,
      height: 28 + rng() * 38,
      rotation: rng() * TAU,
      kind: pickPropKind(biome, rng, "outer", i),
      alive: true,
      side: "outer",
    });
    props.push({
      x: innerPlacement.x,
      y: innerPlacement.y,
      z: (sample?.height || 0) + 4,
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
    seed: event.seed,
    type: event.type,
    width,
    theme: biome,
    points: elevatedPoints,
    checkpoints: checkpoints.map((checkpoint) => ({
      ...checkpoint,
      z: sampleElevationSamples(elevation.samples, checkpoint.t, event.type === "circuit").height,
    })),
    pickups,
    hazards,
    props,
    landmarkAnchors: elevation.landmarkAnchors,
    elevationSamples: elevation.samples,
    heightRange: { min: elevation.min, max: elevation.max },
    sectors,
    surgeStrips,
    safeRespawnNodes: safeRespawnNodes.map((checkpoint) => ({
      ...checkpoint,
      z: sampleElevationSamples(elevation.samples, checkpoint.t, event.type === "circuit").height,
    })),
    metrics,
    startT: anchors.startT,
    finishT: anchors.finishT,
    startLine: {
      ...anchors.startLine,
      z: sampleElevationSamples(elevation.samples, anchors.startLine.t, event.type === "circuit").height,
    },
    finishLine: {
      ...anchors.finishLine,
      z: sampleElevationSamples(elevation.samples, anchors.finishLine.t, event.type === "circuit").height,
    },
    modifiers: event.modifierIds.map((id) => MODIFIER_DEFS[id]),
    start: { x: anchors.startLine.x, y: anchors.startLine.y },
    finish: { x: anchors.finishLine.x, y: anchors.finishLine.y },
  };
  return trackDescriptor;
}

export function getSectorAtProgress(track, t) {
  return getSectorForT(track, t);
}
