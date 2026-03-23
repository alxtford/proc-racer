import { createAudioSystem } from "./core/audio.js";
import { getControlBinding } from "./core/controls.js";
import { COURSE_REROLL_COST, getCurrencyBalance, grantCurrency, purchaseStoreProduct } from "./core/economy.js";
import { EventBus } from "./core/eventBus.js";
import {
  calculateRaceReward,
  getFilledGarageCars,
  generateGarageRoll,
  getGarageCar,
  getGarageSlotIndex,
  isGarageSlotFilled,
  getScrapValue,
  getRollReadyStatus,
  toRuntimeCarDef,
} from "./core/garage.js";
import { buildTrack, getSectorAtProgress, nearestPathInfo, samplePath, sampleTrackHeight } from "./core/generator.js";
import { buildIsoRibbon, ISO_PROJECTION, projectIsoPoint } from "./core/isometric.js";
import { computeLeaderboard, createCar, finalizeFinish, handleCarCollisions, integrateCar, updatePickupRespawns } from "./core/gameplay.js";
import { getGhostKey, loadSave, persistSave, pushRunHistory } from "./core/save.js";
import { buyCosmetic, equipCosmetic, getEquippedCosmeticDefs, getGarageCarStyle } from "./core/styleLocker.js";
import { buildRunSummary, createUi } from "./core/ui.js";
import { clamp, createKey, createRng, lerp, normalize, pickOne, TAU } from "./core/utils.js";
import { BIOME_DEFS, CAR_DEFS, PICKUP_DEFS, EVENT_TEMPLATES, createDailyEvent } from "./data/content.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const bus = new EventBus();
const initialSave = loadSave();
const STRIKE_BOARD_TEMPLATE_IDS = new Set(EVENT_TEMPLATES.filter((event) => !event.guided).map((event) => event.id));
const DAILY_EVENT_ID = "daily-rift";
const FIELD_CLOSE_MIN_HOLD = 1.2;
const FIELD_CLOSE_HARD_LIMIT = 5.5;
const MAX_CUSTOM_COURSE_SEED = 4294967295;

const state = {
  mode: "menu",
  keys: new Set(),
  width: 1280,
  height: 720,
  pixelRatio: 1,
  viewScale: 1,
  camera: { x: 0, y: 0, z: 0, shake: 0, jitterX: 0, jitterY: 0 },
  selectedEventIndex: 0,
  selectedCarId: initialSave.selectedCarId,
  menuStage: "splash",
  menuScreen: "race",
  menuView: "home",
  bindingAction: null,
  events: [],
  currentEvent: null,
  track: null,
  player: null,
  cars: [],
  debris: [],
  fx: [],
  screenBursts: [],
  pickups: [],
  hazards: [],
  finishTime: null,
  elapsed: 0,
  ambientTime: 0,
  countdown: 0,
  countdownTick: 3,
  finishFinalizeTimer: 0,
  finishCloseBannerShown: false,
  slowMo: 0,
  lastTick: 0,
  fixedStep: 1 / 60,
  save: initialSave,
  pendingResult: null,
  runPickupCounts: {},
  currentRunSamples: [],
  ghostPlayback: null,
  ghostRecordTimer: 0,
  lastPlace: null,
  warningTier: 0,
  currentSector: null,
  currentSectorId: null,
  rivalStatus: null,
  lastRivalPhase: "",
  garageRoll: null,
  garageRollTimers: [],
  gamepad: {
    connected: false,
    name: "",
    steer: 0,
    accel: 0,
    brake: 0,
    pickup: false,
    pause: false,
  },
  gamepadPauseLatch: false,
};

const audio = createAudioSystem(bus, () => state);

function applyMenuScreen(screen) {
  state.menuScreen = screen;
  state.menuView = screen === "race" ? "home" : screen === "settings" ? "settings" : "profile";
}

const ui = createUi(state, {
  onStartSelected: () => startSelectedRace(),
  onStartDaily: () => startDailyRace(),
  onQuickRace: () => startQuickRace(),
  onBoardReroll: () => rerollStrikeBoard(),
  onCustomCourseSeedApply: (value) => applyCustomCourseSeed(value),
  onCustomCourseSeedClear: () => clearCustomCourseSeed(),
  onRetry: () => retryRace(),
  onBackToMenu: () => backToMenu(),
  onEnterGarage: () => enterGarage(),
  onPauseResume: () => togglePause(false),
  onPauseRetry: () => retryRace(),
  onPauseMenu: () => backToMenu(),
  onMenuScreenChange: (screen) => applyMenuScreen(screen),
  onMenuViewChange: (view) => { state.menuView = view; },
  onSettingChange: (key, value) => applySetting(key, value),
  onBindingStart: (action) => beginBinding(action),
  onEventSelect: (index) => {
    state.selectedEventIndex = index;
    ui.syncMenu();
  },
  onCarSelect: (carId) => {
    state.selectedCarId = carId;
    state.save.selectedCarId = carId;
    persistSave(state.save);
    ui.syncMenu();
  },
  onGarageRollStart: () => startGarageRoll(),
  onGarageRollToggle: (slotIndex) => toggleGarageRollSlot(slotIndex),
  onGarageRollAssign: (offerSlotIndex, targetSlotIndex) => assignGarageRollSlot(offerSlotIndex, targetSlotIndex),
  onGarageRollConfirm: () => confirmGarageRoll(),
  onGarageRollClose: () => closeGarageRoll(),
  onCosmeticBuy: (itemId) => buyStyleItem(itemId),
  onCosmeticEquip: (itemId) => equipStyleItem(itemId),
});

function setMode(nextMode) {
  state.mode = nextMode;
  audio.setMode(nextMode);
}

function getSelectedGarageCar() {
  return getGarageCar(state.save, state.selectedCarId) || getFilledGarageCars(state.save)[0] || null;
}

function syncSelectedGarageCar() {
  if (!getSelectedGarageCar()) {
    state.selectedCarId = getFilledGarageCars(state.save)[0]?.id || null;
  }
  state.save.selectedCarId = state.selectedCarId;
}

function clearGarageRollTimers() {
  for (const timerId of state.garageRollTimers) {
    window.clearTimeout(timerId);
  }
  state.garageRollTimers = [];
}

function getAssignedGarageRollTargets(assignments = {}, excludeOfferSlotIndex = null) {
  return new Set(Object.entries(assignments)
    .filter(([offerSlotIndex, targetSlotIndex]) => Number(offerSlotIndex) !== excludeOfferSlotIndex && Number.isInteger(targetSlotIndex))
    .map(([, targetSlotIndex]) => targetSlotIndex));
}

function getDefaultGarageRollTarget(offerSlotIndex, assignments = {}, excludeOfferSlotIndex = null) {
  const takenTargets = getAssignedGarageRollTargets(assignments, excludeOfferSlotIndex);
  if (!takenTargets.has(offerSlotIndex)) return offerSlotIndex;
  for (let slotIndex = 0; slotIndex < state.save.garage.length; slotIndex += 1) {
    if (!takenTargets.has(slotIndex)) return slotIndex;
  }
  return offerSlotIndex;
}

function ensureStrikeBoardState() {
  const current = state.save.strikeBoard || {};
  state.save.strikeBoard = {
    seed: Number.isFinite(Number(current.seed)) ? Number(current.seed) : 0,
    rerolls: Number.isFinite(Number(current.rerolls)) ? Number(current.rerolls) : 0,
  };
  return state.save.strikeBoard;
}

function ensureCustomCourseSeedState(save = state.save) {
  if (!save.customCourseSeeds || typeof save.customCourseSeeds !== "object" || Array.isArray(save.customCourseSeeds)) {
    save.customCourseSeeds = {};
  }
  return save.customCourseSeeds;
}

function getEventTemplateId(event) {
  return event?.templateId || event?.id || null;
}

function supportsCustomCourseSeed(event) {
  return Boolean(event) && !event.daily;
}

function normalizeCustomCourseSeed(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return clamp(Math.abs(Math.trunc(numeric)), 0, MAX_CUSTOM_COURSE_SEED);
}

function getSavedCustomCourseSeed(event, save = state.save) {
  if (!supportsCustomCourseSeed(event)) return null;
  const templateId = getEventTemplateId(event);
  if (!templateId) return null;
  return normalizeCustomCourseSeed(ensureCustomCourseSeedState(save)[templateId]);
}

function buildCustomSeedEvent(event, customSeed) {
  if (!supportsCustomCourseSeed(event) || customSeed === null) return event;
  const templateId = getEventTemplateId(event);
  if (!templateId) return event;
  if (customSeed === event.seed) {
    return {
      ...event,
      templateId,
      customSeed: true,
      customSeedValue: customSeed,
      customSeedMatchesBoard: true,
    };
  }
  return {
    ...event,
    templateId,
    id: `${templateId}@seed:${customSeed}`,
    seed: customSeed,
    customSeed: true,
    customSeedValue: customSeed,
    customSeedMatchesBoard: false,
  };
}

function getResolvedEvent(event, save = state.save) {
  const customSeed = getSavedCustomCourseSeed(event, save);
  if (customSeed === null) return event;
  return buildCustomSeedEvent(event, customSeed);
}

function createStrikeBoardEvent(template, slotIndex, boardSeed) {
  if (!boardSeed || template.guided) return template;
  const remixSeed = ((template.seed * 1103515245) ^ (boardSeed * (slotIndex + 3)) ^ ((slotIndex + 1) * 2654435761)) >>> 0;
  return {
    ...template,
    templateId: template.id,
    id: `${template.id}@board:${boardSeed}`,
    seed: remixSeed || template.seed,
    boardSeed,
    boardRerolled: true,
  };
}

function buildStrikeBoardEvents(boardSeed) {
  return EVENT_TEMPLATES.map((template, slotIndex) => createStrikeBoardEvent(template, slotIndex, boardSeed));
}

function isBoardScopedEventId(eventId) {
  return typeof eventId === "string" && (eventId.includes("@board:") || STRIKE_BOARD_TEMPLATE_IDS.has(eventId));
}

function pruneBoardScopedProgress(save, liveEventIds) {
  Object.keys(save.eventResults || {}).forEach((eventId) => {
    if (isBoardScopedEventId(eventId) && !liveEventIds.has(eventId)) delete save.eventResults[eventId];
  });
  Object.keys(save.bestTimes || {}).forEach((key) => {
    const [eventId] = key.split("::");
    if (isBoardScopedEventId(eventId) && !liveEventIds.has(eventId)) delete save.bestTimes[key];
  });
  Object.keys(save.ghostRuns || {}).forEach((key) => {
    const [eventId] = key.split("::");
    if (isBoardScopedEventId(eventId) && !liveEventIds.has(eventId)) delete save.ghostRuns[key];
  });
}

function clearDailyProgress(save) {
  delete save.eventResults?.[DAILY_EVENT_ID];
  Object.keys(save.bestTimes || {}).forEach((key) => {
    if (key === DAILY_EVENT_ID || key.startsWith(`${DAILY_EVENT_ID}::`)) delete save.bestTimes[key];
  });
  Object.keys(save.ghostRuns || {}).forEach((key) => {
    if (key === DAILY_EVENT_ID || key.startsWith(`${DAILY_EVENT_ID}::`)) delete save.ghostRuns[key];
  });
}

function enterGarage() {
  window.setTimeout(() => {
    if (state.mode !== "menu") return;
    state.menuStage = "hub";
    applyMenuScreen("race");
    ui.syncMenu();
  }, 90);
}

function createEvents() {
  const strikeBoard = ensureStrikeBoardState();
  ensureCustomCourseSeedState();
  const dailyEvent = createDailyEvent(new Date());
  if (state.save.daily.seed !== dailyEvent.seed) {
    clearDailyProgress(state.save);
    state.save.daily = {
      seed: dailyEvent.seed,
      bestTime: null,
      rewardClaimed: false,
    };
    persistSave(state.save);
  }
  state.events = [...buildStrikeBoardEvents(strikeBoard.seed), dailyEvent];
  if (!state.save.settings.tutorialCompleted) state.selectedEventIndex = 0;
  else state.selectedEventIndex = clamp(state.save.eventProgress || 1, 1, state.events.length - 1);
  syncSelectedGarageCar();
}

function hydrateRunSummary(result) {
  const existing = state.save.eventResults[result.eventId] || {};
  state.save.eventResults[result.eventId] = {
    bestPlace: existing.bestPlace ? Math.min(existing.bestPlace, result.place) : result.place,
    bestTime: existing.bestTime ? Math.min(existing.bestTime, result.finishTime) : result.finishTime,
    goalsMet: Math.max(existing.goalsMet || 0, result.goalsMet),
    medal: result.medal || (result.place === 1 && result.goalsMet >= 2 ? "Gold" : result.place <= 3 || result.goalsMet >= 2 ? "Silver" : "Steel"),
    completions: (existing.completions || 0) + 1,
  };
  if (result.event.daily) {
    state.save.daily.seed = result.seed;
    state.save.daily.bestTime = state.save.daily.bestTime ? Math.min(state.save.daily.bestTime, result.finishTime) : result.finishTime;
  }
  if (result.place === 1) {
    state.save.wins += 1;
    state.save.eventProgress = Math.max(state.save.eventProgress, state.selectedEventIndex + 1);
  }
  if (result.event.guided && result.tutorialPickupMet) state.save.settings.tutorialCompleted = true;
  const bestKey = createKey(result.eventId, result.carId);
  state.save.bestTimes[bestKey] = state.save.bestTimes[bestKey] ? Math.min(state.save.bestTimes[bestKey], result.finishTime) : result.finishTime;
  result.currencyEarned = calculateRaceReward(result);
  grantCurrency(state.save, "flux", result.currencyEarned);
  result.postRaceFlux = getCurrencyBalance(state.save, "flux");
  result.postRaceScrap = getCurrencyBalance(state.save, "scrap");
  const style = getEquippedCosmeticDefs(state.save);
  result.emoteBadge = style.emote?.badge || "STEEL SET";
  result.emoteName = style.emote?.name || "Cold Stare";
  pushRunHistory(state.save, {
    timestamp: new Date().toISOString(),
    eventId: result.eventId,
    eventName: result.event.name,
    seed: result.seed,
    carId: result.carId,
    carName: result.carName,
    place: result.place,
    finishTime: result.finishTime,
    bestLapTime: result.playerBestLap,
    respawns: result.respawns,
    wallHits: result.wallHits,
    pickupUses: result.pickupUses,
    pulseHits: result.pulseHits,
    wrecks: result.destroyedCount,
    currencyEarned: result.currencyEarned,
  });
}

function startRace(eventIndex, carId) {
  const selectedCar = getGarageCar(state.save, carId);
  if (!selectedCar) return;
  const style = getGarageCarStyle(state.save, selectedCar);
  state.selectedEventIndex = eventIndex;
  state.selectedCarId = selectedCar.id;
  if (state.save.selectedCarId !== selectedCar.id) {
    state.save.selectedCarId = selectedCar.id;
    persistSave(state.save);
  }
  state.currentEvent = getResolvedEvent(state.events[eventIndex]);
  state.track = buildTrack(state.currentEvent);
  state.player = createCar({
    id: selectedCar.id,
    label: selectedCar.name,
    tierLabel: selectedCar.tierLabel,
    def: toRuntimeCarDef(selectedCar),
    visuals: style,
  }, true, 0, state.track, "stable", state.currentEvent.id);
  state.player.invuln = 1.2;
  state.player.assistTimer = 1.3;
  if (state.currentEvent.guided && !state.save.settings.tutorialCompleted) state.player.pickup = "shield";
  state.cars = [state.player];
  const rng = createRng(state.currentEvent.seed ^ 0x9911);
  for (let i = 0; i < state.currentEvent.aiCount; i += 1) {
    state.cars.push(createCar(pickOne(rng, Object.keys(CAR_DEFS)), false, i + 1, state.track, pickOne(rng, state.currentEvent.aiProfiles), state.currentEvent.id));
  }
  const rivals = state.cars.filter((car) => !car.isPlayer && car.aiProfileId !== "rookie");
  const rivalCar = rivals.length ? pickOne(rng, rivals) : null;
  if (rivalCar) rivalCar.rival = true;
  state.pickups = state.track.pickups.map((pickup) => ({ ...pickup }));
  state.hazards = state.track.hazards.map((hazard) => ({ ...hazard }));
  state.debris = [];
  state.fx = [];
  state.finishTime = null;
  state.elapsed = 0;
  state.countdown = 3;
  state.countdownTick = 3;
  state.finishFinalizeTimer = 0;
  state.finishCloseBannerShown = false;
  setMode("race");
  state.pendingResult = null;
  state.bindingAction = null;
  state.runPickupCounts = {};
  state.currentRunSamples = [];
  state.ghostRecordTimer = 0;
  state.lastPlace = null;
  state.warningTier = 0;
  state.currentSector = null;
  state.currentSectorId = null;
  state.rivalStatus = rivalCar ? {
    phase: "marked",
    text: `${rivalCar.label} marked`,
    tone: "danger",
    name: rivalCar.label,
  } : null;
  state.lastRivalPhase = "";
  state.slowMo = 0;
  state.keys.clear();
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.ghostPlayback = state.save.ghostRuns[getGhostKey(state.currentEvent.id, state.selectedCarId)] || null;
  ui.hideResults();
  ui.setPauseOpen(false);
  ui.setMenuOpen(false);
  ui.showBanner("3", 0.9, "countdown");
  ui.showToast(state.currentEvent.guided ? "Aegis loaded. Burn it early." : rivalCar ? `${rivalCar.label} wants your line.` : "Launch hard. Break the line.", rivalCar ? "danger" : "neutral", 1.5);
}

function startSelectedRace() {
  startRace(state.selectedEventIndex, state.selectedCarId);
}

function startDailyRace() {
  const dailyIndex = state.events.findIndex((event) => event.daily);
  if (dailyIndex < 0) return;
  state.selectedEventIndex = dailyIndex;
  ui.syncMenu();
  startSelectedRace();
}

function startQuickRace() {
  const garage = getFilledGarageCars(state.save);
  const rng = createRng(Date.now());
  const candidateEvents = state.events.filter((event) => !event.guided && !event.daily);
  if (!candidateEvents.length || !garage.length) return;
  const chosen = candidateEvents[Math.floor(rng() * candidateEvents.length)];
  state.selectedEventIndex = state.events.findIndex((event) => event.id === chosen.id);
  state.selectedCarId = garage[Math.floor(rng() * garage.length)]?.id || state.selectedCarId;
  ui.syncMenu();
  startSelectedRace();
}

function applyCustomCourseSeed(value) {
  const event = state.events[state.selectedEventIndex];
  if (!supportsCustomCourseSeed(event)) return;
  const templateId = getEventTemplateId(event);
  if (!templateId) return;
  const nextSeed = normalizeCustomCourseSeed(value);
  const customCourseSeeds = ensureCustomCourseSeedState();
  if (nextSeed === null) {
    if (customCourseSeeds[templateId] !== undefined) {
      delete customCourseSeeds[templateId];
      persistSave(state.save);
      ui.syncMenu();
      ui.showToast("Replay seed cleared", "neutral", 1);
    }
    return;
  }
  customCourseSeeds[templateId] = nextSeed;
  persistSave(state.save);
  ui.syncMenu();
  ui.showToast(`Seed ${nextSeed} locked`, "good", 1);
}

function clearCustomCourseSeed() {
  applyCustomCourseSeed(null);
}

function rerollStrikeBoard() {
  if (state.mode !== "menu" || state.menuStage !== "hub" || state.menuScreen !== "race" || state.garageRoll) return;
  const fluxShortfall = Math.max(0, COURSE_REROLL_COST - getCurrencyBalance(state.save, "flux"));
  if (fluxShortfall > 0) {
    ui.showToast(`${fluxShortfall} Flux short`, "neutral", 1);
    return;
  }
  const purchase = purchaseStoreProduct(state.save, "course_refresh", "flux");
  if (!purchase.ok) return;
  const previousIndex = state.selectedEventIndex;
  const previousEvent = state.events[previousIndex];
  const strikeBoard = ensureStrikeBoardState();
  const rerolls = strikeBoard.rerolls + 1;
  const nextSeed = ((((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0xffffffff) ^ (rerolls * 2654435761)) >>> 0) || rerolls || 1);
  strikeBoard.seed = nextSeed;
  strikeBoard.rerolls = rerolls;
  createEvents();
  const liveBoardIds = new Set(state.events.filter((event) => !event.guided && !event.daily).map((event) => event.id));
  pruneBoardScopedProgress(state.save, liveBoardIds);
  if (previousEvent?.daily) state.selectedEventIndex = state.events.findIndex((event) => event.daily);
  else if (previousEvent?.guided) state.selectedEventIndex = 0;
  else if (!state.save.settings.tutorialCompleted) state.selectedEventIndex = 1;
  else state.selectedEventIndex = clamp(previousIndex, 1, state.events.length - 2);
  persistSave(state.save);
  bus.emit("course_refresh", {
    price: purchase.price,
    rerolls,
    flux: getCurrencyBalance(state.save, "flux"),
  });
  ui.syncMenu();
}

