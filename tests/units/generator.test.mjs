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
      assert.strictEqual(track.pickups.length, 7);
      assert.strictEqual(track.pickups[0].kind, "shield");
      assert.strictEqual(track.pickups[0].guidedBeacon, true);
      approx(track.pickups[0].t, 0.052, 1e-9);
      assert.ok(track.safeRespawnNodes.length > 0);
      assert.ok(track.safeRespawnNodes.every((node) => getSectorAtProgress(track, node.t).tag !== "hazard"));
    });

    it("applies pickup and hazard modifiers to generated counts", () => {
      const densePickupTrack = buildTrack(getEvent("grid-slipstream"));
      const hazardTrack = buildTrack(getEvent("void-collar"));
      assert.strictEqual(densePickupTrack.pickups.length, 10);
      assert.strictEqual(densePickupTrack.hazards.length, 4);
      assert.strictEqual(hazardTrack.pickups.length, 7);
      assert.strictEqual(hazardTrack.hazards.length, 7);
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
