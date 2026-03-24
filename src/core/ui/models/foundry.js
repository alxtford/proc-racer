import { getCurrencyBalance } from "../../economy.js";
import { GARAGE_ROLL_COST, getRollReadyStatus, getGarageScore, isGarageSlotFilled } from "../../garage.js";
import { getFoundryInsightItems, getRollCallout, getSelectedGarageCar } from "../legacy.js";
import { getHubPaneSize, isCompactHubPane } from "../layout.js";

export function buildFoundryModel(state) {
  const { width: paneWidth, height: paneHeight } = getHubPaneSize();
  const compactLandscape = isCompactHubPane(paneWidth, paneHeight);
  const selectedCar = getSelectedGarageCar(state);
  const insights = getFoundryInsightItems(state);
  return {
    type: "foundry",
    compactLandscape,
    selectedCar,
    flux: getCurrencyBalance(state.save, "flux"),
    rollReady: getRollReadyStatus(state.save),
    machineTitle: compactLandscape ? "Crack 3 Cars" : "Crack 3 Procedural Cars",
    rollLabel: compactLandscape ? `Roll ${GARAGE_ROLL_COST} Flux` : `Roll 3 Cars // ${GARAGE_ROLL_COST} Flux`,
    rollDisabled: Boolean(state.garageRoll) || getCurrencyBalance(state.save, "flux") < GARAGE_ROLL_COST,
    rollCopy: getRollCallout(state),
    insights: compactLandscape ? insights.slice(0, 2) : insights,
    slotSummary: state.save.garage.map((car, index) => ({
      label: `Slot ${index + 1}`,
      value: isGarageSlotFilled(car) ? car.name : "Open slot",
      note: isGarageSlotFilled(car)
        ? `${car.tierLabel} // Rating ${getGarageScore(car)} // ${car.role}`
        : "Vacant // keep a Foundry roll here",
    })),
  };
}
