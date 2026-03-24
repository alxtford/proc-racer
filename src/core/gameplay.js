import { AI_PROFILE_DEFS, CAR_DEFS, PICKUP_DEFS } from "../data/content.js";
import { getControlBinding } from "./controls.js";
import { getSectorAtProgress, nearestPathInfo, samplePath, sampleTrackBank, sampleTrackHeight } from "./generator.js";
import { clamp, distance, normalize, wrapAngle } from "./utils.js";

const DEFAULT_PARTS = ["bumper", "door", "spoiler", "panel"];
const HYBRID_KEYMAP = {
  left: ["arrowleft", "a"],
  right: ["arrowright", "d"],
  accel: ["arrowup", "w"],
  brake: ["arrowdown", "s", " "],
  pickup: ["shift", "x"],
};

function getAssistConfig(state) {
  const assistLevel = state.save.settings.assistLevel || "standard";
  if (assistLevel === "high") {
    return {
      damageScale: 0.84,
      catchUpBonus: 0.12,
      recoveryBonus: 0.18,
      autoResetScale: 0.82,
      respawnInvuln: 2.5,
      respawnAssist: 1.9,
    };
  }
  if (assistLevel === "off") {
    return {
      damageScale: 1.06,
      catchUpBonus: 0,
      recoveryBonus: 0,
      autoResetScale: 1.14,
      respawnInvuln: 1.6,
      respawnAssist: 1.05,
    };
  }
  return {
    damageScale: 0.94,
    catchUpBonus: 0.08,
    recoveryBonus: 0.1,
    autoResetScale: 1,
    respawnInvuln: 2,
    respawnAssist: 1.5,
  };
}

function getRaceScore(state, car) {
  const checkpointCount = state.track?.checkpoints?.length || 10;
  return (car.currentLap - 1) * checkpointCount + car.checkpointIndex + (car.progress || 0);
}

function getRelativeTrackProgress(track, rawT) {
  if (!track) return 0;
  if (track.type === "circuit") return ((rawT - (track.startT ?? 0) + 1) % 1 + 1) % 1;
  const startT = track.startT ?? 0;
  const finishT = track.finishT ?? 1;
  return clamp((rawT - startT) / Math.max(0.001, finishT - startT), 0, 1);
}

function gateSignedDistance(gate, x, y) {
  const dx = x - gate.x;
  const dy = y - gate.y;
  return dx * gate.tangent.x + dy * gate.tangent.y;
}

function gateCrossTrackOffset(gate, x, y) {
  const dx = x - gate.x;
  const dy = y - gate.y;
  return dx * gate.normal.x + dy * gate.normal.y;
}

function crossesGateForward(gate, fromX, fromY, toX, toY) {
  const fromDistance = gateSignedDistance(gate, fromX, fromY);
  const toDistance = gateSignedDistance(gate, toX, toY);
  if (fromDistance > 0 || toDistance < 0 || Math.abs(toDistance - fromDistance) < 0.0001) return false;
  const mix = clamp((-fromDistance) / (toDistance - fromDistance), 0, 1);
  const crossX = fromX + (toX - fromX) * mix;
  const crossY = fromY + (toY - fromY) * mix;
  return Math.abs(gateCrossTrackOffset(gate, crossX, crossY)) <= gate.halfWidth + 18;
}

function getGamepadValue(state, action) {
  const gamepad = state.gamepad;
  if (!gamepad?.connected) return 0;
  if (action === "left") return gamepad.steer < -0.18 ? Math.abs(gamepad.steer) : 0;
  if (action === "right") return gamepad.steer > 0.18 ? gamepad.steer : 0;
  if (action === "accel") return gamepad.accel > 0.12 ? gamepad.accel : 0;
  if (action === "brake") return gamepad.brake > 0.12 ? gamepad.brake : 0;
  if (action === "pickup") return gamepad.pickup ? 1 : 0;
  return 0;
}

function isKeyboardActionPressed(state, action) {
  return state.save.settings.controlMode === "custom"
    ? state.keys.has(getControlBinding(state.save.settings, action))
    : (HYBRID_KEYMAP[action] || []).some((key) => state.keys.has(key));
}

function isActionPressed(state, action) {
  const keyboardPressed = isKeyboardActionPressed(state, action);
  return keyboardPressed || getGamepadValue(state, action) > 0;
}

