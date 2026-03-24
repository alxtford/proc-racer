import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createMigratedGarage,
  createStarterGarage,
  ensureGarage,
  generateGarageRoll,
  getFilledGarageCars,
  getGarageCar,
  getGarageSlotIndex,
  getGarageStatValue,
  getRollReadyStatus,
  toRuntimeCarDef,
} from "../../src/core/garage.js";

function createSave(overrides = {}) {
  return {
    garage: createStarterGarage(),
    selectedCarId: null,
    wins: 0,
    eventResults: {},
    runHistory: [],
    wallet: { flux: 0, scrap: 0, premium: 0 },
    ...overrides,
  };
}

describe("garage.js branch coverage", () => {
  it("creates a starter garage with one live car and two open slots", () => {
    const garage = createStarterGarage();
    assert.strictEqual(garage.length, 3);
    assert.strictEqual(garage[0].tierId, "starter");
    assert.strictEqual(garage[1].empty, true);
    assert.strictEqual(garage[2].empty, true);
  });

  it("ensures garage slots and resets an invalid selected car", () => {
    const save = createSave({
      garage: [null, { empty: true, slotIndex: 1, name: "Reserve bay" }],
      selectedCarId: "missing-car",
      wallet: { flux: 50, scrap: 2, premium: 1 },
    });

    ensureGarage(save);

    assert.strictEqual(save.garage.length, 3);
    assert.strictEqual(save.garage[0].tierId, "starter");
    assert.strictEqual(save.garage[1].empty, true);
    assert.strictEqual(save.garage[1].name, "Reserve bay");
    assert.strictEqual(save.selectedCarId, save.garage[0].id);
  });

  it("migrates a bonus balanced chassis when legacy unlocks include balanced", () => {
    const garage = createMigratedGarage({ wins: 2, unlockedCars: ["balanced"] });
    assert.strictEqual(garage.length, 3);
    assert.strictEqual(garage[0].tierId, "starter");
    assert.strictEqual(garage[2].templateId, "balanced");
    assert.strictEqual(garage[2].tierId, "pro");
  });

  it("finds filled cars and their slot indexes", () => {
    const save = createSave();
    const [starter] = save.garage;
    assert.deepStrictEqual(getFilledGarageCars(save), [starter]);
    assert.strictEqual(getGarageCar(save, starter.id), starter);
    assert.strictEqual(getGarageCar(save, "missing"), null);
    assert.strictEqual(getGarageSlotIndex(save, starter.id), 0);
    assert.strictEqual(getGarageSlotIndex(save, "missing"), -1);
  });

  it("returns the supported garage stat ids and zero for unknown stats", () => {
    const [starter] = createStarterGarage();
    assert.strictEqual(getGarageStatValue(starter, "accel"), starter.accel);
    assert.strictEqual(getGarageStatValue(starter, "maxSpeed"), starter.maxSpeed);
    assert.strictEqual(getGarageStatValue(starter, "durability"), starter.durability);
    assert.ok(getGarageStatValue(starter, "handling") > 0);
    assert.strictEqual(getGarageStatValue(starter, "mystery"), 0);
  });

  it("converts garage cars to runtime car defs", () => {
    const [starter] = createStarterGarage();
    assert.deepStrictEqual(toRuntimeCarDef(starter), {
      id: starter.id,
      name: starter.name,
      color: starter.color,
      accel: starter.accel,
      maxSpeed: starter.maxSpeed,
      turn: starter.turn,
      grip: starter.grip,
      durability: starter.durability,
      mass: starter.mass,
      brakeTurn: starter.brakeTurn,
      slipstreamAffinity: starter.slipstreamAffinity,
      bodyStyle: starter.bodyStyle,
      visualLength: starter.visualLength,
      visualWidth: starter.visualWidth,
    });
  });

  it("generates deterministic foundry offers with comparison metadata", () => {
    const save = createSave({
      selectedCarId: createStarterGarage()[0].id,
      wallet: { flux: 500, scrap: 0, premium: 0 },
    });
    save.garage = createStarterGarage();

    const first = generateGarageRoll(save, 12345);
    const second = generateGarageRoll(save, 12345);

    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(first.map((offer) => offer.slotIndex), [0, 1, 2]);
    assert.strictEqual(first[0].compareToId, save.garage[0].id);
    assert.strictEqual(first[1].compareToId, null);
    assert.strictEqual(first[2].compareToId, null);
    assert.strictEqual(first[0].compareToScore, save.garage[0].score);
  });

  it("reports whether a roll is affordable", () => {
    assert.strictEqual(getRollReadyStatus(createSave({ wallet: { flux: 180, scrap: 0, premium: 0 } })), true);
    assert.strictEqual(getRollReadyStatus(createSave({ wallet: { flux: 179, scrap: 0, premium: 0 } })), false);
  });
});
