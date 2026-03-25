import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildTrack, samplePath } from "../../src/core/generator.js";
import { createCar, integrateCar } from "../../src/core/gameplay.js";
import { getCheckpointBoundedProgress } from "../../src/core/raceProgress.js";
import { createDefaultSave } from "../../src/core/save.js";
import { EVENT_TEMPLATES } from "../../src/data/content.js";
import { normalize } from "../../src/core/utils.js";

function getEvent(id) {
  return structuredClone(EVENT_TEMPLATES.find((event) => event.id === id));
}

function getSectorMidpoint(sector) {
  if (sector.start < sector.end) return (sector.start + sector.end) * 0.5;
  return ((sector.start + sector.end + 1) * 0.5) % 1;
}

function createRaceContext(eventId) {
  const event = getEvent(eventId);
  const track = buildTrack(event);
  const emitted = [];
  const state = {
    track,
    currentEvent: event,
    save: createDefaultSave(),
    cars: [],
    player: null,
    pickups: [],
    hazards: [],
    fx: [],
    debris: [],
    camera: { shake: 0 },
    elapsed: 12,
    keys: new Set(),
    gamepad: null,
    ctx: null,
  };
  const bus = {
    emit(type, payload) {
      emitted.push({ type, payload });
    },
  };
  const ctx = { state, bus };
  state.ctx = ctx;
  return { event, track, state, ctx, emitted };
}