export function createCar(carSource, isPlayer, slot, track, aiProfileId = "stable", eventId = "") {
  const customSource = typeof carSource === "object" && carSource !== null;
  const carId = customSource ? (carSource.id || carSource.def?.id || `garage-${slot}`) : carSource;
  const def = customSource ? carSource.def : CAR_DEFS[carId];
  const aiProfile = AI_PROFILE_DEFS[aiProfileId] || AI_PROFILE_DEFS.stable;
  const label = customSource ? carSource.label || def.name : isPlayer ? "You" : `${aiProfile.label} ${def.name}`;
  const startTBase = track.startT ?? (track.type === "circuit" ? 0 : 0.03);
  const startOffset = track.type === "circuit"
    ? startTBase + 0.018 + slot * 0.012
    : clamp(startTBase + 0.03 + slot * 0.014, 0, Math.max(startTBase + 0.03, (track.finishT ?? 0.97) - 0.02));
  const lookOffset = track.type === "circuit" ? startOffset + 0.003 : clamp(startOffset + 0.003, 0, 1);
  const start = samplePath(track.points, startOffset, track.type === "circuit");
  const look = samplePath(track.points, lookOffset, track.type === "circuit");
  const dir = Math.atan2(look.y - start.y, look.x - start.x);
  const laneOffset = (slot % 2 === 0 ? -1 : 1) * Math.floor(slot / 2) * 24;
  const spawnX = start.x + Math.cos(dir + Math.PI / 2) * laneOffset;
  const spawnY = start.y + Math.sin(dir + Math.PI / 2) * laneOffset;
  const startHeight = sampleTrackHeight(track, startOffset);
  return {
    id: `${isPlayer ? "player" : "ai"}-${slot}`,
    label,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    angle: dir,
    steer: 0,
    throttle: 0,
    width: def.visualWidth || 26,
    length: def.visualLength || 48,
    carId,
    garageCarId: customSource ? carId : null,
    tierLabel: customSource ? carSource.tierLabel || "" : "",
    cosmetics: customSource ? carSource.visuals || null : null,
    def,
    isPlayer,
    eventId,
    aiProfileId,
    aiProfile,
    currentLap: 1,
    lapStartedAt: 0,
    lapTimes: [],
    lastLapTime: null,
    bestLapTime: null,
    finished: false,
    finishMs: 0,
    checkpointIndex: 0,
    respawnCheckpoint: 0,
    pickup: null,
    pickupCooldown: 0,
    boostTimer: 0,
    shieldTimer: 0,
    invuln: 0,
    damage: 0,
    health: def.durability,
    visibleParts: [...DEFAULT_PARTS],
    destroyed: false,
    respawnTimer: 0,
    chassisFlash: 0,
    place: slot + 1,
    powerPenalty: 0,
    slipstream: 0,
    driftLevel: 0,
    stuckTimer: 0,
    offTrackTimer: 0,
    courseMissTimer: 0,
    wrongWayTimer: 0,
    assistTimer: 0,
    resetCooldown: 0,
    respawns: 0,
    destroyedCount: 0,
    wallHits: 0,
    pickupCollects: 0,
    pickupUses: 0,
    pulseHits: 0,
    boundaryLatch: false,
    lastProgress: 0,
    targetLane: 0,
    mistakeTimer: 0,
    pickupLatch: false,
    overtakePulse: 0,
    rival: false,
    aiIntent: isPlayer ? "Hold the line" : "Form up",
    sectorTag: "high-speed",
    sectorName: "",
    packPressure: 0,
    targetRivalId: null,
    draftCharge: 0,
    draftArmed: false,
    slingshotTimer: 0,
    stripCooldown: 0,
    rivalHeat: 0,
    pathT: startTBase,
    groundZ: startHeight,
    bank: sampleTrackBank(track, startOffset),
    previousX: spawnX,
    previousY: spawnY,
    speedTrail: [],
  };
}

export function usePickup(ctx, car) {
  if (!car.pickup || car.pickupCooldown > 0 || car.destroyed) return;
  const pickupId = car.pickup;
  car.pickupUses += 1;
  car.pickupCooldown = 0.7;
  if (pickupId === "boost") {
    car.boostTimer = 1.6;
    car.assistTimer = Math.max(car.assistTimer, 0.4);
    ctx.state.fx.push({ kind: "boost-bloom", x: car.x, y: car.y, radius: 18, life: 0.45, color: PICKUP_DEFS.boost.color });
  } else if (pickupId === "pulse") {
    ctx.state.fx.push({ kind: "pulse", x: car.x, y: car.y, radius: 44, maxRadius: 200, life: 0.48, color: PICKUP_DEFS.pulse.color, owner: car.id });
    for (const target of ctx.state.cars) {
      if (target.id === car.id || target.destroyed || target.finished || target.invuln > 0) continue;
      const gap = distance(car, target);
      if (gap < 190) {
        const strength = (1 - gap / 190) * 18;
        applyDamage(ctx, target, strength, "pulse", strength > 11 ? "heavy" : "scrape");
        if (target.rival || car.rival) {
          target.rivalHeat = Math.max(target.rivalHeat, 1.1);
          car.rivalHeat = Math.max(car.rivalHeat, 0.9);
        }
        const away = normalize(target.x - car.x, target.y - car.y);
        target.vx += away.x * 140;
        target.vy += away.y * 140;
        car.pulseHits += 1;
      }
    }
  } else if (pickupId === "shield") {
    car.shieldTimer = 2.3;
    car.assistTimer = Math.max(car.assistTimer, 1.2);
    car.damage = Math.max(0, car.damage - car.def.durability * 0.08);
    car.powerPenalty = clamp(car.damage / car.def.durability, 0, 0.35);
    ctx.state.fx.push({ kind: "shield", x: car.x, y: car.y, radius: 24, life: 0.65, color: PICKUP_DEFS.shield.color });
  }
  ctx.bus.emit("pickup_fire", { pickupId, carId: car.id });
  car.pickup = null;
}

