import { getCurrencyBalance } from "../../economy.js";
import { ensureStyleLocker, getEquippedCosmeticDefs, getGarageCarStyle, isCosmeticOwned } from "../../styleLocker.js";
import { COSMETIC_SLOTS, getCosmeticsBySlot } from "../../../data/cosmetics.js";
import {
  getSelectedGarageCar,
  getStylePageSize,
  getStylePreviewSourceLabel,
  getStylePreviewStatusCopy,
} from "../legacy.js";
import { getHubPaneSize, isCompactHubPane } from "../layout.js";

function clampPage(page, pageCount) {
  return Math.max(0, Math.min(pageCount - 1, Number.isInteger(page) ? page : 0));
}

export function buildStyleModel(state, route) {
  ensureStyleLocker(state.save);
  const activeSlot = route.styleSlot || "skin";
  const slotItems = getCosmeticsBySlot(activeSlot);
  const { width: paneWidth, height: paneHeight } = getHubPaneSize();
  const compactLandscape = isCompactHubPane(paneWidth, paneHeight);
  const pageSize = compactLandscape ? 1 : getStylePageSize(paneWidth * 0.36);
  const pageCount = Math.max(1, Math.ceil(slotItems.length / pageSize));
  const page = clampPage(route.stylePage || 0, pageCount);
  const visibleItems = slotItems.slice(page * pageSize, (page + 1) * pageSize);
  const equipped = getEquippedCosmeticDefs(state.save);
  const activeStyleItem = equipped[activeSlot] || null;
  const selectedCar = getSelectedGarageCar(state);
  const previewCandidate = slotItems.find((item) => item.id === route.stylePreviewItemId) || null;
  const previewItem = previewCandidate?.slot === activeSlot ? previewCandidate : activeStyleItem;
  const previewOwned = previewItem ? isCosmeticOwned(state.save, previewItem.id) : false;
  const previewStyle = selectedCar
    ? getGarageCarStyle(state.save, selectedCar, previewItem ? { [activeSlot]: previewItem.id } : null)
    : null;
  return {
    type: "style",
    scrap: getCurrencyBalance(state.save, "scrap"),
    activeSlot,
    page,
    pageCount,
    slotCount: slotItems.length,
    compactLandscape,
    visibleCountLabel: compactLandscape
      ? `${visibleItems.length} visible // ${page + 1}/${pageCount}`
      : `${visibleItems.length} visible // page ${page + 1} / ${pageCount}`,
    slots: COSMETIC_SLOTS,
    equippedItem: activeStyleItem,
    preview: {
      item: previewItem,
      owned: previewOwned,
      style: previewStyle,
      carName: selectedCar?.name || "No active car",
      sourceLabel: getStylePreviewSourceLabel(previewItem, activeStyleItem, previewOwned),
      statusCopy: getStylePreviewStatusCopy(activeSlot, previewItem, activeStyleItem, selectedCar),
    },
    visibleItems: visibleItems.map((item) => {
      const owned = isCosmeticOwned(state.save, item.id);
      const selected = activeStyleItem?.id === item.id;
      return {
        ...item,
        owned,
        previewing: route.stylePreviewItemId === item.id,
        selected,
        action: owned ? "equip" : "buy",
        actionLabel: selected ? "Equipped" : owned ? "Equip" : `Buy ${item.cost} Scrap`,
      };
    }),
  };
}
