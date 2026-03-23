import { getCurrencyBalance } from "../../economy.js";
import { GARAGE_ROLL_COST, getRollReadyStatus, getGarageScore, isGarageSlotFilled } from "../../garage.js";
import { getFoundryInsightItems, getRollCallout, getSelectedGarageCar } from "../legacy.js";

export function buildFoundryModel(state) {
  const selectedCar = getSelectedGarageCar(state);
  return {
    type: "foundry",
    selectedCar,
    flux: getCurrencyBalance(state.save, "flux"),
    rollReady: getRollReadyStatus(state.save),
    rollLabel: `Roll 3 Cars // ${GARAGE_ROLL_COST} Flux`,
    rollDisabled: Boolean(state.garageRoll) || getCurrencyBalance(state.save, "flux") < GARAGE_ROLL_COST,
    rollCopy: getRollCallout(state),
    insights: getFoundryInsightItems(state),
    slotSummary: state.save.garage.map((car, index) => ({
      label: `Slot ${index + 1}`,
      value: isGarageSlotFilled(car) ? car.name : "Open slot",
      note: isGarageSlotFilled(car)
        ? `${car.tierLabel} // Rating ${getGarageScore(car)} // ${car.role}`
        : "Vacant // keep a Foundry roll here",
    })),
  };
}
