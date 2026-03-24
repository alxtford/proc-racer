import { createKey } from "./utils.js";
import { createMigratedGarage, createStarterGarage, ensureGarage } from "./garage.js";
import { createDefaultWallet, ensureWallet, STARTING_FLUX } from "./economy.js";
import { ensureStyleLocker } from "./styleLocker.js";

export const SAVE_KEY = "proc-racer-save-v5";
export const SAVE_VERSION = 5;

export function createDefaultSave() {
  const garage = createStarterGarage();
  return ensureStyleLocker(ensureWallet({
    version: SAVE_VERSION,
    unlockedCars: ["grip", "muscle", "interceptor"],
    garage,
    selectedCarId: garage[0]?.id || null,
    wallet: createDefaultWallet(),
    currency: STARTING_FLUX,
    scrap: 0,
    premiumCurrency: 0,
    unlockedCosmetics: [],
    equippedCosmetics: {},
    wins: 0,
    eventProgress: 0,
    bestTimes: {},
    eventResults: {},
    daily: {
      seed: null,
      bestTime: null,
      rewardClaimed: false,
    },
    strikeBoard: {
      seed: 0,
      rerolls: 0,
    },
    customCourseSeeds: {},
    runHistory: [],
    ghostRuns: {},
    settings: {
      reducedShake: false,
      highContrast: false,
      assistLevel: "standard",
      tutorialCompleted: false,
      masterVolume: 0.65,
      muted: false,
      controlMode: "hybrid",
      controls: {},
    },
  }));
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
      || localStorage.getItem("proc-racer-save-v4")
      || localStorage.getItem("proc-racer-save-v1");
    if (!raw) return ensureStyleLocker(ensureWallet(ensureGarage(createDefaultSave())));
    const parsed = JSON.parse(raw);
    return migrateSave(parsed);
  } catch (error) {
    return ensureStyleLocker(ensureWallet(ensureGarage(createDefaultSave())));
  }
}

export function persistSave(save) {
  ensureStyleLocker(ensureWallet(save));
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function migrateSave(rawSave) {
  if (rawSave.version === SAVE_VERSION) {
    return ensureStyleLocker(ensureWallet(ensureGarage({
      ...createDefaultSave(),
      ...rawSave,
      daily: { ...createDefaultSave().daily, ...rawSave.daily },
      strikeBoard: { ...createDefaultSave().strikeBoard, ...rawSave.strikeBoard },
      customCourseSeeds: { ...createDefaultSave().customCourseSeeds, ...(rawSave.customCourseSeeds || {}) },
      settings: { ...createDefaultSave().settings, ...rawSave.settings },
    })));
  }
  const migrated = createDefaultSave();
  migrated.garage = createMigratedGarage(rawSave);
  migrated.selectedCarId = migrated.garage[0]?.id || null;
  migrated.wallet = {
    ...createDefaultWallet(),
    flux: rawSave.wallet?.flux ?? rawSave.currency ?? STARTING_FLUX + (rawSave.wins || 0) * 55 + (rawSave.eventProgress || 0) * 20,
    scrap: rawSave.wallet?.scrap ?? rawSave.scrap ?? 0,
    premium: rawSave.wallet?.premium ?? rawSave.premiumCurrency ?? 0,
  };
  migrated.unlockedCosmetics = rawSave.unlockedCosmetics || migrated.unlockedCosmetics;
  migrated.equippedCosmetics = { ...migrated.equippedCosmetics, ...(rawSave.equippedCosmetics || {}) };
  migrated.unlockedCars = rawSave.unlockedCars || migrated.unlockedCars;
  migrated.wins = rawSave.wins || 0;
  migrated.eventProgress = rawSave.eventProgress || 0;
  migrated.bestTimes = rawSave.bestTimes || {};
  migrated.eventResults = rawSave.eventResults || migrated.eventResults;
  migrated.runHistory = rawSave.runHistory || migrated.runHistory;
  migrated.ghostRuns = rawSave.ghostRuns || migrated.ghostRuns;
  migrated.customCourseSeeds = { ...migrated.customCourseSeeds, ...(rawSave.customCourseSeeds || {}) };
  if (rawSave.dailyBest) {
    migrated.daily.bestTime = rawSave.dailyBest;
  }
  migrated.strikeBoard = { ...migrated.strikeBoard, ...(rawSave.strikeBoard || {}) };
  migrated.settings = { ...migrated.settings, ...(rawSave.settings || {}) };
  return ensureStyleLocker(ensureWallet(ensureGarage(migrated)));
}

export function pushRunHistory(save, runSummary) {
  save.runHistory.unshift(runSummary);
  save.runHistory = save.runHistory.slice(0, 24);
}

export function getGhostKey(eventId, carId) {
  return createKey(eventId, carId);
}
