import { AI_PROFILE_DEFS, CAR_DEFS, PICKUP_DEFS } from "../data/content.js";
import { getControlBinding } from "./controls.js";
import { getSectorAtProgress, nearestPathInfo, samplePath } from "./generator.js";
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
  const label = customSource ? carSource.label || def.name : isPlayer ? "You" : `AI-${slot}`;
  const offsetT = 0.02 + slot * 0.012;
  const start = samplePath(track.points, offsetT, track.type === "circuit");
  const look = samplePath(track.points, offsetT + 0.003, track.type === "circuit");
  const dir = Math.atan2(look.y - start.y, look.x - start.x);
  const laneOffset = (slot % 2 === 0 ? -1 : 1) * Math.floor(slot / 2) * 24;
  return {
    id: `${isPlayer ? "player" : "ai"}-${slot}`,
    label,
    x: start.x + Math.cos(dir + Math.PI / 2) * laneOffset,
    y: start.y + Math.sin(dir + Math.PI / 2) * laneOffset,
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
    aiProfile: AI_PROFILE_DEFS[aiProfileId],
    currentLap: 1,
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
      if (target.id === car.id || target.destroyed || target.invuln > 0) continue;
      const gap = distance(car, target);
      if (gap < 190) {
        const strength = (1 - gap / 190) * 18;
        applyDamage(ctx, target, strength, "pulse", strength > 11 ? "heavy" : "scrape");
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

export function respawnCar(ctx, car) {
  const assist = car.isPlayer ? getAssistConfig(ctx.state) : null;
  const nodes = ctx.state.track.safeRespawnNodes.length ? ctx.state.track.safeRespawnNodes : ctx.state.track.checkpoints;
  const checkpoint = nodes.find((node) => node.index >= ctx.state.track.checkpoints[car.respawnCheckpoint].index) || nodes[car.respawnCheckpoint % nodes.length] || nodes[0];
  const next = ctx.state.track.checkpoints[(car.respawnCheckpoint + 1) % ctx.state.track.checkpoints.length];
  const tangent = normalize(next.x - checkpoint.x, next.y - checkpoint.y);
  car.x = checkpoint.x;
  car.y = checkpoint.y;
  car.vx = tangent.x * 150;
  car.vy = tangent.y * 150;
  car.angle = Math.atan2(tangent.y, tangent.x);
  car.destroyed = false;
  car.invuln = assist?.respawnInvuln ?? 2;
  car.boostTimer = 0.9;
  car.assistTimer = assist?.respawnAssist ?? 1.5;
  car.respawns += 1;
  car.damage = Math.min(car.damage, car.def.durability * 0.12);
  car.health = car.def.durability - car.damage;
  car.visibleParts = DEFAULT_PARTS.slice(Math.floor((car.damage / car.def.durability) * 4));
  car.powerPenalty = clamp(car.damage / car.def.durability, 0, 0.22);
  ctx.bus.emit("respawn", { carId: car.id, player: car.isPlayer });
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

function chooseAiLane(ctx, car, pathInfo) {
  let targetLane = 0;
  const score = getRaceScore(ctx.state, car);
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
  const ahead = nearbyCars.find((entry) => entry.scoreDelta > 0 && entry.scoreDelta < 1.4);
  const behind = nearbyCars.find((entry) => entry.scoreDelta < 0 && entry.scoreDelta > -1.1);
  if (ahead) {
    const sign = ahead.lateralDelta >= 0 ? -1 : 1;
    targetLane = sign * ctx.state.track.width * 0.18 * (0.72 + car.aiProfile.aggression * 0.65);
    car.overtakePulse = Math.max(car.overtakePulse, 0.36 + car.aiProfile.aggression * 0.26);
  } else if (behind && car.aiProfile.defense > 0.4) {
    const sign = behind.lateralDelta >= 0 ? 1 : -1;
    targetLane = sign * ctx.state.track.width * 0.11 * (0.8 + car.aiProfile.defense * 0.5);
  }
  if (car.rival) {
    targetLane *= ahead ? 1.16 : 1.08;
  }
  car.targetLane = targetLane;
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
  car.throttle = clamp(baseThrottle * turnPenalty + rivalPush + overtakePush, 0.5, 1.08);
  if (car.pickup === "boost" && straightLine && Math.random() < dt * (0.3 + car.aiProfile.aggression * 0.42 + car.overtakePulse * 0.6)) usePickup(ctx, car);
  if (car.pickup === "pulse") {
    const closeTarget = ctx.state.cars.find((other) => other.id !== car.id && !other.destroyed && distance(car, other) < 170);
    if (closeTarget && Math.random() < dt * (0.5 + car.aiProfile.aggression)) usePickup(ctx, car);
  }
  if (car.pickup === "shield" && (car.damage / car.def.durability > 0.3 || info.distance > ctx.state.track.width * 0.38) && Math.random() < dt * 1.4) {
    usePickup(ctx, car);
  }
}

export function integrateCar(ctx, car, dt) {
  if (car.destroyed) {
    car.respawnTimer -= dt;
    if (car.respawnTimer <= 0) respawnCar(ctx, car);
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

  if (car.isPlayer) updatePlayerInput(ctx.state, car);
  else updateAiInput(ctx, car, dt);

  const pathInfo = nearestPathInfo(ctx.state.track, car.x, car.y);
  car.progress = pathInfo.t;
  const sector = getSectorAtProgress(ctx.state.track, pathInfo.t);
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const lateral = { x: -forward.y, y: forward.x };
  const speedForward = car.vx * forward.x + car.vy * forward.y;
  const speedLateral = car.vx * lateral.x + car.vy * lateral.y;
  const braking = car.throttle < 0;
  const turnScale = clamp(Math.abs(speedForward) / 150, 0.25, 1.16);
  const driftBias = braking && Math.abs(car.steer) > 0.15 ? car.def.brakeTurn : 1;
  car.driftLevel = clamp(car.driftLevel + ((braking ? 1 : -1) * dt * 2.6), 0, 1);
  const turnPenalty = 1 - clamp(car.powerPenalty * 0.48, 0, 0.38);
  car.angle += car.steer * car.def.turn * turnScale * turnPenalty * driftBias * dt;

  const assistConfig = car.isPlayer ? getAssistConfig(ctx.state) : null;
  const slipstreamBonus = getSlipstreamBonus(ctx.state, car) * car.def.slipstreamAffinity;
  const catchUpBonus = car.isPlayer && car.place > Math.ceil(ctx.state.cars.length * 0.6) ? assistConfig.catchUpBonus : 0;
  const assistBonus = car.assistTimer > 0 ? (assistConfig?.recoveryBonus ?? 0.08) : 0;
  const boostFactor = car.boostTimer > 0 ? 1.3 : 1;
  const surfaceSpeed = sector.speedBias;
  const accelForce = car.def.accel * (1 - car.powerPenalty * 0.55 + catchUpBonus + assistBonus) * boostFactor;
  const maxSpeed = car.def.maxSpeed * (1 - car.powerPenalty * 0.28 + slipstreamBonus * 0.16 + catchUpBonus + assistBonus) * boostFactor * surfaceSpeed;
  car.vx += forward.x * car.throttle * accelForce * dt;
  car.vy += forward.y * car.throttle * accelForce * dt;

  const gripStrength = clamp(car.def.grip * sector.gripMultiplier * dt * (1 - car.driftLevel * 0.48), 0, 0.3);
  car.vx -= lateral.x * speedLateral * gripStrength;
  car.vy -= lateral.y * speedLateral * gripStrength;
  car.vx *= braking ? 0.986 : 0.992;
  car.vy *= braking ? 0.986 : 0.992;

  const speed = Math.hypot(car.vx, car.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    car.vx *= scale;
    car.vy *= scale;
  }

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speedTrail.push({ x: car.x, y: car.y, age: 0.28 });
  car.speedTrail = car.speedTrail.slice(-8);

  updateCheckpointProgress(ctx, car);
  handleBoundaryCollision(ctx, car, dt);
  handlePickups(ctx, car);
  handleHazards(ctx, car);
  handleAssistReset(ctx, car, dt);
}

function updateCheckpointProgress(ctx, car) {
  const info = nearestPathInfo(ctx.state.track, car.x, car.y);
  const checkpoints = ctx.state.track.checkpoints;
  const nextIndex = (car.checkpointIndex + 1) % checkpoints.length;
  const nextCheckpoint = checkpoints[nextIndex];
  if (Math.hypot(car.x - nextCheckpoint.x, car.y - nextCheckpoint.y) < ctx.state.track.width * 0.4) {
    car.checkpointIndex = nextIndex;
    car.respawnCheckpoint = nextIndex;
    if (nextIndex === 0) {
      if (ctx.state.track.type === "circuit") {
        car.currentLap += 1;
        if (car.currentLap > ctx.state.currentEvent.laps && !car.finished) finishCar(ctx, car);
      } else if (!car.finished && info.t > 0.92) {
        finishCar(ctx, car);
      }
    }
  }
  if (ctx.state.track.type === "sprint" && !car.finished && info.t > 0.98) finishCar(ctx, car);
  car.progress = info.t;
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
    car.vx -= normal.x * dot * 1.6;
    car.vy -= normal.y * dot * 1.6;
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
    if (!pickup.active) {
      pickup.respawn -= ctx.state.fixedStep;
      if (pickup.respawn <= 0) pickup.active = true;
      continue;
    }
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

function handleHazards(ctx, car) {
  for (const hazard of ctx.state.hazards) {
    if (Math.hypot(car.x - hazard.x, car.y - hazard.y) < hazard.radius + 8) {
      applyDamage(ctx, car, hazard.damage * 0.018, "hazard", hazard.damage > 10 ? "heavy" : "scrape");
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
  if (forwardDelta > 2.25) car.wrongWayTimer += dt;
  else car.wrongWayTimer = 0;
  car.wrongWay = car.wrongWayTimer > 1.1;
  if (!car.isPlayer || car.resetCooldown > 0) return;
  const autoResetScale = assistConfig?.autoResetScale ?? 1;
  if (car.stuckTimer > 2.1 * autoResetScale || car.wrongWayTimer > 3.4 * autoResetScale) {
    car.resetCooldown = 3;
    ctx.bus.emit("respawn", { carId: car.id, player: true, assisted: true });
    respawnCar(ctx, car);
  }
}

export function handleCarCollisions(ctx) {
  for (let i = 0; i < ctx.state.cars.length; i += 1) {
    for (let j = i + 1; j < ctx.state.cars.length; j += 1) {
      const a = ctx.state.cars[i];
      const b = ctx.state.cars[j];
      if (a.destroyed || b.destroyed) continue;
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
        const impact = relVx * normal.x + relVy * normal.y;
        if (impact > 0) {
          const impulse = impact * 0.82;
          a.vx += normal.x * impulse * 0.5;
          a.vy += normal.y * impulse * 0.5;
          b.vx -= normal.x * impulse * 0.5;
          b.vy -= normal.y * impulse * 0.5;
          const severity = impact > 300 ? "wreck" : impact > 145 ? "heavy" : "scrape";
          applyDamage(ctx, a, impact * 0.026 * b.def.mass, "car", severity);
          applyDamage(ctx, b, impact * 0.026 * a.def.mass, "car", severity);
          if (a.rival || b.rival) {
            ctx.state.fx.push({ kind: "rival-flash", x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, radius: 18, life: 0.25, color: "#ff5ccb" });
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