function retryRace() {
  if (state.mode === "paused") ui.setPauseOpen(false);
  if (state.currentEvent) startRace(state.selectedEventIndex, state.selectedCarId);
}

function backToMenu() {
  if (state.currentEvent?.guided && state.save.settings.tutorialCompleted) {
    state.selectedEventIndex = clamp(state.save.eventProgress || 1, 1, state.events.length - 1);
  }
  clearGarageRollTimers();
  state.garageRoll = null;
  state.keys.clear();
  state.menuStage = "hub";
  applyMenuScreen("race");
  state.bindingAction = null;
  setMode("menu");
  state.pendingResult = null;
  ui.hideResults();
  ui.setPauseOpen(false);
  ui.setMenuOpen(true);
  ui.syncMenu();
}

function startGarageRoll() {
  if (state.mode !== "menu" || state.menuScreen !== "foundry" || !getRollReadyStatus(state.save) || state.garageRoll) return;
  const purchase = purchaseStoreProduct(state.save, "garage_roll", "flux");
  if (!purchase.ok) return;
  const seed = Date.now();
  state.garageRoll = {
    seed,
    status: "spinning",
    offers: generateGarageRoll(state.save, seed),
    keptSlots: [],
    revealedSlots: [],
    assignments: {},
  };
  persistSave(state.save);
  clearGarageRollTimers();
  bus.emit("garage_roll_start", { seed, price: purchase.price });
  const revealMoments = [920, 1380, 1820];
  revealMoments.forEach((delay, slotIndex) => {
    state.garageRollTimers.push(window.setTimeout(() => {
      if (!state.garageRoll) return;
      state.garageRoll.revealedSlots = [...state.garageRoll.revealedSlots, slotIndex];
      bus.emit("garage_roll_reveal", { slotIndex, offer: state.garageRoll.offers[slotIndex] });
      ui.syncMenu();
    }, delay));
  });
  state.garageRollTimers.push(window.setTimeout(() => {
    if (!state.garageRoll) return;
    state.garageRoll.status = "revealed";
    const autoKeep = state.garageRoll.offers
      .filter((offer) => offer.deltaScore > 0)
      .sort((a, b) => b.deltaScore - a.deltaScore)
      .slice(0, 1)
      .map((offer) => offer.slotIndex);
    state.garageRoll.keptSlots = autoKeep;
    state.garageRoll.assignments = autoKeep.reduce((map, slotIndex) => ({
      ...map,
      [slotIndex]: getDefaultGarageRollTarget(slotIndex),
    }), {});
    ui.syncMenu();
  }, 2140));
  ui.syncMenu();
}

function toggleGarageRollSlot(slotIndex) {
  if (!state.garageRoll || state.garageRoll.status !== "revealed") return;
  const kept = new Set(state.garageRoll.keptSlots);
  const assignments = { ...(state.garageRoll.assignments || {}) };
  if (kept.has(slotIndex)) {
    kept.delete(slotIndex);
    delete assignments[slotIndex];
  } else {
    kept.add(slotIndex);
    assignments[slotIndex] = getDefaultGarageRollTarget(slotIndex, assignments, slotIndex);
  }
  state.garageRoll.keptSlots = [...kept].sort((a, b) => a - b);
  state.garageRoll.assignments = assignments;
  ui.syncMenu();
}

function assignGarageRollSlot(offerSlotIndex, targetSlotIndex) {
  if (!state.garageRoll || state.garageRoll.status !== "revealed") return;
  const kept = new Set(state.garageRoll.keptSlots);
  kept.add(offerSlotIndex);
  const assignments = { ...(state.garageRoll.assignments || {}) };
  Object.entries(assignments).forEach(([otherOfferSlotIndex, assignedTarget]) => {
    if (Number(otherOfferSlotIndex) !== offerSlotIndex && assignedTarget === targetSlotIndex) {
      delete assignments[otherOfferSlotIndex];
      kept.delete(Number(otherOfferSlotIndex));
    }
  });
  assignments[offerSlotIndex] = targetSlotIndex;
  state.garageRoll.keptSlots = [...kept].sort((a, b) => a - b);
  state.garageRoll.assignments = assignments;
  ui.syncMenu();
}

function confirmGarageRoll() {
  if (!state.garageRoll || state.garageRoll.status !== "revealed" || !state.garageRoll.keptSlots.length) return;
  const previousSelectionSlot = getGarageSlotIndex(state.save, state.selectedCarId);
  const keptSlots = new Set(state.garageRoll.keptSlots);
  const assignments = state.garageRoll.assignments || {};
  state.garageRoll.offers.forEach((offer) => {
    if (!keptSlots.has(offer.slotIndex)) return;
    const targetSlot = assignments[offer.slotIndex];
    if (!Number.isInteger(targetSlot)) return;
    state.save.garage[targetSlot] = offer;
  });
  const scrapEarned = state.garageRoll.offers
    .filter((offer) => !keptSlots.has(offer.slotIndex))
    .reduce((sum, offer) => sum + getScrapValue(offer), 0);
  grantCurrency(state.save, "scrap", scrapEarned);
  const replacedSelection = Object.entries(assignments)
    .find(([, targetSlot]) => Number(targetSlot) === previousSelectionSlot);
  if (previousSelectionSlot >= 0 && replacedSelection) {
    state.selectedCarId = state.save.garage[previousSelectionSlot].id;
  } else {
    syncSelectedGarageCar();
  }
  state.save.selectedCarId = state.selectedCarId;
  persistSave(state.save);
  bus.emit("garage_roll_confirm", {
    keptCount: keptSlots.size,
    scrapEarned,
    flux: getCurrencyBalance(state.save, "flux"),
    scrap: getCurrencyBalance(state.save, "scrap"),
  });
  clearGarageRollTimers();
  state.garageRoll = null;
  ui.syncMenu();
}

function closeGarageRoll() {
  if (!state.garageRoll || state.garageRoll.status !== "revealed") return;
  if (state.garageRoll.keptSlots.length) return;
  const bestOffer = [...state.garageRoll.offers].sort((a, b) => b.score - a.score)[0];
  if (bestOffer) toggleGarageRollSlot(bestOffer.slotIndex);
}

function buyStyleItem(itemId) {
  if (state.mode !== "menu" || state.menuScreen !== "style") return;
  const purchase = buyCosmetic(state.save, itemId, "scrap");
  if (!purchase.ok) return;
  persistSave(state.save);
  bus.emit("cosmetic_buy", {
    item: purchase.item,
    currency: purchase.currency,
    price: purchase.price,
    scrap: getCurrencyBalance(state.save, "scrap"),
  });
  ui.syncMenu();
}

function equipStyleItem(itemId) {
  if (state.mode !== "menu" || state.menuScreen !== "style") return;
  const result = equipCosmetic(state.save, itemId);
  if (!result.ok) return;
  persistSave(state.save);
  bus.emit("cosmetic_equip", { item: result.item });
  ui.syncMenu();
}

function applySetting(key, value) {
  if (key === "masterVolume") {
    state.save.settings.masterVolume = clamp(Number(value) || 0, 0, 1);
  } else {
    state.save.settings[key] = value;
  }
  if (key === "controlMode" && value !== "custom") {
    state.bindingAction = null;
  }
  persistSave(state.save);
  audio.setSettings(state.save.settings);
  ui.syncSettingsInputs();
  ui.syncVisualSettings();
  ui.syncMenu();
  if (state.mode === "paused") ui.syncPause();
}

function beginBinding(action) {
  applyMenuScreen("settings");
  state.bindingAction = action;
  ui.syncMenu();
}

function finishBinding(key) {
  if (!state.bindingAction) return;
  state.save.settings.controls = {
    ...state.save.settings.controls,
    [state.bindingAction]: key,
  };
  state.save.settings.controlMode = "custom";
  state.bindingAction = null;
  persistSave(state.save);
  ui.syncMenu();
}

function togglePause(forceOpen) {
  if (state.mode !== "race" && state.mode !== "paused") return;
  const shouldPause = typeof forceOpen === "boolean" ? forceOpen : state.mode === "race";
  state.keys.clear();
  if (shouldPause) {
    setMode("paused");
    ui.setPauseOpen(true);
    ui.syncPause();
  } else {
    setMode("race");
    ui.setPauseOpen(false);
  }
}

function pollGamepad() {
  const pads = navigator.getGamepads?.() || [];
  const pad = Array.from(pads).find(Boolean);
  const wasConnected = state.gamepad.connected;
  if (!pad) {
    state.gamepad = { connected: false, name: "", steer: 0, accel: 0, brake: 0, pickup: false, pause: false };
    state.gamepadPauseLatch = false;
    if (wasConnected && state.mode === "menu") ui.syncMenu();
    if (wasConnected && state.mode === "paused") ui.syncPause();
    return;
  }

  const next = {
    connected: true,
    name: pad.id || "Gamepad",
    steer: pad.axes?.[0] || 0,
    accel: Math.max(pad.buttons?.[7]?.value || 0, pad.buttons?.[5]?.value || 0),
    brake: Math.max(pad.buttons?.[6]?.value || 0, pad.buttons?.[4]?.value || 0),
    pickup: Boolean(pad.buttons?.[0]?.pressed || pad.buttons?.[2]?.pressed),
    pause: Boolean(pad.buttons?.[9]?.pressed),
  };
  state.gamepad = next;
  if (next.pause && !state.gamepadPauseLatch && (state.mode === "race" || state.mode === "paused")) {
    togglePause();
  }
  state.gamepadPauseLatch = next.pause;
  if (!wasConnected && state.mode === "menu") ui.syncMenu();
  if (!wasConnected && state.mode === "paused") ui.syncPause();
}

function isInteractiveShortcutTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("#garage-roll-modal:not(.hidden)")) return true;
  return Boolean(target.closest("input, select, textarea, button, a, [role='button'], [contenteditable='true']"));
}

function canUseMenuHomeShortcut(target) {
  return state.mode === "menu"
    && state.menuStage === "hub"
    && state.menuScreen === "race"
    && !state.garageRoll
    && !isInteractiveShortcutTarget(target);
}

function maybeStoreGhost(result) {
  const ghostKey = getGhostKey(result.eventId, result.carId);
  const best = state.save.ghostRuns[ghostKey];
  if (!best || result.finishTime < best.finishTime) {
    state.save.ghostRuns[ghostKey] = {
      finishTime: result.finishTime,
      samples: state.currentRunSamples.slice(),
    };
  }
}

function finalizeRaceIfNeeded() {
  if (!state.player || state.pendingResult || !state.player.finished) return;
  const allCarsFinished = state.cars.length > 0 && state.cars.every((car) => car.finished);
  if (!allCarsFinished && state.finishFinalizeTimer < FIELD_CLOSE_HARD_LIMIT) return;
  state.finishTime = state.player.finishMs;
  const leaderboard = finalizeFinish({ state });
  const result = buildRunSummary(state, leaderboard);
  hydrateRunSummary(result);
  maybeStoreGhost(result);
  persistSave(state.save);
  state.pendingResult = result;
  setMode("results");
  ui.showResults(result);
  ui.showBanner(result.place === 1 ? "Field broken" : `Finished P${result.place}`, 1.8);
  bus.emit("finish", { result });
}

function handlePlaceChange() {
  if (!state.player || state.mode !== "race") return;
  const leaderboard = computeLeaderboard(state);
  leaderboard.forEach((car, index) => {
    car.place = index + 1;
  });
  if (state.lastPlace === null) {
    state.lastPlace = state.player.place;
    return;
  }
  if (state.player.place !== state.lastPlace) {
    const better = state.player.place < state.lastPlace;
    let message = better ? `Up to P${state.player.place}` : `Dropped to P${state.player.place}`;
    const tone = better ? "good" : "danger";
    if (better && state.player.place === 1 && state.lastPlace !== 1) {
      message = "Lead taken";
    } else if (!better && state.lastPlace === 1) {
      message = "Lead lost";
    } else if (better && state.player.place <= 3 && state.lastPlace > 3) {
      message = "Into the podium";
    } else if (!better && state.player.place > 3 && state.lastPlace <= 3) {
      message = "Podium slipped";
    }
    ui.showToast(message, tone, 1.1);
    bus.emit("place_change", { player: true, better, place: state.player.place, previousPlace: state.lastPlace });
    state.lastPlace = state.player.place;
  }
}

function updateWarnings() {
  if (!state.player) return;
  const pct = state.player.damage / state.player.def.durability;
  const nextTier = pct > 0.82 ? 3 : pct > 0.6 ? 2 : pct > 0.35 ? 1 : 0;
  if (nextTier > state.warningTier) {
    ui.showToast(nextTier === 3 ? "Near destruction" : nextTier === 2 ? "Integrity critical" : "Heavy damage", "danger", 1.2);
  }
  state.warningTier = nextTier;
}

function updateSectorCallouts() {
  if (!state.player || !state.track || state.mode !== "race") return;
  const sectorProgress = state.player.pathT ?? state.player.progress ?? 0;
  const sector = getSectorAtProgress(state.track, sectorProgress);
  if (!sector) return;
  state.currentSector = sector;
  if (state.currentSectorId === sector.id) return;
  state.currentSectorId = sector.id;
  const tone = sector.tag === "hazard" ? "danger" : sector.tag === "recovery" ? "good" : "neutral";
  ui.showBanner(sector.name, 0.7);
  ui.showToast(sector.shortCallout, tone, 1.05);
  bus.emit("sector_enter", { player: true, sectorTag: sector.tag, sectorName: sector.name });
}

function updateRivalPressure() {
  if (!state.player || state.mode !== "race") return;
  const rival = state.cars.find((car) => car.rival);
  if (!rival) {
    state.rivalStatus = null;
    state.lastRivalPhase = "";
    return;
  }
  const raceGap = (state.player.currentLap - rival.currentLap) * 2 + ((state.player.progress || 0) - (rival.progress || 0));
  const physicalGap = Math.hypot(state.player.x - rival.x, state.player.y - rival.y);
  let phase = "cold";
  let text = `${rival.label} live`;
  let tone = "neutral";
  if (rival.destroyed) {
    phase = "shattered";
    text = `${rival.label} shattered`;
    tone = "good";
  } else if (rival.rivalHeat > 0.9 && physicalGap < 240) {
    phase = "vendetta";
    text = `${rival.label} enraged`;
    tone = "danger";
  } else if (raceGap < -0.12 && physicalGap < 170) {
    phase = "nose";
    text = `${rival.label} ahead`;
    tone = "danger";
  } else if (raceGap > 0.08 && physicalGap < 170) {
    phase = "bumper";
    text = `${rival.label} diving`;
    tone = "danger";
  } else if (raceGap < 0) {
    phase = "ahead";
    text = `${rival.label} leads`;
    tone = "danger";
  } else if (raceGap > 0.25) {
    phase = "behind";
    text = `${rival.label} fading`;
    tone = "good";
  }
  state.rivalStatus = {
    phase,
    text,
    tone,
    name: rival.label,
    gap: Number(raceGap.toFixed(2)),
  };
  if (phase !== state.lastRivalPhase) {
    if (phase === "nose") ui.showToast(`${rival.label} on the nose`, "danger", 1.1);
    else if (phase === "bumper") ui.showToast(`${rival.label} on your bumper`, "danger", 1.1);
    else if (phase === "vendetta") ui.showToast(`${rival.label} wants the wreck`, "danger", 1.1);
    else if (phase === "behind" && state.lastRivalPhase && state.lastRivalPhase !== "shattered") ui.showToast(`${rival.label} dropped back`, "good", 1.1);
    else if (phase === "shattered") ui.showToast(`${rival.label} shattered`, "good", 1.2);
    state.lastRivalPhase = phase;
  }
}

function updateGhostRecorder(dt) {
  if (!state.player || state.mode !== "race" || state.countdown > 0 || state.player.finished) return;
  state.ghostRecordTimer += dt;
  if (state.ghostRecordTimer < 0.14) return;
  state.ghostRecordTimer = 0;
  state.currentRunSamples.push({
    t: Number(state.elapsed.toFixed(2)),
    x: Number(state.player.x.toFixed(1)),
    y: Number(state.player.y.toFixed(1)),
    angle: Number(state.player.angle.toFixed(2)),
  });
  state.currentRunSamples = state.currentRunSamples.slice(-1200);
}

function updateRunEffects(dt) {
  for (const car of state.cars) {
    car.speedTrail = car.speedTrail.filter((sample) => {
      sample.age -= dt;
      return sample.age > 0;
    });
    car.effectTimer = Math.max(0, (car.effectTimer || 0) - dt);
    car.smokeTimer = Math.max(0, (car.smokeTimer || 0) - dt);
    car.flameTimer = Math.max(0, (car.flameTimer || 0) - dt);
    car.sparkTimer = Math.max(0, (car.sparkTimer || 0) - dt);
    if (!car.destroyed && car.effectTimer <= 0 && car.driftLevel > 0.35 && Math.hypot(car.vx, car.vy) > 120) {
      state.fx.push({
        kind: "skid",
        x: car.x,
        y: car.y,
        radius: 8 + car.driftLevel * 12,
        length: 18 + car.driftLevel * 20,
        angle: car.angle,
        life: 0.24,
        color: getCarSkidColor(car),
      });
      car.effectTimer = 0.05;
    }
    if (!car.destroyed && car.flameTimer <= 0 && (car.boostTimer > 0 || car.slingshotTimer > 0.16)) {
      emitBoostFlame(car, car.boostTimer > 0 ? 1.2 : 0.9);
      if (car.isPlayer && car.boostTimer > 0) {
        state.fx.push({
          kind: "heat-veil",
          x: car.x + Math.cos(car.angle) * 8,
          y: car.y + Math.sin(car.angle) * 8,
          angle: car.angle,
          radius: 22 + Math.random() * 8,
          life: 0.18,
          maxLife: 0.18,
          color: "#ffb100",
        });
      }
      car.flameTimer = car.boostTimer > 0 ? 0.028 : 0.045;
    }
    if (!car.destroyed && car.effectTimer <= 0 && Math.hypot(car.vx, car.vy) > 250) {
      state.fx.push({ kind: "speed-line", x: car.x, y: car.y, radius: 14, angle: car.angle, life: 0.12, color: getCarTrailColor(car) });
      car.effectTimer = 0.04;
    }
    const damagePct = car.damage / car.def.durability;
    if (!car.destroyed && damagePct > 0.52 && car.smokeTimer <= 0 && Math.hypot(car.vx, car.vy) > 80) {
      state.fx.push({
        kind: "smoke",
        x: car.x - Math.cos(car.angle) * 18,
        y: car.y - Math.sin(car.angle) * 18,
        radius: 14 + damagePct * 8,
        life: 0.65,
        color: getCarAccentColor(car),
        vx: car.vx * 0.08,
        vy: car.vy * 0.08,
      });
      car.smokeTimer = 0.18;
    }
    if (!car.destroyed && car.sparkTimer <= 0 && (car.rivalHeat > 0.95 || damagePct > 0.78)) {
      state.fx.push({
        kind: "spark",
        x: car.x + (Math.random() - 0.5) * 18,
        y: car.y + (Math.random() - 0.5) * 14,
        radius: 8 + Math.random() * 10,
        life: 0.16,
        maxLife: 0.16,
        color: car.rivalHeat > 0.95 ? "#ff5ccb" : "#ffd36e",
      });
      car.sparkTimer = 0.11;
    }
    if (car.destroyed && car.smokeTimer <= 0) {
      state.fx.push({ kind: "smoke", x: car.x, y: car.y, radius: 18, life: 0.9, color: "#8897b0", vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 20 });
      state.fx.push({ kind: "ember", x: car.x + (Math.random() - 0.5) * 26, y: car.y + (Math.random() - 0.5) * 20, radius: 3 + Math.random() * 2, life: 0.45, color: "#ffd36e", vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 20 });
      car.smokeTimer = 0.12;
    }
  }

  state.debris = state.debris.filter((piece) => {
    piece.life -= dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.vx *= 0.985;
    piece.vy *= 0.985;
    return piece.life > 0;
  });
  state.fx = state.fx.filter((effect) => {
    effect.life -= dt;
    if (effect.kind === "pulse") effect.radius = lerp(effect.radius, effect.maxRadius, dt * 8);
    if (effect.kind === "shield") effect.radius += dt * 20;
    if (effect.kind === "shock-diamond") {
      effect.radius += dt * (effect.growth || 54);
      effect.angle += dt * (effect.spin || 3.2);
    }
    if (effect.kind === "heat-veil") {
      effect.radius += dt * 32;
      effect.x += Math.cos(effect.angle || 0) * 20 * dt;
      effect.y += Math.sin(effect.angle || 0) * 20 * dt;
    }
    if (effect.kind === "smoke") {
      effect.radius += dt * 14;
      effect.x += (effect.vx || 0) * dt;
      effect.y += (effect.vy || -16) * dt;
    }
    if (effect.kind === "flame") {
      effect.radius += dt * 10;
      effect.length += dt * 26;
      effect.x += (effect.vx || 0) * dt;
      effect.y += (effect.vy || 0) * dt;
    }
    if (effect.kind === "ember") {
      effect.x += (effect.vx || 0) * dt;
      effect.y += (effect.vy || 0) * dt;
      effect.vx = (effect.vx || 0) * 0.97;
      effect.vy = (effect.vy || 0) * 0.97;
    }
    return effect.life > 0;
  });
  state.screenBursts = state.screenBursts.filter((burst) => {
    burst.timer -= dt;
    return burst.timer > 0;
  });
  state.camera.shake = Math.max(0, state.camera.shake - dt * 18);
}