export function applyDamage(ctx, car, amount, source, severity = "heavy") {
  if (car.destroyed || car.invuln > 0) return;
  let applied = amount;
  if (car.isPlayer) {
    applied *= getAssistConfig(ctx.state).damageScale;
  }
  if (car.shieldTimer > 0) {
    applied *= 0.35;
  }
  if (severity === "scrape") {
    applied *= 0.45;
  }
  car.damage += applied;
  car.health = Math.max(0, car.def.durability - car.damage);
  car.chassisFlash = severity === "wreck" ? 0.45 : 0.22;
  car.powerPenalty = clamp(car.damage / car.def.durability, 0, 0.42);
  ctx.state.camera.shake = Math.max(ctx.state.camera.shake, applied * (severity === "scrape" ? 0.08 : 0.18));

  const thresholds = [0.22, 0.45, 0.68, 0.82];
  while (car.visibleParts.length && car.damage / car.def.durability > thresholds[4 - car.visibleParts.length]) {
    car.visibleParts.shift();
    const debrisColor = car.cosmetics?.bodyColor || car.def.color;
    ctx.state.debris.push({
      x: car.x,
      y: car.y,
      vx: car.vx * 0.3 + (Math.random() - 0.5) * 120,
      vy: car.vy * 0.3 + (Math.random() - 0.5) * 120,
      size: 8 + Math.random() * 12,
      life: 2 + Math.random(),
      color: debrisColor,
      streak: true,
    });
  }

  if (severity !== "scrape") {
    ctx.state.fx.push({ kind: "spark", x: car.x, y: car.y, radius: 12 + applied, life: 0.28, color: "#ffffff" });
    ctx.bus.emit("heavy_impact", { carId: car.id, amount: applied, source, severity });
  }

  if (severity === "wreck" || car.damage >= car.def.durability) {
    destroyCar(ctx, car, source);
  }
}

export function destroyCar(ctx, car, source = "impact") {
  if (car.destroyed) return;
  const bodyColor = car.cosmetics?.bodyColor || car.def.color;
  car.destroyed = true;
  car.destroyedCount += 1;
  car.respawnTimer = 2.1;
  car.vx = 0;
  car.vy = 0;
  car.boostTimer = 0;
  car.shieldTimer = 0;
  ctx.state.fx.push({ kind: "pulse", x: car.x, y: car.y, radius: 26, maxRadius: 230, life: 0.82, color: "#ff6d7f", owner: car.id });
  ctx.state.slowMo = 0.18;
  for (let i = 0; i < 10; i += 1) {
    ctx.state.debris.push({
      x: car.x,
      y: car.y,
      vx: Math.cos((i / 10) * Math.PI * 2) * (90 + Math.random() * 130),
      vy: Math.sin((i / 10) * Math.PI * 2) * (90 + Math.random() * 130),
      size: 9 + Math.random() * 14,
      life: 1.4 + Math.random() * 1.2,
      color: i % 2 === 0 ? bodyColor : "#f7f2ff",
      streak: true,
    });
  }
  ctx.bus.emit("wreck", { carId: car.id, player: car.isPlayer, source });
}

export function respawnCar(ctx, car, meta = {}) {
  const assist = car.isPlayer ? getAssistConfig(ctx.state) : null;
  const checkpoints = ctx.state.track.checkpoints;
  const nodes = ctx.state.track.safeRespawnNodes.length ? ctx.state.track.safeRespawnNodes : checkpoints;
  const targetIndex = clamp(car.respawnCheckpoint, 0, checkpoints.length - 1);
  const checkpoint = nodes.find((node) => node.index === targetIndex)
    || nodes.find((node) => node.index > targetIndex)
    || checkpoints[targetIndex]
    || nodes[0]
    || checkpoints[0];
  const nextIndex = ctx.state.track.type === "circuit"
    ? (checkpoint.index + 1) % checkpoints.length
    : Math.min(checkpoints.length - 1, checkpoint.index + 1);
  const next = checkpoints[nextIndex] || checkpoint;
  const tangent = Math.hypot(next.x - checkpoint.x, next.y - checkpoint.y) > 0.01
    ? normalize(next.x - checkpoint.x, next.y - checkpoint.y)
    : checkpoint.tangent;
  car.x = checkpoint.x + tangent.x * 20;
  car.y = checkpoint.y + tangent.y * 20;
  car.vx = tangent.x * 150;
  car.vy = tangent.y * 150;
  car.angle = Math.atan2(tangent.y, tangent.x);
  car.checkpointIndex = checkpoint.index;
  car.respawnCheckpoint = checkpoint.index;
  car.destroyed = false;
  car.invuln = assist?.respawnInvuln ?? 2;
  car.boostTimer = 0.9;
  car.assistTimer = assist?.respawnAssist ?? 1.5;
  car.respawns += 1;
  car.damage = Math.min(car.damage, car.def.durability * 0.12);
  car.health = car.def.durability - car.damage;
  car.visibleParts = DEFAULT_PARTS.slice(Math.floor((car.damage / car.def.durability) * 4));
  car.powerPenalty = clamp(car.damage / car.def.durability, 0, 0.22);
  car.pathT = checkpoint.t;
  car.progress = getRelativeTrackProgress(ctx.state.track, checkpoint.t);
  car.groundZ = sampleTrackHeight(ctx.state.track, checkpoint.t);
  car.bank = sampleTrackBank(ctx.state.track, checkpoint.t);
  car.previousX = car.x;
  car.previousY = car.y;
  car.stuckTimer = 0;
  car.offTrackTimer = 0;
  car.courseMissTimer = 0;
  car.wrongWayTimer = 0;
  ctx.bus.emit("respawn", { carId: car.id, player: car.isPlayer, ...meta });
}

function getSlipstreamBonus(state, car) {
  let best = 0;
  for (const other of state.cars) {
    if (other.id === car.id || other.destroyed) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const distanceTo = Math.hypot(dx, dy);
    if (distanceTo > 220) continue;
    const angleTo = Math.atan2(dy, dx);
    const delta = Math.abs(wrapAngle(angleTo - car.angle));
    if (delta < 0.38) {
      best = Math.max(best, 1 - distanceTo / 220);
    }
  }
  car.slipstream = best;
  return best;
}

