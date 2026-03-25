import { getCurrencyBalance } from "../economy.js";
import { GARAGE_ROLL_COST, getFilledGarageCars, getRollReadyStatus } from "../garage.js";
import {
  getDisplayEvent,
  getGhostReady,
  getMenuOverviewTooltip,
  getSelectedGarageCar,
} from "./legacy.js";
import { getRouteSection, getSectionOptions } from "./sections.js";

const PLAYER_HUB_SCREENS = ["garage", "foundry", "style", "career"];

export function deriveShellModel(state, route) {
  const selectedEvent = state.events[state.selectedEventIndex] || null;
  const raceEvent = selectedEvent ? getDisplayEvent(state, selectedEvent) : null;
  const selectedCar = getSelectedGarageCar(state);
  const liveCars = getFilledGarageCars(state.save).length;
  const flux = getCurrencyBalance(state.save, "flux");
  const scrap = getCurrencyBalance(state.save, "scrap");
  const inPlayerHub = PLAYER_HUB_SCREENS.includes(route.screen);
  const screenCopy = {
    race: {
      eyebrow: "Procedural kill-runs",
      title: "Race",
      intro: "Pick a run and launch.",
      tooltip: raceEvent ? getMenuOverviewTooltip(state, raceEvent) : "Pick a run and launch.",
      chips: [
        raceEvent ? "Board live" : "No run",
        getGhostReady(state, raceEvent) ? "Ghost ready" : "No ghost",
        `${flux} Flux`,
      ],
    },
    garage: {
      eyebrow: "Player garage hub",
      title: "Garage",
      intro: "Choose your launch car.",
      tooltip: "Pick your launch car. Open bays make Foundry rolls matter.",
      chips: [
        `${liveCars} live`,
        `${state.save.garage.length - liveCars} open`,
        selectedCar ? selectedCar.tierLabel : "No car selected",
      ],
    },
    foundry: {
      eyebrow: "Flux into metal",
      title: "Foundry",
      intro: "Roll three cars. Keep what earns a slot.",
      tooltip: "Flux buys three cars. Keep the upgrades and scrap the rest.",
      chips: [
        `${flux} Flux`,
        getRollReadyStatus(state.save) ? "Roll ready" : `${Math.max(0, GARAGE_ROLL_COST - flux)} Flux short`,
        `${scrap} Scrap`,
      ],
    },
    style: {
      eyebrow: "Locker live",
      title: "Style",
      intro: "Spend Scrap on cosmetics.",
      tooltip: "Preview cosmetics before you buy or equip.",
      chips: [
        `${scrap} Scrap`,
        `${Object.keys(state.save.equippedCosmetics || {}).length || 0} equipped`,
        "Preview",
      ],
    },
    career: {
      eyebrow: "Pressure log",
      title: "Career",
      intro: "Track runs, pace, and wrecks.",
      tooltip: "Check medals, PBs, and recent runs.",
      chips: [
        `${state.save.wins || 0} wins`,
        `${state.save.runHistory?.length || 0} runs logged`,
        `${flux} Flux`,
      ],
    },
    settings: {
      eyebrow: "Comfort and controls",
      title: "Settings",
      intro: "Tune comfort and controls.",
      tooltip: "Comfort settings and bindings update live.",
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
      { id: "menu-tab-home", screen: "race", label: "Race", active: route.screen === "race" },
      { id: "menu-tab-profile", screen: "garage", label: "Garage", active: inPlayerHub },
      { id: "menu-tab-settings", screen: "settings", label: "Settings", active: route.screen === "settings" },
    ],
    subnav: inPlayerHub
      ? [
        { screen: "garage", label: "Cars", active: route.screen === "garage" },
        { screen: "foundry", label: "Foundry", active: route.screen === "foundry" },
        { screen: "style", label: "Style", active: route.screen === "style" },
        { screen: "career", label: "Career", active: route.screen === "career" },
      ]
      : getSectionOptions(route.screen).map((option) => ({
        ...option,
        active: getRouteSection(route) === option.id,
      })),
  };
}
