import {
  createSectionByScreen,
  getRouteSection,
} from "./sections.js";

export const MENU_STAGE_SPLASH = "splash";
export const MENU_STAGE_HUB = "hub";

export const MENU_SCREENS = [
  "race",
  "garage",
  "foundry",
  "style",
  "career",
  "settings",
];

const SCREEN_ALIASES = {
  home: "race",
  profile: "garage",
  settings: "settings",
};

const LEGACY_VIEW_BY_SCREEN = {
  race: "home",
  garage: "profile",
  foundry: "profile",
  style: "profile",
  career: "profile",
  settings: "settings",
};

export function normalizeMenuStage(value) {
  return value === MENU_STAGE_SPLASH ? MENU_STAGE_SPLASH : MENU_STAGE_HUB;
}

export function normalizeMenuScreen(value) {
  const next = SCREEN_ALIASES[value] || value;
  return MENU_SCREENS.includes(next) ? next : "race";
}

export function getLegacyMenuView(screen) {
  return LEGACY_VIEW_BY_SCREEN[screen] || "home";
}

export function createRouteState(state) {
  return {
    stage: normalizeMenuStage(state.menuStage),
    screen: normalizeMenuScreen(state.menuScreen || state.menuView),
    sectionByScreen: createSectionByScreen({
      race: state.homePane,
      foundry: state.foundryPane,
      settings: state.settingsPane,
    }),
    boardPage: null,
    styleSlot: "skin",
    stylePage: 0,
    resultsPane: "summary",
  };
}

export function syncRuntimeMenuState(state, route) {
  state.menuStage = route.stage;
  state.menuScreen = route.screen;
  state.menuView = getLegacyMenuView(route.screen);
  state.menuSection = getRouteSection(route);
}

export function getLegacyPaneState(route) {
  const raceSection = getRouteSection(route, "race");
  const foundrySection = getRouteSection(route, "foundry");
  const settingsSection = getRouteSection(route, "settings");
  return {
    homePane: route.screen === "race"
      ? raceSection === "board"
        ? "board"
        : raceSection === "tools"
          ? "board"
          : "launch"
      : "launch",
    profilePane: route.screen === "garage"
      ? "garage"
      : route.screen === "foundry"
        ? "foundry"
        : route.screen === "style"
          ? "style"
          : route.screen === "career"
            ? "career"
            : "garage",
    foundryPane: route.screen === "foundry"
      ? foundrySection === "readout"
        ? "readout"
        : "forge"
      : "forge",
    settingsPane: route.screen === "settings" ? settingsSection : "comfort",
  };
}