function updateDraftState(ctx, car, dt, slipstreamBonus, speedForward) {
  const wasArmed = car.draftArmed;
  if (slipstreamBonus > 0.18 && speedForward > 120) {
    car.draftCharge = clamp(car.draftCharge + dt * (0.38 + slipstreamBonus * 0.95 * car.def.slipstreamAffinity), 0, 1.3);
    if (car.draftCharge > 0.76) car.draftArmed = true;
  } else {
    const canFire = car.draftArmed && car.draftCharge > 0.72 && slipstreamBonus < 0.08 && car.throttle > 0.35 && speedForward > 110;
    if (canFire) {
      car.slingshotTimer = Math.max(car.slingshotTimer, 0.9 + car.draftCharge * 0.5);
      car.assistTimer = Math.max(car.assistTimer, 0.32);
      if (car.isPlayer) ctx.bus.emit("slingshot_fire", { player: true, strength: car.draftCharge });
      car.draftCharge = 0;
      car.draftArmed = false;
    } else {
      car.draftCharge = Math.max(0, car.draftCharge - dt * (car.isPlayer ? 0.18 : 0.28));
      if (car.draftCharge < 0.52) car.draftArmed = false;
    }
  }
  if (!wasArmed && car.draftArmed && car.isPlayer) {
    ctx.bus.emit("slingshot_armed", { player: true });
  }
}

function chooseAiLane(ctx, car, pathInfo) {
  let targetLane = 0;
  const score = getRaceScore(ctx.state, car);
  const sector = getSectorAtProgress(ctx.state.track, pathInfo.t);
  const normal = { x: -pathInfo.tangent.y, y: pathInfo.tangent.x };
  const nearbyCars = ctx.state.cars
    .filter((other) => other.id !== car.id && !other.destroyed)
    .map((other) => {
      const scoreDelta = getRaceScore(ctx.state, other) - score;
      const lateralDelta = (other.x - car.x) * normal.x + (other.y - car.y) * normal.y;
      return { other, scoreDelta, lateralDelta, range: distance(car, other) };
    })
    .filter((entry) => entry.range < ctx.state.track.width * 1.9)
    .sort((a, b) => a.range - b.range);
  car.packPressure = nearbyCars.length;
  const ahead = nearbyCars.find((entry) => entry.scoreDelta > 0 && entry.scoreDelta < 1.4);
  const behind = nearbyCars.find((entry) => entry.scoreDelta < 0 && entry.scoreDelta > -1.1);
  const playerEntry = nearbyCars.find((entry) => entry.other.isPlayer);
  let intent = sector.tag === "hazard"
    ? "Thread the killbox"
    : sector.tag === "technical"
      ? "Fight the apex"
      : sector.tag === "recovery"
        ? "Reset and fire"
        : "Burn the straight";
  car.targetRivalId = null;
  if (car.rival && playerEntry) {
    car.targetRivalId = playerEntry.other.id;
    if (playerEntry.scoreDelta > 0 && playerEntry.scoreDelta < 1.35) {
      const sign = playerEntry.lateralDelta >= 0 ? -1 : 1;
      targetLane = sign * ctx.state.track.width * 0.2 * (0.82 + car.aiProfile.aggression * 0.85);
      car.overtakePulse = Math.max(car.overtakePulse, 0.56 + car.aiProfile.aggression * 0.32);
      intent = `Hunt ${playerEntry.other.label}`;
    } else if (playerEntry.scoreDelta < 0 && playerEntry.scoreDelta > -1.15) {
      const sign = playerEntry.lateralDelta >= 0 ? 1 : -1;
      targetLane = sign * ctx.state.track.width * 0.14 * (0.86 + car.aiProfile.defense * 0.6);
      intent = `Block ${playerEntry.other.label}`;
    }
  }
  if (ahead) {
    const sign = ahead.lateralDelta >= 0 ? -1 : 1;
    targetLane = sign * ctx.state.track.width * 0.18 * (0.72 + car.aiProfile.aggression * 0.65);
    car.overtakePulse = Math.max(car.overtakePulse, 0.36 + car.aiProfile.aggression * 0.26);
    intent = intent.startsWith("Hunt") ? intent : `Pass ${ahead.other.label}`;
  } else if (behind && car.aiProfile.defense > 0.4) {
    const sign = behind.lateralDelta >= 0 ? 1 : -1;
    targetLane = sign * ctx.state.track.width * 0.11 * (0.8 + car.aiProfile.defense * 0.5);
    if (!intent.startsWith("Block")) intent = `Cover ${behind.other.label}`;
  }
  if (!ahead && !behind && nearbyCars.length >= 3) {
    intent = sector.tag === "hazard" ? "Pack in the killbox" : "Pack pressure";
  }
  const nearbyStrip = ctx.state.track.surgeStrips?.find((strip) => {
    const delta = ctx.state.track.type === "circuit"
      ? ((strip.t - pathInfo.t + 1) % 1)
      : strip.t - pathInfo.t;
    return delta > 0 && delta < 0.045;
  });
  if (nearbyStrip && (!ahead || sector.tag === "high-speed")) {
    const lanePush = nearbyStrip.laneOffset * (car.rival || car.rivalHeat > 0.4 ? 0.92 : 0.74);
    targetLane = targetLane === 0 ? lanePush : targetLane * 0.55 + lanePush * 0.45;
    if (sector.tag === "high-speed") intent = intent.startsWith("Hunt") || intent.startsWith("Pass") ? intent : "Take the overdrive";
  }
  const laneScale = sector.tag === "hazard" ? 0.82 : sector.tag === "technical" ? 1.08 : 1;
  targetLane *= laneScale;
  if (car.rival) {
    targetLane *= ahead ? 1.16 : 1.08;
  }
  car.targetLane = targetLane;
  car.aiIntent = intent;
}

