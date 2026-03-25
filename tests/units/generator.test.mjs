import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildTrack,
  getSectorAtProgress,
  nearestPathInfo,
  samplePath,
  sampleTrackBank,
  sampleTrackHeight,
} from "../../src/core/generator.js";
import { createCar } from "../../src/core/gameplay.js";
import { createDailyEvent, EVENT_TEMPLATES } from "../../src/data/content.js";

const approx = (actual, expected, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ~${expected}, got ${actual}`);
};

function getEvent(id) {
  return structuredClone(EVENT_TEMPLATES.find((event) => event.id === id));
}

function getSectorMidpoint(sector) {
  if (sector.start < sector.end) return (sector.start + sector.end) * 0.5;
  return ((sector.start + sector.end + 1) * 0.5) % 1;
}

describe("generator.js", () => {
  describe("samplePath", () => {
    it("clamps open tracks to the last point", () => {
      const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
      assert.deepStrictEqual(samplePath(points, 2, false), { x: 20, y: 0 });
    });

    it("wraps circuit tracks back around the path", () => {
      const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
      assert.deepStrictEqual(samplePath(points, 1.25, true), { x: 10, y: 0 });
    });
  });

  describe("nearestPathInfo", () => {
    it("projects to the closest sprint segment with a normalized tangent", () => {
      const track = {
        type: "sprint",
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      };
      const info = nearestPathInfo(track, 12, 4);
      approx(info.distance, 4);
      approx(info.t, 0.6);
      assert.deepStrictEqual(info.point, { x: 12, y: 0 });
      approx(info.tangent.x, 1);
      approx(info.tangent.y, 0);
    });

    it("wraps the closing segment for a circuit", () => {
      const track = {
        type: "circuit",
        points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }],
      };
      const info = nearestPathInfo(track, -2, 4);
      approx(info.distance, 2);
      assert.strictEqual(info.index, 3);
      assert.ok(info.t > 0.75 && info.t < 1, `expected wrapped t near the final segment, got ${info.t}`);
    });
  });

  describe("buildTrack", () => {
    it("is deterministic for the same seeded event", () => {
      const a = buildTrack(getEvent("void-collar"));
      const b = buildTrack(getEvent("void-collar"));
      assert.deepStrictEqual(a, b);
    });

    it("builds the guided opener without hazards and with a lead shield beacon", () => {
      const track = buildTrack(getEvent("tutorial-ignition"));
      assert.strictEqual(track.hazards.length, 0);
      assert.ok(track.pickups.length > 0);
      assert.strictEqual(track.pickups[0].kind, "shield");
      assert.strictEqual(track.pickups[0].guidedBeacon, true);
      assert.ok(nearestPathInfo(track, track.pickups[0].x, track.pickups[0].y).distance < 1);
      assert.ok(track.safeRespawnNodes.length > 0);
      assert.ok(track.safeRespawnNodes.every((node) => getSectorAtProgress(track, node.t).tag !== "hazard"));
    });

    it("applies pickup and hazard modifiers to generated counts", () => {
      const densePickupEvent = getEvent("grid-slipstream");
      const basePickupEvent = getEvent("grid-slipstream");
      basePickupEvent.modifierIds = [];

      const hazardEvent = getEvent("void-collar");
      const baseHazardEvent = getEvent("void-collar");
      baseHazardEvent.modifierIds = baseHazardEvent.modifierIds.filter((id) => id !== "high-damage-hazards");

      const densePickupTrack = buildTrack(densePickupEvent);
      const basePickupTrack = buildTrack(basePickupEvent);
      const hazardTrack = buildTrack(hazardEvent);
      const baseHazardTrack = buildTrack(baseHazardEvent);

      assert.ok(densePickupTrack.pickups.length > basePickupTrack.pickups.length);
      assert.strictEqual(densePickupTrack.hazards.length, basePickupTrack.hazards.length);
      assert.ok(hazardTrack.hazards.length > baseHazardTrack.hazards.length);
      assert.strictEqual(hazardTrack.pickups.length, baseHazardTrack.pickups.length);
    });

    it("keeps props outside the road corridor", () => {
      const track = buildTrack(getEvent("arc-halo"));
      for (const prop of track.props) {
        const gap = nearestPathInfo(track, prop.x, prop.y).distance;
        assert.ok(gap >= track.width * 0.56, `prop gap ${gap.toFixed(2)} is inside the corridor`);
      }
    });

    it("resolves sectors consistently across wrapped and non-wrapped ranges", () => {
      const track = buildTrack(getEvent("void-collar"));
      for (const sector of track.sectors) {
        const sampled = getSectorAtProgress(track, getSectorMidpoint(sector));
        assert.strictEqual(sampled.id, sector.id);
      }
    });

    it("samples height and bank from the elevation profile", () => {
      const track = buildTrack(getEvent("neon-runoff"));
      const sample = track.elevationSamples[10];
      approx(sampleTrackHeight(track, sample.t), sample.height);
      approx(sampleTrackBank(track, sample.t), sample.bank);
    });

    it("pins sprint finishes to the path end and stages the grid behind the start line", () => {
      const event = getEvent("shatterline");
      const track = buildTrack(event);
      assert.strictEqual(track.finishT, 1);
      assert.strictEqual(track.finishLine.t, 1);
      assert.ok(Math.hypot(track.finishLine.tangent.x, track.finishLine.tangent.y) > 0.99);
      assert.ok(track.startT >= 0.14, `expected sprint startT to leave staging room, got ${track.startT}`);

      const totalCars = 1 + (event.aiCount || 0);
      for (let slot = 0; slot < totalCars; slot += 1) {
        const car = createCar(slot === 0 ? "balanced" : "interceptor", slot === 0, slot, track);
        const dx = car.x - track.startLine.x;
        const dy = car.y - track.startLine.y;
        const signedDistance = dx * track.startLine.tangent.x + dy * track.startLine.tangent.y;
        assert.ok(signedDistance < 0, `expected slot ${slot} to stage behind the start line, got ${signedDistance}`);
        assert.strictEqual(car.startLineCleared, false);
        assert.strictEqual(car.progress, 0);
      }
    });

    it("builds broad sprint overdrive lanes in the high-speed sectors", () => {
      const track = buildTrack(getEvent("grid-slipstream"));
      const highSpeedStrips = track.surgeStrips.filter((strip) => strip.sectorTag === "high-speed");
      assert.ok(highSpeedStrips.length >= 2, `expected at least two sprint overdrive lanes, got ${highSpeedStrips.length}`);
      assert.ok(
        highSpeedStrips.every((strip) => strip.width >= track.width * 0.55),
        JSON.stringify(highSpeedStrips.map((strip) => ({ width: strip.width, trackWidth: track.width })), null, 2),
      );
      assert.ok(
        highSpeedStrips.some((strip) => Math.abs(strip.laneOffset) >= track.width * 0.08),
        JSON.stringify(highSpeedStrips.map((strip) => ({ laneOffset: strip.laneOffset, trackWidth: track.width })), null, 2),
      );
      assert.ok(
        highSpeedStrips.every((strip) => strip.length >= 120),
        JSON.stringify(highSpeedStrips.map((strip) => ({ length: strip.length })), null, 2),
      );
    });
  });
});

describe("content.js", () => {
  it("derives the daily event from the date seed", () => {
    const event = createDailyEvent(new Date("2026-03-24T00:00:00Z"));
    assert.strictEqual(event.id, "daily-rift");
    assert.strictEqual(event.seed, 20260324);
    assert.strictEqual(event.daily, true);
    assert.strictEqual(event.type, "circuit");
    assert.strictEqual(event.laps, 3);
    assert.strictEqual(event.biomeId, ["industrial", "freeway", "void"][event.seed % 3]);
    assert.deepStrictEqual(
      event.modifierIds,
      event.seed % 3 === 0
        ? ["dense-pickups", "shield-drops"]
        : ["high-damage-hazards", "extra-pulse"],
    );
  });
});
