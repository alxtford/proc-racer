import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clamp, lerp, wrapAngle, normalize, distance,
  createRng, pickOne, formatTime, createKey, TAU,
} from "../../src/core/utils.js";

import {
  STARTING_FLUX, GARAGE_ROLL_COST, COURSE_REROLL_COST,
  createDefaultWallet, ensureWallet, getCurrencyBalance,
  canAfford, grantCurrency, spendCurrency, purchaseStoreProduct,
} from "../../src/core/economy.js";

import {
  isGarageSlotFilled, createEmptyGarageSlot,
  getGarageHandling, getGarageScore, getGarageStatPercent,
  getScrapValue, calculateRaceReward, getGarageProgression,
} from "../../src/core/garage.js";

import {
  SAVE_VERSION, createDefaultSave, migrateSave, pushRunHistory,
} from "../../src/core/save.js";

import { EventBus } from "../../src/core/eventBus.js";

import {
  ISO_PROJECTION, worldToIso, projectIsoPoint,
} from "../../src/core/isometric.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const approx = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ~${expected}, got ${actual}`);

// Baseline race result — override per-test with what you care about.
function makeResult(overrides = {}) {
  const { event: eventOverrides = {}, ...rest } = overrides;
  return {
    event: { guided: false, daily: false, ...eventOverrides },
    place: 4,
    goalsMet: 0,
    deltaToPar: 5,
    destroyedCount: 2,
    newEventBest: false,
    newDailyBest: false,
    wasTutorialRun: false,
    tutorialPickupMet: false,
    ...rest,
  };
}

function getStarterCar() {
  return structuredClone(createDefaultSave().garage[0]);
}