function updateRace(dt) {
  if (state.mode !== "race") return;
  let raceDt = dt;
  if (state.countdown > 0) {
    const countdownDt = Math.min(dt, state.countdown);
    state.countdown -= dt;
    const nextTick = Math.ceil(Math.max(0, state.countdown));
    if (nextTick < state.countdownTick) {
      state.countdownTick = nextTick;
      if (nextTick > 0) {
        bus.emit("countdown_tick", { tick: nextTick });
        ui.showBanner(String(nextTick), 0.55, "countdown");
      } else {
        bus.emit("race_start", { eventId: state.currentEvent.id });
        ui.showBanner("GO", 0.8, "countdown-go");
      }
    }
    raceDt = Math.max(0, dt - countdownDt);
    if (raceDt <= 0) {
      ui.updateHud();
      ui.updateTimers(dt);
      return;
    }
  }
  state.elapsed += raceDt;

  const ctxRef = { state, bus };
  state.ctx = ctxRef;
  updatePickupRespawns(state, raceDt);
  for (const car of state.cars) integrateCar(ctxRef, car, raceDt);
  handleCarCollisions(ctxRef);
  updateRunEffects(raceDt);
  updateGhostRecorder(raceDt);
  handlePlaceChange();
  updateSectorCallouts();
  updateRivalPressure();
  updateWarnings();
  if (state.player?.finished && !state.pendingResult) {
    const finishedCars = state.cars.filter((car) => car.finished).length;
    const fieldClosed = finishedCars === state.cars.length;
    if (!fieldClosed) {
      state.finishFinalizeTimer += raceDt;
      if (!state.finishCloseBannerShown && state.finishFinalizeTimer >= FIELD_CLOSE_MIN_HOLD) {
        ui.showToast(`${state.cars.length - finishedCars} cars still closing`, "neutral", 1.1);
        state.finishCloseBannerShown = true;
      }
    }
  }
  finalizeRaceIfNeeded();
  ui.updateHud();
  ui.updateTimers(dt);
}

function getGhostSample() {
  if (!state.ghostPlayback?.samples?.length || state.mode !== "race") return null;
  const samples = state.ghostPlayback.samples;
  if (state.elapsed <= samples[0].t) return samples[0];
  if (state.elapsed >= samples[samples.length - 1].t) return samples[samples.length - 1];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const previous = samples[i];
    const next = samples[i + 1];
    if (previous.t <= state.elapsed && next.t >= state.elapsed) {
      const span = Math.max(0.0001, next.t - previous.t);
      const mix = clamp((state.elapsed - previous.t) / span, 0, 1);
      return {
        x: lerp(previous.x, next.x, mix),
        y: lerp(previous.y, next.y, mix),
        angle: lerp(previous.angle, next.angle, mix),
      };
    }
  }
  return null;
}

function getFrameBiome() {
  if (state.track) return state.track.theme;
  const event = state.events[state.selectedEventIndex];
  return BIOME_DEFS[event?.biomeId || "industrial"];
}

function getTrackBounds(track) {
  if (!track) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  if (track.bounds) return track.bounds;
  track.bounds = track.points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return track.bounds;
}

function withAlpha(color, alpha) {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map((value) => value + value).join("");
    const value = Number.parseInt(hex, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  return color;
}

function queueScreenBurst(color, strength = 0.12, duration = 0.42, mode = "radial") {
  state.screenBursts.push({
    color,
    strength,
    duration,
    timer: duration,
    mode,
  });
  state.screenBursts = state.screenBursts.slice(-8);
}

function emitShardBurst(x, y, color, count = 9, biasAngle = 0, spread = TAU * 0.8, speedMin = 90, speedMax = 240) {
  for (let index = 0; index < count; index += 1) {
    const mix = count <= 1 ? 0.5 : index / (count - 1);
    const angle = biasAngle - spread * 0.5 + spread * mix + (Math.random() - 0.5) * 0.26;
    const speed = lerp(speedMin, speedMax, 0.2 + Math.random() * 0.8);
    state.debris.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 5,
      life: 0.45 + Math.random() * 0.4,
      color,
      streak: true,
    });
  }
}

function spawnImpactBloom(x, y, color, angle = 0, radius = 22, life = 0.3, kind = "shock-diamond") {
  state.fx.push({
    kind,
    x,
    y,
    angle,
    radius,
    growth: radius * 2.8,
    spin: 2.8 + Math.random() * 1.6,
    life,
    maxLife: life,
    color,
  });
}

function emitBoostFlame(car, intensity = 1) {
  const rearX = car.x - Math.cos(car.angle) * (car.length * 0.62);
  const rearY = car.y - Math.sin(car.angle) * (car.length * 0.62);
  state.fx.push({
    kind: "flame",
    x: rearX,
    y: rearY,
    angle: car.angle + Math.PI,
    radius: (6 + Math.random() * 3) * intensity,
    length: (18 + Math.random() * 12) * intensity,
    life: 0.16 + Math.random() * 0.06,
    maxLife: 0.22,
    color: car.boostTimer > 0 ? "#ffb100" : "#8df7ff",
    vx: car.vx * 0.16,
    vy: car.vy * 0.16,
  });
}

function drawGateLine(gate, accent = "#8df7ff") {
  if (!gate) return;
  const totalWidth = gate.halfWidth * 2;
  const blockCount = Math.max(10, Math.round(totalWidth / 28));
  const blockWidth = totalWidth / blockCount;
  const thickness = 18;

  ctx.save();
  ctx.translate(gate.x, gate.y);
  ctx.rotate(gate.angle + Math.PI / 2);
  ctx.shadowBlur = 24;
  ctx.shadowColor = withAlpha(accent, 0.48);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = withAlpha(accent, 0.82);
  ctx.fillStyle = withAlpha(accent, 0.18);
  ctx.fillRect(-gate.halfWidth, -thickness * 0.9, totalWidth, thickness * 1.8);
  ctx.strokeRect(-gate.halfWidth, -thickness * 0.9, totalWidth, thickness * 1.8);

  for (let index = 0; index < blockCount; index += 1) {
    const x = -gate.halfWidth + index * blockWidth;
    ctx.fillStyle = index % 2 === 0 ? "rgba(247,242,255,0.96)" : withAlpha(accent, 0.9);
    ctx.fillRect(x, -thickness * 0.62, blockWidth + 1, thickness * 1.24);
  }

  ctx.beginPath();
  ctx.moveTo(-gate.halfWidth, 0);
  ctx.lineTo(gate.halfWidth, 0);
  ctx.strokeStyle = withAlpha("#ffffff", 0.72);
  ctx.stroke();
  ctx.restore();
}

function buildTrackScene(track) {
  if (!track) return null;
  if (track.sceneLayer) return track.sceneLayer;
  const isCircuit = track.type === "circuit";
  const seedBase = Number.isFinite(Number(track.seed)) ? Number(track.seed) : track.points.length * 97;
  const rng = createRng(seedBase >>> 0);
  const sampleCount = clamp(Math.round(track.points.length * (isCircuit ? 1.45 : 1.18)), 18, 48);
  const samples = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const center = samplePath(track.points, t, isCircuit);
    const prev = samplePath(track.points, clamp(t - 0.012, 0, 1), isCircuit);
    const next = samplePath(track.points, clamp(t + 0.012, 0, 1), isCircuit);
    const prevDir = normalize(center.x - prev.x, center.y - prev.y) || { x: 1, y: 0 };
    const nextDir = normalize(next.x - center.x, next.y - center.y) || prevDir;
    const tangent = normalize(prevDir.x + nextDir.x, prevDir.y + nextDir.y) || nextDir;
    const normal = { x: -tangent.y, y: tangent.x };
    const curve = clamp(prevDir.x * nextDir.y - prevDir.y * nextDir.x, -1, 1);
    const curveAbs = Math.abs(curve);
    const straightness = 1 - clamp(curveAbs * 2.25, 0, 1);
    const sector = getSectorAtProgress(track, t);

    samples.push({
      t,
      seed: rng(),
      center,
      tangent,
      normal,
      curve,
      curveAbs,
      straightness,
      outerSide: curve >= 0 ? 1 : -1,
      sectorTag: sector?.tag || "technical",
    });
  }

  track.sceneLayer = { samples, offsetPolygons: {} };
  return track.sceneLayer;
}

function getTrackOffsetPolygon(track, offset) {
  const scene = buildTrackScene(track);
  if (!scene?.samples?.length) return [];
  const key = offset.toFixed(1);
  if (scene.offsetPolygons[key]) return scene.offsetPolygons[key];

  const left = [];
  const right = [];
  for (const sample of scene.samples) {
    left.push({
      x: sample.center.x + sample.normal.x * offset,
      y: sample.center.y + sample.normal.y * offset,
    });
    right.push({
      x: sample.center.x - sample.normal.x * offset,
      y: sample.center.y - sample.normal.y * offset,
    });
  }

  const polygon = [...left, ...right.reverse()];
  scene.offsetPolygons[key] = polygon;
  return polygon;
}

function withOutsideTrackClip(track, padding, draw) {
  if (!track) return;
  const polygon = getTrackOffsetPolygon(track, track.width * 0.5 + padding);
  const bounds = getTrackBounds(track);
  const margin = Math.max(360, track.width * 3 + padding * 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    bounds.minX - margin,
    bounds.minY - margin,
    bounds.maxX - bounds.minX + margin * 2,
    bounds.maxY - bounds.minY + margin * 2,
  );
  if (polygon.length > 2) {
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let index = 1; index < polygon.length; index += 1) ctx.lineTo(polygon[index].x, polygon[index].y);
    ctx.closePath();
  }
  ctx.clip("evenodd");
  draw();
  ctx.restore();
}