function updatePlayerInput(state, car) {
  const keyboardSteer = (isKeyboardActionPressed(state, "right") ? 1 : 0) - (isKeyboardActionPressed(state, "left") ? 1 : 0);
  const padSteer = state.gamepad?.connected && Math.abs(state.gamepad.steer) > 0.16 ? state.gamepad.steer : 0;
  const accelValue = Math.max(isKeyboardActionPressed(state, "accel") ? 1 : 0, getGamepadValue(state, "accel"));
  const brakeValue = Math.max(isKeyboardActionPressed(state, "brake") ? 1 : 0, getGamepadValue(state, "brake"));
  car.steer = Math.abs(padSteer) > Math.abs(keyboardSteer) ? padSteer : keyboardSteer;
  car.throttle = accelValue > 0 ? accelValue : brakeValue > 0 ? -0.75 * brakeValue : 0;
  const use = isActionPressed(state, "pickup");
  if (use && !car.pickupLatch) usePickup(state.ctx, car);
  car.pickupLatch = use;
}

function updateAiInput(ctx, car, dt) {
  const info = nearestPathInfo(ctx.state.track, car.x, car.y);
  chooseAiLane(ctx, car, info);
  const sector = getSectorAtProgress(ctx.state.track, info.t);
  const player = ctx.state.player;
  const lookAhead = samplePath(
    ctx.state.track.points,
    info.t + 0.014 + sector.lookAheadBias + car.aiProfile.risk * 0.004 + car.overtakePulse * 0.004,
    ctx.state.track.type === "circuit",
  );
  const tangent = normalize(lookAhead.x - car.x, lookAhead.y - car.y);
  const normal = { x: -tangent.y, y: tangent.x };
  const desiredPoint = {
    x: lookAhead.x + normal.x * car.targetLane,
    y: lookAhead.y + normal.y * car.targetLane,
  };
  const desired = Math.atan2(desiredPoint.y - car.y, desiredPoint.x - car.x);
  let delta = wrapAngle(desired - car.angle);
  if (car.mistakeTimer > 0) {
    delta += Math.sin(car.mistakeTimer * 22) * 0.2;
    car.mistakeTimer -= dt;
  } else if (Math.random() < car.aiProfile.mistakeChance * dt * 0.8) {
    car.mistakeTimer = 0.5 + Math.random() * 0.5;
  }
  car.steer = clamp(delta * 1.8, -1, 1);
  const straightLine = Math.abs(delta) < 0.18;
  const baseThrottle = info.distance > ctx.state.track.width * 0.34 ? 0.72 : car.aiProfile.speedBias;
  const turnPenalty = Math.abs(delta) > 0.34 ? 0.66 : 1;
  const rivalPush = car.rival && straightLine ? 0.08 : 0;
  const overtakePush = car.overtakePulse > 0 ? 0.06 : 0;
  const heatPush = Math.min(0.12, car.rivalHeat * 0.05);
  const sectorThrottle = sector.tag === "high-speed" ? 0.07 : sector.tag === "hazard" ? -0.05 : sector.tag === "recovery" ? 0.04 : 0.01;
  const intentPush = car.aiIntent.startsWith("Hunt")
    ? 0.08
    : car.aiIntent.startsWith("Pass")
      ? 0.05
      : car.aiIntent.startsWith("Block") || car.aiIntent.startsWith("Cover")
      ? -0.03
        : 0;
  const packBias = car.packPressure >= 2 ? 0.03 : 0;
  const riskBias = sector.tag === "technical" ? car.aiProfile.risk * 0.015 : car.aiProfile.risk * 0.028;
  const maxThrottle = sector.tag === "high-speed" ? 1.14 : sector.tag === "hazard" ? 1.02 : 1.08;
  car.throttle = clamp(baseThrottle * turnPenalty + rivalPush + overtakePush + sectorThrottle + intentPush + packBias + riskBias + heatPush, 0.48, maxThrottle);
  const playerRange = player && !player.destroyed ? distance(car, player) : 9999;
  if (car.pickup === "boost" && straightLine && Math.random() < dt * (0.3 + car.aiProfile.aggression * 0.42 + car.overtakePulse * 0.6 + (sector.tag === "high-speed" ? 0.26 : 0) + (car.rival && playerRange < 240 ? 0.22 : 0))) usePickup(ctx, car);
  if (car.pickup === "pulse") {
    const closeTarget = ctx.state.cars
      .filter((other) => other.id !== car.id && !other.destroyed && distance(car, other) < 170)
      .sort((a, b) => {
        if (a.isPlayer) return -1;
        if (b.isPlayer) return 1;
        return distance(car, a) - distance(car, b);
      })[0];
    if (closeTarget && Math.random() < dt * (0.5 + car.aiProfile.aggression + heatPush * 1.6)) usePickup(ctx, car);
  }
  if (car.pickup === "shield" && (car.damage / car.def.durability > 0.3 || info.distance > ctx.state.track.width * 0.38 || sector.tag === "hazard") && Math.random() < dt * 1.4) {
    usePickup(ctx, car);
  }
}

