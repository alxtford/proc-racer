export const SCREEN_SECTION_OPTIONS = {
  race: [
    { id: "launch", label: "Launch" },
    { id: "board", label: "Board" },
    { id: "tools", label: "Tools" },
  ],
  garage: [
    { id: "car", label: "Car" },
    { id: "slots", label: "Slots" },
    { id: "snapshot", label: "Snapshot" },
  ],
  foundry: [
    { id: "forge", label: "Forge" },
    { id: "readout", label: "Readout" },
    { id: "slots", label: "Slots" },
  ],
  style: [
    { id: "loadout", label: "Loadout" },
    { id: "shop", label: "Shop" },
  ],
  career: [
    { id: "snapshot", label: "Snapshot" },
    { id: "runs", label: "Runs" },
  ],
  settings: [
    { id: "comfort", label: "Comfort" },
    { id: "controls", label: "Controls" },
  ],
};

export const SCREEN_SECTION_DEFAULTS = Object.fromEntries(
  Object.entries(SCREEN_SECTION_OPTIONS).map(([screen, options]) => [screen, options[0]?.id || null]),
);

export function createSectionByScreen(initial = {}) {
  return Object.fromEntries(
    Object.keys(SCREEN_SECTION_DEFAULTS).map((screen) => [
      screen,
      normalizeRouteSection(screen, initial[screen] ?? SCREEN_SECTION_DEFAULTS[screen]),
    ]),
  );
}

export function getSectionOptions(screen) {
  return SCREEN_SECTION_OPTIONS[screen] || [];
}

export function normalizeRouteSection(screen, value) {
  const options = getSectionOptions(screen);
  return options.some((option) => option.id === value)
    ? value
    : SCREEN_SECTION_DEFAULTS[screen] || options[0]?.id || null;
}

export function getRouteSection(route, screen = route?.screen) {
  if (!route?.sectionByScreen || !screen) return normalizeRouteSection(screen, null);
  return normalizeRouteSection(screen, route.sectionByScreen[screen]);
}

export function setRouteSection(route, screen, value) {
  if (!route.sectionByScreen) route.sectionByScreen = createSectionByScreen();
  route.sectionByScreen[screen] = normalizeRouteSection(screen, value);
  return route.sectionByScreen[screen];
}
