import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { getCosmeticDirectPremiumPrice, getStorePrice } from "../../src/core/economy.js";
import { createDefaultSave, getGhostKey, loadSave, persistSave, SAVE_KEY } from "../../src/core/save.js";
import {
  buyCosmetic,
  ensureStyleLocker,
  equipCosmetic,
  getEquippedCosmeticDefs,
  getGarageCarStyle,
  isCosmeticOwned,
  mixHexColors,
} from "../../src/core/styleLocker.js";
import {
  COSMETIC_DEFS,
  createDefaultEquippedCosmetics,
  getCosmeticsBySlot,
  getDefaultOwnedCosmetics,
} from "../../src/data/cosmetics.js";

function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

let originalLocalStorage;

beforeEach(() => {
  originalLocalStorage = globalThis.localStorage;
});

afterEach(() => {
  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
    return;
  }
  globalThis.localStorage = originalLocalStorage;
});

describe("save.js", () => {
  it("creates a default save with a live starter car and default cosmetics", () => {
    const save = createDefaultSave();
    assert.strictEqual(save.version, 5);
    assert.strictEqual(save.garage.length, 3);
    assert.strictEqual(save.selectedCarId, save.garage[0].id);
    assert.deepStrictEqual(save.equippedCosmetics, createDefaultEquippedCosmetics());
    assert.deepStrictEqual(
      new Set(save.unlockedCosmetics),
      new Set(getDefaultOwnedCosmetics()),
    );
  });

  it("loads a default save when storage is empty", () => {
    globalThis.localStorage = createMemoryStorage();
    const save = loadSave();
    assert.strictEqual(save.version, 5);
    assert.strictEqual(save.garage[0].tierId, "starter");
  });

  it("falls back to a default save when persisted JSON is corrupt", () => {
    globalThis.localStorage = createMemoryStorage({ [SAVE_KEY]: "{not-json" });
    const save = loadSave();
    assert.strictEqual(save.version, 5);
    assert.strictEqual(save.selectedCarId, save.garage[0].id);
  });

  it("persists an ensured save payload", () => {
    globalThis.localStorage = createMemoryStorage();
    const save = createDefaultSave();
    save.unlockedCosmetics = ["skin-default"];
    save.equippedCosmetics = { skin: "trail-comet" };
    save.wallet = { flux: 300, scrap: 12, premium: 1 };

    persistSave(save);

    const stored = JSON.parse(globalThis.localStorage.getItem(SAVE_KEY));
    assert.strictEqual(stored.wallet.flux, 300);
    assert.strictEqual(stored.wallet.scrap, 12);
    assert.strictEqual(stored.equippedCosmetics.skin, "skin-default");
    assert.strictEqual(stored.equippedCosmetics.trail, "trail-default");
  });

  it("creates stable ghost keys", () => {
    assert.strictEqual(getGhostKey("event-1", "car-7"), "event-1::car-7");
  });
});