function createGarageCar(overrides = {}) {
  return {
    ...getStarterCar(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// utils.js
// ---------------------------------------------------------------------------

describe("utils.js", () => {
  describe("clamp", () => {
    it("leaves in-range value unchanged", () => {
      assert.strictEqual(clamp(5, 0, 10), 5);
    });
    it("clamps to min", () => {
      assert.strictEqual(clamp(-3, 0, 10), 0);
    });
    it("clamps to max", () => {
      assert.strictEqual(clamp(15, 0, 10), 10);
    });
    it("handles equal min and max", () => {
      assert.strictEqual(clamp(7, 4, 4), 4);
    });
  });

  describe("lerp", () => {
    it("t=0 returns a", () => assert.strictEqual(lerp(2, 8, 0), 2));
    it("t=1 returns b", () => assert.strictEqual(lerp(2, 8, 1), 8));
    it("t=0.5 returns midpoint", () => assert.strictEqual(lerp(2, 8, 0.5), 5));
  });

  describe("wrapAngle", () => {
    it("leaves angle of 0 unchanged", () => approx(wrapAngle(0), 0));
    it("leaves in-range angle unchanged", () => approx(wrapAngle(1), 1));
    it("wraps value just above PI back into range", () => {
      const result = wrapAngle(Math.PI + 0.5);
      approx(result, 0.5 - Math.PI, 1e-9);
      assert.ok(result > -Math.PI && result <= Math.PI, `${result} not in (-PI, PI]`);
    });
    it("wraps value just below -PI back into range", () => {
      const result = wrapAngle(-Math.PI - 0.5);
      approx(result, Math.PI - 0.5, 1e-9);
      assert.ok(result > -Math.PI && result <= Math.PI, `${result} not in (-PI, PI]`);
    });
    it("handles values many multiples of TAU away", () => {
      // 9*PI = 4 full rotations + PI => wraps to PI
      approx(wrapAngle(9 * Math.PI), Math.PI, 1e-9);
    });
  });

  describe("normalize", () => {
    it("produces unit vector", () => {
      const { x, y } = normalize(3, 4);
      approx(Math.hypot(x, y), 1);
    });
    it("handles zero vector without NaN (defaults to length 1)", () => {
      const { x, y } = normalize(0, 0);
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
    });
  });

  describe("distance", () => {
    it("computes Euclidean distance", () => {
      approx(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    });
    it("returns 0 for same point", () => {
      approx(distance({ x: 7, y: 3 }, { x: 7, y: 3 }), 0);
    });
  });

  describe("createRng", () => {
    it("same seed produces identical sequence", () => {
      const a = createRng(42);
      const b = createRng(42);
      for (let i = 0; i < 10; i += 1) {
        assert.strictEqual(a(), b());
      }
    });
    it("different seeds produce different first values", () => {
      assert.notStrictEqual(createRng(1)(), createRng(2)());
    });
    it("all output values are in [0, 1)", () => {
      const rng = createRng(99);
      for (let i = 0; i < 100; i += 1) {
        const v = rng();
        assert.ok(v >= 0 && v < 1, `value ${v} outside [0,1)`);
      }
    });
    it("advances state — consecutive calls differ", () => {
      const rng = createRng(7);
      const first = rng();
      const second = rng();
      assert.notStrictEqual(first, second);
    });
  });

  describe("formatTime", () => {
    it("formats zero as 0:00.00", () => {
      assert.strictEqual(formatTime(0), "0:00.00");
    });
    it("formats sub-minute time", () => {
      assert.strictEqual(formatTime(59.99), "0:59.99");
    });
    it("formats multi-minute time with zero-padded seconds", () => {
      assert.strictEqual(formatTime(65.5), "1:05.50");
    });
    it("returns -- for NaN", () => {
      assert.strictEqual(formatTime(NaN), "--");
    });
    it("returns -- for Infinity", () => {
      assert.strictEqual(formatTime(Infinity), "--");
    });
  });

  describe("createKey", () => {
    it("joins parts with ::", () => {
      assert.strictEqual(createKey("garage", "grip", "abc"), "garage::grip::abc");
    });
  });
});

// ---------------------------------------------------------------------------
// economy.js
// ---------------------------------------------------------------------------

describe("economy.js", () => {
  describe("createDefaultWallet", () => {
    it("starts with correct initial values", () => {
      const wallet = createDefaultWallet();
      assert.strictEqual(wallet.flux, STARTING_FLUX);
      assert.strictEqual(wallet.scrap, 0);
      assert.strictEqual(wallet.premium, 0);
    });
  });

  describe("ensureWallet", () => {
    it("preserves existing valid wallet", () => {
      const save = { wallet: { flux: 500, scrap: 10, premium: 2 } };
      ensureWallet(save);
      assert.strictEqual(save.wallet.flux, 500);
      assert.strictEqual(save.wallet.scrap, 10);
      assert.strictEqual(save.wallet.premium, 2);
    });

    it("migrates legacy currency field when wallet is absent", () => {
      const save = { currency: 350, scrap: 8, premiumCurrency: 1 };
      ensureWallet(save);
      assert.strictEqual(save.wallet.flux, 350);
      assert.strictEqual(save.wallet.scrap, 8);
      assert.strictEqual(save.wallet.premium, 1);
    });

    it("clamps flux below zero to 0", () => {
      const save = { wallet: { flux: -200, scrap: 0, premium: 0 } };
      ensureWallet(save);
      assert.strictEqual(save.wallet.flux, 0);
    });

    it("clamps flux above 999999 to 999999", () => {
      const save = { wallet: { flux: 2_000_000, scrap: 0, premium: 0 } };
      ensureWallet(save);
      assert.strictEqual(save.wallet.flux, 999_999);
    });

    it("syncs legacy currency field after ensure", () => {
      const save = { wallet: { flux: 300, scrap: 5, premium: 0 } };
      ensureWallet(save);
      assert.strictEqual(save.currency, 300);
      assert.strictEqual(save.scrap, 5);
    });
  });

  describe("grantCurrency", () => {
    it("adds amount to balance", () => {
      const save = { wallet: { flux: 100, scrap: 0, premium: 0 } };
      grantCurrency(save, "flux", 50);
      assert.strictEqual(save.wallet.flux, 150);
    });

    it("ignores negative amounts", () => {
      const save = { wallet: { flux: 100, scrap: 0, premium: 0 } };
      grantCurrency(save, "flux", -50);
      assert.strictEqual(save.wallet.flux, 100);
    });

    it("clamps at 999999", () => {
      const save = { wallet: { flux: 999_990, scrap: 0, premium: 0 } };
      grantCurrency(save, "flux", 100);
      assert.strictEqual(save.wallet.flux, 999_999);
    });

    it("returns the new balance", () => {
      const save = { wallet: { flux: 50, scrap: 0, premium: 0 } };
      const result = grantCurrency(save, "flux", 30);
      assert.strictEqual(result, 80);
    });
  });

  describe("spendCurrency", () => {
    it("deducts amount and returns true when affordable", () => {
      const save = { wallet: { flux: 200, scrap: 0, premium: 0 } };
      const ok = spendCurrency(save, "flux", 180);
      assert.strictEqual(ok, true);
      assert.strictEqual(save.wallet.flux, 20);
    });

    it("spending exactly the balance succeeds", () => {
      const save = { wallet: { flux: 30, scrap: 0, premium: 0 } };
      assert.strictEqual(spendCurrency(save, "flux", 30), true);
      assert.strictEqual(save.wallet.flux, 0);
    });

    it("returns false and leaves balance unchanged when insufficient", () => {
      const save = { wallet: { flux: 10, scrap: 0, premium: 0 } };
      const ok = spendCurrency(save, "flux", 180);
      assert.strictEqual(ok, false);
      assert.strictEqual(save.wallet.flux, 10);
    });
  });

  describe("canAfford", () => {
    it("true when balance >= amount", () => {
      const save = { wallet: { flux: 220, scrap: 0, premium: 0 } };
      assert.strictEqual(canAfford(save, "flux", 180), true);
    });
    it("false when balance < amount", () => {
      const save = { wallet: { flux: 10, scrap: 0, premium: 0 } };
      assert.strictEqual(canAfford(save, "flux", 180), false);
    });
  });

  describe("purchaseStoreProduct", () => {
    it("returns missing_product for unknown id", () => {
      const save = { wallet: { flux: 9999, scrap: 0, premium: 0 } };
      const result = purchaseStoreProduct(save, "nonexistent");
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, "missing_product");
    });

    it("succeeds with sufficient flux and deducts cost", () => {
      const save = { wallet: { flux: STARTING_FLUX, scrap: 0, premium: 0 } };
      const result = purchaseStoreProduct(save, "garage_roll");
      assert.strictEqual(result.ok, true);
      assert.strictEqual(save.wallet.flux, STARTING_FLUX - GARAGE_ROLL_COST);
    });

    it("returns insufficient_funds when broke", () => {
      const save = { wallet: { flux: 10, scrap: 0, premium: 0 } };
      const result = purchaseStoreProduct(save, "garage_roll");
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, "insufficient_funds");
      assert.strictEqual(save.wallet.flux, 10);
    });

    it("prefers specified currency when available", () => {
      const save = { wallet: { flux: 9999, scrap: 0, premium: 99 } };
      const result = purchaseStoreProduct(save, "garage_roll", "premium");
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.price.currency, "premium");
    });

    it("falls back to flux when preferred currency is insufficient", () => {
      const save = { wallet: { flux: STARTING_FLUX, scrap: 0, premium: 0 } };
      const result = purchaseStoreProduct(save, "garage_roll", "premium");
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.price.currency, "flux");
    });
  });
});