export function integrateCar(ctx, car, dt) {
  if (car.destroyed) {
    car.respawnTimer -= dt;
    if (car.respawnTimer <= 0) respawnCar(ctx, car);
    return;
  }

  if (car.finished) {
    car.vx = 0;
    car.vy = 0;
    car.throttle = 0;
    car.steer = 0;
    return;
  }

  car.invuln = Math.max(0, car.invuln - dt);
  car.pickupCooldown = Math.max(0, car.pickupCooldown - dt);
  car.boostTimer = Math.max(0, car.boostTimer - dt);
  car.shieldTimer = Math.max(0, car.shieldTimer - dt);
  car.assistTimer = Math.max(0, car.assistTimer - dt);
  car.chassisFlash = Math.max(0, car.chassisFlash - dt);
  car.resetCooldown = Math.max(0, car.resetCooldown - dt);
  car.overtakePulse = Math.max(0, car.overtakePulse - dt * 0.5);
  car.slingshotTimer = Math.max(0, car.slingshotTimer - dt);
  car.stripCooldown = Math.max(0, car.stripCooldown - dt);
  car.rivalHeat = Math.max(0, car.rivalHeat - dt * 0.42);

  if (car.isPlayer) updatePlayerInput(ctx.state, car);
  else updateAiInput(ctx, car, dt);

  const pathInfo = nearestPathInfo(ctx.state.track, car.x, car.y);
  car.progress = pathInfo.t;
  const sector = getSectorAtProgress(ctx.state.track, pathInfo.t);
  car.sectorTag = sector.tag;
  car.sectorName = sector.name;
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const lateral = { x: -forward.y, y: forward.x };
  const speedForward = car.vx * forward.x + car.vy * forward.y;
  const speedLateral = car.vx * lateral.x + car.vy * lateral.y;
  const braking = car.throttle < 0;
  const turnScale = clamp(Math.abs(speedForward) / 126, 0.38, 1.24);
  const driftBias = braking && Math.abs(car.steer) > 0.15 ? 1 + (car.def.brakeTurn - 1) * 0.58 : 1;
  const driftDelta = braking && Math.abs(car.steer) > 0.18 ? 1.2 : -1.8;
  car.driftLevel = clamp(car.driftLevel + driftDelta * dt, 0, 0.78);
  const turnPenalty = 1 - clamp(car.powerPenalty * 0.48, 0, 0.38);
  car.angle += car.steer * car.def.turn * turnScale * turnPenalty * driftBias * dt * 1.08;

  const assistConfig = car.isPlayer ? getAssistConfig(ctx.state) : null;
  const slipstreamBonus = getSlipstreamBonus(ctx.state, car) * car.def.slipstreamAffinity;
  updateDraftState(ctx, car, dt, slipstreamBonus, speedForward);
  const catchUpBonus = car.isPlayer && car.place > Math.ceil(ctx.state.cars.length * 0.6) ? assistConfig.catchUpBonus : 0;
  const assistBonus = car.assistTimer > 0 ? (assistConfig?.recoveryBonus ?? 0.08) : 0;
  const boostFactor = car.boostTimer > 0 ? 1.3 : 1;
  const slingshotFactor = 1 + Math.min(1, car.slingshotTimer) * 0.12;
  const surfaceSpeed = sector.speedBias;
  const accelForce = car.def.accel * (1 - car.powerPenalty * 0.55 + catchUpBonus + assistBonus) * boostFactor * slingshotFactor;
  const maxSpeed = car.def.maxSpeed * (1 - car.powerPenalty * 0.28 + slipstreamBonus * 0.16 + catchUpBonus + assistBonus) * boostFactor * slingshotFactor * surfaceSpeed;
  car.vx += forward.x * car.throttle * accelForce * dt;
  car.vy += forward.y * car.throttle * accelForce * dt;

  const gripStrength = clamp(car.def.grip * sector.gripMultiplier * dt * (1.06 - car.driftLevel * 0.28), 0, 0.38);
  car.vx -= lateral.x * speedLateral * gripStrength;
  car.vy -= lateral.y * speedLateral * gripStrength;
  car.vx *= braking ? 0.982 : 0.994;
  car.vy *= braking ? 0.982 : 0.994;

  const speed = Math.hypot(car.vx, car.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    car.vx *= scale;
    car.vy *= scale;
  }

  const previousX = car.x;
  const previousY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.groundZ = sampleTrackHeight(ctx.state.track, pathInfo.t);
  car.bank = sampleTrackBank(ctx.state.track, pathInfo.t);
  const trailLife = car.boostTimer > 0 ? 0.62 : car.slingshotTimer > 0 ? 0.46 : 0.34;
  const trailLimit = car.boostTimer > 0 ? 22 : car.slingshotTimer > 0 ? 18 : 14;
  car.speedTrail.push({
    x: car.x,
    y: car.y,
    z: car.groundZ,
    angle: car.angle,
    age: trailLife,
    maxAge: trailLife,
    energy: car.boostTimer > 0 ? 1 : car.slingshotTimer > 0 ? 0.55 : 0,
  });
  car.speedTrail = car.speedTrail.slice(-trailLimit);

  handleBoundaryCollision(ctx, car, dt);
  updateCheckpointProgress(ctx, car, previousX, previousY);
  handleSurgeStrips(ctx, car);
  handlePickups(ctx, car);
  handleHazards(ctx, car, dt);
  handleAssistReset(ctx, car, dt);
}

