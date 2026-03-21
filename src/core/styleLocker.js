import { COSMETIC_DEFS, COSMETIC_SLOTS, createDefaultEquippedCosmetics, getDefaultOwnedCosmetics } from "../data/cosmetics.js";
import { canAfford, getCosmeticDirectPremiumPrice, spendCurrency } from "./economy.js";
import { clamp } from "./utils.js";

function randomHexPair(value) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

export function mixHexColors(colorA, colorB, amount) {
  const a = String(colorA || "#ffffff").replace("#", "");
  const b = String(colorB || "#ffffff").replace("#", "");
  const mix = clamp(amount, 0, 1);
  const av = [0, 2, 4].map((offset) => Number.parseInt(a.slice(offset, offset + 2), 16));
  const bv = [0, 2, 4].map((offset) => Number.parseInt(b.slice(offset, offset + 2), 16));
  return `#${av.map((value, index) => randomHexPair(value + (bv[index] - value) * mix)).join("")}`;
}

export function ensureStyleLocker(save) {
  const defaultOwned = getDefaultOwnedCosmetics();
  const defaultEquipped = createDefaultEquippedCosmetics();
  const owned = new Set(Array.isArray(save.unlockedCosmetics) ? save.unlockedCosmetics : defaultOwned);
  defaultOwned.forEach((itemId) => owned.add(itemId));
  save.unlockedCosmetics = [...owned];
  save.equippedCosmetics = { ...defaultEquipped, ...(save.equippedCosmetics || {}) };
  COSMETIC_SLOTS.forEach((slot) => {
    const equipped = save.equippedCosmetics[slot];
    if (!equipped || !save.unlockedCosmetics.includes(equipped) || COSMETIC_DEFS[equipped]?.slot !== slot) {
      save.equippedCosmetics[slot] = defaultEquipped[slot];
    }
  });
  return save;
}

export function isCosmeticOwned(save, itemId) {
  ensureStyleLocker(save);
  return save.unlockedCosmetics.includes(itemId);
}

export function buyCosmetic(save, itemId, currency = "scrap") {
  ensureStyleLocker(save);
  const item = COSMETIC_DEFS[itemId];
  if (!item) return { ok: false, reason: "missing_item" };
  if (isCosmeticOwned(save, itemId)) return { ok: false, reason: "already_owned", item };
  const price = currency === "premium" ? getCosmeticDirectPremiumPrice(item) : item.cost;
  if (!canAfford(save, currency, price)) return { ok: false, reason: "insufficient_funds", item, currency, price };
  spendCurrency(save, currency, price);
  save.unlockedCosmetics = [...new Set([...save.unlockedCosmetics, itemId])];
  return { ok: true, item, currency, price };
}

export function equipCosmetic(save, itemId) {
  ensureStyleLocker(save);
  const item = COSMETIC_DEFS[itemId];
  if (!item) return { ok: false, reason: "missing_item" };
  if (!isCosmeticOwned(save, itemId)) return { ok: false, reason: "not_owned", item };
  save.equippedCosmetics[item.slot] = itemId;
  return { ok: true, item };
}

export function getEquippedCosmeticDefs(save) {
  ensureStyleLocker(save);
  return COSMETIC_SLOTS.reduce((acc, slot) => {
    const itemId = save.equippedCosmetics?.[slot];
    acc[slot] = COSMETIC_DEFS[itemId] || COSMETIC_DEFS[createDefaultEquippedCosmetics()[slot]];
    return acc;
  }, {});
}

export function getGarageCarStyle(save, car) {
  const cosmetics = getEquippedCosmeticDefs(save);
  const skin = cosmetics.skin;
  const trail = cosmetics.trail;
  const skid = cosmetics.skid;
  const emote = cosmetics.emote;
  const baseColor = car?.color || "#8df7ff";
  const accentBase = car?.accentColor || baseColor;
  return {
    skin,
    trail,
    skid,
    emote,
    bodyColor: skin?.tint ? mixHexColors(baseColor, skin.tint, skin.mix ?? 0.2) : baseColor,
    accentColor: skin?.tint ? mixHexColors(accentBase, skin.tint, Math.min(0.72, (skin.mix ?? 0.2) * 1.25)) : accentBase,
    trailColor: trail?.color || accentBase,
    skidColor: skid?.color || "rgba(220, 232, 255, 0.18)",
    emoteBadge: emote?.badge || "LOCKED IN",
    emoteName: emote?.name || "Steady Nod",
  };
}