function drawTrackSurfaceLayer(track, theme, time) {
  const scene = buildTrackScene(track);
  if (!scene?.samples?.length) return;
  const samples = scene.samples;
  const edgeOffset = track.width * 0.54;
  const leftEdge = [];
  const rightEdge = [];

  for (const sample of samples) {
    leftEdge.push({
      x: sample.center.x + sample.normal.x * edgeOffset,
      y: sample.center.y + sample.normal.y * edgeOffset,
    });
    rightEdge.push({
      x: sample.center.x - sample.normal.x * edgeOffset,
      y: sample.center.y - sample.normal.y * edgeOffset,
    });
  }

  const strokePath = (points, color, width, dash = null, alpha = 1) => {
    ctx.save();
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 12;
    ctx.shadowColor = withAlpha(color, alpha * 0.6);
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  };

  strokePath(leftEdge, "#000000", 16, null, 0.22);
  strokePath(rightEdge, "#000000", 16, null, 0.22);
  strokePath(leftEdge, theme.trackEdge, 2, [20, 16], 0.08);
  strokePath(rightEdge, theme.trackEdge, 2, [20, 16], 0.08);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const angle = Math.atan2(sample.tangent.y, sample.tangent.x);
    const paletteColor = sample.sectorTag === "high-speed"
      ? "#ffd36e"
      : sample.sectorTag === "technical"
        ? "#8df7ff"
        : "#50f9d8";

    if (sample.straightness > 0.48 && index % 2 === 0) {
      ctx.save();
      ctx.translate(sample.center.x, sample.center.y);
      ctx.rotate(angle);
      ctx.fillStyle = withAlpha(paletteColor, 0.08 + sample.straightness * 0.04);
      ctx.fillRect(-track.width * 0.22, -2.2, track.width * 0.44, 4.4);
      ctx.restore();
    }

    if (sample.curveAbs > 0.16) {
      const innerOffset = track.width * (0.1 + sample.curveAbs * 0.08);
      const apexX = sample.center.x - sample.normal.x * innerOffset * sample.outerSide;
      const apexY = sample.center.y - sample.normal.y * innerOffset * sample.outerSide;
      ctx.save();
      ctx.translate(apexX, apexY);
      ctx.rotate(angle);
      ctx.strokeStyle = withAlpha(paletteColor, 0.18 + sample.curveAbs * 0.14);
      ctx.lineWidth = 3.2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = withAlpha(paletteColor, 0.3);
      ctx.beginPath();
      ctx.moveTo(-11, -5);
      ctx.lineTo(0, 7);
      ctx.lineTo(11, -5);
      ctx.stroke();
      if (sample.curveAbs > 0.28) {
        ctx.beginPath();
        ctx.moveTo(-19, -2);
        ctx.lineTo(-7, 10);
        ctx.lineTo(7, 10);
        ctx.lineTo(19, -2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(sample.center.x - sample.normal.x * track.width * 0.28 * sample.outerSide, sample.center.y - sample.normal.y * track.width * 0.28 * sample.outerSide);
      ctx.rotate(angle + sample.curve * 0.18);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath();
      ctx.fillRect(-track.width * 0.14, -2.5, track.width * 0.32, 5);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawTrackRoadsideLayer(track, theme, time) {
  const scene = buildTrackScene(track);
  if (!scene?.samples?.length) return;
  const samples = scene.samples;
  const densityDivisor = 3;
  const isCircuit = track.type === "circuit";

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const shouldPlace = index % densityDivisor === 0 || sample.curveAbs > 0.2 || sample.straightness > 0.72;
    if (!shouldPlace) continue;

    const angle = Math.atan2(sample.tangent.y, sample.tangent.x);
    const outerOffset = track.width * (0.92 + sample.curveAbs * 0.28) + 34;
    const innerOffset = track.width * 0.68 + 22;
    const outerX = sample.center.x + sample.normal.x * outerOffset * sample.outerSide;
    const outerY = sample.center.y + sample.normal.y * outerOffset * sample.outerSide;
    const innerX = sample.center.x - sample.normal.x * innerOffset * sample.outerSide;
    const innerY = sample.center.y - sample.normal.y * innerOffset * sample.outerSide;
    const outerSeed = Math.floor(sample.seed * 9973);
    const innerSeed = Math.floor(sample.seed * 7919);
    let outerKind;
    let outerAccent = theme.decoA;
    let outerFill = withAlpha(theme.inside, 0.8);
    let outerRotation = angle + Math.PI / 2;
    let outerSize = 18 + sample.curveAbs * 12;
    let outerHeight = outerSize * 2.1;

    if (theme.id === "industrial") {
      outerKind = sample.curveAbs > 0.18 ? (outerSeed % 3 === 0 ? "tower" : "stack") : (outerSeed % 2 === 0 ? "guardrail" : "barrel");
      outerAccent = sample.sectorTag === "high-speed" ? "#ffd36e" : theme.decoA;
      outerFill = withAlpha(theme.inside, 0.84);
      outerRotation = sample.curveAbs > 0.18 ? angle * 0.08 : angle + Math.PI / 2;
      outerSize = 22 + sample.curveAbs * 16;
      outerHeight = outerSize * 2.5;
    } else if (theme.id === "freeway") {
      outerKind = sample.straightness > 0.66 ? (outerSeed % 4 === 0 ? "billboard" : "lightpost") : (outerSeed % 2 === 0 ? "sign" : "beacon");
      outerAccent = sample.sectorTag === "high-speed" ? "#ffd36e" : theme.trackEdge;
      outerFill = withAlpha(theme.inside, 0.82);
      outerRotation = sample.straightness > 0.66 ? angle + Math.PI / 2 : angle + Math.PI * 0.5;
      outerSize = 24 + sample.straightness * 14;
      outerHeight = outerSize * 2.6;
    } else {
      outerKind = sample.curveAbs > 0.18 ? (outerSeed % 3 === 0 ? "monolith" : "prism") : (outerSeed % 2 === 0 ? "ring" : "beacon");
      outerAccent = sample.sectorTag === "recovery" ? "#50f9d8" : "#8a45ff";
      outerFill = withAlpha("#03040b", 0.88);
      outerRotation = angle * 0.18 + (sample.seed - 0.5) * 0.4;
      outerSize = 22 + sample.curveAbs * 18;
      outerHeight = outerSize * 2.4;
    }

    drawTrackProp({
      kind: outerKind,
      side: "outer",
      x: outerX,
      y: outerY,
      size: outerSize,
      height: outerHeight,
      rotation: outerRotation,
      accent: outerAccent,
      fill: outerFill,
    }, theme, time);

    if (sample.straightness > 0.62 && index % (isCircuit ? 4 : 5) === 0) {
      let innerKind;
      let innerAccent = theme.decoB;
      let innerFill = withAlpha(theme.inside, 0.74);
      let innerRotation = angle + Math.PI / 2;
      let innerSize = 12 + sample.straightness * 10;
      let innerHeight = innerSize * 2.2;

      if (theme.id === "industrial") {
        innerKind = innerSeed % 2 === 0 ? "beacon" : "guardrail";
        innerAccent = "#50f9d8";
      } else if (theme.id === "freeway") {
        innerKind = innerSeed % 2 === 0 ? "lightpost" : "sign";
        innerAccent = sample.sectorTag === "technical" ? "#8df7ff" : "#ffd36e";
      } else {
        innerKind = innerSeed % 2 === 0 ? "beacon" : "ring";
        innerAccent = sample.sectorTag === "recovery" ? "#50f9d8" : "#8df7ff";
        innerFill = withAlpha("#050612", 0.8);
      }

      drawTrackProp({
        kind: innerKind,
        side: "inner",
        x: innerX,
        y: innerY,
        size: innerSize,
        height: innerHeight,
        rotation: innerRotation,
        accent: innerAccent,
        fill: innerFill,
      }, theme, time);
    }

    if (sample.straightness > 0.78 && index % 5 === 0) {
      const accentOffset = track.width * 1.02 + 42 + sample.straightness * 18;
      const accentX = sample.center.x + sample.normal.x * accentOffset * sample.outerSide;
      const accentY = sample.center.y + sample.normal.y * accentOffset * sample.outerSide;
      drawTrackProp({
        kind: theme.id === "freeway" ? "billboard" : theme.id === "industrial" ? "tower" : "beacon",
        side: "outer",
        x: accentX,
        y: accentY,
        size: 18 + sample.straightness * 8,
        height: 26 + sample.straightness * 16,
        rotation: angle + Math.PI / 2,
        accent: sample.sectorTag === "high-speed" ? "#ffd36e" : theme.trackEdge,
        fill: withAlpha(theme.inside, 0.72),
      }, theme, time);
    }
  }
}

function drawScenicFeature(feature, theme, time) {
  const accent = feature.accent || theme.decoA;
  const fill = feature.fill || withAlpha(theme.inside, 0.84);
  const size = feature.size;
  const height = feature.height || size * 1.8;

  ctx.save();
  ctx.translate(feature.x, feature.y);
  ctx.rotate((feature.rotation || 0) + Math.sin(time * 0.18 + feature.y * 0.001) * 0.03);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = withAlpha(accent, 0.56);
  ctx.fillStyle = fill;
  ctx.shadowBlur = 22;
  ctx.shadowColor = withAlpha(accent, 0.24);

  if (feature.kind === "city-block") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.54, height * 0.5);
    ctx.lineTo(-size * 0.46, -height * 0.48);
    ctx.lineTo(size * 0.46, -height * 0.5);
    ctx.lineTo(size * 0.58, height * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = withAlpha(accent, 0.34);
    for (let row = 0; row < 4; row += 1) {
      const y = -height * 0.26 + row * (height * 0.18);
      ctx.beginPath();
      ctx.moveTo(-size * 0.32, y);
      ctx.lineTo(size * 0.32, y);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha("#ffffff", 0.16);
    for (let col = -1; col <= 1; col += 1) {
      ctx.beginPath();
      ctx.moveTo(col * size * 0.18, -height * 0.34);
      ctx.lineTo(col * size * 0.18, height * 0.3);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(accent, 0.52);
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.52);
    ctx.lineTo(0, -height * 0.76);
    ctx.stroke();
  } else if (feature.kind === "crane") {
    ctx.strokeStyle = withAlpha(accent, 0.44);
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, height * 0.5);
    ctx.lineTo(-size * 0.12, -height * 0.44);
    ctx.lineTo(size * 0.42, -height * 0.72);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -height * 0.26);
    ctx.lineTo(size * 0.36, -height * 0.26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.24, -height * 0.62);
    ctx.lineTo(size * 0.24, -height * 0.14);
    ctx.stroke();
    ctx.fillStyle = withAlpha(accent, 0.76);
    ctx.fillRect(size * 0.18, -height * 0.14, size * 0.14, size * 0.14);
  } else if (feature.kind === "hill") {
    ctx.fillStyle = withAlpha(fill, 0.92);
    ctx.beginPath();
    ctx.moveTo(-size, height * 0.5);
    ctx.bezierCurveTo(-size * 0.6, -height * 0.28, size * 0.08, -height * 0.64, size, height * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = withAlpha(accent, 0.26);
    for (let band = 0; band < 3; band += 1) {
      const y = -height * 0.06 + band * (height * 0.18);
      ctx.beginPath();
      ctx.moveTo(-size * 0.62, y);
      ctx.quadraticCurveTo(0, y - height * 0.1, size * 0.64, y + height * 0.02);
      ctx.stroke();
    }
  } else if (feature.kind === "pine") {
    ctx.strokeStyle = withAlpha(fill, 0.88);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(0, height * 0.1);
    ctx.stroke();
    for (let tier = 0; tier < 3; tier += 1) {
      const tierScale = 1 - tier * 0.2;
      const tierY = -height * (0.06 + tier * 0.16);
      ctx.fillStyle = withAlpha(accent, 0.16 + tier * 0.04);
      ctx.beginPath();
      ctx.moveTo(0, tierY - height * 0.22);
      ctx.lineTo(size * 0.42 * tierScale, tierY + height * 0.06);
      ctx.lineTo(-size * 0.42 * tierScale, tierY + height * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (feature.kind === "shard-tree") {
    ctx.strokeStyle = withAlpha(fill, 0.8);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(0, -height * 0.08);
    ctx.stroke();
    ctx.fillStyle = withAlpha(accent, 0.22);
    for (let shard = 0; shard < 4; shard += 1) {
      const angle = -Math.PI / 2 + (shard - 1.5) * 0.45;
      const shardX = Math.cos(angle) * size * 0.18;
      const shardY = -height * 0.18 + Math.sin(angle) * size * 0.12;
      ctx.beginPath();
      ctx.moveTo(shardX, shardY - size * 0.38);
      ctx.lineTo(shardX + size * 0.16, shardY + size * 0.04);
      ctx.lineTo(shardX - size * 0.08, shardY + size * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(accent, 0.42);
    ctx.beginPath();
    ctx.arc(0, -height * 0.14, size * 0.3, 0, TAU);
    ctx.stroke();
  } else {
    drawTrackProp(feature, theme, time);
  }

  ctx.restore();
}

function drawTrackScenicLayer(track, theme, time) {
  const scene = buildTrackScene(track);
  if (!scene?.samples?.length) return;
  const samples = scene.samples;
  const stride = theme.id === "freeway" ? 4 : 5;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < samples.length; index += stride) {
    const sample = samples[index];
    if (sample.sectorTag === "hazard" && theme.id !== "industrial") continue;
    const scenicSide = sample.seed > 0.68 ? -sample.outerSide : sample.outerSide;
    const baseOffset = track.width * (1.42 + sample.curveAbs * 0.42) + 96 + sample.seed * 86;
    const x = sample.center.x + sample.normal.x * baseOffset * scenicSide;
    const y = sample.center.y + sample.normal.y * baseOffset * scenicSide;
    const angle = Math.atan2(sample.tangent.y, sample.tangent.x);

    if (theme.id === "industrial") {
      drawScenicFeature({
        kind: sample.straightness > 0.58 ? "city-block" : "crane",
        x,
        y,
        size: 38 + sample.straightness * 26,
        height: 72 + sample.curveAbs * 46,
        rotation: sample.straightness > 0.58 ? angle * 0.05 : angle * 0.09,
        accent: sample.sectorTag === "high-speed" ? "#ffd36e" : theme.decoA,
        fill: withAlpha(theme.inside, 0.86),
      }, theme, time);
    } else if (theme.id === "freeway") {
      drawScenicFeature({
        kind: sample.seed > 0.46 ? "hill" : "pine",
        x,
        y,
        size: sample.seed > 0.46 ? 64 + sample.straightness * 38 : 34 + sample.curveAbs * 18,
        height: sample.seed > 0.46 ? 52 + sample.curveAbs * 28 : 76 + sample.straightness * 24,
        rotation: sample.seed > 0.46 ? angle * 0.02 : angle * 0.05,
        accent: sample.sectorTag === "technical" ? "#8df7ff" : theme.trackEdge,
        fill: sample.seed > 0.46 ? withAlpha("#160d28", 0.92) : withAlpha(theme.inside, 0.82),
      }, theme, time);
    } else {
      drawScenicFeature({
        kind: "shard-tree",
        x,
        y,
        size: 34 + sample.curveAbs * 18,
        height: 82 + sample.straightness * 18,
        rotation: angle * 0.04 + (sample.seed - 0.5) * 0.1,
        accent: sample.sectorTag === "recovery" ? "#50f9d8" : theme.decoA,
        fill: withAlpha("#030611", 0.9),
      }, theme, time);
    }
  }
  ctx.restore();
}

function drawTrackProp(prop, theme, time) {
  const wobble = 1 + Math.sin(time * 2 + prop.x * 0.01) * 0.04;
  const accent = prop.accent || (prop.side === "outer" ? theme.decoA : theme.decoB);
  const fill = prop.fill || withAlpha(theme.inside, 0.78);
  const size = prop.size * wobble;
  const height = (prop.height || prop.size * 1.4) * wobble;

  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate((prop.rotation || 0) + Math.sin(time * 0.3 + prop.y * 0.001) * 0.08);
  ctx.strokeStyle = accent;
  ctx.fillStyle = fill;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 18;
  ctx.shadowColor = withAlpha(accent, 0.34);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(size * 0.04, height * 0.38, size * 0.62, Math.max(6, size * 0.18), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = fill;

  if (prop.kind === "stack") {
    ctx.fillRect(-size * 0.52, -height * 0.34, size * 1.04, height * 0.68);
    ctx.strokeRect(-size * 0.52, -height * 0.34, size * 1.04, height * 0.68);
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, -height * 0.1);
    ctx.lineTo(size * 0.4, -height * 0.1);
    ctx.moveTo(-size * 0.4, height * 0.12);
    ctx.lineTo(size * 0.4, height * 0.12);
    ctx.stroke();
  } else if (prop.kind === "tower") {
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.52);
    ctx.lineTo(size * 0.32, height * 0.48);
    ctx.lineTo(-size * 0.32, height * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -height * 0.16, size * 0.12, 0, TAU);
    ctx.fillStyle = withAlpha(accent, 0.74);
    ctx.fill();
  } else if (prop.kind === "barrel") {
    for (let offset = -1; offset <= 1; offset += 1) {
      ctx.beginPath();
      ctx.arc(offset * size * 0.24, 0, size * 0.22, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (prop.kind === "billboard") {
    ctx.fillRect(-size * 0.08, -height * 0.48, size * 0.16, height * 0.96);
    ctx.strokeRect(-size * 0.08, -height * 0.48, size * 0.16, height * 0.96);
    ctx.fillRect(-size * 0.62, -height * 0.5, size * 1.24, height * 0.42);
    ctx.strokeRect(-size * 0.62, -height * 0.5, size * 1.24, height * 0.42);
    ctx.beginPath();
    ctx.moveTo(-size * 0.44, -height * 0.32);
    ctx.lineTo(size * 0.44, -height * 0.32);
    ctx.stroke();
  } else if (prop.kind === "gantry") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.56, height * 0.46);
    ctx.lineTo(-size * 0.56, -height * 0.34);
    ctx.lineTo(size * 0.56, -height * 0.34);
    ctx.lineTo(size * 0.56, height * 0.46);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -height * 0.18, size * 0.14, 0, TAU);
    ctx.fillStyle = withAlpha(accent, 0.66);
    ctx.fill();
  } else if (prop.kind === "lightpost") {
    ctx.beginPath();
    ctx.moveTo(0, height * 0.48);
    ctx.lineTo(0, -height * 0.46);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -height * 0.52, size * 0.2, 0, TAU);
    ctx.fillStyle = withAlpha(accent, 0.88);
    ctx.fill();
  } else if (prop.kind === "monolith") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, height * 0.5);
    ctx.lineTo(-size * 0.44, -height * 0.5);
    ctx.lineTo(size * 0.2, -height * 0.36);
    ctx.lineTo(size * 0.38, height * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop.kind === "ring") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.56, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, TAU);
    ctx.stroke();
  } else if (prop.kind === "prism") {
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.52);
    ctx.lineTo(size * 0.42, height * 0.14);
    ctx.lineTo(0, height * 0.54);
    ctx.lineTo(-size * 0.42, height * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop.kind === "guardrail") {
    ctx.fillRect(-size * 0.78, -height * 0.12, size * 1.56, height * 0.24);
    ctx.strokeRect(-size * 0.78, -height * 0.12, size * 1.56, height * 0.24);
    ctx.beginPath();
    ctx.moveTo(-size * 0.56, -height * 0.02);
    ctx.lineTo(size * 0.56, -height * 0.02);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.32, -height * 0.02);
    ctx.lineTo(-size * 0.32, height * 0.32);
    ctx.moveTo(0, -height * 0.02);
    ctx.lineTo(0, height * 0.32);
    ctx.moveTo(size * 0.32, -height * 0.02);
    ctx.lineTo(size * 0.32, height * 0.32);
    ctx.stroke();
  } else if (prop.kind === "sign") {
    ctx.fillRect(-size * 0.08, height * 0.14, size * 0.16, height * 0.68);
    ctx.strokeRect(-size * 0.08, height * 0.14, size * 0.16, height * 0.68);
    ctx.fillRect(-size * 0.72, -height * 0.46, size * 1.44, height * 0.54);
    ctx.strokeRect(-size * 0.72, -height * 0.46, size * 1.44, height * 0.54);
    ctx.beginPath();
    ctx.moveTo(-size * 0.48, -height * 0.22);
    ctx.lineTo(size * 0.48, -height * 0.22);
    ctx.moveTo(-size * 0.42, 0);
    ctx.lineTo(size * 0.42, 0);
    ctx.stroke();
  } else if (prop.kind === "beacon") {
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(0, -height * 0.42);
    ctx.stroke();
    ctx.fillStyle = withAlpha(accent, 0.92);
    ctx.beginPath();
    ctx.arc(0, -height * 0.48, size * 0.18, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 26;
    ctx.shadowColor = withAlpha(accent, 0.5);
    ctx.beginPath();
    ctx.arc(0, -height * 0.48, size * 0.42, 0, TAU);
    ctx.stroke();
  } else if (prop.kind === "arch") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.68, height * 0.4);
    ctx.lineTo(-size * 0.68, -height * 0.3);
    ctx.lineTo(size * 0.68, -height * 0.3);
    ctx.lineTo(size * 0.68, height * 0.4);
    ctx.stroke();
    ctx.fillRect(-size * 0.56, -height * 0.3, size * 1.12, height * 0.1);
    ctx.strokeRect(-size * 0.56, -height * 0.3, size * 1.12, height * 0.1);
    ctx.beginPath();
    ctx.arc(0, -height * 0.06, size * 0.12, 0, TAU);
    ctx.fillStyle = withAlpha(accent, 0.84);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.rect(-size * 0.5, -size * 0.5, size, size);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function getTrackFrame(track, t) {
  const closed = track.type === "circuit";
  const step = 0.014;
  const prev = samplePath(track.points, t - step, closed);
  const current = samplePath(track.points, t, closed);
  const next = samplePath(track.points, t + step, closed);
  const prevDir = normalize(current.x - prev.x, current.y - prev.y);
  const nextDir = normalize(next.x - current.x, next.y - current.y);
  const tangent = normalize(prevDir.x + nextDir.x, prevDir.y + nextDir.y);
  const cross = prevDir.x * nextDir.y - prevDir.y * nextDir.x;
  const dot = clamp(prevDir.x * nextDir.x + prevDir.y * nextDir.y, -1, 1);
  return {
    point: current,
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
    turnSign: Math.sign(cross),
    severity: clamp((1 - dot) * 0.72 + Math.abs(cross) * 0.62, 0, 1),
  };
}

function drawBiomeHorizon(theme, time) {
  if (!state.track || state.mode === "menu") return;
  const horizonY = state.height * 0.17;
  const baseDrift = (state.camera.x * 0.04 + time * 18) % 180;
  const liftDrift = Math.sin(time * 0.35 + state.camera.y * 0.002) * 8;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.72;

  if (theme.id === "industrial") {
    for (let i = 0; i < 11; i += 1) {
      const x = (i * 132 - baseDrift * 1.8) % (state.width + 240) - 96;
      const h = 42 + (i % 4) * 18 + Math.sin(time * 0.65 + i) * 6;
      const w = 48 + (i % 3) * 18;
      ctx.fillStyle = withAlpha(theme.trackEdge, 0.05 + (i % 3) * 0.012);
      ctx.fillRect(x, horizonY + 42 - h, w, h);
      ctx.strokeStyle = withAlpha(theme.decoA, 0.16);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, horizonY + 42 - h * 0.72);
      ctx.lineTo(x + w + 8, horizonY + 42 - h * 0.72);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 10, horizonY + 42 - h);
      ctx.lineTo(x + 10, horizonY + 78);
      ctx.moveTo(x + w - 10, horizonY + 42 - h * 0.82);
      ctx.lineTo(x + w - 10, horizonY + 66);
      ctx.stroke();
    }
  } else if (theme.id === "freeway") {
    for (let i = 0; i < 6; i += 1) {
      const x = (i * 236 - baseDrift * 1.9) % (state.width + 320) - 150;
      const w = 180 + (i % 2) * 46;
      const h = 36 + (i % 3) * 10;
      ctx.fillStyle = withAlpha(theme.trackEdge, 0.04);
      ctx.beginPath();
      ctx.moveTo(x, horizonY + 70 + liftDrift);
      ctx.quadraticCurveTo(x + w * 0.3, horizonY + 18 + liftDrift - h, x + w * 0.56, horizonY + 44 + liftDrift - h * 0.4);
      ctx.quadraticCurveTo(x + w * 0.82, horizonY + 10 + liftDrift - h * 0.5, x + w, horizonY + 70 + liftDrift);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.decoB, 0.14);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.16, horizonY + 62 + liftDrift);
      ctx.lineTo(x + w * 0.36, horizonY + 30 + liftDrift - h * 0.26);
      ctx.lineTo(x + w * 0.62, horizonY + 42 + liftDrift - h * 0.18);
      ctx.lineTo(x + w * 0.84, horizonY + 22 + liftDrift - h * 0.12);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i += 1) {
      const x = (i * 168 - baseDrift * 2.8) % (state.width + 260) - 90;
      ctx.strokeStyle = withAlpha(theme.trackEdge, 0.18);
      ctx.beginPath();
      ctx.moveTo(x, horizonY + 70 + liftDrift);
      ctx.lineTo(x, horizonY + 30 + liftDrift);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 12, horizonY + 38 + liftDrift);
      ctx.lineTo(x, horizonY + 24 + liftDrift);
      ctx.lineTo(x + 12, horizonY + 38 + liftDrift);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 11; i += 1) {
      const x = (i * 132 - baseDrift * 1.5) % (state.width + 240) - 86;
      const h = 38 + (i % 4) * 10 + Math.sin(time * 0.5 + i) * 8;
      ctx.fillStyle = withAlpha(theme.decoA, 0.05 + (i % 2) * 0.015);
      ctx.beginPath();
      ctx.moveTo(x, horizonY + 76 + liftDrift);
      ctx.lineTo(x + 16, horizonY + 46 - h + liftDrift * 0.24);
      ctx.lineTo(x + 32, horizonY + 60 - h * 0.28);
      ctx.lineTo(x + 48, horizonY + 32 - h + liftDrift * 0.2);
      ctx.lineTo(x + 64, horizonY + 76 + liftDrift);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.decoB, 0.14);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 32, horizonY + 34 - h * 0.34 + liftDrift * 0.2, 11 + (i % 3) * 3, 0, TAU);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawTrackEnvironment(track, theme, time) {
  const closed = track.type === "circuit";
  const sampleCount = closed ? 28 : 22;
  const roadHalf = track.width * 0.5;
  const baseOuter = roadHalf + 34;
  const depthOuter = roadHalf + 92;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < sampleCount; i += 1) {
    const t = closed ? i / sampleCount : i / (sampleCount - 1);
    const frame = getTrackFrame(track, t);
    const sector = getSectorAtProgress(track, t);
    const sectorBias = sector.tag === "hazard" ? 0.95 : sector.tag === "technical" ? 0.7 : sector.tag === "high-speed" ? 0.55 : 0.35;
    const outerSign = frame.turnSign === 0 ? (i % 2 === 0 ? 1 : -1) : frame.turnSign > 0 ? -1 : 1;
    const innerSign = -outerSign;
    const turnBoost = 1 + frame.severity * 0.38;
    const tangentAngle = Math.atan2(frame.tangent.y, frame.tangent.x);
    const phase = Math.sin(time * 2.2 + t * TAU * 3 + i * 0.4);
    const stripeLength = 64 + sectorBias * 34 + frame.severity * 36;
    const stripeHeight = 9 + sectorBias * 3.5 + frame.severity * 3;

    for (const side of [innerSign, outerSign]) {
      const primary = side === outerSign;
      const distance = primary ? depthOuter + frame.severity * 62 : baseOuter + frame.severity * 20;
      const bandColor = primary ? theme.trackEdge : theme.inside;
      const alpha = primary ? 0.08 + sectorBias * 0.03 + frame.severity * 0.05 : 0.1 + sectorBias * 0.02;
      const x = frame.point.x + frame.normal.x * distance * side;
      const y = frame.point.y + frame.normal.y * distance * side;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tangentAngle);
      ctx.fillStyle = withAlpha(bandColor, alpha);
      ctx.strokeStyle = withAlpha(primary ? theme.decoA : theme.decoB, 0.26 + frame.severity * 0.18);
      ctx.lineWidth = primary ? 2.2 : 1.4;
      ctx.shadowBlur = primary ? 20 : 12;
      ctx.shadowColor = withAlpha(primary ? theme.trackEdge : theme.decoB, 0.2 + frame.severity * 0.1);
      ctx.beginPath();
      ctx.roundRect(-stripeLength * 0.5, -stripeHeight * 0.5, stripeLength, stripeHeight, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      const slabHeight = primary ? 18 + frame.severity * 8 : 10 + frame.severity * 4;
      const slabLength = primary ? 28 + sectorBias * 16 : 20 + sectorBias * 10;
      ctx.fillStyle = withAlpha(primary ? theme.decoA : theme.trackEdge, 0.16 + frame.severity * 0.1);
      ctx.fillRect(-slabLength * 0.5, -slabHeight * 0.5, slabLength, slabHeight);
      ctx.strokeStyle = withAlpha(primary ? theme.decoA : theme.trackEdge, 0.38);
      ctx.strokeRect(-slabLength * 0.5, -slabHeight * 0.5, slabLength, slabHeight);

      if (primary && (i % 3 === 0 || frame.severity > 0.22)) {
        const chevronCount = frame.severity > 0.32 ? 3 : 2;
        const chevronGap = 11;
        ctx.strokeStyle = withAlpha(sector.tag === "hazard" ? "#ff6d7f" : theme.decoB, 0.62);
        ctx.lineWidth = 2;
        for (let c = 0; c < chevronCount; c += 1) {
          const cx = -18 + c * chevronGap;
          ctx.beginPath();
          ctx.moveTo(cx - 2, -8);
          ctx.lineTo(cx + 7, 0);
          ctx.lineTo(cx - 2, 8);
          ctx.stroke();
        }
      }

      if (primary && (i % 4 === 0 || sector.tag === "technical" || sector.tag === "hazard")) {
        const postHeight = 26 + frame.severity * 34 + sectorBias * 10;
        const postX = 26 + frame.severity * 6;
        ctx.fillStyle = withAlpha(theme.trackEdge, 0.14 + phase * 0.02);
        ctx.fillRect(postX, -postHeight, 5, postHeight);
        ctx.strokeStyle = withAlpha(theme.decoB, 0.24);
        ctx.beginPath();
        ctx.moveTo(postX - 8, -postHeight + 8);
        ctx.lineTo(postX + 10, -postHeight + 8);
        ctx.stroke();
      }

      if (primary && theme.id === "freeway" && i % 5 === 0) {
        const arm = 58 + frame.severity * 32;
        ctx.strokeStyle = withAlpha(theme.trackEdge, 0.28);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-arm * 0.52, -14);
        ctx.lineTo(-arm * 0.12, -14);
        ctx.lineTo(arm * 0.16, 12);
        ctx.lineTo(arm * 0.5, 12);
        ctx.stroke();
      }

      if (primary && theme.id === "industrial" && i % 4 === 0) {
        ctx.fillStyle = withAlpha(theme.decoB, 0.12 + sectorBias * 0.04);
        ctx.beginPath();
        ctx.moveTo(-20, 16);
        ctx.lineTo(0, -6 - frame.severity * 10);
        ctx.lineTo(20, 16);
        ctx.closePath();
        ctx.fill();
      }

      if (primary && theme.id === "void" && i % 3 === 0) {
        ctx.strokeStyle = withAlpha(theme.decoA, 0.36 + frame.severity * 0.1);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, -12 - frame.severity * 6, 14 + frame.severity * 6, 0, TAU);
        ctx.stroke();
      }

      if (sector.tag !== "recovery" && primary) {
        ctx.fillStyle = withAlpha(theme.trackEdge, 0.03 + sectorBias * 0.02);
        ctx.fillRect(-12, 12, 24 + frame.severity * 14, 3);
      }

      ctx.restore();
    }
  }
  ctx.restore();
}

