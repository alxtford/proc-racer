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
      intro: "Split launch, board, and course tools into one fast race workspace.",
      tooltip: raceEvent ? getMenuOverviewTooltip(state, raceEvent) : "Pick a line and launch in seconds.",
      chips: [
        raceEvent ? "Strike board live" : "Run cold",
        getGhostReady(state, raceEvent) ? "Ghost ready" : "Ghost cold",
        `${flux} Flux`,
      ],
    },
    garage: {
      eyebrow: "Player garage hub",
      title: "Garage",
      intro: "Garage is the player hub: active chassis, Foundry pressure, style locker, and the pressure log all route from here.",
      tooltip: "Garage is the player hub. Keep the active chassis visible, switch between Foundry, Style, and Career without leaving the player workspace, and use open bays to tempt stronger rolls.",
      chips: [
        `${liveCars} live`,
        `${state.save.garage.length - liveCars} open`,
        selectedCar ? selectedCar.tierLabel : "No car selected",
      ],
    },
    foundry: {
      eyebrow: "Flux into metal",
      title: "Foundry",
      intro: "Keep the forge, readout, and slot pressure in one Foundry split so the Flux decision reads in a single pass.",
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
      intro: "Keep the live loadout and shop grid together so the locker reads like a pit wall instead of a catalog dump.",
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
      intro: "Read the macro snapshot and recent run ledger together so the pressure log stays actionable.",
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
