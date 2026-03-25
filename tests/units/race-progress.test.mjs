import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildTrack, nearestPathInfo } from "../../src/core/generator.js";
import { computeLeaderboard, createCar, respawnCar } from "../../src/core/gameplay.js";
import { getCarRaceUnits, getCheckpointBoundedProgress, getTrackRaceUnits } from "../../src/core/raceProgress.js";
import { createDefaultSave } from "../../src/core/save.js";
import { buildRunSummary } from "../../src/core/ui.js";
import { EVENT_TEMPLATES } from "../../src/data/content.js";

const approx = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ~${expected}, got ${actual}`);

function createCheckpoint(index, count) {
  return { index, t: index / count };
}

function getEvent(id) {
  return structuredClone(EVENT_TEMPLATES.find((event) => event.id === id));
}

describe("raceProgress.js", () => {
  it("treats car.progress as lap-wide progress units instead of adding checkpoint index again", () => {
    const state = {
      track: {
        type: "circuit",
        checkpoints: Array.from({ length: 10 }, (_, index) => createCheckpoint(index, 10)),
      },
      currentEvent: {
        laps: 2,
      },
    };

    assert.strictEqual(getTrackRaceUnits(state), 20);
    approx(getCarRaceUnits(state, { currentLap: 1, checkpointIndex: 9, progress: 0.95 }), 9.5);
    approx(getCarRaceUnits(state, { currentLap: 2, checkpointIndex: 0, progress: 0.02 }), 10.2);
  });

  it("keeps live ordering and classified gaps on the same track-progress scale", () => {
    const save = createDefaultSave();
    const playerId = save.garage[0].id;
    const state = {
      track: {
        type: "circuit",
        checkpoints: Array.from({ length: 10 }, (_, index) => createCheckpoint(index, 10)),
      },
      currentEvent: {
        id: "circuit-test",
        name: "Circuit Test",
        seed: 42,
        type: "circuit",
        laps: 2,
        parTime: 105,
        daily: false,
        guided: false,
        goals: [],
      },
      save,
      selectedCarId: playerId,
      finishTime: 100,
      elapsed: 100,
      runPickupCounts: {},
    };

    const winner = {
      id: "winner",
      label: "Winner",
      isPlayer: false,
      currentLap: 2,
      checkpointIndex: 9,
      progress: 1,
      finished: true,
      finishMs: 100,
      vx: 0,
      vy: 0,
      respawns: 0,
      wallHits: 0,
      pickupUses: 0,
      pulseHits: 0,
      destroyedCount: 0,
      lapTimes: [48.5, 51.5],
      bestLapTime: 48.5,
      lastLapTime: 51.5,
    };
    const player = {
      id: playerId,
      label: "You",
      isPlayer: true,
      currentLap: 1,
      checkpointIndex: 9,
      progress: 0.95,
      finished: false,
      finishMs: null,
      vx: 220,
      vy: 0,
      respawns: 0,
      wallHits: 0,
      pickupUses: 0,
      pulseHits: 0,
      destroyedCount: 0,
      lapTimes: [49.8],
      bestLapTime: 49.8,
      lastLapTime: 49.8,
    };
    const rival = {
      id: "rival-a",
      label: "Rival A",
      isPlayer: false,
      rival: true,
      currentLap: 2,
      checkpointIndex: 0,
      progress: 0.02,
      finished: false,
      finishMs: null,
      vx: 220,
      vy: 0,
      respawns: 0,
      wallHits: 0,
      pickupUses: 0,
      pulseHits: 0,
      destroyedCount: 0,
      lapTimes: [50.1],
      bestLapTime: 50.1,
      lastLapTime: 50.1,
    };

    state.player = player;
    state.cars = [winner, player, rival];

    const leaderboard = computeLeaderboard(state);
    assert.deepStrictEqual(leaderboard.map((car) => car.id), ["winner", "rival-a", playerId]);

    const summary = buildRunSummary(state, leaderboard);
    assert.strictEqual(summary.classification[1].id, "rival-a");
    approx(summary.classification[2].intervalToAhead, 3.515, 1e-6);
    approx(summary.gapToWinner, 52.53, 1e-6);
  });

  it("holds staged circuit cars at zero progress until they clear the start line", () => {
    const track = {
      type: "circuit",
      startT: 0.9,
      checkpoints: Array.from({ length: 10 }, (_, index) => createCheckpoint(index, 10)),
    };

    approx(getCheckpointBoundedProgress(track, { checkpointIndex: 0, startLineCleared: false }, 0.88), 0);
    approx(getCheckpointBoundedProgress(track, { checkpointIndex: 0, startLineCleared: true }, 0.92), 0.02);
  });

  it("orders a car that has cleared the start line ahead of staged circuit traffic", () => {
    const track = buildTrack(getEvent("void-collar"));
    const save = createDefaultSave();
    const player = createCar("balanced", true, 0, track);
    const rival = createCar("interceptor", false, 1, track);
    player.id = save.garage[0].id;
    player.startLineCleared = true;
    player.checkpointIndex = 0;
    player.pathT = (track.startT + 0.03) % 1;
    player.progress = getCheckpointBoundedProgress(track, player, player.pathT);
    rival.progress = getCheckpointBoundedProgress(track, rival, rival.pathT);

    const state = {
      track,
      currentEvent: {
        laps: 2,
      },
      cars: [rival, player],
    };

    const leaderboard = computeLeaderboard(state);
    assert.deepStrictEqual(leaderboard.map((car) => car.id), [player.id, rival.id]);
    approx(rival.progress, 0);
    assert.ok(player.progress > rival.progress);
  });

  it("respawns staged cars behind the line and keeps respawn progress aligned to the new position", () => {
    const track = buildTrack(getEvent("void-collar"));
    const car = createCar("balanced", true, 0, track);
    const state = {
      track,
      save: createDefaultSave(),
      cars: [car],
      elapsed: 12,
      fx: [],
      debris: [],
      camera: { shake: 0 },
    };
    const ctx = {
      state,
      bus: { emit() {} },
    };

    respawnCar(ctx, car, { assisted: true });
    const dx = car.x - track.startLine.x;
    const dy = car.y - track.startLine.y;
    const signedDistance = dx * track.startLine.tangent.x + dy * track.startLine.tangent.y;
    const info = nearestPathInfo(track, car.x, car.y);

    assert.strictEqual(car.startLineCleared, false);
    assert.ok(signedDistance < 0, `expected pre-start respawn behind the line, got ${signedDistance}`);
    approx(car.pathT, info.t, 0.01);
    approx(car.progress, 0);
  });

  it("biases assisted respawns backward instead of skipping AI forward to later safe nodes", () => {
    const track = buildTrack(getEvent("void-collar"));
    track.safeRespawnNodes = [track.checkpoints[0], track.checkpoints[2], track.checkpoints[4]];
    const car = createCar("balanced", true, 0, track);
    car.startLineCleared = true;
    car.respawnCheckpoint = 1;
    const state = {
      track,
      save: createDefaultSave(),
      cars: [car],
      elapsed: 18,
      fx: [],
      debris: [],
      camera: { shake: 0 },
    };
    const ctx = {
      state,
      bus: { emit() {} },
    };

    respawnCar(ctx, car, { assisted: true });

    assert.strictEqual(car.checkpointIndex, 0);
    assert.ok(car.progress <= 0.05, `expected backward-biased respawn progress, got ${car.progress}`);
  });
});