// ---------------------------------------------------------------------------
// garage.js
// ---------------------------------------------------------------------------

describe("garage.js", () => {
  describe("isGarageSlotFilled", () => {
    it("returns false for an empty slot object", () => {
      assert.strictEqual(isGarageSlotFilled(createEmptyGarageSlot(0)), false);
    });
    it("returns true for a car without empty flag", () => {
      assert.strictEqual(isGarageSlotFilled(getStarterCar()), true);
    });
    it("returns false for null", () => {
      assert.strictEqual(isGarageSlotFilled(null), false);
    });
  });

  describe("getGarageHandling", () => {
    it("returns 0 for an empty slot", () => {
      assert.strictEqual(getGarageHandling(createEmptyGarageSlot(0)), 0);
    });
    it("increases when turn or grip improve and clamps extreme builds", () => {
      const starter = getStarterCar();
      assert.ok(getGarageHandling({ ...starter, turn: starter.turn + 0.2 }) > getGarageHandling(starter));
      assert.ok(getGarageHandling({ ...starter, grip: starter.grip + 0.8 }) > getGarageHandling(starter));
      assert.strictEqual(getGarageHandling({ ...starter, turn: 999, grip: 999 }), 100);
    });
  });

  describe("getGarageScore", () => {
    it("returns 0 for an empty slot", () => {
      assert.strictEqual(getGarageScore(createEmptyGarageSlot(0)), 0);
    });
    it("rewards stronger builds and caps maxed-out stats", () => {
      const starter = getStarterCar();
      const accelUpgrade = { ...starter, accel: starter.accel + 40 };
      const durabilityUpgrade = { ...starter, durability: starter.durability + 20 };
      const maxed = createGarageCar({
        accel: 9999,
        maxSpeed: 9999,
        turn: 9999,
        grip: 9999,
        durability: 9999,
      });
      assert.ok(getGarageScore(accelUpgrade) > getGarageScore(starter));
      assert.ok(getGarageScore(durabilityUpgrade) > getGarageScore(starter));
      assert.strictEqual(getGarageScore(maxed), 100);
    });
  });

  describe("getGarageStatPercent", () => {
    it("returns 0 for an unknown stat id", () => {
      assert.strictEqual(getGarageStatPercent(getStarterCar(), "unknown"), 0);
    });
    it("returns a value in [0, 100] for accel", () => {
      const pct = getGarageStatPercent(getStarterCar(), "accel");
      assert.ok(pct >= 0 && pct <= 100, `${pct} outside [0,100]`);
    });
  });

  describe("getScrapValue", () => {
    it("increases with higher tiers for the same chassis", () => {
      const baseCar = getStarterCar();
      const street = getScrapValue({ ...baseCar, tierId: "street" });
      const club = getScrapValue({ ...baseCar, tierId: "club" });
      const pro = getScrapValue({ ...baseCar, tierId: "pro" });
      const apex = getScrapValue({ ...baseCar, tierId: "apex" });
      assert.ok(street < club);
      assert.ok(club < pro);
      assert.ok(pro < apex);
    });
    it("adds more scrap for stronger cars within the same tier", () => {
      const starter = getStarterCar();
      const low = getScrapValue({ ...starter, tierId: "street" });
      const high = getScrapValue(createGarageCar({
        tierId: "street",
        accel: 9999,
        maxSpeed: 9999,
        turn: 9999,
        grip: 9999,
        durability: 9999,
      }));
      assert.ok(high > low);
    });
  });

  describe("calculateRaceReward", () => {
    it("returns a positive integer baseline payout", () => {
      const reward = calculateRaceReward(makeResult());
      assert.ok(Number.isInteger(reward));
      assert.ok(reward > 0);
    });

    it("guided events pay less base reward than standard events", () => {
      const standard = calculateRaceReward(makeResult());
      const guided = calculateRaceReward(makeResult({ event: { guided: true } }));
      assert.ok(guided < standard);
    });

    it("rewards stronger finishing positions", () => {
      const first = calculateRaceReward(makeResult({ place: 1 }));
      const second = calculateRaceReward(makeResult({ place: 2 }));
      const third = calculateRaceReward(makeResult({ place: 3 }));
      const fourth = calculateRaceReward(makeResult({ place: 4 }));
      assert.ok(first > second);
      assert.strictEqual(second, third);
      assert.ok(third > fourth);
    });

    it("adds the same increment for each goal met", () => {
      const zeroGoals = calculateRaceReward(makeResult({ goalsMet: 0 }));
      const oneGoal = calculateRaceReward(makeResult({ goalsMet: 1 }));
      const twoGoals = calculateRaceReward(makeResult({ goalsMet: 2 }));
      assert.ok(oneGoal > zeroGoals);
      assert.ok(twoGoals > oneGoal);
      assert.strictEqual(twoGoals - oneGoal, oneGoal - zeroGoals);
    });

    it("rewards beating par time", () => {
      const overPar = calculateRaceReward(makeResult({ deltaToPar: 5 }));
      const onPar = calculateRaceReward(makeResult({ deltaToPar: 0 }));
      const underPar = calculateRaceReward(makeResult({ deltaToPar: -5 }));
      assert.ok(onPar > overPar);
      assert.strictEqual(onPar, underPar);
    });

    it("rewards cleaner survival in even steps", () => {
      const twoWrecks = calculateRaceReward(makeResult({ destroyedCount: 2 }));
      const oneWreck = calculateRaceReward(makeResult({ destroyedCount: 1 }));
      const zeroWrecks = calculateRaceReward(makeResult({ destroyedCount: 0 }));
      assert.ok(zeroWrecks > oneWreck);
      assert.ok(oneWreck > twoWrecks);
      assert.strictEqual(zeroWrecks - oneWreck, oneWreck - twoWrecks);
    });

    it("applies event-best bonuses only to non-guided runs", () => {
      const nonGuided = calculateRaceReward(makeResult({ newEventBest: true }));
      const nonGuidedBase = calculateRaceReward(makeResult());
      const guided = calculateRaceReward(makeResult({ newEventBest: true, event: { guided: true } }));
      const guidedBase = calculateRaceReward(makeResult({ event: { guided: true } }));
      assert.ok(nonGuided > nonGuidedBase);
      assert.strictEqual(guided, guidedBase);
    });

    it("adds daily and daily-best bonuses independently", () => {
      const baseline = calculateRaceReward(makeResult());
      const daily = calculateRaceReward(makeResult({ event: { daily: true } }));
      const dailyBest = calculateRaceReward(makeResult({ newDailyBest: true }));
      const stacked = calculateRaceReward(makeResult({ event: { daily: true }, newDailyBest: true }));
      assert.ok(daily > baseline);
      assert.ok(dailyBest > baseline);
      assert.ok(stacked > daily);
      assert.ok(stacked > dailyBest);
    });

    it("only awards the tutorial pickup bonus when both tutorial flags are set", () => {
      const guidedBase = calculateRaceReward(makeResult({
        event: { guided: true },
        wasTutorialRun: true,
        tutorialPickupMet: false,
      }));
      const tutorialMet = calculateRaceReward(makeResult({
        event: { guided: true },
        wasTutorialRun: true,
        tutorialPickupMet: true,
      }));
      const notTutorialRun = calculateRaceReward(makeResult({
        event: { guided: true },
        wasTutorialRun: false,
        tutorialPickupMet: true,
      }));
      assert.ok(tutorialMet > guidedBase);
      assert.strictEqual(notTutorialRun, guidedBase);
    });
  });

  describe("getGarageProgression", () => {
    it("returns 0 for a fresh save", () => {
      const save = { wins: 0, eventResults: {}, runHistory: [] };
      assert.strictEqual(getGarageProgression(save), 0);
    });

    it("clamps at 1 for a veteran save", () => {
      const save = {
        wins: 20,
        eventResults: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`e${i}`, 1])),
        runHistory: Array.from({ length: 24 }, () => ({})),
      };
      assert.strictEqual(getGarageProgression(save), 1);
    });
  });
});