function updateCheckpointProgress(ctx, car, previousX, previousY) {
  const info = nearestPathInfo(ctx.state.track, car.x, car.y);
  car.pathT = info.t;
  car.progress = getRelativeTrackProgress(ctx.state.track, info.t);
  const checkpoints = ctx.state.track.checkpoints;
  const nextIndex = ctx.state.track.type === "circuit"
    ? (car.checkpointIndex + 1) % checkpoints.length
    : Math.min(checkpoints.length - 1, car.checkpointIndex + 1);
  const nextCheckpoint = checkpoints[nextIndex];
  if (!car.finished && nextCheckpoint && crossesGateForward(nextCheckpoint, previousX, previousY, car.x, car.y)) {
    car.checkpointIndex = nextIndex;
    car.respawnCheckpoint = nextIndex;
    if (ctx.state.track.type === "circuit" && nextIndex === 0) {
      const lapTime = Math.max(0, ctx.state.elapsed - (car.lapStartedAt || 0));
      car.lapTimes.push(lapTime);
      car.lastLapTime = lapTime;
      car.bestLapTime = Number.isFinite(car.bestLapTime) ? Math.min(car.bestLapTime, lapTime) : lapTime;
      ctx.bus.emit("lap_complete", {
        carId: car.id,
        player: car.isPlayer,
        lap: car.currentLap,
        lapTime,
        bestLap: Math.abs((car.bestLapTime ?? lapTime) - lapTime) < 0.005,
      });
      car.lapStartedAt = ctx.state.elapsed;
      car.currentLap += 1;
      if (car.currentLap > ctx.state.currentEvent.laps) finishCar(ctx, car);
    } else if (ctx.state.track.type === "sprint" && nextIndex === checkpoints.length - 1) {
      finishCar(ctx, car);
    }
  }
  car.previousX = car.x;
  car.previousY = car.y;
  car.lastProgress = car.progress;
}

function finishCar(ctx, car) {
  car.finished = true;
  car.finishMs = ctx.state.elapsed;
}

function handleBoundaryCollision(ctx, car, dt) {
  const pathInfo = nearestPathInfo(ctx.state.track, car.x, car.y);
  const limit = ctx.state.track.width * 0.5;
  if (pathInfo.distance > limit) {
    const normal = normalize(car.x - pathInfo.point.x, car.y - pathInfo.point.y);
    const penetration = pathInfo.distance - limit;
    const hitSpeed = Math.hypot(car.vx, car.vy);
    car.x -= normal.x * penetration * 0.92;
    car.y -= normal.y * penetration * 0.92;
    const dot = car.vx * normal.x + car.vy * normal.y;
    car.vx -= normal.x * dot * 1.9;
    car.vy -= normal.y * dot * 1.9;
    if (!car.boundaryLatch) {
      car.wallHits += 1;
      car.boundaryLatch = true;
    }
    if (hitSpeed < 180) {
      applyDamage(ctx, car, 0.2 + penetration * 0.026, "wall", "scrape");
    } else if (hitSpeed < 420) {
      applyDamage(ctx, car, 3.2 + penetration * 0.08, "wall", "heavy");
    } else {
      applyDamage(ctx, car, 11.5 + penetration * 0.3, "wall", "wreck");
    }
  } else {
    car.boundaryLatch = false;
  }

  for (const prop of ctx.state.track.props) {
    if (!prop.alive) continue;
    if (Math.hypot(car.x - prop.x, car.y - prop.y) < car.width + prop.size) {
      prop.alive = false;
      applyDamage(ctx, car, 4, "prop", "heavy");
      ctx.state.debris.push({
        x: prop.x,
        y: prop.y,
        vx: (Math.random() - 0.5) * 180,
        vy: (Math.random() - 0.5) * 180,
        size: prop.size * 0.6,
        life: 1.8,
        color: "#8df7ff",
        streak: true,
      });
    }
  }
}

function handlePickups(ctx, car) {
  for (const pickup of ctx.state.pickups) {
    if (!pickup.active) continue;
    if (car.pickup) continue;
    const collectRadius = pickup.guidedBeacon ? 56 : 26;
    if (Math.hypot(car.x - pickup.x, car.y - pickup.y) < collectRadius) {
      pickup.active = false;
      pickup.respawn = 5.5;
      car.pickup = pickup.kind;
      car.pickupCollects += 1;
      ctx.state.fx.push({ kind: "pickup-bloom", x: pickup.x, y: pickup.y, radius: 16, life: 0.48, color: PICKUP_DEFS[pickup.kind].color });
      ctx.bus.emit("pickup_collect", { pickupId: pickup.kind, player: car.isPlayer });
    }
  }
}

export function updatePickupRespawns(state, dt) {
  for (const pickup of state.pickups) {
    if (pickup.active) continue;
    pickup.respawn -= dt;
    if (pickup.respawn <= 0) pickup.active = true;
  }
}

function handleSurgeStrips(ctx, car) {
  if (!ctx.state.track.surgeStrips?.length || car.stripCooldown > 0) return;
  for (const strip of ctx.state.track.surgeStrips) {
    const dx = car.x - strip.x;
    const dy = car.y - strip.y;
    const along = dx * strip.tangent.x + dy * strip.tangent.y;
    const across = dx * strip.normal.x + dy * strip.normal.y;
    if (Math.abs(along) < strip.length * 0.5 && Math.abs(across) < strip.width * 0.5) {
      car.boostTimer = Math.max(car.boostTimer, strip.sectorTag === "high-speed" ? 1.25 : 0.85);
      car.slingshotTimer = Math.max(car.slingshotTimer, strip.sectorTag === "high-speed" ? 0.72 : 0.4);
      car.assistTimer = Math.max(car.assistTimer, 0.28);
      car.stripCooldown = 1.1;
      ctx.state.fx.push({ kind: "surge-strip", x: car.x, y: car.y, radius: strip.width * 0.4, angle: strip.angle, life: 0.28, color: strip.color });
      ctx.bus.emit("surge_strip", { player: car.isPlayer, sectorTag: strip.sectorTag });
      break;
    }
  }
}

