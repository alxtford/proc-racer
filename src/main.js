import { createAudioSystem } from "./core/audio.js";
import { getControlBinding } from "./core/controls.js";
import { getCurrencyBalance, grantCurrency, purchaseStoreProduct } from "./core/economy.js";
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
import { buildTrack, nearestPathInfo, samplePath } from "./core/generator.js";
import { computeLeaderboard, createCar, finalizeFinish, handleCarCollisions, integrateCar } from "./core/gameplay.js";
import { getGhostKey, loadSave, persistSave, pushRunHistory } from "./core/save.js";
import { buyCosmetic, equipCosmetic, getEquippedCosmeticDefs, getGarageCarStyle } from "./core/styleLocker.js";
import { buildRunSummary, createUi } from "./core/ui.js";
import { clamp, createKey, createRng, lerp, normalize, pickOne, TAU } from "./core/utils.js";
import { BIOME_DEFS, CAR_DEFS, PICKUP_DEFS, EVENT_TEMPLATES, createDailyEvent } from "./data/content.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const bus = new EventBus();
const initialSave = loadSave();

const state = {
  mode: "menu",
  keys: new Set(),
  width: 1280,
  height: 720,
  pixelRatio: 1,
  viewScale: 1,
  camera: { x: 0, y: 0, shake: 0 },
  selectedEventIndex: 0,
  selectedCarId: initialSave.selectedCarId,
  menuStage: "splash",
  menuView: "home",
  bindingAction: null,
  events: [],
  currentEvent: null,
  track: null,
  player: null,
  cars: [],
  debris: [],
  fx: [],
  pickups: [],
  hazards: [],
  finishTime: null,
  elapsed: 0,
  ambientTime: 0,
  countdown: 0,
  countdownTick: 3,
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
const ui = createUi(state, {
  onStartSelected: () => startSelectedRace(),
  onStartDaily: () => startDailyRace(),
  onQuickRace: () => startQuickRace(),
  onRetry: () => retryRace(),
  onBackToMenu: () => backToMenu(),
  onEnterGarage: () => enterGarage(),
  onPauseResume: () => togglePause(false),
  onPauseRetry: () => retryRace(),
  onPauseMenu: () => backToMenu(),
  onMenuViewChange: (view) => {
    state.menuView = view;
    ui.syncMenu();
  },
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

function enterGarage() {
  window.setTimeout(() => {
    if (state.mode !== "menu") return;
    state.menuStage = "garage";
    state.menuView = "home";
    ui.syncMenu();
  }, 90);
}

function createEvents() {
  const dailyEvent = createDailyEvent(new Date());
  if (state.save.daily.seed !== dailyEvent.seed) {
    state.save.daily = {
      seed: dailyEvent.seed,
      bestTime: null,
      rewardClaimed: false,
    };
    persistSave(state.save);
  }
  state.events = [...EVENT_TEMPLATES, dailyEvent];
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
    medal: result.place === 1 ? "Gold" : result.place <= 3 ? "Silver" : "Steel",
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
  result.emoteBadge = style.emote?.badge || "LOCKED IN";
  result.emoteName = style.emote?.name || "Steady Nod";
  pushRunHistory(state.save, {
    timestamp: new Date().toISOString(),
    eventId: result.eventId,
    seed: result.seed,
    carId: result.carId,
    carName: result.carName,
    place: result.place,
    finishTime: result.finishTime,
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
  state.selectedCarId = carId;
  state.currentEvent = state.events[eventIndex];
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
  if (rivals.length) pickOne(rng, rivals).rival = true;
  state.pickups = state.track.pickups.map((pickup) => ({ ...pickup }));
  state.hazards = state.track.hazards.map((hazard) => ({ ...hazard }));
  state.debris = [];
  state.fx = [];
  state.finishTime = null;
  state.elapsed = 0;
  state.countdown = 3;
  state.countdownTick = 3;
  setMode("race");
  state.pendingResult = null;
  state.bindingAction = null;
  state.runPickupCounts = {};
  state.currentRunSamples = [];
  state.ghostRecordTimer = 0;
  state.lastPlace = null;
  state.warningTier = 0;
  state.slowMo = 0;
  state.keys.clear();
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.ghostPlayback = state.save.ghostRuns[getGhostKey(state.currentEvent.id, state.selectedCarId)] || null;
  ui.hideResults();
  ui.setPauseOpen(false);
  ui.setMenuOpen(false);
  ui.showBanner(`${state.currentEvent.name} // ${state.currentEvent.type}`, 1.8);
  ui.showToast(state.currentEvent.guided ? "Shield loaded. Use it early." : "Launch clean, recover fast", "neutral", 1.5);
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
  const candidateEvents = state.events.filter((event) => !event.guided);
  const chosen = candidateEvents[Math.floor(rng() * candidateEvents.length)];
  state.selectedEventIndex = state.events.findIndex((event) => event.id === chosen.id);
  state.selectedCarId = garage[Math.floor(rng() * garage.length)]?.id || state.selectedCarId;
  ui.syncMenu();
  startSelectedRace();
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
  state.menuStage = "garage";
  state.menuView = "home";
  state.bindingAction = null;
  setMode("menu");
  state.pendingResult = null;
  ui.hideResults();
  ui.setPauseOpen(false);
  ui.setMenuOpen(true);
  ui.syncMenu();
}

function startGarageRoll() {
  if (state.mode !== "menu" || state.menuView !== "profile" || !getRollReadyStatus(state.save) || state.garageRoll) return;
  const purchase = purchaseStoreProduct(state.save, "garage_roll", "flux");
  if (!purchase.ok) return;
  const seed = Date.now();
  state.garageRoll = {
    seed,
    status: "spinning",
    offers: generateGarageRoll(state.save, seed),
    keptSlots: [],
    revealedSlots: [],
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
    ui.syncMenu();
  }, 2140));
  ui.syncMenu();
}

function toggleGarageRollSlot(slotIndex) {
  if (!state.garageRoll || state.garageRoll.status !== "revealed") return;
  const kept = new Set(state.garageRoll.keptSlots);
  if (kept.has(slotIndex)) kept.delete(slotIndex);
  else kept.add(slotIndex);
  state.garageRoll.keptSlots = [...kept].sort((a, b) => a - b);
  ui.syncMenu();
}

function confirmGarageRoll() {
  if (!state.garageRoll || state.garageRoll.status !== "revealed" || !state.garageRoll.keptSlots.length) return;
  const previousSelectionSlot = getGarageSlotIndex(state.save, state.selectedCarId);
  const keptSlots = new Set(state.garageRoll.keptSlots);
  state.garageRoll.offers.forEach((offer) => {
    if (!keptSlots.has(offer.slotIndex)) return;
    state.save.garage[offer.slotIndex] = offer;
  });
  const scrapEarned = state.garageRoll.offers
    .filter((offer) => !keptSlots.has(offer.slotIndex))
    .reduce((sum, offer) => sum + getScrapValue(offer), 0);
  grantCurrency(state.save, "scrap", scrapEarned);
  if (previousSelectionSlot >= 0 && keptSlots.has(previousSelectionSlot)) {
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
  if (state.mode !== "menu" || state.menuView !== "profile") return;
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
  if (state.mode !== "menu" || state.menuView !== "profile") return;
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
  state.menuView = "settings";
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
  state.finishTime = state.player.finishMs;
  const leaderboard = finalizeFinish({ state });
  const result = buildRunSummary(state, leaderboard);
  hydrateRunSummary(result);
  maybeStoreGhost(result);
  persistSave(state.save);
  state.pendingResult = result;
  setMode("results");
  ui.showResults(result);
  ui.showBanner(result.place === 1 ? "Event won" : `Finished P${result.place}`, 1.8);
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
    ui.showToast(better ? `Up to P${state.player.place}` : `Dropped to P${state.player.place}`, better ? "good" : "danger", 1.1);
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
    if (effect.kind === "smoke") {
      effect.radius += dt * 14;
      effect.x += (effect.vx || 0) * dt;
      effect.y += (effect.vy || -16) * dt;
    }
    if (effect.kind === "ember") {
      effect.x += (effect.vx || 0) * dt;
      effect.y += (effect.vy || 0) * dt;
      effect.vx = (effect.vx || 0) * 0.97;
      effect.vy = (effect.vy || 0) * 0.97;
    }
    return effect.life > 0;
  });
  state.camera.shake = Math.max(0, state.camera.shake - dt * 18);
}

function updateRace(dt) {
  if (state.mode !== "race") return;
  state.elapsed += dt;
  if (state.countdown > 0) {
    state.countdown -= dt;
    const nextTick = Math.ceil(Math.max(0, state.countdown));
    if (nextTick < state.countdownTick) {
      state.countdownTick = nextTick;
      if (nextTick > 0) {
        bus.emit("countdown_tick", { tick: nextTick });
        ui.showBanner(String(nextTick), 0.4);
      } else {
        bus.emit("race_start", { eventId: state.currentEvent.id });
        ui.showBanner("GO", 0.85);
      }
    }
    ui.updateHud();
    ui.updateTimers(dt);
    return;
  }

  const ctxRef = { state, bus };
  state.ctx = ctxRef;
  for (const car of state.cars) integrateCar(ctxRef, car, dt);
  handleCarCollisions(ctxRef);
  updateRunEffects(dt);
  updateGhostRecorder(dt);
  handlePlaceChange();
  updateWarnings();
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

function traceTrackPath(track) {
  ctx.beginPath();
  track.points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  if (track.type === "circuit") ctx.closePath();
}

function sectorStrokeColor(tag, alpha = 0.28) {
  if (tag === "high-speed") return `rgba(255,211,110,${alpha})`;
  if (tag === "technical") return `rgba(141,247,255,${alpha})`;
  if (tag === "recovery") return `rgba(80,249,216,${alpha})`;
  return `rgba(255,109,127,${alpha})`;
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

function drawTrackProp(prop, theme, time) {
  const wobble = 1 + Math.sin(time * 2 + prop.x * 0.01) * 0.04;
  const accent = prop.side === "outer" ? theme.decoA : theme.decoB;
  const fill = withAlpha(theme.inside, 0.78);
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
  } else {
    ctx.beginPath();
    ctx.rect(-size * 0.5, -size * 0.5, size, size);
    ctx.fill();
    ctx.stroke();
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

function traceCarShell(bodyStyle, length, width) {
  ctx.beginPath();
  if (bodyStyle === "dart") {
    ctx.moveTo(-length * 0.56, -width * 0.24);
    ctx.lineTo(-length * 0.26, -width * 0.44);
    ctx.lineTo(length * 0.12, -width * 0.4);
    ctx.lineTo(length * 0.52, -width * 0.18);
    ctx.lineTo(length * 0.68, 0);
    ctx.lineTo(length * 0.52, width * 0.18);
    ctx.lineTo(length * 0.12, width * 0.4);
    ctx.lineTo(-length * 0.26, width * 0.44);
    ctx.lineTo(-length * 0.56, width * 0.24);
  } else if (bodyStyle === "brick") {
    ctx.moveTo(-length * 0.58, -width * 0.34);
    ctx.lineTo(-length * 0.2, -width * 0.46);
    ctx.lineTo(length * 0.3, -width * 0.42);
    ctx.lineTo(length * 0.58, -width * 0.24);
    ctx.lineTo(length * 0.66, -width * 0.06);
    ctx.lineTo(length * 0.66, width * 0.06);
    ctx.lineTo(length * 0.58, width * 0.24);
    ctx.lineTo(length * 0.3, width * 0.42);
    ctx.lineTo(-length * 0.2, width * 0.46);
    ctx.lineTo(-length * 0.58, width * 0.34);
  } else if (bodyStyle === "blade") {
    ctx.moveTo(-length * 0.6, -width * 0.22);
    ctx.lineTo(-length * 0.18, -width * 0.42);
    ctx.lineTo(length * 0.34, -width * 0.32);
    ctx.lineTo(length * 0.64, -width * 0.1);
    ctx.lineTo(length * 0.72, 0);
    ctx.lineTo(length * 0.64, width * 0.1);
    ctx.lineTo(length * 0.34, width * 0.32);
    ctx.lineTo(-length * 0.18, width * 0.42);
    ctx.lineTo(-length * 0.6, width * 0.22);
  } else {
    ctx.moveTo(-length * 0.52, -width * 0.3);
    ctx.lineTo(-length * 0.18, -width * 0.46);
    ctx.lineTo(length * 0.16, -width * 0.44);
    ctx.lineTo(length * 0.5, -width * 0.22);
    ctx.lineTo(length * 0.62, 0);
    ctx.lineTo(length * 0.5, width * 0.22);
    ctx.lineTo(length * 0.16, width * 0.44);
    ctx.lineTo(-length * 0.18, width * 0.46);
    ctx.lineTo(-length * 0.52, width * 0.3);
  }
  ctx.closePath();
}

function traceCarCabin(bodyStyle, length, width) {
  ctx.beginPath();
  if (bodyStyle === "dart") {
    ctx.moveTo(-length * 0.12, -width * 0.18);
    ctx.lineTo(length * 0.12, -width * 0.24);
    ctx.lineTo(length * 0.32, -width * 0.14);
    ctx.lineTo(length * 0.24, width * 0.12);
    ctx.lineTo(-length * 0.02, width * 0.2);
    ctx.lineTo(-length * 0.18, width * 0.1);
  } else if (bodyStyle === "brick") {
    ctx.moveTo(-length * 0.18, -width * 0.22);
    ctx.lineTo(length * 0.06, -width * 0.28);
    ctx.lineTo(length * 0.24, -width * 0.24);
    ctx.lineTo(length * 0.24, width * 0.24);
    ctx.lineTo(-length * 0.02, width * 0.28);
    ctx.lineTo(-length * 0.2, width * 0.18);
  } else if (bodyStyle === "blade") {
    ctx.moveTo(-length * 0.08, -width * 0.16);
    ctx.lineTo(length * 0.16, -width * 0.24);
    ctx.lineTo(length * 0.34, -width * 0.1);
    ctx.lineTo(length * 0.2, width * 0.1);
    ctx.lineTo(-length * 0.02, width * 0.18);
    ctx.lineTo(-length * 0.16, width * 0.08);
  } else {
    ctx.moveTo(-length * 0.14, -width * 0.2);
    ctx.lineTo(length * 0.1, -width * 0.26);
    ctx.lineTo(length * 0.28, -width * 0.16);
    ctx.lineTo(length * 0.22, width * 0.16);
    ctx.lineTo(0, width * 0.24);
    ctx.lineTo(-length * 0.18, width * 0.12);
  }
  ctx.closePath();
}

function drawCarTrim(bodyStyle, length, width, accentColor, parts) {
  ctx.strokeStyle = withAlpha(accentColor, 0.72);
  ctx.fillStyle = withAlpha(accentColor, 0.2);
  ctx.lineWidth = 2;

  if (bodyStyle === "brick") {
    ctx.strokeRect(-length * 0.08, -width * 0.12, length * 0.24, width * 0.24);
    if (parts.has("spoiler")) {
      ctx.fillRect(-length * 0.62, -width * 0.18, 8, width * 0.36);
      ctx.fillRect(-length * 0.66, -width * 0.32, 18, 6);
      ctx.fillRect(-length * 0.66, width * 0.26, 18, 6);
    }
  } else if (bodyStyle === "blade") {
    ctx.beginPath();
    ctx.moveTo(length * 0.2, -width * 0.34);
    ctx.lineTo(length * 0.58, -width * 0.14);
    ctx.lineTo(length * 0.18, -width * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(length * 0.2, width * 0.34);
    ctx.lineTo(length * 0.58, width * 0.14);
    ctx.lineTo(length * 0.18, width * 0.08);
    ctx.closePath();
    ctx.fill();
    if (parts.has("panel")) {
      ctx.beginPath();
      ctx.moveTo(-length * 0.12, -width * 0.02);
      ctx.lineTo(length * 0.42, 0);
      ctx.lineTo(-length * 0.02, width * 0.12);
      ctx.stroke();
    }
  } else if (bodyStyle === "dart") {
    ctx.beginPath();
    ctx.moveTo(-length * 0.04, -width * 0.22);
    ctx.lineTo(length * 0.3, 0);
    ctx.lineTo(-length * 0.04, width * 0.22);
    ctx.stroke();
    if (parts.has("spoiler")) {
      ctx.beginPath();
      ctx.moveTo(-length * 0.58, 0);
      ctx.lineTo(-length * 0.72, -width * 0.18);
      ctx.lineTo(-length * 0.72, width * 0.18);
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-length * 0.14, -width * 0.18);
    ctx.lineTo(length * 0.22, -width * 0.1);
    ctx.lineTo(length * 0.3, width * 0.08);
    ctx.lineTo(-length * 0.02, width * 0.18);
    ctx.stroke();
    if (parts.has("panel")) {
      ctx.fillRect(-length * 0.04, -width * 0.34, length * 0.18, 4);
      ctx.fillRect(-length * 0.04, width * 0.3, length * 0.18, 4);
    }
  }
}

function drawDestroyedCar(car) {
  const fade = clamp(car.respawnTimer / 2.1, 0.18, 1);
  const bodyColor = getCarBodyColor(car);
  const accentColor = getCarAccentColor(car);
  const bodyStyle = getCarBodyStyle(car);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = 0.82 * fade;

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 8, car.length * 0.68, car.width * 0.8, 0, 0, TAU);
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

  ctx.fillStyle = "#080b13";
  traceCarShell(bodyStyle, car.length, car.width);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  traceCarCabin(bodyStyle, car.length, car.width);
  ctx.fill();
  drawCarTrim(bodyStyle, car.length, car.width, accentColor, new Set(["spoiler", "panel"]));

  ctx.strokeStyle = withAlpha(accentColor, 0.32);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-car.length * 0.28, -car.width * 0.1);
  ctx.lineTo(car.length * 0.26, car.width * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-car.length * 0.28, car.width * 0.1);
  ctx.lineTo(car.length * 0.26, -car.width * 0.1);
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
      x: state.player.x + forward.x * 110,
      y: state.player.y + forward.y * 110,
    };
  }
  const shakeScale = state.save.settings.reducedShake ? 0.32 : 1;
  state.camera.x = lerp(state.camera.x, focus.x, 0.08);
  state.camera.y = lerp(state.camera.y, focus.y, 0.08);
  const jitterX = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake * 1.4 * shakeScale : 0;
  const jitterY = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake * 1.4 * shakeScale : 0;
  state.viewScale = clamp(Math.min(state.width / 1280, state.height / 720), 0.74, 1.2);
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  ctx.translate(state.width / 2 + jitterX, state.height / 2 + jitterY);
  ctx.scale(state.viewScale, state.viewScale);
  ctx.translate(-state.camera.x, -state.camera.y);
}

function drawTrack() {
  const track = state.track;
  const theme = track.theme;
  const time = state.ambientTime;

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
    for (let i = 0; i <= 26; i += 1) {
      const t = sector.start + (i / 26) * (sector.end - sector.start);
      points.push(samplePath(track.points, t, track.type === "circuit"));
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

  const startMarker = samplePath(track.points, track.type === "circuit" ? 0.02 : 0.03, track.type === "circuit");
  const startNext = samplePath(track.points, track.type === "circuit" ? 0.024 : 0.034, track.type === "circuit");
  const tangent = normalize(startNext.x - startMarker.x, startNext.y - startMarker.y);
  const normal = { x: -tangent.y, y: tangent.x };
  ctx.save();
  ctx.translate(startMarker.x, startMarker.y);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 6;
  for (let i = -2; i <= 2; i += 1) {
    const offset = i * 18;
    ctx.beginPath();
    ctx.moveTo(normal.x * (-track.width * 0.25 + offset), normal.y * (-track.width * 0.25 + offset));
    ctx.lineTo(normal.x * (-track.width * 0.18 + offset) + tangent.x * 24, normal.y * (-track.width * 0.18 + offset) + tangent.y * 24);
    ctx.stroke();
  }
  ctx.restore();

  const countdownStage = state.countdown > 0 ? 3 - Math.ceil(Math.max(0, state.countdown)) : 3;
  ctx.save();
  ctx.translate(startMarker.x, startMarker.y);
  const lightColors = ["#ff6d7f", "#ffd36e", "#50f9d8"];
  for (let i = 0; i < 3; i += 1) {
    const offset = (i - 1) * 20;
    const active = countdownStage > i || state.countdown <= 0;
    ctx.fillStyle = active ? withAlpha(lightColors[i], 0.92) : withAlpha(lightColors[i], 0.18);
    ctx.shadowBlur = active ? 22 : 0;
    ctx.shadowColor = lightColors[i];
    ctx.beginPath();
    ctx.arc(tangent.x * -32 + normal.x * offset, tangent.y * -32 + normal.y * offset, 6.4, 0, TAU);
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
  if (!car.speedTrail.length) return;
  const trailColor = getCarTrailColor(car);
  ctx.save();
  ctx.strokeStyle = withAlpha(trailColor, car.isPlayer ? 0.22 : 0.16);
  ctx.lineWidth = car.isPlayer ? 9 : 6;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.82;
  ctx.shadowBlur = 22;
  ctx.shadowColor = withAlpha(trailColor, 0.3);
  ctx.beginPath();
  car.speedTrail.forEach((sample, index) => {
    if (index === 0) ctx.moveTo(sample.x, sample.y);
    else ctx.lineTo(sample.x, sample.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(trailColor, 0.86);
  ctx.lineWidth = car.isPlayer ? 3.5 : 2.4;
  ctx.stroke();
  ctx.restore();
}

function drawGhost(sample) {
  if (!sample) return;
  ctx.save();
  ctx.translate(sample.x, sample.y);
  ctx.rotate(sample.angle);
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  traceCarShell("touring", 42, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  traceCarShell("touring", 42, 22);
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
  const bodyStyle = getCarBodyStyle(car);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = car.invuln > 0 ? 0.6 + Math.sin(state.ambientTime * 24) * 0.25 : 1;
  const damagePct = clamp(car.damage / car.def.durability, 0, 1);
  const parts = new Set(car.visibleParts);

  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(0, 7, car.length * 0.7, car.width * 0.78, 0, 0, TAU);
  ctx.fill();

  ctx.shadowBlur = 22;
  ctx.shadowColor = withAlpha(accentColor, 0.4);
  ctx.fillStyle = withAlpha(accentColor, 0.14 + (car.isPlayer ? 0.08 : 0.02));
  ctx.beginPath();
  ctx.ellipse(-car.length * 0.06, 0, car.length * 0.78, car.width * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (car.rival) {
    ctx.strokeStyle = "rgba(255,92,203,0.56)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.rect(-car.length * 0.7, -car.width * 0.74, car.length * 1.4, car.width * 1.48);
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
    ctx.moveTo(-car.length * 0.6, 0);
    ctx.lineTo(-car.length * 1.02, -8);
    ctx.lineTo(-car.length * 1.14, 0);
    ctx.lineTo(-car.length * 1.02, 8);
    ctx.closePath();
    ctx.fill();
  }

  for (const wheelX of [-car.length * 0.22, car.length * 0.18]) {
    for (const wheelY of [-car.width * 0.44, car.width * 0.44]) {
      ctx.fillStyle = "rgba(7, 10, 18, 0.96)";
      ctx.fillRect(wheelX - 4, wheelY - 5, 8, 10);
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  traceCarShell(bodyStyle, car.length * 0.9, car.width * 1.16);
  ctx.fill();

  ctx.shadowBlur = 18;
  ctx.shadowColor = withAlpha(accentColor, 0.52);
  ctx.fillStyle = car.chassisFlash > 0 ? "#ffffff" : bodyColor;
  traceCarShell(bodyStyle, car.length, car.width);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = withAlpha("#08101d", 0.96);
  traceCarCabin(bodyStyle, car.length, car.width);
  ctx.fill();

  ctx.fillStyle = withAlpha("#f8fbff", 0.82);
  ctx.beginPath();
  ctx.moveTo(-car.length * 0.18, -car.width * 0.04);
  ctx.lineTo(car.length * 0.26, -car.width * 0.12);
  ctx.lineTo(car.length * 0.18, car.width * 0.02);
  ctx.lineTo(-car.length * 0.14, car.width * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = withAlpha("#ffffff", 0.86);
  ctx.fillRect(car.length * 0.4, -car.width * 0.24, 8, 6);
  ctx.fillRect(car.length * 0.4, car.width * 0.18, 8, 6);
  ctx.fillStyle = withAlpha(car.isPlayer ? accentColor : "#ff6d7f", 0.82);
  ctx.fillRect(-car.length * 0.48, -car.width * 0.2, 6, 5);
  ctx.fillRect(-car.length * 0.48, car.width * 0.14, 6, 5);

  drawCarTrim(bodyStyle, car.length, car.width, accentColor, parts);

  ctx.fillStyle = withAlpha("#dff6ff", 0.88);
  if (parts.has("bumper")) {
    ctx.beginPath();
    ctx.moveTo(car.length * 0.44, -car.width * 0.28);
    ctx.lineTo(car.length * 0.56, -car.width * 0.12);
    ctx.lineTo(car.length * 0.56, car.width * 0.12);
    ctx.lineTo(car.length * 0.44, car.width * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  if (parts.has("door")) {
    ctx.fillRect(-4, -car.width * 0.36, 6, car.width * 0.72);
  }
  if (parts.has("spoiler")) {
    ctx.fillRect(-car.length * 0.56, -car.width * 0.34, 10, car.width * 0.68);
    ctx.fillRect(-car.length * 0.6, -car.width * 0.2, 6, car.width * 0.4);
  }
  if (parts.has("panel")) {
    ctx.fillRect(-car.length * 0.18, car.width * 0.34, car.length * 0.24, 5);
    ctx.fillRect(-car.length * 0.18, -car.width * 0.39, car.length * 0.24, 5);
  }

  if (damagePct > 0.28) {
    ctx.strokeStyle = withAlpha("#08101d", 0.58 + damagePct * 0.2);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-car.length * 0.08, -car.width * 0.18);
    ctx.lineTo(car.length * 0.18, -car.width * 0.04);
    ctx.lineTo(car.length * 0.32, car.width * 0.16);
    ctx.stroke();
    if (damagePct > 0.58) {
      ctx.beginPath();
      ctx.moveTo(-car.length * 0.18, car.width * 0.08);
      ctx.lineTo(car.length * 0.04, car.width * 0.2);
      ctx.lineTo(car.length * 0.22, car.width * 0.28);
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
    traceCarShell(bodyStyle, car.length * 1.16, car.width * 1.22);
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

  if (!state.player || state.mode === "menu") return;
  const speedFactor = clamp(Math.hypot(state.player.vx, state.player.vy) / 420, 0, 1);
  if (speedFactor > 0.18) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(141,247,255,${0.07 + speedFactor * 0.08})`;
    ctx.lineWidth = 1.4;
    const streakCount = 6 + Math.floor(speedFactor * 8);
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

function renderRaceWorld() {
  if (!state.track || (state.mode !== "race" && state.mode !== "results" && state.mode !== "paused")) return;
  setCamera();
  drawTrack();
  drawGhost(getGhostSample());
  for (const car of state.cars.filter((item) => !item.isPlayer)) drawCar(car);
  if (state.player) drawCar(state.player);
  drawEffects();
  drawMinimap();
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
  if (key === getControlBinding(state.save.settings, "retry") && (state.mode === "race" || state.mode === "results" || state.mode === "paused")) retryRace();
  if (key === "enter" && state.mode === "menu") startSelectedRace();
  if (key === "enter" && state.mode === "results") retryRace();
  if (key === getControlBinding(state.save.settings, "quick") && state.mode === "menu") startQuickRace();
  if ((key === getControlBinding(state.save.settings, "daily") || key === "d") && state.mode === "menu") startDailyRace();
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
    ui.showToast(`${PICKUP_DEFS[pickupId].label} loaded`, "good", 1);
  });
  bus.on("pickup_fire", ({ pickupId, carId }) => {
    if (carId !== state.player?.id) return;
    const key = createKey(pickupId, "count");
    state.runPickupCounts[key] = (state.runPickupCounts[key] || 0) + 1;
    ui.showToast(`${PICKUP_DEFS[pickupId].label} used`, pickupId === "pulse" ? "danger" : "good", 0.9);
  });
  bus.on("respawn", ({ player, assisted }) => {
    if (!player) return;
    ui.showToast(assisted ? "Auto-reset assist" : "Respawn assist live", "good", 1.2);
  });
  bus.on("wreck", ({ player }) => {
    if (!player) return;
    ui.showBanner("Wrecked", 0.7);
    ui.showToast("Pace restored on respawn", "neutral", 1.2);
  });
  bus.on("race_start", () => {
    state.lastPlace = null;
  });
  bus.on("garage_roll_start", () => {
    ui.showBanner("Foundry Spin", 0.9);
  });
  bus.on("garage_roll_reveal", ({ offer }) => {
    if (!offer) return;
    ui.showToast(`${offer.name} cracked`, offer.deltaScore > 0 ? "good" : "neutral", 0.9);
  });
  bus.on("garage_roll_confirm", ({ scrapEarned }) => {
    ui.showToast(`Garage locked // +${scrapEarned} Scrap`, "good", 1.2);
  });
  bus.on("cosmetic_buy", ({ item }) => {
    if (!item) return;
    ui.showToast(`${item.name} unlocked`, "good", 1);
  });
  bus.on("cosmetic_equip", ({ item }) => {
    if (!item) return;
    ui.showToast(`${item.name} equipped`, "neutral", 0.9);
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
