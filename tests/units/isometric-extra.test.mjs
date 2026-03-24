import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildIsoRibbon,
  buildIsoRibbonRaw,
  getRawIsoBounds,
  getTrackFrameAtIndex,
} from "../../src/core/isometric.js";

const SIMPLE_CIRCUIT = {
  type: "circuit",
  width: 40,
  points: [
    { x: 0, y: 0, z: 0, bank: 0 },
    { x: 60, y: 0, z: 8, bank: 3 },
    { x: 60, y: 40, z: 12, bank: -2 },
    { x: 0, y: 40, z: 4, bank: 0 },
  ],
};

describe("isometric.js extended helpers", () => {
  it("builds track frames with wrapped circuit neighbors", () => {
    const frame = getTrackFrameAtIndex(SIMPLE_CIRCUIT, 0);
    assert.deepStrictEqual(frame.point, SIMPLE_CIRCUIT.points[0]);
    assert.ok(Math.abs(Math.hypot(frame.tangent.x, frame.tangent.y) - 1) < 1e-9);
    assert.ok(Math.abs(frame.tangent.x) > 0 || Math.abs(frame.tangent.y) > 0);
  });

  it("projects an isometric ribbon for both edges of the track", () => {
    const ribbon = buildIsoRibbon(
      SIMPLE_CIRCUIT,
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 50 },
      1,
    );
    assert.strictEqual(ribbon.left.length, SIMPLE_CIRCUIT.points.length);
    assert.strictEqual(ribbon.right.length, SIMPLE_CIRCUIT.points.length);
    assert.notDeepStrictEqual(ribbon.left[0], ribbon.right[0]);
  });

  it("builds raw ribbons and finite bounds", () => {
    const raw = buildIsoRibbonRaw(SIMPLE_CIRCUIT, { heightOffset: -6, bankScale: 0.5 });
    const bounds = getRawIsoBounds(SIMPLE_CIRCUIT, { heightOffset: -6, bankScale: 0.5 });
    assert.strictEqual(raw.left.length, SIMPLE_CIRCUIT.points.length);
    assert.strictEqual(raw.right.length, SIMPLE_CIRCUIT.points.length);
    assert.ok(Number.isFinite(bounds.minX));
    assert.ok(Number.isFinite(bounds.minY));
    assert.ok(Number.isFinite(bounds.maxX));
    assert.ok(Number.isFinite(bounds.maxY));
    assert.ok(bounds.maxX > bounds.minX);
    assert.ok(bounds.maxY > bounds.minY);
  });
});