// ---------------------------------------------------------------------------
// save.js
// ---------------------------------------------------------------------------

describe("save.js", () => {
  describe("migrateSave — same-version (v5) path", () => {
    it("preserves wallet, wins, and nested settings", () => {
      const raw = {
        version: SAVE_VERSION,
        wins: 7,
        wallet: { flux: 500, scrap: 20, premium: 0 },
        settings: { reducedShake: true, assistLevel: "high" },
        daily: { bestTime: 30.5, rewardClaimed: true },
        strikeBoard: { seed: 123, rerolls: 2 },
      };
      const save = migrateSave(raw);
      assert.strictEqual(save.wallet.flux, 500);
      assert.strictEqual(save.wins, 7);
      assert.strictEqual(save.settings.reducedShake, true);
      assert.strictEqual(save.settings.assistLevel, "high");
    });

    it("merges nested daily fields — user data over defaults", () => {
      const raw = {
        version: SAVE_VERSION,
        daily: { bestTime: 44.1, rewardClaimed: true },
      };
      const save = migrateSave(raw);
      approx(save.daily.bestTime, 44.1);
      assert.strictEqual(save.daily.rewardClaimed, true);
    });

    it("fills missing nested daily fields from defaults", () => {
      const raw = { version: SAVE_VERSION, daily: {} };
      const save = migrateSave(raw);
      assert.strictEqual(save.daily.rewardClaimed, false);
    });
  });

  describe("migrateSave — old-version path", () => {
    it("migrates legacy currency field to wallet.flux", () => {
      const save = migrateSave({ version: 4, currency: 350, wins: 0 });
      assert.strictEqual(save.wallet.flux, 350);
    });

    it("maps dailyBest to daily.bestTime", () => {
      const save = migrateSave({ version: 4, currency: 0, dailyBest: 52.3 });
      approx(save.daily.bestTime, 52.3);
    });

    it("preserves wins and eventProgress", () => {
      const save = migrateSave({ version: 4, currency: 0, wins: 5, eventProgress: 8 });
      assert.strictEqual(save.wins, 5);
      assert.strictEqual(save.eventProgress, 8);
    });

    it("reconstructs flux from wins/eventProgress when no currency field", () => {
      const save = migrateSave({ version: 4, wins: 2, eventProgress: 3 });
      // STARTING_FLUX + 2*55 + 3*20 = 220 + 110 + 60 = 390
      assert.strictEqual(save.wallet.flux, 220 + 2 * 55 + 3 * 20);
    });
  });

  describe("pushRunHistory", () => {
    it("inserts new entry at the front", () => {
      const save = { runHistory: [{ run: "old" }] };
      pushRunHistory(save, { run: "new" });
      assert.deepStrictEqual(save.runHistory[0], { run: "new" });
      assert.deepStrictEqual(save.runHistory[1], { run: "old" });
    });

    it("caps history at 24 entries", () => {
      const save = { runHistory: Array.from({ length: 25 }, (_, i) => ({ i })) };
      pushRunHistory(save, { run: "newest" });
      assert.strictEqual(save.runHistory.length, 24);
      assert.deepStrictEqual(save.runHistory[0], { run: "newest" });
    });
  });
});

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