function withRandomSequence(values, fn) {
  const sequence = Array.isArray(values) ? values : [values];
  let index = 0;
  const original = Math.random;
  Math.random = () => sequence[Math.min(index++, sequence.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function getSprintCheckpointIndex(track, t) {
  let checkpointIndex = 0;
  for (const checkpoint of track.checkpoints) {
    if (checkpoint.t <= t + 0.000001) checkpointIndex = checkpoint.index;
  }
  return checkpointIndex;
}

function placeCarOnSprintTrack(track, car, t, laneOffset = 0) {
  const point = samplePath(track.points, t, false);
  const look = samplePath(track.points, Math.min(1, t + 0.003), false);
  const tangent = normalize(look.x - point.x, look.y - point.y);
  const normal = { x: -tangent.y, y: tangent.x };
  car.x = point.x + normal.x * laneOffset;
  car.y = point.y + normal.y * laneOffset;
  car.previousX = car.x;
  car.previousY = car.y;
  car.angle = Math.atan2(tangent.y, tangent.x);
  car.vx = 0;
  car.vy = 0;
  car.startLineCleared = true;
  car.pathT = t;
  car.checkpointIndex = getSprintCheckpointIndex(track, t);
  car.respawnCheckpoint = car.checkpointIndex;
  car.progress = getCheckpointBoundedProgress(track, car, t);
  return { point, tangent, normal };
}

describe("AI logic", () => {
  it("locks onto the player and hunts when a rival AI sees the player just ahead", () => {
    const { track, state, ctx } = createRaceContext("grid-slipstream");
    const sector = track.sectors.find((item) => item.tag === "high-speed");
    assert.ok(sector, "expected a high-speed sector");
    const t = getSectorMidpoint(sector);
    const player = createCar("balanced", true, 0, track);
    const rival = createCar("interceptor", false, 1, track, "hunter");
    const { tangent, normal } = placeCarOnSprintTrack(track, rival, t);
    placeCarOnSprintTrack(track, player, t, 10);
    player.x += tangent.x * 48 + normal.x * 10;
    player.y += tangent.y * 48 + normal.y * 10;
    player.previousX = player.x;
    player.previousY = player.y;
    player.pathT = Math.min(0.98, t + 0.002);
    player.checkpointIndex = getSprintCheckpointIndex(track, player.pathT);
    rival.progress = 0.4;
    player.progress = Math.min(1, rival.progress + 0.06);
    rival.rival = true;
    rival.place = 4;
    track.surgeStrips = [];
    state.player = player;
    state.cars = [player, rival];

    withRandomSequence([0.99], () => integrateCar(ctx, rival, 1 / 60));

    assert.strictEqual(rival.targetRivalId, player.id);
    assert.match(rival.aiIntent, /^Hunt /);
    assert.ok(Math.abs(rival.targetLane) > 0);
    assert.ok(rival.overtakePulse > 0);
  });

  it("blocks the player when a rival AI has the player closing from behind", () => {
    const { track, state, ctx } = createRaceContext("grid-slipstream");
    const sector = track.sectors.find((item) => item.tag === "high-speed");
    assert.ok(sector, "expected a high-speed sector");
    const t = getSectorMidpoint(sector);
    const player = createCar("balanced", true, 0, track);
    const rival = createCar("interceptor", false, 1, track, "bully");
    placeCarOnSprintTrack(track, rival, t);
    placeCarOnSprintTrack(track, player, t, -18);
    player.pathT = t;
    player.checkpointIndex = getSprintCheckpointIndex(track, player.pathT);
    rival.progress = 0.4;
    player.progress = Math.max(0, rival.progress - 0.06);
    rival.rival = true;
    rival.place = 2;
    track.surgeStrips = [];
    state.player = player;
    state.cars = [player, rival];

    withRandomSequence([0.99], () => integrateCar(ctx, rival, 1 / 60));

    assert.strictEqual(rival.targetRivalId, player.id);
    assert.match(rival.aiIntent, /^Block /);
    assert.ok(Math.abs(rival.targetLane) > 0);
  });

  it("fires boost on a straight overdrive sector", () => {
    const { track, state, ctx, emitted } = createRaceContext("grid-slipstream");
    const strip = track.surgeStrips.find((item) => item.sectorTag === "high-speed");
    assert.ok(strip, "expected a high-speed surge strip");
    const ai = createCar("interceptor", false, 1, track, "hunter");
    placeCarOnSprintTrack(track, ai, strip.t);
    ai.angle = Math.atan2(strip.tangent.y, strip.tangent.x);
    ai.rival = true;
    ai.overtakePulse = 0.8;
    ai.pickup = "boost";
    track.surgeStrips = [];
    state.cars = [ai];

    withRandomSequence([0.99, 0], () => integrateCar(ctx, ai, 1));

    assert.strictEqual(ai.pickup, null);
    assert.strictEqual(ai.pickupUses, 1);
    assert.ok(ai.boostTimer > 1.5, `expected active boost timer, got ${ai.boostTimer}`);
    assert.ok(emitted.some((event) => event.type === "pickup_fire" && event.payload.pickupId === "boost"));
  });

  it("fires pulse when the player is inside the attack window", () => {
    const { track, state, ctx, emitted } = createRaceContext("grid-slipstream");
    const sector = track.sectors.find((item) => item.tag === "high-speed");
    assert.ok(sector, "expected a high-speed sector");
    const t = getSectorMidpoint(sector);
    const player = createCar("balanced", true, 0, track);
    const ai = createCar("interceptor", false, 1, track, "hunter");
    const { tangent } = placeCarOnSprintTrack(track, ai, t);
    placeCarOnSprintTrack(track, player, t);
    player.x += tangent.x * 34;
    player.y += tangent.y * 34;
    player.previousX = player.x;
    player.previousY = player.y;
    ai.pickup = "pulse";
    state.player = player;
    state.cars = [player, ai];

    withRandomSequence([0.99, 0], () => integrateCar(ctx, ai, 1));

    assert.strictEqual(ai.pickup, null);
    assert.strictEqual(ai.pickupUses, 1);
    assert.ok(player.damage > 0, `expected pulse damage, got ${player.damage}`);
    assert.ok(emitted.some((event) => event.type === "pickup_fire" && event.payload.pickupId === "pulse"));
  });

  it("fires shield when damaged enough to justify recovery", () => {
    const { track, state, ctx, emitted } = createRaceContext("grid-slipstream");
    const sector = track.sectors.find((item) => item.tag === "recovery") || track.sectors[0];
    const ai = createCar("balanced", false, 1, track, "stable");
    placeCarOnSprintTrack(track, ai, getSectorMidpoint(sector));
    const startingDamage = ai.def.durability * 0.5;
    ai.pickup = "shield";
    ai.damage = startingDamage;
    ai.health = ai.def.durability - startingDamage;
    state.cars = [ai];

    withRandomSequence([0.99, 0], () => integrateCar(ctx, ai, 1));

    assert.strictEqual(ai.pickup, null);
    assert.strictEqual(ai.pickupUses, 1);
    assert.ok(ai.shieldTimer > 2, `expected shield uptime, got ${ai.shieldTimer}`);
    assert.ok(ai.damage < startingDamage, `expected shield recovery, got ${ai.damage}`);
    assert.ok(emitted.some((event) => event.type === "pickup_fire" && event.payload.pickupId === "shield"));
  });

  it("keeps staged AI from triggering pickups, strips, or course-miss resets before the line", () => {
    const { track, state, ctx } = createRaceContext("neon-runoff");
    const ai = createCar("interceptor", false, 5, track, "hunter");
    track.surgeStrips = [{
      x: ai.x,
      y: ai.y,
      t: ai.pathT,
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      length: 220,
      width: 220,
      angle: 0,
      color: "#ffffff",
      sectorTag: "high-speed",
      laneOffset: 0,
    }];
    state.pickups = [{
      x: ai.x,
      y: ai.y,
      kind: "boost",
      active: true,
      respawn: 0,
      guidedBeacon: false,
    }];
    state.cars = [ai];

    withRandomSequence([0.99], () => integrateCar(ctx, ai, 0.01));

    assert.strictEqual(ai.startLineCleared, false);
    assert.strictEqual(state.pickups[0].active, true);
    assert.strictEqual(ai.pickup, null);
    assert.strictEqual(ai.boostTimer, 0);
    assert.strictEqual(ai.courseMissTimer, 0);
  });
});