function drawTrackEdgeDecals(track, theme, time) {
  const closed = track.type === "circuit";
  const sampleCount = closed ? 24 : 18;
  const roadHalf = track.width * 0.5;
  const edgeOffset = roadHalf + 10;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < sampleCount; i += 1) {
    const t = closed ? i / sampleCount : i / (sampleCount - 1);
    const frame = getTrackFrame(track, t);
    const sector = getSectorAtProgress(track, t);
    const sectorColor = sectorStrokeColor(sector.tag, 0.42);
    const tangentAngle = Math.atan2(frame.tangent.y, frame.tangent.x);
    const outerSign = frame.turnSign === 0 ? (i % 2 === 0 ? 1 : -1) : frame.turnSign > 0 ? -1 : 1;
    const accentSide = outerSign;
    const laneSide = -accentSide;
    const wobble = Math.sin(time * 3 + t * TAU * 4 + i) * 0.5 + 0.5;
    const accentDistance = edgeOffset + frame.severity * 22;
    const laneDistance = edgeOffset * 0.7 + frame.severity * 12;
    const accentX = frame.point.x + frame.normal.x * accentDistance * accentSide;
    const accentY = frame.point.y + frame.normal.y * accentDistance * accentSide;
    const laneX = frame.point.x + frame.normal.x * laneDistance * laneSide;
    const laneY = frame.point.y + frame.normal.y * laneDistance * laneSide;

    ctx.save();
    ctx.translate(accentX, accentY);
    ctx.rotate(tangentAngle);
    ctx.strokeStyle = withAlpha(sectorColor, 0.24 + frame.severity * 0.15);
    ctx.fillStyle = withAlpha(theme.trackEdge, 0.08 + frame.severity * 0.05);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.fillRect(-6, -4, 12, 8);
    if (sector.tag === "hazard" || frame.severity > 0.32) {
      ctx.strokeStyle = withAlpha("#ff6d7f", 0.52);
      ctx.beginPath();
      ctx.moveTo(-4, -10);
      ctx.lineTo(8, 0);
      ctx.lineTo(-4, 10);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(laneX, laneY);
    ctx.rotate(tangentAngle);
    ctx.strokeStyle = withAlpha(theme.trackEdge, 0.1 + wobble * 0.12);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([10 + frame.severity * 8, 14]);
    ctx.lineDashOffset = -time * 96;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.restore();
}

function getCarBodyColor(car) {
  return car.cosmetics?.bodyColor || car.def.color;
}

function getCarAccentColor(car) {
  return car.cosmetics?.accentColor || car.def.color;
}

function getCarTrailColor(car) {
  return car.cosmetics?.trailColor || getCarAccentColor(car);
}

function getCarSkidColor(car) {
  return car.cosmetics?.skidColor || withAlpha(getCarAccentColor(car), 0.28);
}

function getCarBodyStyle(car) {
  return car?.def?.bodyStyle || "touring";
}

function lerpValue(a, b, t) {
  return a + (b - a) * t;
}

function normalizeMetric(value, min, max) {
  return clamp((value - min) / (max - min || 1), 0, 1);
}

function tracePolygon(points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function getCarShapeBias(bodyStyle) {
  if (bodyStyle === "dart") return { speed: 0.08, accel: -0.03, dur: -0.04, grip: 0.03 };
  if (bodyStyle === "brick") return { speed: -0.08, accel: 0.05, dur: 0.12, grip: -0.02 };
  if (bodyStyle === "blade") return { speed: 0.1, accel: -0.02, dur: -0.06, grip: 0.05 };
  return { speed: 0, accel: 0, dur: 0, grip: 0 };
}

function fract(value) {
  return value - Math.floor(value);
}

function getCarVariantMix(bodyStyle, speed, accel, durability, grip) {
  const styleIndex = bodyStyle === "dart" ? 1 : bodyStyle === "brick" ? 2 : bodyStyle === "blade" ? 3 : 4;
  return fract(Math.sin(styleIndex * 91.733 + speed * 17.317 + accel * 27.491 + durability * 13.913 + grip * 23.731) * 43758.5453123);
}

function getCarDesign(car, scale = 1) {
  const def = car.def || car;
  const bodyStyle = getCarBodyStyle(car);
  const bias = getCarShapeBias(bodyStyle);
  const speed = clamp(normalizeMetric(def.maxSpeed || 350, 320, 405) + bias.speed, 0, 1);
  const accel = clamp(normalizeMetric(def.accel || 450, 400, 530) + bias.accel, 0, 1);
  const durability = clamp(normalizeMetric(def.durability || 124, 110, 140) + bias.dur, 0, 1);
  const grip = clamp(normalizeMetric(def.grip || 7, 5.5, 9) + bias.grip, 0, 1);
  const length = (car.length || def.visualLength || 48) * scale;
  const baseWidth = (car.width || def.visualWidth || 26) * scale;
  const variantMix = getCarVariantMix(bodyStyle, speed, accel, durability, grip);
  const shipBase = bodyStyle === "blade" ? 0.58 : bodyStyle === "touring" ? 0.26 : bodyStyle === "dart" ? 0.18 : 0.12;
  const shipMix = clamp(shipBase + (variantMix - 0.5) * 0.34 + speed * 0.14 - durability * 0.07, 0.04, 0.92);
  const beam = baseWidth * (1.08 + durability * 0.08 + shipMix * 0.1 + (bodyStyle === "brick" ? 0.06 : 0));
  const noseReach = clamp(speed * 0.72 + grip * 0.28, 0, 1);
  const rearMass = clamp(accel * 0.58 + durability * 0.42, 0, 1);

  const tailX = -length * lerpValue(0.54, 0.65, rearMass * 0.7 + shipMix * 0.3);
  const rearHaunchX = -length * lerpValue(0.2, 0.3, rearMass * 0.62 + shipMix * 0.18);
  const midX = length * lerpValue(-0.02, 0.08, speed * 0.22 + shipMix * 0.34);
  const shoulderX = length * lerpValue(0.18, 0.3, noseReach * 0.6 + shipMix * 0.28);
  const noseBaseX = length * lerpValue(0.42, 0.54, noseReach * 0.6 + shipMix * 0.22);
  const noseChineX = length * lerpValue(0.6, 0.74, noseReach * 0.72 + shipMix * 0.28);
  const noseX = length * lerpValue(0.76, 0.9, noseReach * 0.74 + shipMix * 0.2);

  const tailHalf = beam * lerpValue(0.18, 0.26, rearMass * 0.62 + shipMix * 0.18);
  const rearHaunchHalf = beam * lerpValue(0.26, 0.38, rearMass * 0.58 + durability * 0.24 + shipMix * 0.18);
  const midHalf = beam * lerpValue(0.2, 0.3, durability * 0.18 + shipMix * 0.26 + speed * 0.12);
  const shoulderHalf = beam * lerpValue(0.28, 0.4, grip * 0.28 + shipMix * 0.44 + durability * 0.18);
  const noseBaseHalf = beam * lerpValue(0.2, 0.29, shipMix * 0.42 + grip * 0.3 + durability * 0.16);
  const noseChineHalf = beam * lerpValue(0.12, 0.2, shipMix * 0.36 + speed * 0.38 + grip * 0.16);
  const noseHalf = beam * lerpValue(0.06, 0.11, speed * 0.62 + grip * 0.18 + shipMix * 0.2);

  const cockpitRearX = -length * lerpValue(0.04, 0.12, rearMass * 0.44 + shipMix * 0.14);
  const cockpitMidX = length * lerpValue(0.06, 0.16, shipMix * 0.42 + speed * 0.24);
  const cockpitFrontX = length * lerpValue(0.24, 0.36, noseReach * 0.58 + shipMix * 0.24);
  const cockpitHalf = beam * lerpValue(0.12, 0.17, shipMix * 0.42 + durability * 0.18);
  const canopyNoseHalf = cockpitHalf * lerpValue(0.54, 0.76, grip * 0.42 + shipMix * 0.34);

  const frontAxleX = length * lerpValue(0.18, 0.28, noseReach * 0.46 + shipMix * 0.18);
  const rearAxleX = -length * lerpValue(0.24, 0.34, rearMass * 0.54 + shipMix * 0.16);
  const wheelLength = length * lerpValue(0.1, 0.14, speed * 0.28 + grip * 0.12);
  const wheelWidth = baseWidth * lerpValue(0.18, 0.24, durability * 0.54 + grip * 0.18 + (1 - shipMix) * 0.1);
  const wheelTrackHalf = Math.max(rearHaunchHalf, shoulderHalf, noseBaseHalf)
    + wheelWidth * lerpValue(0.1, 0.22, (1 - shipMix) * 0.76 + durability * 0.24);

  const splitterHalf = noseBaseHalf * lerpValue(0.82, 1.08, grip * 0.4 + shipMix * 0.3);
  const splitterRearX = noseBaseX - length * 0.14;
  const splitterTipX = noseX + length * 0.13;
  const tailPlaneHalf = rearHaunchHalf * lerpValue(0.62, 0.82, shipMix * 0.48 + grip * 0.2);
  const tailPlaneX = tailX + length * 0.02;

  const engineCoverRearX = tailX + length * 0.12;
  const engineCoverFrontX = cockpitMidX + length * lerpValue(0.08, 0.16, accel * 0.36 + shipMix * 0.22);
  const engineHalf = beam * lerpValue(0.12, 0.18, accel * 0.54 + durability * 0.18 + shipMix * 0.18);
  const trailMountX = tailX - length * lerpValue(0.015, 0.055, shipMix * 0.58 + rearMass * 0.22);
  const trailRearHalf = Math.max(tailHalf * 1.28, rearHaunchHalf * 0.92);

  return {
    length,
    width: beam,
    trailMountX,
    trailRearHalf,
    tub: [
      [tailX, -tailHalf],
      [rearHaunchX, -rearHaunchHalf],
      [midX, -midHalf],
      [shoulderX, -shoulderHalf],
      [noseBaseX, -noseBaseHalf],
      [noseChineX, -noseChineHalf],
      [noseX, -noseHalf],
      [noseX + length * 0.08, 0],
      [noseX, noseHalf],
      [noseChineX, noseChineHalf],
      [noseBaseX, noseBaseHalf],
      [shoulderX, shoulderHalf],
      [midX, midHalf],
      [rearHaunchX, rearHaunchHalf],
      [tailX, tailHalf],
    ],
    floor: [
      [tailX - length * 0.04, -tailHalf * 0.9],
      [rearHaunchX - length * 0.02, -rearHaunchHalf * 1.06],
      [midX, -midHalf * 1.06],
      [shoulderX + length * 0.02, -shoulderHalf * 1.04],
      [noseBaseX + length * 0.02, -noseBaseHalf * 1.1],
      [noseChineX + length * 0.02, -noseChineHalf * 1.1],
      [noseX + length * 0.02, -noseHalf * 1.12],
      [noseX + length * 0.1, 0],
      [noseX + length * 0.02, noseHalf * 1.12],
      [noseChineX + length * 0.02, noseChineHalf * 1.1],
      [noseBaseX + length * 0.02, noseBaseHalf * 1.1],
      [shoulderX + length * 0.02, shoulderHalf * 1.04],
      [midX, midHalf * 1.06],
      [rearHaunchX - length * 0.02, rearHaunchHalf * 1.06],
      [tailX - length * 0.04, tailHalf * 0.9],
    ],
    sidepods: [
      [
        [rearHaunchX - length * 0.02, -rearHaunchHalf * 0.86],
        [midX + length * 0.02, -midHalf * 0.78],
        [shoulderX - length * 0.02, -shoulderHalf * 0.96],
        [noseBaseX - length * 0.06, -noseBaseHalf * 0.78],
        [shoulderX - length * 0.12, -shoulderHalf * 0.56],
        [midX + length * 0.04, -midHalf * 0.62],
      ],
      [
        [rearHaunchX - length * 0.02, rearHaunchHalf * 0.86],
        [midX + length * 0.02, midHalf * 0.78],
        [shoulderX - length * 0.02, shoulderHalf * 0.96],
        [noseBaseX - length * 0.06, noseBaseHalf * 0.78],
        [shoulderX - length * 0.12, shoulderHalf * 0.56],
        [midX + length * 0.04, midHalf * 0.62],
      ],
    ],
    engineCover: [
      [engineCoverRearX, -engineHalf * 0.7],
      [cockpitRearX, -engineHalf],
      [engineCoverFrontX, -engineHalf * 0.82],
      [engineCoverFrontX + length * 0.08, 0],
      [engineCoverFrontX, engineHalf * 0.82],
      [cockpitRearX, engineHalf],
      [engineCoverRearX, engineHalf * 0.7],
    ],
    canopy: [
      [cockpitRearX, -cockpitHalf * 0.96],
      [cockpitMidX, -cockpitHalf],
      [cockpitFrontX, -canopyNoseHalf],
      [cockpitFrontX + length * 0.06, 0],
      [cockpitFrontX, canopyNoseHalf],
      [cockpitMidX, cockpitHalf],
      [cockpitRearX, cockpitHalf * 0.96],
    ],
    glass: [
      [cockpitRearX + length * 0.04, -cockpitHalf * 0.34],
      [cockpitMidX + length * 0.08, -cockpitHalf * 0.42],
      [cockpitFrontX - length * 0.02, -canopyNoseHalf * 0.2],
      [cockpitFrontX - length * 0.06, canopyNoseHalf * 0.36],
      [cockpitMidX - length * 0.08, cockpitHalf * 0.4],
      [cockpitRearX + length * 0.02, cockpitHalf * 0.24],
    ],
    frontWing: [
      [splitterRearX, -splitterHalf * 0.9],
      [noseBaseX - length * 0.02, -noseBaseHalf * 0.98],
      [noseChineX + length * 0.02, -noseChineHalf * 0.8],
      [splitterTipX, -noseHalf * 0.16],
      [splitterTipX + length * 0.04, 0],
      [splitterTipX, noseHalf * 0.16],
      [noseChineX + length * 0.02, noseChineHalf * 0.8],
      [noseBaseX - length * 0.02, noseBaseHalf * 0.98],
      [splitterRearX, splitterHalf * 0.9],
    ],
    rearWing: [
      [tailPlaneX - length * 0.06, -tailPlaneHalf],
      [tailPlaneX + length * 0.08, -tailPlaneHalf * 0.64],
      [tailPlaneX + length * 0.16, -tailHalf * 0.14],
      [tailPlaneX + length * 0.16, tailHalf * 0.14],
      [tailPlaneX + length * 0.08, tailPlaneHalf * 0.64],
      [tailPlaneX - length * 0.06, tailPlaneHalf],
    ],
    dorsalFin: [
      [engineCoverRearX + length * 0.08, 0],
      [noseBaseX - length * 0.04, 0],
    ],
    wheelCapsules: [
      { x: rearAxleX, y: -wheelTrackHalf, length: wheelLength, width: wheelWidth },
      { x: rearAxleX, y: wheelTrackHalf, length: wheelLength, width: wheelWidth },
      { x: frontAxleX, y: -wheelTrackHalf, length: wheelLength * 0.94, width: wheelWidth * (0.9 + grip * 0.12) },
      { x: frontAxleX, y: wheelTrackHalf, length: wheelLength * 0.94, width: wheelWidth * (0.9 + grip * 0.12) },
    ],
    headlights: [
      { x: noseChineX + length * 0.01, y: -noseChineHalf * 0.84, w: 12, h: 3 },
      { x: noseChineX + length * 0.01, y: noseChineHalf * 0.64, w: 12, h: 3 },
    ],
    taillights: [
      { x: tailX + length * 0.06, y: -rearHaunchHalf * 0.36, w: 10, h: 3 },
      { x: tailX + length * 0.06, y: rearHaunchHalf * 0.18, w: 10, h: 3 },
    ],
    accentLines: [
      [
        [rearHaunchX + length * 0.1, -rearHaunchHalf * 0.26],
        [shoulderX - length * 0.08, -shoulderHalf * 0.18],
        [noseChineX - length * 0.02, -noseChineHalf * 0.08],
      ],
      [
        [rearHaunchX + length * 0.1, rearHaunchHalf * 0.26],
        [shoulderX - length * 0.08, shoulderHalf * 0.18],
        [noseChineX - length * 0.02, noseChineHalf * 0.08],
      ],
      [
        [cockpitRearX + length * 0.08, 0],
        [cockpitFrontX + length * 0.02, 0],
        [noseBaseX + length * 0.02, 0],
      ],
    ],
  };
}

function traceRibbon(points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].left.x, points[0].left.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    ctx.lineTo(point.left.x, point.left.y);
  }
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    ctx.lineTo(point.right.x, point.right.y);
  }
  ctx.closePath();
}

function traceCapsule(x, y, length, width) {
  const radius = width * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - length * 0.5 + radius, y - radius);
  ctx.lineTo(x + length * 0.5 - radius, y - radius);
  ctx.arc(x + length * 0.5 - radius, y, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - length * 0.5 + radius, y + radius);
  ctx.arc(x - length * 0.5 + radius, y, radius, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
}

function drawCarWheels(design) {
  ctx.fillStyle = "rgba(6, 9, 16, 0.98)";
  for (const wheel of design.wheelCapsules) {
    traceCapsule(wheel.x, wheel.y, wheel.length, wheel.width);
    ctx.fill();
    ctx.fillStyle = "rgba(96, 111, 142, 0.18)";
    traceCapsule(wheel.x, wheel.y, wheel.length * 0.44, wheel.width * 0.36);
    ctx.fill();
    ctx.fillStyle = "rgba(6, 9, 16, 0.98)";
  }
}