describe("EventBus", () => {
  it("calls registered handler when event is emitted", () => {
    const bus = new EventBus();
    let called = 0;
    bus.on("test", () => { called += 1; });
    bus.emit("test");
    assert.strictEqual(called, 1);
  });

  it("passes payload to handler", () => {
    const bus = new EventBus();
    let received = null;
    bus.on("data", (payload) => { received = payload; });
    bus.emit("data", { value: 42 });
    assert.deepStrictEqual(received, { value: 42 });
  });

  it("handler is not called after unsubscribing", () => {
    const bus = new EventBus();
    let called = 0;
    const unsub = bus.on("ev", () => { called += 1; });
    unsub();
    bus.emit("ev");
    assert.strictEqual(called, 0);
  });

  it("multiple handlers on the same event are all called", () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.on("ev", () => { a += 1; });
    bus.on("ev", () => { b += 1; });
    bus.emit("ev");
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });

  it("removing one handler does not affect others", () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    const unsub = bus.on("ev", () => { a += 1; });
    bus.on("ev", () => { b += 1; });
    unsub();
    bus.emit("ev");
    assert.strictEqual(a, 0);
    assert.strictEqual(b, 1);
  });

  it("emitting with no listeners does not throw", () => {
    const bus = new EventBus();
    assert.doesNotThrow(() => bus.emit("nothing", { x: 1 }));
  });
});

