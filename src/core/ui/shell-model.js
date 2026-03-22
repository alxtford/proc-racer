import { getCurrencyBalance } from "../economy.js";
import { GARAGE_ROLL_COST, getFilledGarageCars, getRollReadyStatus } from "../garage.js";
import {
  getDisplayEvent,
  getGhostReady,
  getMenuOverviewTooltip,
  getSelectedGarageCar,
} from "./legacy.js";
import { getRouteSection, getSectionOptions } from "./sections.js";

export function deriveShellModel(state, route) {
  const selectedEvent = state.events[state.selectedEventIndex] || null;
  const raceEvent = selectedEvent ? getDisplayEvent(state, selectedEvent) : null;
  const selectedCar = getSelectedGarageCar(state);
  const liveCars = getFilledGarageCars(state.save).length;
  const flux = getCurrencyBalance(state.save, "flux");
  const scrap = getCurrencyBalance(state.save, "scrap");
  const screenCopy = {
    race: {
      eyebrow: "Procedural kill-runs",
      title: "Race",
      intro: "Split launch, board, and course tools into one fast race workspace.",
      tooltip: raceEvent ? getMenuOverviewTooltip(state, raceEvent) : "Pick a line and launch in seconds.",
      chips: [
        raceEvent ? "Strike board live" : "Run cold",
        getGhostReady(state, raceEvent) ? "Ghost ready" : "Ghost cold",
        `${flux} Flux`,
      ],
    },
    garage: {
      eyebrow: "Loadout and lineup",
      title: "Garage",
      intro: "Keep the active chassis, slot browser, and garage pressure separated so the lineup reads cleaner.",
      tooltip: "Garage slots hold your live lineup. Open bays exist to tempt stronger Foundry rolls, not to pad the screen.",
      chips: [
        `${liveCars} live`,
        `${state.save.garage.length - liveCars} open`,
        selectedCar ? selectedCar.tierLabel : "No car selected",
      ],
    },
    foundry: {
      eyebrow: "Flux into metal",
      title: "Foundry",
      intro: "Break forge, readout, and slot pressure into distinct views so the machine stops crowding the data.",
      tooltip: "Flux buys three procedural car reveals. Keep any subset, assign them to slots, and sell the rest for Scrap.",
      chips: [
        `${flux} Flux`,
        getRollReadyStatus(state.save) ? "Roll ready" : `${Math.max(0, GARAGE_ROLL_COST - flux)} Flux short`,
        `${scrap} Scrap`,
      ],
    },
    style: {
      eyebrow: "Locker live",
      title: "Style",
      intro: "Separate the live loadout from the shop grid so the locker reads like a pit wall instead of a catalog dump.",
      tooltip: "Scrap buys cosmetics only. The locker should feel like a live pit wall, not a dead spreadsheet.",
      chips: [
        `${scrap} Scrap`,
        `${Object.keys(state.save.equippedCosmetics || {}).length || 0} equipped`,
        "Preview live",
      ],
    },
    career: {
      eyebrow: "Pressure log",
      title: "Career",
      intro: "Split the macro snapshot from the run ledger so each layer stays readable.",
      tooltip: "Career is the pressure log: medals, PBs, and the last few runs that tell you whether the garage is actually getting meaner.",
      chips: [
        `${state.save.wins || 0} wins`,
        `${state.save.runHistory?.length || 0} runs logged`,
        `${flux} Flux`,
      ],
    },
    settings: {
      eyebrow: "Comfort and controls",
      title: "Settings",
      intro: "Separate comfort tuning from bindings so setup is quick without piling every control on one page.",
      tooltip: "Comfort settings and bindings update live. This screen should solve friction quickly, not hide device setup behind another subtab.",
      chips: [
        state.save.settings.controlMode === "custom" ? "Custom bindings" : "Hybrid input",
        state.save.settings.assistLevel || "standard assist",
        state.gamepad?.connected ? "Gamepad live" : "Keyboard focus",
      ],
    },
  };
  return {
    ...screenCopy[route.screen],
    tabs: [
      { id: "menu-tab-home", screen: "race", label: "Race" },
      { id: "menu-tab-profile", screen: "garage", label: "Garage" },
      { id: "menu-tab-foundry", screen: "foundry", label: "Foundry" },
      { id: "menu-tab-style", screen: "style", label: "Style" },
      { id: "menu-tab-career", screen: "career", label: "Career" },
      { id: "menu-tab-settings", screen: "settings", label: "Settings" },
    ],
    subnav: getSectionOptions(route.screen).map((option) => ({
      ...option,
      active: getRouteSection(route) === option.id,
    })),
  };
}