describe("styleLocker.js and cosmetics.js", () => {
  it("mixes hex colors and clamps the blend amount", () => {
    assert.strictEqual(mixHexColors("#000000", "#ffffff", 0), "#000000");
    assert.strictEqual(mixHexColors("#000000", "#ffffff", 2), "#ffffff");
  });

  it("repairs invalid equipped items back to owned slot defaults", () => {
    const save = createDefaultSave();
    save.unlockedCosmetics = ["skin-default"];
    save.equippedCosmetics = {
      skin: "trail-comet",
      trail: "trail-default",
      skid: "skid-default",
      emote: "emote-default",
    };

    ensureStyleLocker(save);

    assert.strictEqual(save.equippedCosmetics.skin, "skin-default");
    assert.strictEqual(isCosmeticOwned(save, "skin-default"), true);
  });

  it("returns direct premium prices and product prices", () => {
    assert.strictEqual(getCosmeticDirectPremiumPrice(COSMETIC_DEFS["skin-radioactive"]), 2);
    assert.deepStrictEqual(getStorePrice("garage_roll", "premium"), { currency: "premium", amount: 3 });
    assert.deepStrictEqual(getStorePrice("course_refresh"), { currency: "flux", amount: 30 });
  });

  it("supports buying cosmetics with scrap or premium", () => {
    const scrapSave = createDefaultSave();
    scrapSave.wallet.scrap = 100;
    const scrapPurchase = buyCosmetic(scrapSave, "trail-comet");
    assert.deepStrictEqual(scrapPurchase, {
      ok: true,
      item: COSMETIC_DEFS["trail-comet"],
      currency: "scrap",
      price: 68,
    });
    assert.strictEqual(scrapSave.wallet.scrap, 32);
    assert.strictEqual(isCosmeticOwned(scrapSave, "trail-comet"), true);

    const premiumSave = createDefaultSave();
    premiumSave.wallet.premium = 2;
    const premiumPurchase = buyCosmetic(premiumSave, "skin-radioactive", "premium");
    assert.strictEqual(premiumPurchase.ok, true);
    assert.strictEqual(premiumPurchase.currency, "premium");
    assert.strictEqual(premiumPurchase.price, 2);
    assert.strictEqual(premiumSave.wallet.premium, 0);
  });

  it("rejects missing, duplicate, and unaffordable cosmetic purchases", () => {
    const save = createDefaultSave();
    assert.deepStrictEqual(buyCosmetic(save, "missing"), { ok: false, reason: "missing_item" });

    const duplicate = buyCosmetic(save, "skin-default");
    assert.strictEqual(duplicate.ok, false);
    assert.strictEqual(duplicate.reason, "already_owned");

    const broke = buyCosmetic(save, "trail-comet");
    assert.strictEqual(broke.ok, false);
    assert.strictEqual(broke.reason, "insufficient_funds");
  });

  it("equips owned cosmetics and rejects unowned ones", () => {
    const save = createDefaultSave();
    const notOwned = equipCosmetic(save, "trail-comet");
    assert.strictEqual(notOwned.ok, false);
    assert.strictEqual(notOwned.reason, "not_owned");

    save.wallet.scrap = 100;
    buyCosmetic(save, "trail-comet");
    const equipped = equipCosmetic(save, "trail-comet");
    assert.strictEqual(equipped.ok, true);
    assert.strictEqual(save.equippedCosmetics.trail, "trail-comet");
  });

  it("resolves equipped defs with overrides and slot fallback", () => {
    const save = createDefaultSave();
    const defs = getEquippedCosmeticDefs(save, {
      skin: "skin-inferno",
      trail: "skin-ultraviolet",
    });
    assert.strictEqual(defs.skin.id, "skin-inferno");
    assert.strictEqual(defs.trail.id, "trail-default");
  });

  it("builds the live garage car style from equipped or overridden cosmetics", () => {
    const save = createDefaultSave();
    const style = getGarageCarStyle(save, {
      color: "#101010",
      accentColor: "#d0d0d0",
    }, {
      skin: "skin-inferno",
      trail: "trail-hotwire",
      skid: "skid-cinder",
      emote: "emote-static",
    });

    assert.strictEqual(style.bodyColor, mixHexColors("#101010", COSMETIC_DEFS["skin-inferno"].tint, COSMETIC_DEFS["skin-inferno"].mix));
    assert.strictEqual(style.trailColor, COSMETIC_DEFS["trail-hotwire"].color);
    assert.strictEqual(style.skidColor, COSMETIC_DEFS["skid-cinder"].color);
    assert.strictEqual(style.emoteBadge, COSMETIC_DEFS["emote-static"].badge);
  });

  it("lists cosmetics by slot", () => {
    const trailCosmetics = getCosmeticsBySlot("trail");
    assert.ok(trailCosmetics.length > 0);
    assert.ok(trailCosmetics.every((item) => item.slot === "trail"));
  });
});