// ---------------------------------------------------------------------------
// isometric.js
// ---------------------------------------------------------------------------

describe("isometric.js", () => {
  describe("worldToIso", () => {
    it("origin maps to origin", () => {
      const p = worldToIso(0, 0, 0);
      approx(p.x, 0);
      approx(p.y, 0);
    });

    it("positive x moves right and slightly down", () => {
      const p = worldToIso(1, 0, 0);
      approx(p.x, ISO_PROJECTION.xScale);
      approx(p.y, ISO_PROJECTION.yScale);
    });

    it("positive y moves left and slightly down", () => {
      const p = worldToIso(0, 1, 0);
      approx(p.x, -ISO_PROJECTION.xScale);
      approx(p.y, ISO_PROJECTION.yScale);
    });

    it("positive z lifts the point (negative screen y)", () => {
      const p = worldToIso(0, 0, 1);
      approx(p.x, 0);
      approx(p.y, -ISO_PROJECTION.heightScale);
    });
  });

  describe("projectIsoPoint", () => {
    it("camera at origin, identity scale — matches worldToIso + viewport offset", () => {
      const camera = { x: 0, y: 0, z: 0 };
      const viewport = { x: 100, y: 80 };
      const iso = worldToIso(2, 3, 0);
      const proj = projectIsoPoint(2, 3, 0, camera, viewport, 1);
      approx(proj.x, viewport.x + iso.x);
      approx(proj.y, viewport.y + iso.y);
    });

    it("placing the camera at the point results in the viewport centre", () => {
      const camera = { x: 5, y: 5, z: 0 };
      const viewport = { x: 640, y: 360 };
      const proj = projectIsoPoint(5, 5, 0, camera, viewport, 1);
      approx(proj.x, 640);
      approx(proj.y, 360);
    });
  });
});
