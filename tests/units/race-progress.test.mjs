import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeLeaderboard } from "../../src/core/gameplay.js";
import { getCarRaceUnits, getTrackRaceUnits } from "../../src/core/raceProgress.js";
import { createDefaultSave } from "../../src/core/save.js";
import { buildRunSummary } from "../../src/core/ui.js";

const approx = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ~${expected}, got ${actual}`);

function createCheckpoint(index, count) {
  return { index, t: index / count };
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
});