function handleHazards(ctx, car, dt) {
  for (const hazard of ctx.state.hazards) {
    if (Math.hypot(car.x - hazard.x, car.y - hazard.y) < hazard.radius + 8) {
      applyDamage(ctx, car, hazard.damage * 0.018 * dt * 60, "hazard", hazard.damage > 10 ? "heavy" : "scrape");
    }
  }
}

function handleAssistReset(ctx, car, dt) {
  if (car.destroyed) return;
  const assistConfig = car.isPlayer ? getAssistConfig(ctx.state) : null;
  const info = nearestPathInfo(ctx.state.track, car.x, car.y);
  const speed = Math.hypot(car.vx, car.vy);
  const forwardDelta = Math.abs(wrapAngle(Math.atan2(info.tangent.y, info.tangent.x) - car.angle));
  if (speed < 22 && info.distance > ctx.state.track.width * 0.68) {
    car.stuckTimer += dt;
  } else {
    car.stuckTimer = 0;
  }
  if (info.distance > ctx.state.track.width * (car.isPlayer ? 0.9 : 0.78)) {
    car.offTrackTimer += dt;
  } else {
    car.offTrackTimer = 0;
  }
  if (forwardDelta > 2.25) car.wrongWayTimer += dt;
  else car.wrongWayTimer = 0;
  const checkpoints = ctx.state.track.checkpoints;
  const nextIndex = ctx.state.track.type === "circuit"
    ? (car.checkpointIndex + 1) % checkpoints.length
    : Math.min(checkpoints.length - 1, car.checkpointIndex + 1);
  const nextCheckpoint = checkpoints[nextIndex];
  if (!car.isPlayer && nextCheckpoint && Math.hypot(car.x - nextCheckpoint.x, car.y - nextCheckpoint.y) > ctx.state.track.width * 3.1) {
    car.courseMissTimer += dt;
  } else {
    car.courseMissTimer = 0;
  }
  car.wrongWay = car.wrongWayTimer > 1.1;
  if (car.resetCooldown > 0) return;
  const autoResetScale = assistConfig?.autoResetScale ?? 1;
  const stuckThreshold = car.isPlayer ? 2.1 * autoResetScale : 1.8 + (car.aiProfile?.risk || 0.5) * 0.8;
  const offTrackThreshold = car.isPlayer ? 2.4 * autoResetScale : 1.25 + (car.aiProfile?.risk || 0.5) * 0.35;
  const courseMissThreshold = car.isPlayer ? Infinity : 1.25 + (car.aiProfile?.risk || 0.5) * 0.25;
  const wrongWayThreshold = car.isPlayer ? 3.4 * autoResetScale : 2.6 + (car.aiProfile?.risk || 0.5) * 0.8;
  if (
    car.stuckTimer > stuckThreshold
    || car.offTrackTimer > offTrackThreshold
    || car.courseMissTimer > courseMissThreshold
    || car.wrongWayTimer > wrongWayThreshold
  ) {
    car.resetCooldown = car.isPlayer ? 3 : 2.4;
    respawnCar(ctx, car, { assisted: true });
  }
}

export function handleCarCollisions(ctx) {
  for (let i = 0; i < ctx.state.cars.length; i += 1) {
    for (let j = i + 1; j < ctx.state.cars.length; j += 1) {
      const a = ctx.state.cars[i];
      const b = ctx.state.cars[j];
      if (a.destroyed || b.destroyed || a.finished || b.finished) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const gap = Math.hypot(dx, dy);
      const minDist = a.width + b.width;
      if (gap > 0 && gap < minDist) {
        const normal = { x: dx / gap, y: dy / gap };
        const overlap = minDist - gap;
        a.x -= normal.x * overlap * 0.5;
        a.y -= normal.y * overlap * 0.5;
        b.x += normal.x * overlap * 0.5;
        b.y += normal.y * overlap * 0.5;
        const relVx = b.vx - a.vx;
        const relVy = b.vy - a.vy;
        const separatingVelocity = relVx * normal.x + relVy * normal.y;
        const closingSpeed = Math.max(0, -separatingVelocity);
        if (closingSpeed > 0) {
          const impulse = closingSpeed * 0.96;
          a.vx -= normal.x * impulse * 0.5;
          a.vy -= normal.y * impulse * 0.5;
          b.vx += normal.x * impulse * 0.5;
          b.vy += normal.y * impulse * 0.5;
          const severity = closingSpeed > 300 ? "wreck" : closingSpeed > 145 ? "heavy" : "scrape";
          applyDamage(ctx, a, closingSpeed * 0.026 * b.def.mass, "car", severity);
          applyDamage(ctx, b, closingSpeed * 0.026 * a.def.mass, "car", severity);
          if (a.rival || b.rival) {
            a.rivalHeat = Math.max(a.rivalHeat, closingSpeed > 145 ? 1.7 : 1.05);
            b.rivalHeat = Math.max(b.rivalHeat, closingSpeed > 145 ? 1.7 : 1.05);
            ctx.state.fx.push({ kind: "rival-flash", x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, radius: 18, life: 0.25, color: "#ff5ccb" });
            if (a.isPlayer || b.isPlayer) ctx.bus.emit("rival_contact", { player: true, heavy: closingSpeed > 145 });
          }
        }
      }
    }
  }
}

export function computeLeaderboard(state) {
  return [...state.cars].sort((a, b) => {
    const aProgress = getRaceScore(state, a);
    const bProgress = getRaceScore(state, b);
    if (a.finished && b.finished) return a.finishMs - b.finishMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return bProgress - aProgress;
  });
}

export function finalizeFinish(ctx) {
  const leaderboard = computeLeaderboard(ctx.state);
  leaderboard.forEach((car, index) => { car.place = index + 1; });
  return leaderboard;
}