function drawCarHighlights(design, accentColor, parts) {
  ctx.lineJoin = "round";
  ctx.strokeStyle = withAlpha(accentColor, 0.72);
  ctx.lineWidth = 2;
  for (const pod of parts.has("door") ? design.sidepods : []) {
    tracePolygon(pod);
    ctx.stroke();
  }
  if (parts.has("panel")) {
    tracePolygon(design.engineCover);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(design.dorsalFin[0][0], design.dorsalFin[0][1]);
    ctx.lineTo(design.dorsalFin[1][0], design.dorsalFin[1][1]);
    ctx.stroke();
  }
  for (const line of design.accentLines || []) {
    ctx.beginPath();
    line.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.stroke();
  }
}

function drawDestroyedCar(car) {
  const fade = clamp(car.respawnTimer / 2.1, 0.18, 1);
  const accentColor = getCarAccentColor(car);
  const design = getCarDesign(car);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = 0.82 * fade;

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 8, car.length * 0.7, car.width * 0.84, 0, 0, TAU);
  ctx.fill();

  ctx.shadowBlur = 28;
  ctx.shadowColor = "rgba(255,109,127,0.24)";
  ctx.fillStyle = "rgba(255,109,127,0.12)";
  ctx.beginPath();
  ctx.arc(0, 0, car.length * 0.78, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  for (let i = 0; i < 4; i += 1) {
    const t = state.ambientTime * 1.1 + i * 0.9;
    const puffX = -car.length * 0.16 - i * 6;
    const puffY = Math.sin(t) * 4 - i * 10;
    ctx.fillStyle = `rgba(17, 26, 42, ${0.18 + i * 0.04})`;
    ctx.beginPath();
    ctx.arc(puffX, puffY, 7 + i * 3, 0, TAU);
    ctx.fill();
  }

  drawCarWheels(design);

  ctx.fillStyle = "#090d16";
  tracePolygon(design.tub);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.2;
  tracePolygon(design.tub);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  tracePolygon(design.engineCover);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  tracePolygon(design.canopy);
  ctx.fill();

  ctx.strokeStyle = withAlpha(accentColor, 0.32);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-car.length * 0.22, -car.width * 0.12);
  ctx.lineTo(car.length * 0.34, car.width * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-car.length * 0.22, car.width * 0.12);
  ctx.lineTo(car.length * 0.34, -car.width * 0.1);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 211, 110, 0.72)";
  for (let i = 0; i < 3; i += 1) {
    const flicker = Math.sin(state.ambientTime * 10 + i * 1.8) * 3;
    ctx.beginPath();
    ctx.arc(-car.length * 0.08 + i * 10, car.width * 0.04, 1.6 + i * 0.3 + flicker * 0.05, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function drawBackground() {
  const theme = getFrameBiome();
  const time = state.ambientTime;
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, theme.bg);
  gradient.addColorStop(0.62, theme.inside);
  gradient.addColorStop(1, "#010308");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  const halo = ctx.createRadialGradient(state.width * 0.2, state.height * 0.18, 0, state.width * 0.2, state.height * 0.18, state.width * 0.45);
  halo.addColorStop(0, theme.fog);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, state.width, state.height);

  if (state.player && state.mode !== "menu") {
    const speedFactor = clamp(Math.hypot(state.player.vx, state.player.vy) / 420, 0, 1);
    const runnerGlow = ctx.createRadialGradient(
      state.width * 0.54,
      state.height * 0.46,
      0,
      state.width * 0.54,
      state.height * 0.46,
      state.width * (0.16 + speedFactor * 0.18),
    );
    runnerGlow.addColorStop(0, withAlpha(theme.trackEdge, 0.12 + speedFactor * 0.12));
    runnerGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = runnerGlow;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  if (state.track && state.mode !== "menu") drawBiomeHorizon(theme, time);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (theme.atmosphere === "grid") {
    ctx.strokeStyle = "rgba(141,247,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i += 1) {
      const y = state.height * 0.56 + i * 26;
      ctx.beginPath();
      ctx.moveTo(-30, y);
      ctx.lineTo(state.width + 30, y + i * 5);
      ctx.stroke();
    }
    for (let i = -2; i < 10; i += 1) {
      const x = state.width * 0.5 + i * 90 + Math.sin(time * 0.4 + i) * 12;
      ctx.beginPath();
      ctx.moveTo(x, state.height * 0.52);
      ctx.lineTo(x * 1.1, state.height + 30);
      ctx.stroke();
    }
  } else if (theme.atmosphere === "beams") {
    for (let i = 0; i < 8; i += 1) {
      const beamX = ((i * 170 + time * 70) % (state.width + 280)) - 140;
      const beam = ctx.createLinearGradient(beamX, 0, beamX + 120, 0);
      beam.addColorStop(0, "rgba(255,211,110,0)");
      beam.addColorStop(0.5, "rgba(255,211,110,0.08)");
      beam.addColorStop(1, "rgba(255,211,110,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(beamX, 0, 120, state.height);
    }
  } else {
    for (let i = 0; i < 26; i += 1) {
      const radius = 20 + ((i * 37 + time * 40) % 240);
      const x = (i * 91 + time * 14) % (state.width + 120) - 60;
      const y = (i * 57 + Math.sin(time * 0.7 + i) * 50 + state.height * 0.48) % (state.height + 100) - 50;
      ctx.strokeStyle = i % 2 === 0 ? "rgba(182,140,255,0.08)" : "rgba(255,92,203,0.06)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < state.height; i += 4) ctx.fillRect(0, i, state.width, 1);
}

function setCamera() {
  let focus = { x: 0, y: 0 };
  if (state.player && state.mode !== "menu") {
    const forward = { x: Math.cos(state.player.angle), y: Math.sin(state.player.angle) };
    focus = {
      x: state.player.x + forward.x * 170,
      y: state.player.y + forward.y * 170,
    };
  }
  const shakeScale = state.save.settings.reducedShake ? 0.32 : 1;
  state.camera.x = lerp(state.camera.x, focus.x, 0.08);
  state.camera.y = lerp(state.camera.y, focus.y, 0.08);
  const focusT = state.player ? state.player.pathT : 0;
  state.camera.z = lerp(state.camera.z, sampleTrackHeight(state.track, focusT) + 34, 0.12);
  state.camera.jitterX = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake * 1.6 * shakeScale : 0;
  state.camera.jitterY = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake * 1.2 * shakeScale : 0;
  state.viewScale = clamp(Math.min(state.width / 1280, state.height / 720), 0.54, 0.84);
}

function drawTrack() {
  const track = state.track;
  const theme = track.theme;
  const time = state.ambientTime;

  withOutsideTrackClip(track, 16, () => {
    drawTrackEnvironment(track, theme, time);
    drawTrackScenicLayer(track, theme, time);
  });

  ctx.save();
  ctx.shadowBlur = 38;
  ctx.shadowColor = theme.glow;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.track;
  ctx.lineWidth = track.width + 24;
  traceTrackPath(track);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = theme.track;
  ctx.lineWidth = track.width;
  traceTrackPath(track);
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  for (const sector of track.sectors) {
    const points = [];
    const closed = track.type === "circuit";
    for (let i = 0; i <= 26; i += 1) {
      const t = getSectorSampleT(sector, i / 26, closed);
      points.push(samplePath(track.points, t, closed));
    }
    ctx.strokeStyle = sectorStrokeColor(sector.tag, 0.18);
    ctx.lineWidth = track.width * 0.7;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawTrackSurfaceLayer(track, theme, time);

  ctx.strokeStyle = theme.trackEdge;
  ctx.lineWidth = 9;
  traceTrackPath(track);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([20, 18]);
  ctx.lineDashOffset = -time * 120;
  traceTrackPath(track);
  ctx.stroke();
  ctx.setLineDash([]);

  if (state.currentEvent?.guided) {
    ctx.strokeStyle = "rgba(141,247,255,0.28)";
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -time * 180;
    traceTrackPath(track);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawTrackEdgeDecals(track, theme, time);

  drawGateLine(track.startLine, track.type === "circuit" ? "#ffd36e" : "#8df7ff");
  if (track.type === "sprint") drawGateLine(track.finishLine, "#ff6d7f");

  withOutsideTrackClip(track, 12, () => {
    drawTrackRoadsideLayer(track, theme, time);
  });

  const countdownStage = state.countdown > 0 ? 3 - Math.ceil(Math.max(0, state.countdown)) : 3;
  ctx.save();
  ctx.translate(track.startLine.x, track.startLine.y);
  const lightColors = ["#ff6d7f", "#ffd36e", "#50f9d8"];
  for (let i = 0; i < 3; i += 1) {
    const offset = (i - 1) * 20;
    const active = countdownStage > i || state.countdown <= 0;
    ctx.fillStyle = active ? withAlpha(lightColors[i], 0.92) : withAlpha(lightColors[i], 0.18);
    ctx.shadowBlur = active ? 22 : 0;
    ctx.shadowColor = lightColors[i];
    ctx.beginPath();
    ctx.arc(track.startLine.tangent.x * -32 + track.startLine.normal.x * offset, track.startLine.tangent.y * -32 + track.startLine.normal.y * offset, 6.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  for (const checkpoint of track.checkpoints) {
    ctx.fillStyle = "rgba(141,247,255,0.08)";
    ctx.beginPath();
    ctx.arc(checkpoint.x, checkpoint.y, 11 + Math.sin(time * 2 + checkpoint.index) * 1.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(141,247,255,0.16)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  for (const prop of track.props) {
    if (!prop.alive) continue;
    drawTrackProp(prop, theme, time);
  }

  for (const strip of track.surgeStrips || []) {
    ctx.save();
    ctx.translate(strip.x, strip.y);
    ctx.rotate(strip.angle);
    ctx.shadowBlur = 22;
    ctx.shadowColor = strip.color;
    const pulse = 0.72 + Math.sin(time * 5 + strip.t * TAU) * 0.18;
    ctx.fillStyle = withAlpha(strip.color, 0.14 + pulse * 0.08);
    ctx.strokeStyle = withAlpha(strip.color, 0.58 + pulse * 0.16);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.roundRect(-strip.length * 0.5, -strip.width * 0.5, strip.length, strip.width, 12);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -time * 180;
    ctx.beginPath();
    ctx.moveTo(-strip.length * 0.38, 0);
    ctx.lineTo(strip.length * 0.38, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  for (const hazard of state.hazards) {
    const pulse = 1 + Math.sin(time * 4 + hazard.x * 0.01) * 0.16;
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.strokeStyle = "rgba(255,109,127,0.58)";
    ctx.fillStyle = "rgba(255,109,127,0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius * pulse, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(time * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, -hazard.radius * 0.46);
    ctx.lineTo(hazard.radius * 0.3, hazard.radius * 0.18);
    ctx.lineTo(-hazard.radius * 0.3, hazard.radius * 0.18);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,195,201,0.52)";
    ctx.fill();
    ctx.restore();
  }

  for (const pickup of state.pickups) {
    if (!pickup.active) continue;
    const def = PICKUP_DEFS[pickup.kind];
    if (pickup.guidedBeacon) {
      const halo = 18 + Math.sin(time * 4.2) * 5;
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.strokeStyle = "rgba(141,247,255,0.68)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, 28 + halo, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(141,247,255,0.8)";
      ctx.beginPath();
      ctx.arc(0, 0, 20 + halo * 0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.rotate(time * 1.6 + pickup.t * TAU);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 16;
    ctx.shadowColor = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawTrail(car) {
  if (car.speedTrail.length < 2) return;
  const trailColor = getCarTrailColor(car);
  const design = getCarDesign(car);
  const anchors = car.speedTrail.map((sample) => {
    const angle = Number.isFinite(sample.angle) ? sample.angle : car.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: sample.x + cos * design.trailMountX,
      y: sample.y + sin * design.trailMountX,
      angle,
      tangent: { x: cos, y: sin },
      energy: sample.energy || 0,
      ageMix: clamp((sample.age || 0) / (sample.maxAge || 1), 0, 1),
    };
  });
  const ribbon = [];
  const lastIndex = anchors.length - 1;
  for (let index = 0; index < anchors.length; index += 1) {
    const current = anchors[index];
    const prev = anchors[Math.max(0, index - 1)];
    const next = anchors[Math.min(lastIndex, index + 1)];
    let tangent = normalize(next.x - prev.x, next.y - prev.y);
    if (!tangent.x && !tangent.y) tangent = current.tangent;
    const normal = { x: -tangent.y, y: tangent.x };
    const progress = lastIndex <= 0 ? 1 : index / lastIndex;
    const taper = 0.12 + 0.88 * progress * progress;
    const widthBoost = 1 + current.energy * 0.42;
    const halfWidth = design.trailRearHalf * taper * widthBoost * (0.72 + current.ageMix * 0.28);
    ribbon.push({
      center: current,
      left: {
        x: current.x + normal.x * halfWidth,
        y: current.y + normal.y * halfWidth,
      },
      right: {
        x: current.x - normal.x * halfWidth,
        y: current.y - normal.y * halfWidth,
      },
    });
  }
  if (ribbon.length < 2) return;
  const boostMix = clamp(Math.max(car.boostTimer || 0, car.slingshotTimer || 0), 0, 1.6);
  const segmentCount = ribbon.length - 1;
  const traceTrailSegment = (from, to, scale = 1) => {
    const fromLeftX = from.center.x + (from.left.x - from.center.x) * scale;
    const fromLeftY = from.center.y + (from.left.y - from.center.y) * scale;
    const toLeftX = to.center.x + (to.left.x - to.center.x) * scale;
    const toLeftY = to.center.y + (to.left.y - to.center.y) * scale;
    const toRightX = to.center.x + (to.right.x - to.center.x) * scale;
    const toRightY = to.center.y + (to.right.y - to.center.y) * scale;
    const fromRightX = from.center.x + (from.right.x - from.center.x) * scale;
    const fromRightY = from.center.y + (from.right.y - from.center.y) * scale;
    ctx.beginPath();
    ctx.moveTo(fromLeftX, fromLeftY);
    ctx.lineTo(toLeftX, toLeftY);
    ctx.lineTo(toRightX, toRightY);
    ctx.lineTo(fromRightX, fromRightY);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = car.isPlayer ? 0.92 : 0.78;
  ctx.shadowBlur = 26 + boostMix * 8;
  ctx.shadowColor = withAlpha(trailColor, 0.34 + boostMix * 0.08);
  for (let index = 0; index < segmentCount; index += 1) {
    const fade = Math.pow((index + 1) / segmentCount, 1.4);
    ctx.fillStyle = withAlpha(trailColor, fade * (car.isPlayer ? 0.16 + boostMix * 0.04 : 0.11 + boostMix * 0.03));
    traceTrailSegment(ribbon[index], ribbon[index + 1], 1);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  for (let index = 0; index < segmentCount; index += 1) {
    const fade = Math.pow((index + 1) / segmentCount, 1.22);
    ctx.fillStyle = withAlpha(trailColor, fade * (car.isPlayer ? 0.42 + boostMix * 0.08 : 0.3 + boostMix * 0.05));
    traceTrailSegment(ribbon[index], ribbon[index + 1], 0.44);
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (let index = 0; index < segmentCount; index += 1) {
    const fade = Math.pow((index + 1) / segmentCount, 1.16);
    const from = ribbon[index].center;
    const to = ribbon[index + 1].center;
    ctx.strokeStyle = withAlpha(trailColor, fade * (0.86 + boostMix * 0.06));
    ctx.lineWidth = (car.isPlayer ? 0.9 : 0.7) + fade * (car.isPlayer ? 1.05 : 0.72);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGhost(sample) {
  if (!sample) return;
  const design = getCarDesign({ def: { maxSpeed: 356, accel: 448, durability: 122, grip: 7.2, bodyStyle: "touring", visualLength: 42, visualWidth: 22 }, length: 42, width: 22 });
  ctx.save();
  ctx.translate(sample.x, sample.y);
  ctx.rotate(sample.angle);
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  tracePolygon(design.tub);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  tracePolygon(design.tub);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCar(car) {
  if (car.destroyed) {
    drawDestroyedCar(car);
    return;
  }
  drawTrail(car);
  const bodyColor = getCarBodyColor(car);
  const accentColor = getCarAccentColor(car);
  const design = getCarDesign(car);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = car.invuln > 0 ? 0.6 + Math.sin(state.ambientTime * 24) * 0.25 : 1;
  const damagePct = clamp(car.damage / car.def.durability, 0, 1);
  const parts = new Set(car.visibleParts);

  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(0, 7, car.length * 0.76, design.width * 0.38, 0, 0, TAU);
  ctx.fill();

  ctx.shadowBlur = 22;
  ctx.shadowColor = withAlpha(accentColor, 0.4);
  ctx.fillStyle = withAlpha(accentColor, 0.14 + (car.isPlayer ? 0.08 : 0.02));
  ctx.beginPath();
  ctx.ellipse(-car.length * 0.02, 0, car.length * 0.84, design.width * 0.44, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (car.rival) {
    ctx.strokeStyle = "rgba(255,92,203,0.56)";
    ctx.lineWidth = 2.2;
    tracePolygon(design.floor);
    ctx.stroke();
  }
  if (car.shieldTimer > 0 || car.invuln > 0) {
    ctx.strokeStyle = car.shieldTimer > 0 ? "#8df7ff" : "rgba(255,255,255,0.78)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, car.length * 0.74 + Math.sin(state.ambientTime * 10) * 3, 0, TAU);
    ctx.stroke();
  }
  if (car.boostTimer > 0) {
    ctx.fillStyle = "rgba(255,211,110,0.82)";
    ctx.beginPath();
    ctx.moveTo(-car.length * 0.58, 0);
    ctx.lineTo(-car.length * 1.02, -10);
    ctx.lineTo(-car.length * 1.18, 0);
    ctx.lineTo(-car.length * 1.02, 10);
    ctx.closePath();
    ctx.fill();
  }

  drawCarWheels(design);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  tracePolygon(design.floor);
  ctx.fill();

  if (parts.has("spoiler")) {
    ctx.fillStyle = withAlpha(bodyColor, 0.88);
    tracePolygon(design.rearWing);
    ctx.fill();
  }
  if (parts.has("bumper")) {
    ctx.fillStyle = withAlpha(bodyColor, 0.94);
    tracePolygon(design.frontWing);
    ctx.fill();
  }
  if (parts.has("door")) {
    ctx.fillStyle = withAlpha(bodyColor, 0.88);
    for (const pod of design.sidepods) {
      tracePolygon(pod);
      ctx.fill();
    }
  }

  ctx.shadowBlur = 18;
  ctx.shadowColor = withAlpha(accentColor, 0.52);
  ctx.fillStyle = car.chassisFlash > 0 ? "#ffffff" : bodyColor;
  tracePolygon(design.tub);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (parts.has("panel")) {
    ctx.fillStyle = withAlpha(bodyColor, 0.94);
    tracePolygon(design.engineCover);
    ctx.fill();
  }

  ctx.fillStyle = withAlpha("#08101d", 0.96);
  tracePolygon(design.canopy);
  ctx.fill();

  ctx.fillStyle = withAlpha("#f8fbff", 0.82);
  tracePolygon(design.glass);
  ctx.fill();

  ctx.fillStyle = withAlpha("#ffffff", 0.88);
  for (const light of design.headlights) ctx.fillRect(light.x, light.y, light.w, light.h);
  ctx.fillStyle = withAlpha(car.isPlayer ? accentColor : "#ff6d7f", 0.82);
  for (const light of design.taillights) ctx.fillRect(light.x, light.y, light.w, light.h);

  drawCarHighlights(design, accentColor, parts);

  if (damagePct > 0.28) {
    ctx.strokeStyle = withAlpha("#08101d", 0.58 + damagePct * 0.2);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-car.length * 0.08, -car.width * 0.14);
    ctx.lineTo(car.length * 0.12, -car.width * 0.02);
    ctx.lineTo(car.length * 0.34, car.width * 0.12);
    ctx.stroke();
    if (damagePct > 0.58) {
      ctx.beginPath();
      ctx.moveTo(-car.length * 0.24, car.width * 0.06);
      ctx.lineTo(car.length * 0.04, car.width * 0.18);
      ctx.lineTo(car.length * 0.18, car.width * 0.26);
      ctx.stroke();
    }
  }

  if (car.pickup) {
    ctx.strokeStyle = PICKUP_DEFS[car.pickup].color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, car.length * 0.7, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = withAlpha(PICKUP_DEFS[car.pickup].color, 0.86);
    ctx.font = '700 10px "Orbitron", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PICKUP_DEFS[car.pickup].icon, 0, -car.length * 0.76);
  }
  if (car.isPlayer) {
    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    ctx.lineWidth = 1.5;
    tracePolygon(design.floor);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEffects() {
  for (const piece of state.debris) {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.life * 4);
    ctx.globalAlpha = clamp(piece.life / 2, 0.15, 0.9);
    if (piece.streak) {
      ctx.strokeStyle = piece.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-piece.size * 0.9, 0);
      ctx.lineTo(piece.size * 0.8, 0);
      ctx.stroke();
    }
    ctx.fillStyle = piece.color;
    ctx.beginPath();
    ctx.moveTo(-piece.size * 0.55, -piece.size * 0.32);
    ctx.lineTo(piece.size * 0.46, -piece.size * 0.4);
    ctx.lineTo(piece.size * 0.62, piece.size * 0.18);
    ctx.lineTo(-piece.size * 0.4, piece.size * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const effect of state.fx) {
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.globalAlpha = clamp(effect.life * 1.8, 0, 1);
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    if (effect.kind === "spark") {
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * TAU + state.ambientTime * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * effect.radius, Math.sin(angle) * effect.radius);
        ctx.stroke();
      }
    } else if (effect.kind === "flame") {
      ctx.rotate(effect.angle || 0);
      ctx.shadowBlur = 18;
      ctx.shadowColor = effect.color;
      ctx.fillStyle = withAlpha(effect.color, clamp(effect.life * 5, 0, 0.92));
      ctx.beginPath();
      ctx.moveTo(-effect.length * 0.95, 0);
      ctx.lineTo(effect.length * 0.2, -effect.radius);
      ctx.lineTo(effect.length * 0.42, 0);
      ctx.lineTo(effect.length * 0.2, effect.radius);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,245,224,0.78)";
      ctx.beginPath();
      ctx.moveTo(-effect.length * 0.52, 0);
      ctx.lineTo(effect.length * 0.04, -effect.radius * 0.38);
      ctx.lineTo(effect.length * 0.14, 0);
      ctx.lineTo(effect.length * 0.04, effect.radius * 0.38);
      ctx.closePath();
      ctx.fill();
    } else if (effect.kind === "heat-veil") {
      ctx.rotate(effect.angle || 0);
      ctx.strokeStyle = withAlpha(effect.color, clamp(effect.life * 3.4, 0, 0.32));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, effect.radius * 1.25, effect.radius * 0.56, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.38;
      ctx.beginPath();
      ctx.ellipse(effect.radius * 0.18, 0, effect.radius * 1.45, effect.radius * 0.72, 0, 0, TAU);
      ctx.stroke();
    } else if (effect.kind === "shock-diamond") {
      ctx.rotate(effect.angle || 0);
      ctx.shadowBlur = 18;
      ctx.shadowColor = effect.color;
      ctx.lineWidth = 3;
      const radius = effect.radius;
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius, 0);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.7);
      ctx.lineTo(radius * 0.7, 0);
      ctx.lineTo(0, radius * 0.7);
      ctx.lineTo(-radius * 0.7, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (effect.kind === "smoke") {
      ctx.fillStyle = withAlpha("#0e1524", clamp(effect.life * 0.28, 0, 0.28));
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(effect.color || "#8df7ff", clamp(effect.life * 0.18, 0, 0.18));
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (effect.kind === "ember") {
      ctx.shadowBlur = 16;
      ctx.shadowColor = effect.color;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, TAU);
      ctx.fill();
    } else if (effect.kind === "speed-line") {
      ctx.rotate(effect.angle || 0);
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-effect.radius * 2.1, 0);
      ctx.lineTo(effect.radius * 0.5, 0);
      ctx.stroke();
      ctx.globalAlpha *= 0.55;
      ctx.beginPath();
      ctx.moveTo(-effect.radius * 1.5, 3);
      ctx.lineTo(effect.radius * 0.2, 3);
      ctx.stroke();
    } else if (effect.kind === "skid") {
      ctx.rotate(effect.angle || 0);
      ctx.lineCap = "round";
      ctx.lineWidth = 2.8;
      const gap = Math.max(6, effect.radius * 0.32);
      const length = effect.length || effect.radius * 1.8;
      ctx.beginPath();
      ctx.moveTo(-length * 0.8, -gap);
      ctx.lineTo(length * 0.2, -gap);
      ctx.moveTo(-length * 0.8, gap);
      ctx.lineTo(length * 0.2, gap);
      ctx.stroke();
    } else if (effect.kind === "pickup-bloom" || effect.kind === "boost-bloom") {
      ctx.rotate(state.ambientTime * 2.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -effect.radius);
      ctx.lineTo(effect.radius, 0);
      ctx.lineTo(0, effect.radius);
      ctx.lineTo(-effect.radius, 0);
      ctx.closePath();
      ctx.stroke();
    } else if (effect.kind === "surge-strip") {
      ctx.rotate(effect.angle || 0);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-effect.radius * 2.4, 0);
      ctx.lineTo(effect.radius * 2.4, 0);
      ctx.stroke();
      ctx.globalAlpha *= 0.48;
      ctx.beginPath();
      ctx.moveTo(-effect.radius * 1.8, -6);
      ctx.lineTo(effect.radius * 1.8, -6);
      ctx.moveTo(-effect.radius * 1.8, 6);
      ctx.lineTo(effect.radius * 1.8, 6);
      ctx.stroke();
    } else if (effect.kind === "rival-flash") {
      ctx.rotate(state.ambientTime * 3);
      ctx.lineWidth = 2;
      ctx.strokeRect(-effect.radius, -effect.radius, effect.radius * 2, effect.radius * 2);
    } else {
      ctx.lineWidth = effect.kind === "shield" ? 5 : 4;
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawScreenEffects() {
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  const vignette = ctx.createRadialGradient(
    state.width * 0.5,
    state.height * 0.45,
    Math.min(state.width, state.height) * 0.12,
    state.width * 0.5,
    state.height * 0.5,
    Math.max(state.width, state.height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, state.width, state.height);

  for (const burst of state.screenBursts) {
    const alpha = clamp((burst.timer / Math.max(0.001, burst.duration)) * burst.strength, 0, burst.strength);
    if (burst.mode === "edge") {
      const edge = ctx.createLinearGradient(0, 0, state.width, state.height);
      edge.addColorStop(0, withAlpha(burst.color, alpha));
      edge.addColorStop(0.24, "rgba(0,0,0,0)");
      edge.addColorStop(0.76, "rgba(0,0,0,0)");
      edge.addColorStop(1, withAlpha(burst.color, alpha * 0.78));
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, state.width, state.height);
    } else {
      const bloom = ctx.createRadialGradient(
        state.width * 0.5,
        state.height * 0.5,
        Math.min(state.width, state.height) * 0.04,
        state.width * 0.5,
        state.height * 0.5,
        Math.max(state.width, state.height) * 0.7,
      );
      bloom.addColorStop(0, withAlpha(burst.color, alpha * 0.9));
      bloom.addColorStop(0.32, withAlpha(burst.color, alpha * 0.36));
      bloom.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  if (!state.player || state.mode === "menu") return;
  const sector = state.currentSector || (state.player.sectorTag ? { tag: state.player.sectorTag } : null);
  if (sector) {
    const overlay = sector.tag === "hazard"
      ? `rgba(255, 62, 122, ${0.045 + Math.sin(state.ambientTime * 6.2) * 0.015})`
      : sector.tag === "recovery"
        ? "rgba(72,255,196,0.032)"
        : sector.tag === "technical"
          ? "rgba(255,164,64,0.028)"
          : "rgba(82,228,255,0.024)";
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, state.width, state.height);
  }
  if (state.rivalStatus && (state.rivalStatus.phase === "nose" || state.rivalStatus.phase === "bumper")) {
    const pulse = 0.1 + (Math.sin(state.ambientTime * 12) + 1) * 0.045;
    const edge = ctx.createLinearGradient(0, 0, state.width, 0);
    edge.addColorStop(0, `rgba(255,70,185,${pulse})`);
    edge.addColorStop(0.14, "rgba(255,70,185,0)");
    edge.addColorStop(0.86, "rgba(255,70,185,0)");
    edge.addColorStop(1, `rgba(255,70,185,${pulse})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, state.width, state.height);
  }
  if (state.player.slingshotTimer > 0.1) {
    const alpha = 0.028 + Math.min(0.06, state.player.slingshotTimer * 0.035);
    const sling = ctx.createLinearGradient(0, state.height, state.width, 0);
    sling.addColorStop(0, `rgba(92,249,255,${alpha})`);
    sling.addColorStop(0.5, "rgba(92,249,255,0)");
    sling.addColorStop(1, `rgba(255,175,86,${alpha * 0.7})`);
    ctx.fillStyle = sling;
    ctx.fillRect(0, 0, state.width, state.height);
  }
  if (state.countdown > 0) {
    const alpha = 0.04 + Math.sin(state.ambientTime * 12) * 0.015;
    const glow = ctx.createRadialGradient(state.width * 0.5, state.height * 0.5, 40, state.width * 0.5, state.height * 0.5, state.width * 0.46);
    glow.addColorStop(0, `rgba(255,177,0,${alpha * 1.8})`);
    glow.addColorStop(0.28, `rgba(255,177,0,${alpha})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.width, state.height);
  }
  const speedFactor = clamp(Math.hypot(state.player.vx, state.player.vy) / 420, 0, 1);
  const sectorBoost = sector?.tag === "high-speed" ? 0.14 : sector?.tag === "technical" ? -0.03 : 0;
  if (speedFactor > 0.18 || sectorBoost > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = sector?.tag === "technical"
      ? `rgba(255,186,102,${0.05 + speedFactor * 0.06})`
      : sector?.tag === "hazard"
        ? `rgba(255,104,162,${0.06 + speedFactor * 0.07})`
        : `rgba(141,247,255,${0.07 + speedFactor * 0.08 + sectorBoost * 0.12})`;
    ctx.lineWidth = 1.4;
    const streakCount = 6 + Math.floor((speedFactor + sectorBoost) * 8);
    for (let i = 0; i < streakCount; i += 1) {
      const y = (i / streakCount) * state.height;
      const drift = (state.ambientTime * 240 + i * 90) % (state.width + 220);
      ctx.beginPath();
      ctx.moveTo(state.width - drift, y);
      ctx.lineTo(state.width - drift - 120 - speedFactor * 140, y - 18 - speedFactor * 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(drift * 0.24, state.height - y);
      ctx.lineTo(drift * 0.24 + 96 + speedFactor * 110, state.height - y - 16);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMinimap() {
  if (!state.track || state.mode === "menu") return;
  const mapW = 178;
  const mapH = 116;
  const x = state.width - mapW - 24;
  const y = state.height - mapH - 22;
  const bounds = getTrackBounds(state.track);
  const scale = Math.min((mapW - 18) / (bounds.maxX - bounds.minX || 1), (mapH - 18) / (bounds.maxY - bounds.minY || 1));
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  ctx.fillStyle = "rgba(4, 8, 18, 0.76)";
  ctx.strokeStyle = "rgba(141,247,255,0.22)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, mapW, mapH);
  ctx.strokeRect(x, y, mapW, mapH);
  ctx.beginPath();
  state.track.points.forEach((point, index) => {
    const px = x + 9 + (point.x - bounds.minX) * scale;
    const py = y + 9 + (point.y - bounds.minY) * scale;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (state.track.type === "circuit") ctx.closePath();
  ctx.strokeStyle = state.track.theme.trackEdge;
  ctx.lineWidth = 2;
  ctx.stroke();

  const ghost = getGhostSample();
  if (ghost) {
    const gx = x + 9 + (ghost.x - bounds.minX) * scale;
    const gy = y + 9 + (ghost.y - bounds.minY) * scale;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(gx - 2, gy - 2, 4, 4);
  }
  for (const car of state.cars) {
    if (car.destroyed) continue;
    const px = x + 9 + (car.x - bounds.minX) * scale;
    const py = y + 9 + (car.y - bounds.minY) * scale;
    ctx.fillStyle = car.isPlayer ? "#ffffff" : car.rival ? "#ff5ccb" : getCarAccentColor(car);
    ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
  }
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = '600 10px "Orbitron", sans-serif';
  ctx.fillText("TRACK", x + 10, y + 14);
}

function getIsoViewport() {
  return {
    x: state.width * 0.5 + (state.camera.jitterX || 0),
    y: state.height * 0.58 + (state.camera.jitterY || 0),
  };
}

function projectWorldPoint(x, y, z = 0) {
  return projectIsoPoint(x, y, z, state.camera, getIsoViewport(), state.viewScale, ISO_PROJECTION);
}

function traceScreenPolygon(points) {
  if (!points?.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
}

function traceScreenRibbon(ribbon) {
  if (!ribbon?.left?.length) return;
  ctx.beginPath();
  ctx.moveTo(ribbon.left[0].x, ribbon.left[0].y);
  for (let index = 1; index < ribbon.left.length; index += 1) ctx.lineTo(ribbon.left[index].x, ribbon.left[index].y);
  for (let index = ribbon.right.length - 1; index >= 0; index -= 1) ctx.lineTo(ribbon.right[index].x, ribbon.right[index].y);
  ctx.closePath();
}

function traceProjectedLine(points) {
  if (!points?.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
}

function getProjectedTrackLine(track) {
  return track.points.map((point) => projectWorldPoint(point.x, point.y, point.z || 0));
}

function getGroundHeightAtPosition(x, y) {
  if (!state.track) return 0;
  const info = nearestPathInfo(state.track, x, y);
  return sampleTrackHeight(state.track, info.t);
}

function drawIsoVerticalFeature(feature, theme, accent, fill, scaleBoost = 1) {
  const base = projectWorldPoint(feature.x, feature.y, feature.z || 0);
  const top = projectWorldPoint(feature.x, feature.y, (feature.z || 0) + (feature.height || feature.size * 1.8));
  const footprint = (feature.size || 24) * 0.34 * scaleBoost;
  const leftBase = projectWorldPoint(feature.x - footprint * 0.55, feature.y + footprint * 0.55, feature.z || 0);
  const rightBase = projectWorldPoint(feature.x + footprint * 0.7, feature.y - footprint * 0.7, feature.z || 0);
  const leftTop = projectWorldPoint(feature.x - footprint * 0.55, feature.y + footprint * 0.55, (feature.z || 0) + (feature.height || feature.size * 1.8));
  const rightTop = projectWorldPoint(feature.x + footprint * 0.7, feature.y - footprint * 0.7, (feature.z || 0) + (feature.height || feature.size * 1.8));

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.2, state.viewScale * 2.2);
  ctx.strokeStyle = withAlpha(accent, 0.58);
  ctx.fillStyle = withAlpha(fill, 0.88);

  traceScreenPolygon([leftBase, rightBase, rightTop, leftTop]);
  ctx.fillStyle = withAlpha(fill, 0.64);
  ctx.fill();
  ctx.stroke();

  traceScreenPolygon([base, rightBase, rightTop, top]);
  ctx.fillStyle = withAlpha(fill, 0.8);
  ctx.fill();
  ctx.stroke();

  traceScreenPolygon([base, leftBase, leftTop, top]);
  ctx.fillStyle = withAlpha(fill, 0.54);
  ctx.fill();
  ctx.stroke();

  if (feature.kind === "pine-shoulder") {
    ctx.fillStyle = withAlpha(accent, 0.22);
    traceScreenPolygon([
      projectWorldPoint(feature.x, feature.y, (feature.z || 0) + feature.height * 0.98),
      projectWorldPoint(feature.x + footprint * 0.8, feature.y - footprint * 0.8, (feature.z || 0) + feature.height * 0.4),
      projectWorldPoint(feature.x, feature.y, (feature.z || 0) + feature.height * 0.22),
      projectWorldPoint(feature.x - footprint * 0.8, feature.y + footprint * 0.8, (feature.z || 0) + feature.height * 0.4),
    ]);
    ctx.fill();
  }
  ctx.restore();
}

function drawIsoScenery(track, theme) {
  const scenery = [
    ...(track.landmarkAnchors || []).map((anchor) => ({ ...anchor, visual: "landmark" })),
    ...(track.props || []).filter((prop) => prop.alive).map((prop) => ({ ...prop, visual: "prop" })),
  ].map((feature) => ({
    ...feature,
    screen: projectWorldPoint(feature.x, feature.y, (feature.z || 0) + (feature.visual === "landmark" ? feature.height * 0.08 : 0)),
  })).sort((a, b) => a.screen.y - b.screen.y);

  for (const feature of scenery) {
    const accent = feature.sectorTag === "high-speed"
      ? "#ffd36e"
      : feature.sectorTag === "technical"
        ? theme.trackEdge
        : feature.side === "outer"
          ? theme.decoA
          : theme.decoB;
    const fill = feature.visual === "landmark" ? theme.inside : withAlpha(theme.inside, 0.82);
    drawIsoVerticalFeature(feature, theme, accent, fill, feature.visual === "landmark" ? 1.18 : 0.9);
  }
}

function drawIsoGate(gate, accent = "#8df7ff") {
  if (!gate) return;
  const left = projectWorldPoint(
    gate.x + gate.normal.x * gate.halfWidth,
    gate.y + gate.normal.y * gate.halfWidth,
    gate.z || 0,
  );
  const right = projectWorldPoint(
    gate.x - gate.normal.x * gate.halfWidth,
    gate.y - gate.normal.y * gate.halfWidth,
    gate.z || 0,
  );
  ctx.save();
  ctx.strokeStyle = withAlpha(accent, 0.92);
  ctx.lineWidth = Math.max(4, state.viewScale * 7);
  ctx.shadowBlur = 18;
  ctx.shadowColor = withAlpha(accent, 0.48);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
  const blocks = 8;
  const normal = normalize(right.y - left.y, left.x - right.x);
  for (let index = 0; index < blocks; index += 1) {
    const mix = index / blocks;
    const nextMix = (index + 1) / blocks;
    const a = { x: lerp(left.x, right.x, mix), y: lerp(left.y, right.y, mix) };
    const b = { x: lerp(left.x, right.x, nextMix), y: lerp(left.y, right.y, nextMix) };
    const depth = 6;
    ctx.fillStyle = index % 2 === 0 ? "rgba(247,242,255,0.92)" : withAlpha(accent, 0.9);
    traceScreenPolygon([
      { x: a.x + normal.x * depth, y: a.y + normal.y * depth },
      { x: b.x + normal.x * depth, y: b.y + normal.y * depth },
      { x: b.x - normal.x * depth, y: b.y - normal.y * depth },
      { x: a.x - normal.x * depth, y: a.y - normal.y * depth },
    ]);
    ctx.fill();
  }
  ctx.restore();
}

function drawIsoTrackWorld() {
  const track = state.track;
  const theme = track.theme;
  const topRibbon = buildIsoRibbon(track, state.camera, getIsoViewport(), state.viewScale);
  const lowerRibbon = buildIsoRibbon(track, state.camera, getIsoViewport(), state.viewScale, {
    heightOffset: -ISO_PROJECTION.roadDepth,
    bankScale: 0.56,
    width: track.width * 1.02,
  });

  drawIsoScenery(track, theme);

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  traceScreenRibbon(lowerRibbon);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowBlur = 28;
  ctx.shadowColor = theme.glow;
  ctx.fillStyle = theme.track;
  traceScreenRibbon(topRibbon);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = withAlpha(theme.trackEdge, 0.8);
  ctx.lineWidth = Math.max(3, state.viewScale * 6);
  traceScreenRibbon(topRibbon);
  ctx.stroke();

  const projectedLine = getProjectedTrackLine(track);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = Math.max(1.2, state.viewScale * 2.2);
  ctx.setLineDash([18, 16]);
  traceProjectedLine(projectedLine);
  if (track.type === "circuit") ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  if (state.currentEvent?.guided) {
    ctx.strokeStyle = "rgba(141,247,255,0.28)";
    ctx.lineWidth = Math.max(1.4, state.viewScale * 2.6);
    ctx.setLineDash([10, 8]);
    traceProjectedLine(projectedLine);
    if (track.type === "circuit") ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const strip of track.surgeStrips || []) {
    const from = projectWorldPoint(
      strip.x - strip.tangent.x * strip.length * 0.5,
      strip.y - strip.tangent.y * strip.length * 0.5,
      (strip.z || getGroundHeightAtPosition(strip.x, strip.y)) + 4,
    );
    const to = projectWorldPoint(
      strip.x + strip.tangent.x * strip.length * 0.5,
      strip.y + strip.tangent.y * strip.length * 0.5,
      (strip.z || getGroundHeightAtPosition(strip.x, strip.y)) + 4,
    );
    ctx.strokeStyle = withAlpha(strip.color, 0.76);
    ctx.lineWidth = Math.max(2.2, state.viewScale * 4);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (const hazard of state.hazards) {
    const point = projectWorldPoint(hazard.x, hazard.y, (hazard.z || getGroundHeightAtPosition(hazard.x, hazard.y)) + 3);
    const radius = Math.max(8, hazard.radius * state.viewScale * 0.2);
    ctx.strokeStyle = "rgba(255,109,127,0.62)";
    ctx.fillStyle = "rgba(255,109,127,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  for (const pickup of state.pickups) {
    if (!pickup.active) continue;
    const def = PICKUP_DEFS[pickup.kind];
    const point = projectWorldPoint(pickup.x, pickup.y, (pickup.z || getGroundHeightAtPosition(pickup.x, pickup.y) + 14));
    const radius = pickup.guidedBeacon ? 16 : 10;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(state.ambientTime * 0.9);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = Math.max(2, state.viewScale * 3.2);
    ctx.shadowBlur = 16;
    ctx.shadowColor = def.color;
    traceScreenPolygon([
      { x: 0, y: -radius },
      { x: radius * 0.8, y: 0 },
      { x: 0, y: radius },
      { x: -radius * 0.8, y: 0 },
    ]);
    ctx.stroke();
    ctx.restore();
  }

  drawIsoGate(track.startLine, track.type === "circuit" ? "#ffd36e" : "#8df7ff");
  if (track.type === "sprint") drawIsoGate(track.finishLine, "#ff6d7f");
}

function projectCarLocalPoint(car, localX, localY, zOffset = 0) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  return projectWorldPoint(
    car.x + cos * localX - sin * localY,
    car.y + sin * localX + cos * localY,
    (car.groundZ || 0) + zOffset,
  );
}

function buildProjectedCarPolygon(car, polygon, zOffset = 0) {
  return polygon.map(([x, y]) => projectCarLocalPoint(car, x, y, zOffset));
}

function drawIsoTrail(car) {
  if (car.speedTrail.length < 2) return;
  const trailColor = getCarTrailColor(car);
  const design = getCarDesign(car);
  const points = car.speedTrail.map((sample) => {
    const angle = Number.isFinite(sample.angle) ? sample.angle : car.angle;
    const z = sample.z ?? getGroundHeightAtPosition(sample.x, sample.y);
    return projectWorldPoint(
      sample.x + Math.cos(angle) * design.trailMountX,
      sample.y + Math.sin(angle) * design.trailMountX,
      z + 6 + (sample.energy || 0) * 10,
    );
  });
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 1; index < points.length; index += 1) {
    const fade = index / points.length;
    ctx.strokeStyle = withAlpha(trailColor, 0.2 + fade * 0.46);
    ctx.lineWidth = Math.max(1.6, state.viewScale * (2.2 + fade * 4.2));
    ctx.beginPath();
    ctx.moveTo(points[index - 1].x, points[index - 1].y);
    ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIsoCar(car, ghost = false) {
  if (!car) return;
  const design = getCarDesign(car);
  const bodyColor = ghost ? "rgba(255,255,255,0.06)" : car.destroyed ? "#090d16" : getCarBodyColor(car);
  const accentColor = ghost ? "rgba(255,255,255,0.78)" : getCarAccentColor(car);
  const base = buildProjectedCarPolygon(car, design.tub, ghost ? 8 : 6);
  const top = buildProjectedCarPolygon(car, design.tub, ghost ? 18 : 18);
  const canopy = buildProjectedCarPolygon(car, design.canopy, ghost ? 24 : 25);
  const center = projectWorldPoint(car.x, car.y, (car.groundZ || 0) + 10);

  if (!ghost) {
    drawIsoTrail(car);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + state.viewScale * 10, car.length * state.viewScale * 0.18, design.width * state.viewScale * 0.14, 0, 0, TAU);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = ghost ? 0.5 : car.invuln > 0 ? 0.66 + Math.sin(state.ambientTime * 24) * 0.2 : 1;
  for (let index = 0; index < base.length; index += 1) {
    const nextIndex = (index + 1) % base.length;
    traceScreenPolygon([base[index], base[nextIndex], top[nextIndex], top[index]]);
    ctx.fillStyle = withAlpha(accentColor, ghost ? 0.12 : 0.16 + (index % 2) * 0.05);
    ctx.fill();
  }
  ctx.shadowBlur = ghost ? 0 : 18;
  ctx.shadowColor = withAlpha(accentColor, 0.4);
  traceScreenPolygon(top);
  ctx.fillStyle = ghost ? bodyColor : car.chassisFlash > 0 ? "#ffffff" : bodyColor;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(accentColor, ghost ? 0.7 : 0.74);
  ctx.lineWidth = Math.max(1.2, state.viewScale * 2.4);
  ctx.stroke();

  traceScreenPolygon(canopy);
  ctx.fillStyle = ghost ? "rgba(255,255,255,0.02)" : withAlpha("#08101d", 0.94);
  ctx.fill();
  if (!ghost) {
    ctx.strokeStyle = withAlpha("#f8fbff", 0.18);
    ctx.lineWidth = Math.max(1, state.viewScale * 1.6);
    ctx.stroke();
  }

  if (!ghost && car.pickup) {
    ctx.strokeStyle = PICKUP_DEFS[car.pickup].color;
    ctx.lineWidth = Math.max(1.4, state.viewScale * 2.4);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y - state.viewScale * 8, car.length * state.viewScale * 0.2, design.width * state.viewScale * 0.18, 0, 0, TAU);
    ctx.stroke();
  }
  if (!ghost && car.rival) {
    ctx.strokeStyle = "rgba(255,92,203,0.64)";
    ctx.lineWidth = Math.max(1.1, state.viewScale * 2);
    traceScreenPolygon(base);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIsoGhost(sample) {
  if (!sample) return;
  const ghostCar = {
    ...sample,
    def: { maxSpeed: 356, accel: 448, durability: 122, grip: 7.2, bodyStyle: "touring", visualLength: 42, visualWidth: 22 },
    length: 42,
    width: 22,
    groundZ: getGroundHeightAtPosition(sample.x, sample.y),
  };
  drawIsoCar(ghostCar, true);
}

function drawIsoEffects() {
  for (const piece of state.debris) {
    const point = projectWorldPoint(piece.x, piece.y, getGroundHeightAtPosition(piece.x, piece.y) + (piece.size || 4));
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(piece.life * 4);
    ctx.globalAlpha = clamp(piece.life / 2, 0.15, 0.9);
    ctx.fillStyle = piece.color;
    ctx.beginPath();
    ctx.moveTo(-piece.size * 0.55, -piece.size * 0.24);
    ctx.lineTo(piece.size * 0.48, -piece.size * 0.4);
    ctx.lineTo(piece.size * 0.62, piece.size * 0.18);
    ctx.lineTo(-piece.size * 0.4, piece.size * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const effect of state.fx) {
    const point = projectWorldPoint(effect.x, effect.y, (effect.z ?? getGroundHeightAtPosition(effect.x, effect.y)) + (effect.kind === "flame" ? 12 : 8));
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.globalAlpha = clamp(effect.life * 1.8, 0, 1);
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    const radius = Math.max(4, effect.radius * state.viewScale * 0.26);
    if (effect.kind === "flame" || effect.kind === "smoke") {
      ctx.rotate(effect.angle || 0);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (effect.kind === "flame" ? 1.8 : 1.2), radius * 0.7, 0, 0, TAU);
      if (effect.kind === "flame") ctx.fill();
      else ctx.stroke();
    } else if (effect.kind === "spark" || effect.kind === "ember") {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.44, 0, TAU);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1.6, state.viewScale * 2.2);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function renderRaceWorld() {
  if (!state.track || (state.mode !== "race" && state.mode !== "results" && state.mode !== "paused")) return;
  setCamera();
  drawIsoTrackWorld();
  drawIsoGhost(getGhostSample());
  const renderCars = [...state.cars.filter((item) => !item.isPlayer), state.player]
    .filter(Boolean)
    .map((car) => ({ car, depth: projectWorldPoint(car.x, car.y, car.groundZ || 0).y }))
    .sort((a, b) => a.depth - b.depth);
  for (const item of renderCars) drawIsoCar(item.car);
  drawIsoEffects();
}

function render() {
  drawBackground();
  renderRaceWorld();
  drawScreenEffects();
  if (state.mode === "menu") {
    ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.font = '700 13px "Orbitron", sans-serif';
    ctx.fillText("START FAST // WRECK HARD // RECOVER QUICKLY", 30, state.height - 22);
  }
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  state.pixelRatio = ratio;
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * ratio);
  canvas.height = Math.floor(state.height * ratio);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ui.updateMenuScale();
  render();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

function step(realDt) {
  const dt = clamp(realDt, 0.001, 0.05);
  state.ambientTime += dt;
  pollGamepad();
  if (state.mode === "paused") {
    ui.updateHud();
    ui.syncPause();
    ui.updateTimers(dt);
    audio.update();
    return;
  }
  if (state.slowMo > 0) {
    state.slowMo = Math.max(0, state.slowMo - dt);
    updateRace(dt * 0.38);
  } else {
    updateRace(dt);
  }
  if (state.mode !== "race") ui.updateTimers(dt);
  audio.update();
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  const target = event.target;
  if (state.bindingAction) {
    event.preventDefault();
    if (["tab", "shift", "control", "alt", "meta"].includes(key)) return;
    if (key === "escape") {
      state.bindingAction = null;
      ui.syncMenu();
      return;
    }
    finishBinding(key);
    return;
  }
  state.keys.add(key);
  if (state.mode === "menu" && state.menuStage === "splash") {
    if (key === "enter" || key === " ") {
      event.preventDefault();
      enterGarage();
    }
    return;
    }
    if (key === getControlBinding(state.save.settings, "fullscreen")) toggleFullscreen();
    if ((key === getControlBinding(state.save.settings, "pause") || key === "p") && (state.mode === "race" || state.mode === "paused")) {
      event.preventDefault();
      togglePause();
      return;
    }
    if ((key === "arrowleft" || key === "arrowright") && state.mode === "menu" && state.menuStage === "hub" && state.menuScreen === "race" && canUseMenuHomeShortcut(target)) {
      event.preventDefault();
      ui.cycleHomePane(key === "arrowright" ? 1 : -1);
      return;
    }
    if ((key === "arrowleft" || key === "arrowright") && state.mode === "results" && !isInteractiveShortcutTarget(target)) {
      event.preventDefault();
      ui.cycleResultsPane(key === "arrowright" ? 1 : -1);
      return;
    }
    if (key === getControlBinding(state.save.settings, "retry") && (state.mode === "race" || state.mode === "results" || state.mode === "paused")) retryRace();
    if (key === "enter" && canUseMenuHomeShortcut(target)) startSelectedRace();
    if (key === "enter" && state.mode === "results" && !isInteractiveShortcutTarget(target)) retryRace();
    if (key === getControlBinding(state.save.settings, "quick") && canUseMenuHomeShortcut(target)) startQuickRace();
  if ((key === getControlBinding(state.save.settings, "daily") || key === "d") && canUseMenuHomeShortcut(target)) startDailyRace();
  if (key === "r" && canUseMenuHomeShortcut(target)) rerollStrikeBoard();
  if (key === "escape" && state.mode === "results") backToMenu();
}

function handleKeyUp(event) {
  state.keys.delete(event.key.toLowerCase());
}

function loop(timestamp) {
  if (!state.lastTick) state.lastTick = timestamp;
  const dt = (timestamp - state.lastTick) / 1000;
  state.lastTick = timestamp;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

function attachBusListeners() {
  bus.on("pickup_collect", ({ pickupId, player }) => {
    if (!player) return;
    const color = PICKUP_DEFS[pickupId].color;
    emitShardBurst(state.player.x, state.player.y, color, 6, state.player.angle, TAU * 0.7, 70, 180);
    spawnImpactBloom(state.player.x, state.player.y, color, state.player.angle, 14, 0.24);
    ui.showToast(`${PICKUP_DEFS[pickupId].label} online`, "good", 1);
  });
  bus.on("pickup_fire", ({ pickupId, carId }) => {
    if (carId !== state.player?.id) return;
    const key = createKey(pickupId, "count");
    state.runPickupCounts[key] = (state.runPickupCounts[key] || 0) + 1;
    emitShardBurst(state.player.x, state.player.y, PICKUP_DEFS[pickupId].color, pickupId === "pulse" ? 11 : 8, state.player.angle, TAU, 90, 250);
    spawnImpactBloom(state.player.x, state.player.y, PICKUP_DEFS[pickupId].color, state.player.angle, pickupId === "pulse" ? 22 : 16, 0.28);
    queueScreenBurst(PICKUP_DEFS[pickupId].color, pickupId === "pulse" ? 0.1 : 0.07, 0.24, pickupId === "pulse" ? "edge" : "radial");
    ui.showToast(`${PICKUP_DEFS[pickupId].label} fired`, pickupId === "pulse" ? "danger" : "good", 0.9);
  });
  bus.on("lap_complete", ({ player, lapTime, bestLap }) => {
    if (!player || !state.player) return;
    emitShardBurst(state.player.x, state.player.y, "#ffb100", 12, state.player.angle - Math.PI * 0.5, TAU * 0.9, 120, 280);
    spawnImpactBloom(state.player.x, state.player.y, "#ffb100", 0, 26, 0.38);
    queueScreenBurst("#ffb100", 0.11, 0.34, "radial");
    ui.showToast(bestLap ? `Lap carved // ${lapTime.toFixed(2)}s best` : `Lap split // ${lapTime.toFixed(2)}s`, "good", 1.1);
  });
  bus.on("place_change", ({ player, better }) => {
    if (!player || !state.player) return;
    const color = better ? "#ffb100" : "#ff5ccb";
    emitShardBurst(state.player.x, state.player.y, color, better ? 9 : 7, better ? state.player.angle : state.player.angle + Math.PI, TAU * 0.6, 90, 230);
    spawnImpactBloom(state.player.x, state.player.y, color, state.player.angle, 18, 0.24);
    queueScreenBurst(color, better ? 0.08 : 0.06, 0.22, better ? "radial" : "edge");
  });
  bus.on("slingshot_armed", ({ player }) => {
    if (!player) return;
    spawnImpactBloom(state.player.x, state.player.y, "#8df7ff", state.player.angle, 14, 0.28);
    ui.showToast("Slingshot primed", "good", 0.9);
  });
  bus.on("slingshot_fire", ({ player }) => {
    if (!player) return;
    emitShardBurst(state.player.x, state.player.y, "#ffb100", 12, state.player.angle, TAU * 0.8, 120, 320);
    spawnImpactBloom(state.player.x, state.player.y, "#ffb100", state.player.angle, 24, 0.3);
    queueScreenBurst("#ffb100", 0.12, 0.26, "edge");
    ui.showToast("Slingshot live", "good", 0.9);
  });
  bus.on("surge_strip", ({ player, sectorTag }) => {
    if (!player) return;
    const color = sectorTag === "high-speed" ? "#ffb100" : "#50f9d8";
    emitShardBurst(state.player.x, state.player.y, color, 10, state.player.angle, TAU * 0.8, 100, 240);
    spawnImpactBloom(state.player.x, state.player.y, color, state.player.angle, 18, 0.24);
    ui.showToast(sectorTag === "high-speed" ? "Overdrive strip" : "Reset strip", "good", 0.8);
  });
  bus.on("sector_enter", ({ player, sectorTag }) => {
    if (!player || !state.player) return;
    const color = sectorTag === "hazard" ? "#ff6d7f" : sectorTag === "recovery" ? "#50f9d8" : sectorTag === "technical" ? "#8df7ff" : "#ffb100";
    queueScreenBurst(color, sectorTag === "hazard" ? 0.07 : 0.05, 0.2, sectorTag === "hazard" ? "edge" : "radial");
  });
  bus.on("rival_contact", ({ player, heavy }) => {
    if (!player) return;
    emitShardBurst(state.player.x, state.player.y, "#ff5ccb", heavy ? 10 : 6, state.player.angle, TAU, 110, 260);
    spawnImpactBloom(state.player.x, state.player.y, "#ff5ccb", state.player.angle, heavy ? 24 : 16, 0.26);
    queueScreenBurst("#ff5ccb", heavy ? 0.11 : 0.07, 0.28, "edge");
    ui.showToast(heavy ? "Vendetta live" : "Rival contact", "danger", 0.8);
  });
  bus.on("respawn", ({ player, assisted }) => {
    if (!player) return;
    spawnImpactBloom(state.player.x, state.player.y, "#8df7ff", 0, 26, 0.34);
    queueScreenBurst("#8df7ff", 0.06, 0.24, "radial");
    ui.showToast(assisted ? "Auto-reset kicked in" : "Re-entry shield live", "good", 1.2);
  });
  bus.on("wreck", ({ player }) => {
    if (!player) return;
    emitShardBurst(state.player.x, state.player.y, "#ff6d7f", 14, state.player.angle, TAU, 120, 340);
    queueScreenBurst("#ff6d7f", 0.14, 0.34, "edge");
    ui.showBanner("CHASSIS TOTALED", 0.7);
    ui.showToast("Re-entry line armed", "neutral", 1.2);
  });
  bus.on("race_start", () => {
    state.lastPlace = null;
    if (state.player) {
      emitShardBurst(state.player.x, state.player.y, "#ffb100", 10, state.player.angle, TAU * 0.7, 120, 260);
      spawnImpactBloom(state.player.x, state.player.y, "#ffb100", state.player.angle, 24, 0.28);
    }
    queueScreenBurst("#ffb100", 0.12, 0.22, "radial");
  });
  bus.on("garage_roll_start", () => {
    ui.showBanner("FOUNDRY BREACH", 0.9);
  });
  bus.on("garage_roll_reveal", ({ offer }) => {
    if (!offer) return;
    ui.showToast(`${offer.name} breached`, offer.deltaScore > 0 ? "good" : "neutral", 0.9);
  });
  bus.on("garage_roll_confirm", ({ scrapEarned }) => {
    ui.showToast(`Bays locked // +${scrapEarned} Scrap`, "good", 1.2);
  });
  bus.on("cosmetic_buy", ({ item }) => {
    if (!item) return;
    ui.showToast(`${item.name} forged`, "good", 1);
  });
  bus.on("cosmetic_equip", ({ item }) => {
    if (!item) return;
    ui.showToast(`${item.name} armed`, "neutral", 0.9);
  });
  bus.on("course_refresh", ({ price, rerolls }) => {
    ui.showBanner(`BOARD ${rerolls}`, 0.6);
    ui.showToast(`Strike board reforged // -${price?.amount || COURSE_REROLL_COST} Flux`, "good", 1.2);
  });
  bus.on("finish", ({ result }) => {
    if (!state.player) return;
    const color = result?.place === 1 ? "#ffb100" : result?.place <= 3 ? "#8df7ff" : "#ff5ccb";
    emitShardBurst(state.player.x, state.player.y, color, result?.place === 1 ? 18 : 12, -Math.PI * 0.5, TAU, 120, 320);
    spawnImpactBloom(state.player.x, state.player.y, color, 0, result?.place === 1 ? 34 : 26, 0.42);
    queueScreenBurst(color, result?.place === 1 ? 0.16 : 0.09, 0.4, result?.place === 1 ? "radial" : "edge");
  });
}

function initialize() {
  createEvents();
  attachBusListeners();
  audio.setSettings(state.save.settings);
  audio.setMode(state.mode);
  state.menuStage = "splash";
  resize();
  ui.setMenuOpen(true);
  ui.setPauseOpen(false);
  ui.syncVisualSettings();
  ui.syncMenu();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    state.keys.clear();
    if (state.mode === "race") togglePause(true);
  });
  document.addEventListener("fullscreenchange", resize);
  window.__procRacer = state;
  window.__procRacerAudio = audio;
  window.__procRacerUi = ui;
  window.render_game_to_text = ui.renderGameToText;
  window.advanceTime = (ms) => {
    let remaining = ms;
    const frameMs = 1000 / 60;
    while (remaining > 0) {
      const current = Math.min(frameMs, remaining);
      step(current / 1000);
      remaining -= current;
    }
    render();
  };
  render();
  requestAnimationFrame(loop);
}

initialize();
