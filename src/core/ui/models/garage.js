import { getFilledGarageCars, getGarageScore, getGarageSlotIndex, isGarageSlotFilled } from "../../garage.js";
import {
  formatCarMeta,
  getCarGuidance,
  getCarLabel,
  getCarTags,
  getProfileSummaryItems,
  getSelectedGarageCar,
  renderStatTiles,
} from "../legacy.js";

export function buildGarageModel(state) {
  const selectedCar = getSelectedGarageCar(state);
  const liveCars = getFilledGarageCars(state.save);
  return {
    type: "garage",
    selectedCar,
    liveCars: liveCars.length,
    openSlots: state.save.garage.length - liveCars.length,
    summary: getProfileSummaryItems(state),
    selectedCarSlot: selectedCar ? getGarageSlotIndex(state.save, selectedCar.id) + 1 : null,
    cars: state.save.garage.map((car, slotIndex) => {
      const filled = isGarageSlotFilled(car);
      return {
        slotIndex,
        filled,
        selected: filled && state.selectedCarId === car.id,
        id: filled ? car.id : null,
        title: filled ? car.name : "Open Slot",
        kicker: filled ? `Slot ${slotIndex + 1} // ${getCarLabel(car)}` : `Slot ${slotIndex + 1} // Vacant`,
        meta: filled ? formatCarMeta(car) : "Keep a Foundry roll here to activate this bay.",
        tags: filled ? [car.role, `${getGarageScore(car)} rating`, ...getCarTags(car).slice(0, 2)] : ["Vacant", "Foundry", "Roll ready"],
      };
    }),
    hero: selectedCar ? {
      badge: `Slot ${getGarageSlotIndex(state.save, selectedCar.id) + 1} // ${getCarLabel(selectedCar)}`,
      role: formatCarMeta(selectedCar),
      title: selectedCar.name,
      copy: getCarGuidance(selectedCar),
      tags: getCarTags(selectedCar),
      statsHtml: renderStatTiles(selectedCar),
    } : null,
  };
}
