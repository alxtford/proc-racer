import { getCurrencyBalance } from "../../economy.js";
import { ensureStyleLocker, getEquippedCosmeticDefs, isCosmeticOwned } from "../../styleLocker.js";
import { COSMETIC_SLOTS, getCosmeticsBySlot } from "../../../data/cosmetics.js";
import { getStylePageSize } from "../legacy.js";

function clampPage(page, pageCount) {
  return Math.max(0, Math.min(pageCount - 1, Number.isInteger(page) ? page : 0));
}

export function buildStyleModel(state, route) {
  ensureStyleLocker(state.save);
  const activeSlot = route.styleSlot || "skin";
  const slotItems = getCosmeticsBySlot(activeSlot);
  const pageSize = getStylePageSize(typeof window !== "undefined" ? window.innerWidth * 0.36 : 640);
  const pageCount = Math.max(1, Math.ceil(slotItems.length / pageSize));
  const page = clampPage(route.stylePage || 0, pageCount);
  const visibleItems = slotItems.slice(page * pageSize, (page + 1) * pageSize);
  const equipped = getEquippedCosmeticDefs(state.save);
  const activeStyleItem = equipped[activeSlot] || null;
  return {
    type: "style",
    scrap: getCurrencyBalance(state.save, "scrap"),
    activeSlot,
    page,
    pageCount,
    slots: COSMETIC_SLOTS,
    equippedItem: activeStyleItem,
    visibleItems: visibleItems.map((item) => {
      const owned = isCosmeticOwned(state.save, item.id);
      const equippedItemId = state.save.equippedCosmetics?.[activeSlot];
      const selected = equippedItemId === item.id;
      return {
        ...item,
        owned,
        selected,
        action: owned ? "equip" : "buy",
        actionLabel: selected ? "Equipped" : owned ? "Equip" : `Buy ${item.cost} Scrap`,
      };
    }),
  };
}
