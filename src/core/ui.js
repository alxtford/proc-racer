import { buildTrack } from "./generator.js";
import {
  GARAGE_ROLL_COST,
  getFilledGarageCars,
  getGarageCar,
  getGarageProgression,
  getGarageScore,
  getGarageSlotIndex,
  getGarageStatPercent,
  getRollReadyStatus,
  getScrapValue,
  isGarageSlotFilled,
} from "./garage.js";
import { CONTROL_DEFAULTS, CONTROL_LABELS } from "./controls.js";
import { getCurrencyBalance } from "./economy.js";
import { ensureStyleLocker, getEquippedCosmeticDefs, isCosmeticOwned } from "./styleLocker.js";
import { createKey, formatTime } from "./utils.js";
import { BIOME_DEFS, MODIFIER_DEFS, PICKUP_DEFS } from "../data/content.js";
import { COSMETIC_DEFS, COSMETIC_SLOTS, getCosmeticsBySlot } from "../data/cosmetics.js";

const COURSE_COPY_LIMIT = 88;
const TOOLTIP_DELAY_MS = 3000;

function createRefs() {
  return {
    root: document.getElementById("hud"),
    menu: document.getElementById("menu"),
    menuSplash: document.getElementById("menu-splash"),
    splashShell: document.getElementById("splash-shell"),
    menuShell: document.getElementById("menu-shell"),
    splashStartBtn: document.getElementById("start-btn"),
    splashOverviewInfo: document.getElementById("splash-overview-info"),
    splashRunsInfo: document.getElementById("splash-runs-info"),
    splashRecoveryInfo: document.getElementById("splash-recovery-info"),
    splashReplayInfo: document.getElementById("splash-replay-info"),
    menuEyebrow: document.getElementById("menu-eyebrow"),
    hubTitle: document.getElementById("hub-title"),
    menuIntro: document.getElementById("menu-intro"),
    menuOverviewInfo: document.getElementById("menu-overview-info"),
    launchHint: document.getElementById("launch-hint"),
    eventName: document.getElementById("event-name"),
    eventMeta: document.getElementById("event-meta"),
    banner: document.getElementById("banner"),
    toast: document.getElementById("race-toast"),
    tutorialCard: document.getElementById("tutorial-card"),
    tutorialStep: document.getElementById("tutorial-step"),
    tutorialCopy: document.getElementById("tutorial-copy"),
    hudBottom: document.getElementById("hud-bottom"),
    placePill: document.getElementById("hud-place-pill"),
    progressRing: document.getElementById("hud-progress-ring"),
    rivalPill: document.getElementById("hud-rival-pill"),
    damageFill: document.getElementById("hud-damage-fill"),
    damageValue: document.getElementById("hud-damage-value"),
    speedFill: document.getElementById("hud-speed-fill"),
    speedValue: document.getElementById("hud-speed-value"),
    pickupChip: document.getElementById("hud-pickup-chip"),
    assistChip: document.getElementById("hud-assist-chip"),
    slipstreamChip: document.getElementById("hud-slipstream-chip"),
    ghostChip: document.getElementById("hud-ghost-chip"),
    pause: document.getElementById("pause"),
    pauseShell: document.querySelector(".pause-shell"),
    pauseTitle: document.getElementById("pause-title"),
    pauseCopy: document.getElementById("pause-copy"),
    pauseGoal: document.getElementById("pause-goal"),
    pauseMeta: document.getElementById("pause-meta"),
    pauseResume: document.getElementById("pause-resume-btn"),
    pauseRetry: document.getElementById("pause-retry-btn"),
    pauseMenu: document.getElementById("pause-menu-btn"),
    pauseVolume: document.getElementById("pause-volume"),
    pauseMute: document.getElementById("pause-mute"),
    pauseShake: document.getElementById("pause-shake"),
    pauseAssist: document.getElementById("pause-assist"),
    results: document.getElementById("results"),
    resultsShell: document.querySelector(".results-shell"),
    resultsTitle: document.getElementById("results-title"),
    resultsSubtitle: document.getElementById("results-subtitle"),
    resultsNote: document.getElementById("results-note"),
    resultsNext: document.getElementById("results-next"),
    resultsMedal: document.getElementById("results-medal"),
    resultsPlace: document.getElementById("results-place"),
    resultsStats: document.getElementById("results-stats"),
    resultsGoals: document.getElementById("results-goals"),
    resultsProgress: document.getElementById("results-progress"),
    resultsRetry: document.getElementById("results-retry-btn"),
    resultsMenu: document.getElementById("results-menu-btn"),
    eventList: document.getElementById("event-list"),
    carList: document.getElementById("car-list"),
    launchBtn: document.getElementById("launch-btn"),
    dailyBtn: document.getElementById("daily-btn"),
    quickRaceBtn: document.getElementById("quick-race-btn"),
    careerStatus: document.getElementById("career-status"),
    dailyStatus: document.getElementById("daily-status"),
    ghostStatus: document.getElementById("ghost-status"),
    eventFormatHero: document.getElementById("event-format-hero"),
    heroRecoveryCopy: document.getElementById("hero-recovery-copy"),
    heroReplayCopy: document.getElementById("hero-replay-copy"),
    heroDailyCopy: document.getElementById("hero-daily-copy"),
    eventFocusBadge: document.getElementById("event-focus-badge"),
    eventFocusTitle: document.getElementById("event-focus-title"),
    eventFocusMeta: document.getElementById("event-focus-meta"),
    eventFocusCopy: document.getElementById("event-focus-copy"),
    eventFocusModifiers: document.getElementById("event-focus-modifiers"),
    eventGhostStatus: document.getElementById("event-ghost-status"),
    eventRewardStatus: document.getElementById("event-reward-status"),
    eventPreview: document.getElementById("event-preview"),
    eventInfoBtn: document.getElementById("event-info-btn"),
    carInfoBtn: document.getElementById("car-info-btn"),
    carFocusBadge: document.getElementById("car-focus-badge"),
    carFocusRole: document.getElementById("car-focus-role"),
    carFocusTitle: document.getElementById("car-focus-title"),
    carFocusCopy: document.getElementById("car-focus-copy"),
    carFocusTags: document.getElementById("car-focus-tags"),
    carFocusStats: document.getElementById("car-focus-stats"),
    menuTabHome: document.getElementById("menu-tab-home"),
    menuTabProfile: document.getElementById("menu-tab-profile"),
    menuTabSettings: document.getElementById("menu-tab-settings"),
    menuViewHome: document.getElementById("menu-view-home"),
    menuViewProfile: document.getElementById("menu-view-profile"),
    menuViewSettings: document.getElementById("menu-view-settings"),
    profileTabGarage: document.getElementById("profile-tab-garage"),
    profileTabFoundry: document.getElementById("profile-tab-foundry"),
    profileTabStyle: document.getElementById("profile-tab-style"),
    profileTabCareer: document.getElementById("profile-tab-career"),
    profilePaneGarage: document.getElementById("profile-pane-garage"),
    profilePaneFoundry: document.getElementById("profile-pane-foundry"),
    profilePaneStyle: document.getElementById("profile-pane-style"),
    profilePaneCareer: document.getElementById("profile-pane-career"),
    profileBadge: document.getElementById("profile-badge"),
    profileSummary: document.getElementById("profile-summary"),
    profileRuns: document.getElementById("profile-runs"),
    foundryInsights: document.getElementById("foundry-insights"),
    garageSlotSummary: document.getElementById("garage-slot-summary"),
    gachaInfoBtn: document.getElementById("gacha-info-btn"),
    garageCurrency: document.getElementById("garage-currency"),
    gachaRollCopy: document.getElementById("gacha-roll-copy"),
    garageRollBtn: document.getElementById("garage-roll-btn"),
    styleInfoBtn: document.getElementById("style-info-btn"),
    scrapCurrency: document.getElementById("scrap-currency"),
    equippedStyle: document.getElementById("equipped-style"),
    styleSlotTabs: document.getElementById("style-slot-tabs"),
    styleShop: document.getElementById("style-shop"),
    garageRollModal: document.getElementById("garage-roll-modal"),
    garageRollShell: document.querySelector(".garage-roll-shell"),
    garageRollStatus: document.getElementById("garage-roll-status"),
    garageRollGrid: document.getElementById("garage-roll-grid"),
    garageRollSummary: document.getElementById("garage-roll-summary"),
    garageRollConfirmBtn: document.getElementById("garage-roll-confirm-btn"),
    settingsVolume: document.getElementById("settings-volume"),
    settingsMute: document.getElementById("settings-mute"),
    settingsShake: document.getElementById("settings-shake"),
    settingsContrast: document.getElementById("settings-contrast"),
    settingsAssist: document.getElementById("settings-assist"),
    settingsControlMode: document.getElementById("settings-control-mode"),
    settingsTabComfort: document.getElementById("settings-tab-comfort"),
    settingsTabControls: document.getElementById("settings-tab-controls"),
    settingsPaneComfort: document.getElementById("settings-pane-comfort"),
    settingsPaneControls: document.getElementById("settings-pane-controls"),
    settingsBindings: document.getElementById("settings-bindings"),
    settingsAudioInfo: document.getElementById("settings-audio-info"),
    settingsControlsInfo: document.getElementById("settings-controls-info"),
    bindStatus: document.getElementById("bind-status"),
    tooltip: document.getElementById("ui-tooltip"),
  };
}

function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  return `${seconds >= 0 ? "+" : "-"}${formatTime(Math.abs(seconds))}`;
}

function formatGain(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  return formatTime(Math.abs(seconds));
}

function formatKeyLabel(key) {
  const map = { arrowleft: "Left", arrowright: "Right", arrowup: "Up", arrowdown: "Down", shift: "Shift", escape: "Esc", " ": "Space" };
  return map[key] || key.toUpperCase();
}

function clampCopy(text, limit = COURSE_COPY_LIMIT) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const clipped = clean.slice(0, limit + 1);
  const wordBreak = clipped.lastIndexOf(" ");
  const end = wordBreak > limit * 0.62 ? wordBreak : limit;
  return `${clipped.slice(0, end).trimEnd()}…`;
}

function describeStat(value) {
  if (value >= 84) return "High";
  if (value >= 68) return "Strong";
  if (value >= 52) return "Mid";
  return "Low";
}

function renderStatTiles(car, compareCar = null) {
  const rows = [
    ["Launch", "accel"],
    ["Top end", "maxSpeed"],
    ["Handling", "handling"],
    ["Durability", "durability"],
  ];
  return rows.map(([label, statId]) => {
    const value = Math.round(getGarageStatPercent(car, statId));
    const compareValue = compareCar ? Math.round(getGarageStatPercent(compareCar, statId)) : value;
    const delta = value - compareValue;
    const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return `
    <div class="stat-row">
      <div class="stat-copy">
        <span>${label}</span>
        <strong>${describeStat(value)}</strong>
      </div>
      <div class="stat-track">
        <div class="stat-bar stat-bar-base" style="width:${compareValue}%"></div>
        <div class="stat-bar stat-bar-${tone}" style="width:${value}%"></div>
      </div>
    </div>
  `;
  }).join("");
}

function medalForResult(result) {
  if (result.place === 1 && result.goalsMet >= 2) return "Gold";
  if (result.place <= 3 || result.goalsMet >= 2) return "Silver";
  return "Steel";
}

function getDisplayedEvents(state) {
  if (state.save.settings.tutorialCompleted) return state.events;
  const shown = [];
  const picks = [
    state.events.find((event) => event.guided),
    state.events.find((event) => !event.guided && !event.daily),
    state.events.find((event) => event.daily),
  ];
  for (const event of picks) {
    if (event && !shown.find((item) => item.id === event.id)) shown.push(event);
  }
  return shown;
}

function getDifficultyLabel(event) {
  if (event.guided) return "Starter";
  let pressure = 0;
  if (event.aiCount >= 7) pressure += 2;
  else if (event.aiCount >= 6) pressure += 1;
  if (event.modifierIds.includes("high-damage-hazards")) pressure += 2;
  if (event.modifierIds.includes("dense-traffic")) pressure += 1;
  if (event.modifierIds.includes("rival-pressure")) pressure += 1;
  if (pressure >= 4) return "Chaos";
  if (pressure >= 2) return "Pressure";
  return event.type === "sprint" ? "Fast" : "Open";
}

function getPrimaryGoal(event) {
  if (event.guided) return "Use one pickup";
  const preferred = event.goals.find((goal) => goal.type !== "finish");
  return preferred?.label || "Finish the run";
}

function getEventBadge(state, event) {
  if (event.guided && !state.save.settings.tutorialCompleted) return "Recommended first run";
  if (event.daily) return "Daily spotlight";
  if (!state.save.eventResults[event.id]) return "Fresh run";
  return "Replay ready";
}

function getEventResult(state, event) {
  return state.save.eventResults[event.id];
}

function getGhostCount(state) {
  return Object.keys(state.save.ghostRuns || {}).length;
}

function getGhostReady(state, event, carId = state.selectedCarId) {
  return Boolean(state.save.ghostRuns?.[createKey(event.id, carId)]);
}

function getSelectedGarageCar(state) {
  return getGarageCar(state.save, state.selectedCarId) || getFilledGarageCars(state.save)[0] || null;
}

function getEventReason(state, event, eventResult) {
  if (event.guided && !state.save.settings.tutorialCompleted) {
    return clampCopy("Shortest route to pickups, forgiving wreck recovery, and fast restarts.");
  }
  if (event.daily) {
    return clampCopy(state.save.daily.bestTime
      ? `Today's seeded challenge. Daily best ${formatTime(state.save.daily.bestTime)} is on the board.`
      : "Today's seeded challenge. One clean run is enough to bank a time.");
  }
  if (!eventResult) return clampCopy(`${event.summary} Fresh run with no banked best yet.`);
  return clampCopy(`${event.summary} Best ${formatTime(eventResult.bestTime)} with ${eventResult.goalsMet}/${event.goals.length} goals cleared.`);
}

function getCareerStatus(state) {
  const selectedCar = getSelectedGarageCar(state);
  if (!selectedCar) return "Starter garage loading";
  if (!state.save.settings.tutorialCompleted) return `${selectedCar.name} // starter slot`;
  return `${selectedCar.name} // ${selectedCar.tierLabel}`;
}

function getDailyStatus(state) {
  return state.save.daily.bestTime ? `Daily PB ${formatTime(state.save.daily.bestTime)}` : "Today's daily is fresh";
}

function getGhostStatus(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  if (getRollReadyStatus(state.save)) return `${flux} Flux // pull ready`;
  return `${flux} Flux // ${Math.max(0, GARAGE_ROLL_COST - flux)} to roll`;
}

function getReplayHook(state, event) {
  if (event.daily) {
    return state.save.daily.bestTime
      ? "Shave the daily best or chase a cleaner medal line."
      : "Put down the first daily time, then rerun it clean.";
  }
  const eventResult = getEventResult(state, event);
  if (!eventResult) return "Fresh run. Bank a first best, then start attacking goals.";
  if (eventResult.bestPlace > 3) return "Retry for a podium finish before moving deeper into the ladder.";
  return `Best ${formatTime(eventResult.bestTime)} is live. Beat it or reroll a new one-shot event.`;
}

function getFocusTags(event, eventResult) {
  const tags = [
    event.daily ? "Daily seed" : eventResult?.bestTime ? `Best ${formatTime(eventResult.bestTime)}` : "Fresh run",
    `Par ${formatTime(event.parTime)}`,
    BIOME_DEFS[event.biomeId].name,
  ];
  if (event.modifierIds.length) tags.push(MODIFIER_DEFS[event.modifierIds[0]].label);
  return tags;
}

function getMenuEyebrow(state, event) {
  if (!state.save.settings.tutorialCompleted) return "Start fast. Learn the loop. Then hit arcade runs.";
  if (event.daily) return "Daily pressure, forgiving recovery, instant retry.";
  return "Fast-launch neon racing with clean replay hooks.";
}

function getMenuIntro(state, event) {
  if (!state.save.settings.tutorialCompleted) return "Take the guided opener, then jump straight into arcade runs.";
  if (event.daily) return "Today's daily is live. Bank one clean time, then decide if it is worth another push.";
  return "Pick a run and launch in seconds.";
}

function getLaunchHint(state) {
  return state.save.settings.tutorialCompleted
    ? "Press Enter to start this run, D for the daily, or Q to remix the event and car for a fresh one-shot race."
    : "Press Enter to start the recommended run, D for the daily, or Q to skip straight into arcade play.";
}

function getStartLabel(state, event) {
  if (!state.save.settings.tutorialCompleted && event.guided) return "Start Guided Run";
  if (event.daily) return "Start Daily Challenge";
  return "Start This Race";
}

function getDailyLabel(state) {
  return state.save.daily.bestTime ? "Retry Daily PB" : "Run Daily Challenge";
}

function getQuickLabel(state) {
  return state.save.settings.tutorialCompleted ? "Instant Remix" : "Skip To Arcade";
}

function getHeroNextCopy(state, event) {
  if (!state.save.settings.tutorialCompleted && !event.guided) {
    return "Ignition Class is still the fastest way to learn pickups and recovery before full arcade pressure.";
  }
  return `${event.name} is a ${getDifficultyLabel(event).toLowerCase()} ${event.type === "circuit" ? "circuit" : "sprint"} built around ${getPrimaryGoal(event).toLowerCase()}.`;
}

function getHeroRecoveryCopy(state) {
  return state.save.settings.tutorialCompleted
    ? "Scrapes should bleed speed first. Respawns give you pace, shield time, and a real way back into the race."
    : "Minor hits should cost pace first, not the whole race. The opener is tuned to prove that quickly.";
}

function getHeroDailyCopy(state) {
  return state.save.daily.bestTime ? `Today's daily best is ${formatTime(state.save.daily.bestTime)}.` : "The daily seed is the cleanest reason to jump back in tomorrow.";
}

function getCarLabel(car) {
  if (!isGarageSlotFilled(car)) return "Vacant";
  return car.tierLabel || car.role || "Ready";
}

function getCarTags(car) {
  if (!isGarageSlotFilled(car)) return ["vacant"];
  return [...car.traits];
}

function getCarGuidance(car) {
  if (!isGarageSlotFilled(car)) return "Open slot. Keep a Foundry roll here to expand the garage.";
  return car.guidance || car.description || "Race ready.";
}

function getMenuOverviewTooltip(state, event) {
  if (state.menuView === "profile") {
    return "Garage keeps three live cars only, so every foundry pull matters.\n\nUse Garage to compare your active slot cars, Foundry to roll three new procedural offers, Style to spend Scrap, and Career to review momentum.\n\nThe goal is simple: keep only meaningful upgrades and sell the misses into cosmetic progress.";
  }
  if (state.menuView === "settings") {
    return "Settings are split into two short surfaces so comfort and controls stay readable on one screen.\n\nComfort covers audio, contrast, shake, and assist level. Controls covers binding mode, remaps, and live device state.\n\nEverything updates immediately and persists between sessions.";
  }
  const currentRun = event.daily
    ? "Daily Challenge uses the same seeded course all day, so the replay value comes from shaving time and cleaning up your line."
    : `${event.name} is currently selected. ${getReplayHook(state, event)}`;
  const recommendedPath = !state.save.settings.tutorialCompleted
    ? "Recommended path: take Guided Run first, then move into Daily Challenge or Instant Remix once the pickup loop makes sense."
    : "Use Start This Race for the selected event, Daily Challenge for the fixed seed, and Instant Remix when you want a fresh one-shot race immediately.";
  return `${getMenuIntro(state, event)}\n\n${currentRun}\n\n${recommendedPath}\n\n${getLaunchHint(state)}`;
}

function getEventTooltip(state, event, eventResult) {
  const formatLabel = event.type === "circuit" ? `${event.laps} lap circuit` : "Point-to-point sprint";
  const progressCopy = event.daily
    ? state.save.daily.bestTime
      ? `Daily best on record: ${formatTime(state.save.daily.bestTime)}.`
      : "No daily time banked yet."
    : eventResult?.bestTime
      ? `Best result on record: ${formatTime(eventResult.bestTime)} with ${eventResult.goalsMet}/${event.goals.length} goals cleared.`
      : "Fresh run with no saved best yet.";
  return `${event.name}\n${formatLabel} // ${getDifficultyLabel(event)} // ${BIOME_DEFS[event.biomeId].name}\n\n${event.summary}\n\nPrimary goal: ${getPrimaryGoal(event)}.\n${progressCopy}`;
}

function getCarTooltip(car) {
  if (!isGarageSlotFilled(car)) {
    return "Open Slot\n\nThis garage bay is empty. Keep a Foundry roll here to turn it into a live race slot.";
  }
  const stats = [
    `Launch ${describeStat(Math.round(getGarageStatPercent(car, "accel")))}`,
    `Top end ${describeStat(Math.round(getGarageStatPercent(car, "maxSpeed")))}`,
    `Handling ${describeStat(Math.round(getGarageStatPercent(car, "handling")))}`,
    `Durability ${describeStat(Math.round(getGarageStatPercent(car, "durability")))}`,
  ].join(" // ");
  return `${car.name} // ${getCarLabel(car)}\n\n${getCarGuidance(car)}\n\n${stats}.`;
}

function getGoalProgressText(result) {
  return `${result.goalsMet}/${result.goals.length} goals cleared`;
}

function getResultsSubtitle(result) {
  if (result.previousEventBest === null && !result.event.daily) return `${result.placeLabel} // first result banked // ${getGoalProgressText(result)}`;
  if (result.newDailyBest) return `${result.placeLabel} // new daily best // ${getGoalProgressText(result)}`;
  if (result.newEventBest) return `${result.placeLabel} // new best // ${getGoalProgressText(result)}`;
  if (result.deltaToPar <= 0) return `${result.placeLabel} // par beaten ${formatGain(result.deltaToPar)} // ${getGoalProgressText(result)}`;
  return `${result.placeLabel} // par missed ${formatGain(result.deltaToPar)} // ${getGoalProgressText(result)}`;
}

function getResultsNote(result) {
  if (result.event.guided && result.wasTutorialRun && !result.tutorialPickupMet) return "You finished the opener, but missed the pickup lesson that completes onboarding.";
  if (result.event.guided && result.wasTutorialRun) return "Tutorial clear. You used the full loop: pickup, damage tolerance, recovery, and finish.";
  if (result.previousEventBest === null && !result.event.daily) return "First result banked. Now you have a line, a par time, and goals worth chasing.";
  if (result.newDailyBest && result.previousDailyBest !== null) return `New daily best by ${formatGain(result.previousDailyBest - result.finishTime)}.`;
  if (result.newDailyBest) return "First daily time banked.";
  if (result.newEventBest && result.previousEventBest !== null) return `New event best by ${formatGain(result.previousEventBest - result.finishTime)}.`;
  if (result.place === 1) return "Win banked. You kept enough pace alive after mistakes to close it out.";
  if (result.deltaToPar <= 0) return `Par beaten by ${formatGain(result.deltaToPar)}.`;
  return `You missed par by ${formatGain(result.deltaToPar)}.`;
}

function getResultsNext(result) {
  if (result.event.guided && result.wasTutorialRun && !result.tutorialPickupMet) return "Retry once and use the guided pickup to finish onboarding, or back out and skip straight to arcade play.";
  if (result.event.guided && result.wasTutorialRun) return "Back out to the menu and run Neon Runoff, or use Skip To Arcade if you want a faster one-shot race now.";
  if ((result.postRaceFlux || 0) >= GARAGE_ROLL_COST) return "Your Flux Foundry pull is ready. Jump into the garage and crack three new cars.";
  if (result.place > 3) return "Retry and chase the podium. A cleaner first sector should keep you in the pack.";
  if (result.deltaToPar > 0) return `Retry and beat par ${formatTime(result.event.parTime)} before moving on.`;
  if (result.event.daily) return "Daily pace is banked. Retry if you think the line still has time left in it.";
  return "Instant remix is ready if you want a fresh seed without extra setup.";
}

function getResultsRetryLabel(result) {
  if (result.event.guided && result.wasTutorialRun) return "Retry Tutorial";
  if (result.event.daily) return "Retry Daily";
  return "Instant Retry";
}

function getResultsMenuLabel(result) {
  if (result.event.guided && result.wasTutorialRun) return "Pick Arcade Race";
  return "Back To Menu";
}

function getLiveGoal(state, player) {
  if (state.currentEvent.guided && !state.save.settings.tutorialCompleted) {
    if (player.pickup && player.pickupUses < 1) return `Goal: use your ${PICKUP_DEFS[player.pickup].label.toLowerCase()}`;
    if ((player.pickupCollects || 0) < 1 && !player.pickup) return "Goal: drive through the pickup ahead";
    if (player.destroyedCount < 1) return "Goal: stay moving through contact";
    return "Goal: respawn clean and finish";
  }
  return `Goal: ${getPrimaryGoal(state.currentEvent).toLowerCase()}`;
}

function getPressureState(state, player) {
  const rival = state.cars.find((car) => car.rival);
  if (player.wrongWay) return { text: "Turn back", tone: "danger" };
  if (rival && rival.place < player.place) return { text: "Rival ahead", tone: "danger" };
  if (player.place <= Math.min(3, state.cars.length)) return { text: "Podium pace", tone: "good" };
  return { text: `Chase P${Math.max(1, player.place - 1)}`, tone: "neutral" };
}

function getAssistState(state, player) {
  const damagePct = player.damage / player.def.durability;
  if (state.save.settings.assistLevel === "off") return { text: damagePct > 0.65 ? "Manual recovery" : "Manual handling", tone: damagePct > 0.65 ? "danger" : "neutral" };
  if (player.invuln > 0 || player.shieldTimer > 0) return { text: "Protected", tone: "good" };
  if (player.assistTimer > 0) return { text: "Recovery push", tone: "good" };
  if (damagePct > 0.75) return { text: "Critical integrity", tone: "danger" };
  if (damagePct > 0.45) return { text: "Heavy damage", tone: "danger" };
  return { text: "Stable line", tone: "neutral" };
}

function getFlowState(player) {
  if (player.wrongWay) return { text: "Turn back", tone: "danger" };
  if (player.slipstream > 0.22) return { text: "Drafting", tone: "good" };
  if (player.place > 3) return { text: "Close the gap", tone: "neutral" };
  return { text: "Clean line", tone: "neutral" };
}

function getGhostState(state) {
  if (!state.ghostPlayback) return { text: "Ghost offline", tone: "neutral" };
  return { text: "Ghost live", tone: "good" };
}

function getProfileSummaryItems(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  const liveCars = getFilledGarageCars(state.save);
  const eventResults = Object.values(state.save.eventResults || {});
  const podiums = eventResults.filter((result) => result.bestPlace <= 3).length;
  const bestEvent = state.events
    .filter((event) => state.save.eventResults[event.id]?.bestTime)
    .sort((a, b) => state.save.eventResults[a.id].bestTime - state.save.eventResults[b.id].bestTime)[0];
  const averageGarageScore = liveCars.length
    ? Math.round(liveCars.reduce((sum, car) => sum + getGarageScore(car), 0) / liveCars.length)
    : 0;
  return [
    { label: "Wins", value: String(state.save.wins), note: state.save.wins ? "Ladder victories banked" : "No wins banked yet" },
    { label: "Flux", value: `${flux}`, note: getRollReadyStatus(state.save) ? "Pull is ready right now" : `${Math.max(0, GARAGE_ROLL_COST - flux)} more for the next pull` },
    { label: "Garage", value: `${averageGarageScore}`, note: `${liveCars.length} live car${liveCars.length === 1 ? "" : "s"} loaded right now` },
    { label: "Ghosts", value: String(getGhostCount(state)), note: getGhostCount(state) ? "Replay ghosts ready" : "Set your first clean ghost" },
    { label: "Podiums", value: String(podiums), note: podiums ? "Solid replay foundation" : "First podium still live" },
    { label: "Daily", value: state.save.daily.bestTime ? formatTime(state.save.daily.bestTime) : "--", note: state.save.daily.bestTime ? "Best daily time" : "Daily not banked yet" },
    { label: "Best Event", value: bestEvent ? bestEvent.name : "None yet", note: bestEvent ? formatTime(state.save.eventResults[bestEvent.id].bestTime) : "Finish a full arcade event" },
  ];
}

function getFoundryInsightItems(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  const scrap = getCurrencyBalance(state.save, "scrap");
  const progression = Math.round(getGarageProgression(state.save) * 100);
  const liveCars = getFilledGarageCars(state.save);
  const bestScore = liveCars.length
    ? Math.max(...liveCars.map((car) => getGarageScore(car)))
    : 0;
  return [
    { label: "Calibration", value: `${progression}%`, note: "More race history lifts the pull ceiling, not the floor." },
    { label: "Wallet", value: `${flux} Flux`, note: getRollReadyStatus(state.save) ? "Enough for a full three-capsule pull." : `${Math.max(0, GARAGE_ROLL_COST - flux)} Flux to the next reveal.` },
    { label: "Scrap", value: `${scrap}`, note: scrap ? "Ready for cosmetic spend." : "Sell missed pulls to start the style economy." },
    { label: "Best Slot", value: `${bestScore}`, note: "Current highest live rating in your garage." },
  ];
}

function getMenuHeaderContent(state, view, event) {
  const volume = Math.round((state.save.settings.masterVolume ?? 0.65) * 100);
  const liveCars = getFilledGarageCars(state.save).length;
  if (view === "profile") {
    return {
      title: "Garage",
      eyebrow: liveCars <= 1
        ? "One live starter, two open bays, and a Foundry built to replace it."
        : "Three garage bays, procedural pulls, and scrap-funded flex.",
      intro: "Manage your current rides, crack foundry rolls, and turn the misses into style upgrades.",
      chips: [
        `${liveCars} live / ${state.save.garage.length} slots`,
        `${getCurrencyBalance(state.save, "flux")} Flux`,
        `${getCurrencyBalance(state.save, "scrap")} Scrap`,
      ],
    };
  }
  if (view === "settings") {
    return {
      title: "Settings",
      eyebrow: "Comfort, clarity, and control tuning without burying the race start.",
      intro: "Keep the setup simple: tune the feel, confirm bindings, then jump straight back into the loop.",
      chips: [
        `${state.save.settings.assistLevel || "standard"} assist`,
        `${volume}% volume${state.save.settings.muted ? " muted" : ""}`,
        state.save.settings.controlMode === "custom"
          ? `Custom bindings${state.gamepad?.connected ? " // gamepad live" : ""}`
          : `Hybrid controls${state.gamepad?.connected ? " // gamepad live" : ""}`,
      ],
    };
  }
  return {
    title: "Race Setup",
    eyebrow: getMenuEyebrow(state, event),
    intro: getMenuIntro(state, event),
    chips: [
      getCareerStatus(state),
      getDailyStatus(state),
      getGhostStatus(state),
    ],
  };
}

function formatCarMeta(car) {
  if (!isGarageSlotFilled(car)) return "Vacant // Rating 0 // Foundry slot";
  return `${car.tierLabel} // Rating ${getGarageScore(car)} // ${car.role}`;
}

function getRollCallout(state) {
  const progression = Math.round(getGarageProgression(state.save) * 100);
  const flux = getCurrencyBalance(state.save, "flux");
  const openSlots = state.save.garage.filter((car) => !isGarageSlotFilled(car)).length;
  if (flux >= GARAGE_ROLL_COST) {
    return openSlots
      ? `Foundry hot. ${openSlots} open slot${openSlots === 1 ? "" : "s"} can be filled immediately, but no pull is guaranteed to upgrade your live car.`
      : "Foundry hot. Crack three procedural cars. Better race history raises the ceiling, but no pull is guaranteed to beat your garage.";
  }
  return `Foundry calibration ${progression}%. More race data improves the roll pool. Earn ${GARAGE_ROLL_COST - flux} more Flux to spin again.`;
}

function getCosmeticItem(itemId) {
  return COSMETIC_DEFS[itemId] || null;
}

function getEventUtilityStatus(state, event) {
  if (event.daily) return "Bonus Flux live";
  if (getRollReadyStatus(state.save)) return "Foundry ready";
  return event.modifierIds.includes("rival-pressure") ? "Rival heat live" : `${Math.max(0, GARAGE_ROLL_COST - getCurrencyBalance(state.save, "flux"))} Flux to next pull`;
}

function drawTrackPreview(canvas, event) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = Math.max(1, Math.round(canvas.clientWidth || canvas.width));
  const cssHeight = Math.max(1, Math.round(canvas.clientHeight || canvas.height));
  const targetWidth = Math.round(cssWidth * dpr);
  const targetHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const width = cssWidth;
  const height = cssHeight;
  const track = buildTrack(event);
  const bounds = track.points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = Math.max(18, Math.min(width, height) * 0.12);
  const scale = Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight);
  const offsetX = (width - contentWidth * scale) * 0.5 - bounds.minX * scale;
  const offsetY = (height - contentHeight * scale) * 0.5 - bounds.minY * scale;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(dpr, dpr);
  context.fillStyle = track.theme.inside;
  context.fillRect(0, 0, width, height);
  const spotlight = context.createRadialGradient(width * 0.5, height * 0.48, 8, width * 0.5, height * 0.48, Math.max(width, height) * 0.66);
  spotlight.addColorStop(0, "rgba(255,255,255,0.12)");
  spotlight.addColorStop(0.34, track.theme.glow);
  spotlight.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = spotlight;
  context.fillRect(0, 0, width, height);
  context.fillStyle = track.theme.fog;
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(offsetX, offsetY);
  context.beginPath();
  track.points.forEach((point, index) => {
    const x = point.x * scale;
    const y = point.y * scale;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (track.type === "circuit") context.closePath();
  context.shadowBlur = 22;
  context.shadowColor = track.theme.glow;
  context.strokeStyle = track.theme.track;
  context.lineWidth = 10;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.shadowBlur = 12;
  context.strokeStyle = track.theme.trackEdge;
  context.lineWidth = 3.2;
  context.stroke();
  if (event.guided) {
    context.setLineDash([8, 6]);
    context.strokeStyle = "rgba(47,246,255,0.78)";
    context.lineWidth = 1.8;
    context.stroke();
    context.setLineDash([]);
  }
  const start = track.points[0];
  if (start) {
    const sx = start.x * scale;
    const sy = start.y * scale;
    context.fillStyle = track.theme.trackEdge;
    context.beginPath();
    context.arc(sx, sy, 5.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.72)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(sx, sy, 10, 0, Math.PI * 2);
    context.stroke();
  }
  for (const pickup of track.pickups.slice(0, 4)) {
    context.fillStyle = PICKUP_DEFS[pickup.kind].color;
    context.beginPath();
    context.arc(pickup.x * scale, pickup.y * scale, pickup.guidedBeacon ? 5 : 3, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  context.restore();
}

export function createUi(state, callbacks = {}) {
  const refs = createRefs();
  const uiState = {
    menuOpen: true,
    toastTimer: 0,
    bannerTimer: 0,
    tooltipTimer: null,
    tooltipButton: null,
    tooltipMode: null,
    lastMenuStage: null,
    lastMenuView: null,
    styleSlot: "skin",
    profilePane: "garage",
    settingsPane: "comfort",
  };
  const tooltipButtons = [
    refs.splashOverviewInfo,
    refs.splashRunsInfo,
    refs.splashRecoveryInfo,
    refs.splashReplayInfo,
    refs.menuOverviewInfo,
    refs.eventInfoBtn,
    refs.carInfoBtn,
    refs.gachaInfoBtn,
    refs.styleInfoBtn,
    refs.settingsAudioInfo,
    refs.settingsControlsInfo,
  ].filter(Boolean);

  function clearTooltipTimer() {
    if (!uiState.tooltipTimer) return;
    window.clearTimeout(uiState.tooltipTimer);
    uiState.tooltipTimer = null;
  }

  function dismissTooltip() {
    clearTooltipTimer();
    uiState.tooltipButton = null;
    uiState.tooltipMode = null;
    refs.tooltip.textContent = "";
    refs.tooltip.dataset.mode = "";
    refs.tooltip.classList.add("hidden");
    refs.tooltip.setAttribute("aria-hidden", "true");
    refs.tooltip.style.left = "";
    refs.tooltip.style.top = "";
    tooltipButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function positionTooltip(button) {
    if (!button || refs.tooltip.classList.contains("hidden")) return;
    refs.tooltip.style.left = "12px";
    refs.tooltip.style.top = "12px";
    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = refs.tooltip.getBoundingClientRect();
    const edge = 12;
    let left = buttonRect.left + buttonRect.width * 0.5 - tooltipRect.width * 0.5;
    left = Math.max(edge, Math.min(left, window.innerWidth - tooltipRect.width - edge));
    let top = buttonRect.bottom + 12;
    if (top + tooltipRect.height > window.innerHeight - edge) {
      top = buttonRect.top - tooltipRect.height - 12;
    }
    top = Math.max(edge, Math.min(top, window.innerHeight - tooltipRect.height - edge));
    refs.tooltip.style.left = `${Math.round(left)}px`;
    refs.tooltip.style.top = `${Math.round(top)}px`;
  }

  function showTooltip(button, mode = "click") {
    const text = button?.dataset.tooltip?.trim();
    if (!text) return;
    clearTooltipTimer();
    uiState.tooltipButton = button;
    uiState.tooltipMode = mode;
    refs.tooltip.textContent = text;
    refs.tooltip.dataset.mode = mode;
    refs.tooltip.classList.remove("hidden");
    refs.tooltip.setAttribute("aria-hidden", "false");
    tooltipButtons.forEach((item) => item.setAttribute("aria-expanded", item === button ? "true" : "false"));
    positionTooltip(button);
  }

  function scheduleTooltip(button) {
    if (!button?.dataset.tooltip || uiState.tooltipMode === "click") return;
    clearTooltipTimer();
    uiState.tooltipTimer = window.setTimeout(() => {
      showTooltip(button, "hover");
    }, TOOLTIP_DELAY_MS);
  }

  function scaleShell(shell, variableName, padding = 24) {
    if (!shell) return;
    shell.style.setProperty(variableName, "1");
    const availableWidth = Math.max(320, window.innerWidth - padding);
    const availableHeight = Math.max(320, window.innerHeight - padding);
    const width = shell.scrollWidth || shell.offsetWidth || 1;
    const height = shell.scrollHeight || shell.offsetHeight || 1;
    const scale = Math.min(1, availableWidth / width, availableHeight / height);
    shell.style.setProperty(variableName, scale.toFixed(4));
  }

  function updateMenuScale() {
    scaleShell(refs.splashShell, "--splash-scale", 24);
    scaleShell(refs.menuShell, "--menu-scale", 24);
    scaleShell(refs.pauseShell, "--pause-scale", 32);
    scaleShell(refs.resultsShell, "--results-scale", 32);
    scaleShell(refs.garageRollShell, "--garage-roll-scale", 32);
    if (uiState.tooltipButton && !refs.tooltip.classList.contains("hidden")) positionTooltip(uiState.tooltipButton);
  }

  function syncVisualSettings() {
    document.body.dataset.contrast = state.save.settings.highContrast ? "high" : "normal";
  }

  function showProfilePane(pane) {
    const nextPane = pane || uiState.profilePane || "garage";
    uiState.profilePane = nextPane;
    refs.menuViewProfile.dataset.pane = nextPane;
    refs.profilePaneGarage.classList.toggle("hidden", nextPane !== "garage");
    refs.profilePaneFoundry.classList.toggle("hidden", nextPane !== "foundry");
    refs.profilePaneStyle.classList.toggle("hidden", nextPane !== "style");
    refs.profilePaneCareer.classList.toggle("hidden", nextPane !== "career");
    refs.profileTabGarage.classList.toggle("selected", nextPane === "garage");
    refs.profileTabFoundry.classList.toggle("selected", nextPane === "foundry");
    refs.profileTabStyle.classList.toggle("selected", nextPane === "style");
    refs.profileTabCareer.classList.toggle("selected", nextPane === "career");
  }

  function showSettingsPane(pane) {
    const nextPane = pane || uiState.settingsPane || "comfort";
    uiState.settingsPane = nextPane;
    refs.menuViewSettings.dataset.pane = nextPane;
    refs.settingsPaneComfort.classList.toggle("hidden", nextPane !== "comfort");
    refs.settingsPaneControls.classList.toggle("hidden", nextPane !== "controls");
    refs.settingsTabComfort.classList.toggle("selected", nextPane === "comfort");
    refs.settingsTabControls.classList.toggle("selected", nextPane === "controls");
  }

  function showView(view) {
    if (uiState.lastMenuView && uiState.lastMenuView !== view) dismissTooltip();
    uiState.lastMenuView = view;
    refs.menu.dataset.view = view;
    refs.menuViewHome.classList.toggle("hidden", view !== "home");
    refs.menuViewProfile.classList.toggle("hidden", view !== "profile");
    refs.menuViewSettings.classList.toggle("hidden", view !== "settings");
    refs.menuTabHome.classList.toggle("selected", view === "home");
    refs.menuTabProfile.classList.toggle("selected", view === "profile");
    refs.menuTabSettings.classList.toggle("selected", view === "settings");
    if (view === "profile") showProfilePane(uiState.profilePane);
    if (view === "settings") showSettingsPane(uiState.settingsPane);
  }

  function showMenuStage(stage) {
    if (uiState.lastMenuStage && uiState.lastMenuStage !== stage) dismissTooltip();
    uiState.lastMenuStage = stage;
    const splash = stage !== "garage";
    refs.menuSplash.classList.toggle("hidden", !splash);
    refs.splashShell.classList.toggle("hidden", !splash);
    refs.menuShell.classList.toggle("hidden", splash);
    refs.menu.dataset.stage = splash ? "splash" : "garage";
  }

  function setMenuOpen(isOpen) {
    uiState.menuOpen = isOpen;
    refs.menu.classList.toggle("hidden", !isOpen);
    refs.root.classList.toggle("menu-open", isOpen);
    if (!isOpen) dismissTooltip();
    if (isOpen) updateMenuScale();
  }

  function setPauseOpen(isOpen) {
    refs.pause.classList.toggle("hidden", !isOpen);
    refs.root.classList.toggle("pause-open", isOpen);
    dismissTooltip();
    if (isOpen) {
      syncPause();
      updateMenuScale();
    }
  }

  function showBanner(text, duration = 2) {
    refs.banner.textContent = text;
    refs.banner.classList.remove("hidden");
    uiState.bannerTimer = duration;
  }

  function showToast(text, tone = "neutral", duration = 1.4) {
    refs.toast.textContent = text;
    refs.toast.dataset.tone = tone;
    refs.toast.classList.remove("hidden");
    uiState.toastTimer = duration;
  }

  function hideResults() {
    refs.results.classList.add("hidden");
    refs.root.classList.remove("results-open");
    dismissTooltip();
  }

  function syncSettingsInputs() {
    const volume = Math.round((state.save.settings.masterVolume ?? 0.65) * 100);
    refs.settingsVolume.value = String(volume);
    refs.pauseVolume.value = String(volume);
    refs.settingsMute.checked = Boolean(state.save.settings.muted);
    refs.pauseMute.checked = Boolean(state.save.settings.muted);
    refs.settingsShake.checked = Boolean(state.save.settings.reducedShake);
    refs.pauseShake.checked = Boolean(state.save.settings.reducedShake);
    refs.settingsContrast.checked = Boolean(state.save.settings.highContrast);
    refs.settingsAssist.value = state.save.settings.assistLevel || "standard";
    refs.pauseAssist.value = state.save.settings.assistLevel || "standard";
    refs.settingsControlMode.value = state.save.settings.controlMode || "hybrid";
    const deviceStatus = state.gamepad?.connected ? " // gamepad live" : "";
    refs.bindStatus.textContent = state.bindingAction
      ? `Press a key for ${CONTROL_LABELS[state.bindingAction]}`
      : state.save.settings.controlMode === "custom" ? `Custom bindings${deviceStatus}` : `Hybrid bindings${deviceStatus}`;
  }

  function showResults(result) {
    dismissTooltip();
    refs.results.classList.remove("hidden");
    refs.pause.classList.add("hidden");
    refs.root.classList.add("results-open");
    updateMenuScale();
    const shouldCelebrateBest = (result.newEventBest && result.previousEventBest !== null) || (result.newDailyBest && result.previousDailyBest !== null);
    refs.resultsTitle.textContent = shouldCelebrateBest ? "New Best Locked In" : `${result.event.name} Complete`;
    refs.resultsSubtitle.textContent = getResultsSubtitle(result);
    refs.resultsNote.textContent = getResultsNote(result);
    refs.resultsNext.textContent = getResultsNext(result);
    refs.resultsMedal.textContent = medalForResult(result);
    refs.resultsPlace.textContent = `Place ${result.place} / ${result.fieldSize} // ${result.emoteBadge || "LOCKED IN"}`;
    refs.resultsStats.innerHTML = [
      `Time <strong>${formatTime(result.finishTime)}</strong>`,
      result.previousEventBest !== null ? `Event best <strong>${formatDelta(result.finishTime - result.previousEventBest)}</strong>` : "Event best <strong>first result</strong>",
      `Par line <strong>${formatDelta(result.deltaToPar)}</strong>`,
      `Flux earned <strong>+${result.currencyEarned || 0}</strong>`,
      `Wrecks <strong>${result.destroyedCount}</strong>`,
      `Pickups used <strong>${result.pickupUses}</strong>`,
      `Wall hits <strong>${result.wallHits}</strong>`,
    ].map((item) => `<div class="results-item">${item}</div>`).join("");
    refs.resultsGoals.innerHTML = result.goals.map((goal) => `
      <div class="results-item ${goal.complete ? "results-item-pass" : "results-item-fail"}">
        ${goal.complete ? "PASS" : "MISS"} <strong>${goal.label}</strong>
      </div>
    `).join("");
    refs.resultsProgress.innerHTML = [
      result.newDailyBest ? "Daily line <strong>improved</strong>" : result.event.daily ? "Daily line <strong>banked</strong>" : `Ghost <strong>${result.newGhost ? "updated" : result.ghostAvailable ? "ready to chase" : "not set yet"}</strong>`,
      `Wallet <strong>${result.postRaceFlux ?? getCurrencyBalance(state.save, "flux")} Flux // ${result.postRaceScrap ?? getCurrencyBalance(state.save, "scrap")} Scrap</strong>`,
      `Replay <strong>${result.place <= 3 ? "medal chase live" : "podium still needed"}</strong>`,
      `Run count <strong>${result.completions}</strong>`,
      `Finish emote <strong>${result.emoteName || "Steady Nod"}</strong>`,
      result.event.daily ? `Daily best <strong>${result.newDailyBest ? "improved" : state.save.daily.bestTime ? formatTime(state.save.daily.bestTime) : "first run"}</strong>` : `Best place <strong>P${result.bestPlace}</strong>`,
    ].map((item) => `<div class="results-item">${item}</div>`).join("");
    refs.resultsRetry.textContent = getResultsRetryLabel(result);
    refs.resultsMenu.textContent = getResultsMenuLabel(result);
  }

  function updateTutorial() {
    const player = state.player;
    const event = state.currentEvent;
    const shouldGuide = event?.guided && !state.save.settings.tutorialCompleted;
    refs.tutorialCard.classList.toggle("hidden", !shouldGuide);
    if (!shouldGuide || !player) return;

    let copy = "Hold the line into turn one. You can push earlier than the track looks.";
    let step = "Launch";

    if (state.countdown > 0) {
      copy = "Clean launch first. The opener is short, forgiving, and built to show how recovery works.";
      step = "Start";
    } else if (player.pickup && player.pickupUses < 1) {
      copy = `Use your ${PICKUP_DEFS[player.pickup].label.toLowerCase()} now. One pickup slot keeps the decision simple.`;
      step = "Use it";
    } else if ((player.pickupCollects || 0) < 1 && !player.pickup) {
      copy = "Drive through the bright pickup ahead. This tutorial always places one on the racing line early.";
      step = "Collect";
    } else if (player.destroyedCount < 1) {
      copy = "Push through contact. Scrapes should bleed speed first, with full wrecks saved for bigger mistakes.";
      step = "Push";
    } else {
      copy = "Respawns return you with pace and protection. Use that window to get straight back into the race.";
      step = "Recover";
    }

    refs.tutorialStep.textContent = step;
    refs.tutorialCopy.textContent = copy;
  }

  function renderProfile() {
    ensureStyleLocker(state.save);
    const styleDefs = getEquippedCosmeticDefs(state.save);
    refs.profileBadge.textContent = getRollReadyStatus(state.save) ? "Foundry ready" : "Garage live";
    refs.profileSummary.innerHTML = getProfileSummaryItems(state).map((item) => `
      <div class="profile-item">
        <div class="section-label">${item.label}</div>
        <div class="profile-value">${item.value}</div>
        <div class="profile-note">${item.note}</div>
      </div>
    `).join("");

    const recentRuns = state.save.runHistory.slice(0, 3);
    refs.profileRuns.innerHTML = recentRuns.length
      ? recentRuns.map((run) => {
        const eventName = state.events.find((event) => event.id === run.eventId)?.name || run.eventId;
        return `<div class="results-item">${eventName} <strong>P${run.place}</strong> <span class="results-inline">${formatTime(run.finishTime)} // +${run.currencyEarned || 0} Flux // ${run.wrecks} wrecks</span></div>`;
      }).join("")
      : `<div class="results-item">No recent runs yet <strong>Start one race</strong></div>`;

    refs.foundryInsights.innerHTML = getFoundryInsightItems(state).map((item) => `
      <div class="profile-item">
        <div class="section-label">${item.label}</div>
        <div class="profile-value">${item.value}</div>
        <div class="profile-note">${item.note}</div>
      </div>
    `).join("");
    refs.garageSlotSummary.innerHTML = state.save.garage.map((car, index) => `
      <div class="results-item">
        Slot ${index + 1} <strong>${isGarageSlotFilled(car) ? car.name : "Open slot"}</strong>
        <span class="results-inline">${isGarageSlotFilled(car) ? `${car.tierLabel} // Rating ${getGarageScore(car)} // ${car.role}` : "Vacant // keep a Foundry roll here"}</span>
      </div>
    `).join("");

    refs.scrapCurrency.textContent = `${getCurrencyBalance(state.save, "scrap")} Scrap`;
    refs.styleSlotTabs.innerHTML = COSMETIC_SLOTS.map((slot) => `
      <button class="menu-tab${uiState.styleSlot === slot ? " selected" : ""}" data-style-slot="${slot}" type="button">${slot}</button>
    `).join("");
    refs.styleSlotTabs.querySelectorAll("[data-style-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        uiState.styleSlot = button.dataset.styleSlot;
        renderProfile();
      });
    });
    refs.equippedStyle.innerHTML = COSMETIC_SLOTS.map((slot) => {
      const item = styleDefs[slot] || getCosmeticItem(state.save.equippedCosmetics?.[slot]);
      return `
        <div class="garage-item">
          <div class="section-label">${slot}</div>
          <div class="profile-value">${item?.name || "None"}</div>
          <div class="profile-note">${item?.description || "No cosmetic equipped."}</div>
        </div>
      `;
    }).join("");

    const activeSlot = uiState.styleSlot || "skin";
    const slotItems = getCosmeticsBySlot(activeSlot);
    refs.styleShop.innerHTML = `
      <div class="style-slot-group">
        <div class="section-head style-slot-head">
          <div class="section-label">${activeSlot}</div>
          <div class="section-note">${slotItems.length} options</div>
        </div>
        <div class="style-card-grid">
          ${slotItems.map((item) => {
            const owned = isCosmeticOwned(state.save, item.id);
            const equipped = state.save.equippedCosmetics?.[activeSlot] === item.id;
            const actionLabel = equipped ? "Equipped" : owned ? "Equip" : `Buy ${item.cost} Scrap`;
            return `
              <button class="style-card${equipped ? " selected" : ""}" data-style-id="${item.id}" data-style-action="${owned ? "equip" : "buy"}" ${equipped ? "disabled" : ""} type="button">
                <div class="card-head">
                  <div class="card-title">${item.name}</div>
                  <div class="card-kicker">${owned ? activeSlot : "Shop"}</div>
                </div>
                <div class="card-meta">${item.description}</div>
                <div class="mini-tags">
                  <span class="mini-tag">${owned ? "Owned" : `${item.cost} Scrap`}</span>
                  ${equipped ? '<span class="mini-tag">Live</span>' : ""}
                </div>
                <div class="style-card-action">${actionLabel}</div>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
    refs.styleShop.querySelectorAll(".style-card").forEach((button) => {
      const itemId = button.dataset.styleId;
      const action = button.dataset.styleAction;
      button.addEventListener("click", () => {
        if (action === "buy") callbacks.onCosmeticBuy?.(itemId);
        else callbacks.onCosmeticEquip?.(itemId);
      });
    });
  }

  function renderBindings() {
    const custom = state.save.settings.controls || {};
    refs.settingsBindings.innerHTML = Object.entries(CONTROL_LABELS).map(([action, label]) => {
      const key = custom[action] || CONTROL_DEFAULTS[action];
      const active = state.bindingAction === action;
      return `<button class="binding-btn${active ? " selected" : ""}" data-action="${action}" type="button"><span>${label}</span><strong>${formatKeyLabel(key)}</strong></button>`;
    }).join("");
    refs.settingsBindings.querySelectorAll(".binding-btn").forEach((button) => {
      button.addEventListener("click", () => callbacks.onBindingStart?.(button.dataset.action));
    });
  }

  function syncPause() {
    if (!state.player || !state.currentEvent) return;
    refs.pauseTitle.textContent = `${state.currentEvent.name} Paused`;
    refs.pauseCopy.textContent = "Resume immediately, restart the event, or tune accessibility without losing the run.";
    refs.pauseGoal.textContent = getLiveGoal(state, state.player);
    refs.pauseMeta.textContent = `P${state.player.place} // ${state.track.type === "circuit" ? `Lap ${Math.min(state.player.currentLap, state.currentEvent.laps)}/${state.currentEvent.laps}` : `${Math.round((state.player.progress || 0) * 100)}% to finish`} // ${state.player.pickup ? `Holding ${PICKUP_DEFS[state.player.pickup].label}` : "Pickup empty"}`;
    syncSettingsInputs();
  }

  function renderGarageRoll() {
    const roll = state.garageRoll;
    refs.garageRollModal.classList.toggle("hidden", !roll);
    refs.root.classList.toggle("garage-roll-open", Boolean(roll));
    if (!roll) return;

    const revealed = new Set(roll.revealedSlots || []);
    refs.garageRollStatus.textContent = roll.status === "revealed"
      ? `${roll.keptSlots.length || 0} selected // ${roll.offers.length} revealed`
      : `Charging capsules // ${revealed.size}/3 cracked`;
    refs.garageRollGrid.innerHTML = roll.offers.map((offer) => {
      const currentCar = state.save.garage[offer.slotIndex];
      const hasCurrentCar = isGarageSlotFilled(currentCar);
      const isRevealed = revealed.has(offer.slotIndex) || roll.status === "revealed";
      const kept = roll.keptSlots.includes(offer.slotIndex);
      const compareTags = [
        `Slot ${offer.slotIndex + 1}`,
        `${offer.deltaScore >= 0 ? "+" : ""}${offer.deltaScore} rating`,
        `${getScrapValue(offer)} Scrap if sold`,
      ];
      return `
        <div class="garage-roll-card${isRevealed ? " revealed" : " hidden-card"}${kept ? " kept" : ""}">
          <div class="garage-roll-card-inner">
            ${isRevealed ? `
              <div class="card-head">
                <div class="card-title">${offer.name}</div>
                <div class="card-kicker">${offer.tierLabel}</div>
              </div>
              <div class="event-meta">${formatCarMeta(offer)}</div>
              <div class="card-meta">${getCarGuidance(offer)}</div>
              <div class="mini-tags">${compareTags.map((tag) => `<span class="mini-tag">${tag}</span>`).join("")}</div>
                <div class="roll-compare-grid">
                  <div class="roll-compare-panel">
                    <div class="section-label">Current slot</div>
                    <div class="roll-compare-title">${hasCurrentCar ? currentCar.name : "Open slot"}</div>
                    <div class="card-meta">${hasCurrentCar ? formatCarMeta(currentCar) : "Vacant bay. Keep this roll to add another live car."}</div>
                    <div class="stat-bars compact">${renderStatTiles(currentCar)}</div>
                  </div>
                  <div class="roll-compare-panel roll-compare-panel-new">
                  <div class="section-label">New roll</div>
                  <div class="roll-compare-title">${offer.name}</div>
                  <div class="card-meta">${formatCarMeta(offer)}</div>
                  <div class="stat-bars compact">${renderStatTiles(offer, currentCar)}</div>
                </div>
              </div>
              <button class="secondary-btn garage-roll-toggle${kept ? " selected" : ""}" data-roll-slot="${offer.slotIndex}" type="button">${kept ? "Keeping this car" : "Keep this car"}</button>
            ` : `
              <div class="roll-capsule-shell">
                <div class="roll-capsule-core"></div>
                <div class="section-label">Capsule ${offer.slotIndex + 1}</div>
                <div class="card-meta">Scanning chassis line...</div>
              </div>
            `}
          </div>
        </div>
      `;
    }).join("");
    refs.garageRollGrid.querySelectorAll("[data-roll-slot]").forEach((button) => {
      button.addEventListener("click", () => callbacks.onGarageRollToggle?.(Number(button.dataset.rollSlot)));
    });
    const scrapPreview = roll.offers
      .filter((offer) => !roll.keptSlots.includes(offer.slotIndex))
      .reduce((sum, offer) => sum + getScrapValue(offer), 0);
    refs.garageRollSummary.textContent = roll.status === "revealed"
      ? `Keep 1, 2, or all 3. Unkept cars are sold for ${scrapPreview} Scrap, and none of the pulls are guaranteed upgrades.`
      : "The foundry is cracking three procedural cars. Ceiling scales with race history, but the reveals can still spike or whiff.";
    refs.garageRollConfirmBtn.disabled = roll.status !== "revealed" || !roll.keptSlots.length;
    refs.garageRollConfirmBtn.textContent = roll.status !== "revealed"
      ? "Revealing..."
      : `Keep ${roll.keptSlots.length} Car${roll.keptSlots.length === 1 ? "" : "s"}`;
  }

  function syncMenu() {
    const event = state.events[state.selectedEventIndex];
    const car = getSelectedGarageCar(state);
    const eventResult = getEventResult(state, event);
    const onboarding = !state.save.settings.tutorialCompleted;
    const displayedEvents = getDisplayedEvents(state);
    const menuView = state.menuView || "home";
    const header = getMenuHeaderContent(state, menuView, event);

    syncVisualSettings();
    syncSettingsInputs();
    showView(menuView);
    showMenuStage(state.menuStage || "splash");

    refs.hubTitle.textContent = header.title;
    refs.menuEyebrow.textContent = header.eyebrow;
    refs.menuIntro.textContent = header.intro;
    refs.careerStatus.textContent = header.chips[0] || "";
    refs.dailyStatus.textContent = header.chips[1] || "";
    refs.ghostStatus.textContent = header.chips[2] || "";
    refs.launchBtn.textContent = getStartLabel(state, event);
    refs.dailyBtn.textContent = getDailyLabel(state);
    refs.quickRaceBtn.textContent = getQuickLabel(state);
    refs.launchHint.textContent = getLaunchHint(state);
    refs.eventFormatHero.textContent = getHeroNextCopy(state, event);
    refs.heroRecoveryCopy.textContent = getHeroRecoveryCopy(state);
    refs.heroReplayCopy.textContent = getReplayHook(state, event);
    refs.heroDailyCopy.textContent = getHeroDailyCopy(state);

    refs.eventFocusBadge.textContent = getEventBadge(state, event);
    refs.eventFocusTitle.textContent = event.name;
    refs.eventFocusMeta.textContent = `${event.guided ? "~1:12" : `~${formatTime(event.parTime)}`} // ${getDifficultyLabel(event)} // Goal: ${getPrimaryGoal(event).toLowerCase()}`;
    refs.eventFocusCopy.textContent = getEventReason(state, event, eventResult);
    refs.eventFocusCopy.removeAttribute("title");
    refs.eventFocusModifiers.innerHTML = "";
    for (const tagLabel of getFocusTags(event, eventResult)) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = tagLabel;
      refs.eventFocusModifiers.appendChild(tag);
    }
    refs.eventGhostStatus.textContent = getGhostReady(state, event) ? "Ghost ready" : "Ghost offline";
    refs.eventRewardStatus.textContent = getEventUtilityStatus(state, event);
    drawTrackPreview(refs.eventPreview, event);

    if (car) {
      refs.carFocusBadge.textContent = `Slot ${getGarageSlotIndex(state.save, car.id) + 1} // ${getCarLabel(car)}`;
      refs.carFocusRole.textContent = formatCarMeta(car);
      refs.carFocusTitle.textContent = car.name;
      refs.carFocusCopy.textContent = getCarGuidance(car);
      refs.carFocusTags.innerHTML = "";
      for (const trait of getCarTags(car)) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = trait;
        refs.carFocusTags.appendChild(tag);
      }
      refs.carFocusStats.innerHTML = renderStatTiles(car);
    }

    refs.eventList.innerHTML = "";
    displayedEvents.forEach((item) => {
      const eventIndex = state.events.findIndex((eventOption) => eventOption.id === item.id);
      const cardResult = getEventResult(state, item);
      const button = document.createElement("button");
      button.dataset.kind = item.daily ? "daily" : item.guided ? "guided" : "event";
      button.className = `event-card${eventIndex === state.selectedEventIndex ? " selected" : ""}`;
      button.innerHTML = `
        <div class="card-head">
          <div class="card-title">${item.name}</div>
          <div class="card-kicker">${getEventBadge(state, item)}</div>
        </div>
        <div class="event-meta">${item.guided ? "~1:12" : `~${formatTime(item.parTime)}`} // ${getDifficultyLabel(item)}</div>
        <div class="event-meta">${getPrimaryGoal(item)}</div>
        <div class="mini-tags">
          <span class="mini-tag">${cardResult?.bestTime ? `Best ${formatTime(cardResult.bestTime)}` : "Fresh run"}</span>
          <span class="mini-tag">${item.daily ? "Today" : BIOME_DEFS[item.biomeId].name}</span>
          ${getGhostReady(state, item) ? '<span class="mini-tag">Ghost</span>' : ""}
        </div>
      `;
      button.addEventListener("click", () => callbacks.onEventSelect?.(eventIndex));
      refs.eventList.appendChild(button);
    });

    refs.carList.innerHTML = "";
    state.save.garage.forEach((item, slotIndex) => {
      const button = document.createElement("button");
      const filled = isGarageSlotFilled(item);
      button.className = `car-card${filled && state.selectedCarId === item.id ? " selected" : ""}${filled ? "" : " open-slot"}`;
      button.innerHTML = filled
        ? `
          <div class="card-head">
            <div class="card-title">${item.name}</div>
            <div class="card-kicker">Slot ${slotIndex + 1} // ${getCarLabel(item)}</div>
          </div>
          <div class="card-meta">${formatCarMeta(item)}</div>
          <div class="stat-bars compact card-stat-bars">${renderStatTiles(item)}</div>
          <div class="mini-tags">
            <span class="mini-tag">${item.role}</span>
            <span class="mini-tag">${getGarageScore(item)} rating</span>
            ${getCarTags(item).map((trait) => `<span class="mini-tag">${trait}</span>`).join("")}
          </div>
        `
        : `
          <div class="card-head">
            <div class="card-title">Open Slot</div>
            <div class="card-kicker">Slot ${slotIndex + 1} // Vacant</div>
          </div>
          <div class="card-meta">No car is parked here yet. Keep a Foundry roll to turn this bay into a live race slot.</div>
          <div class="stat-bars compact card-stat-bars">${renderStatTiles(item)}</div>
          <div class="mini-tags">
            <span class="mini-tag">Vacant</span>
            <span class="mini-tag">Foundry</span>
          </div>
        `;
      button.addEventListener("click", () => {
        if (filled) callbacks.onCarSelect?.(item.id);
        else {
          uiState.profilePane = "foundry";
          showProfilePane("foundry");
          updateMenuScale();
        }
      });
      refs.carList.appendChild(button);
    });

    refs.garageCurrency.textContent = `${getCurrencyBalance(state.save, "flux")} Flux`;
    refs.gachaRollCopy.textContent = getRollCallout(state);
    refs.garageRollBtn.textContent = `Roll 3 Cars // ${GARAGE_ROLL_COST} Flux`;
    refs.garageRollBtn.disabled = Boolean(state.garageRoll) || getCurrencyBalance(state.save, "flux") < GARAGE_ROLL_COST;

    renderProfile();
    renderGarageRoll();
    renderBindings();

    refs.splashOverviewInfo.dataset.tooltip = "Built for instant runs: short events, stylish wrecks, forgiving respawns, and fast retries.";
    refs.splashRunsInfo.dataset.tooltip = "Every event is seeded. Circuits and sprints reshuffle layout, hazards, and pickup pockets while staying readable enough for first-try launches.";
    refs.splashRecoveryInfo.dataset.tooltip = "Scrapes should cost speed first. Bigger hits shed parts. Full destruction respawns you quickly with protection so one mistake does not end the run.";
    refs.splashReplayInfo.dataset.tooltip = "Daily seeds, medals, ghosts, and quick remixes give you reasons to jump back in without a long setup flow.";
    refs.menuOverviewInfo.dataset.tooltip = getMenuOverviewTooltip(state, event);
    refs.eventInfoBtn.dataset.tooltip = getEventTooltip(state, event, eventResult);
    refs.carInfoBtn.dataset.tooltip = car ? getCarTooltip(car) : "Garage data is still loading.";
    refs.gachaInfoBtn.dataset.tooltip = "Flux buys three procedural car rolls at once. Better race history improves the tier pool, but every pull can still miss. Compare each reveal against its matching garage slot, keep any number of them, and sell the rest automatically for Scrap.";
    refs.styleInfoBtn.dataset.tooltip = "Scrap comes from cars you do not keep. Spend it here on skins, trails, tyre marks, and results emotes. The purchase path is isolated so direct premium buys can slot in later without rebuilding the garage flow.";
    refs.settingsAudioInfo.dataset.tooltip = "These settings update live. Use volume and mute for quick comfort, reduced shake to calm collisions, high contrast for clearer track reads, and assist level to soften punishment after mistakes.";
    refs.settingsControlsInfo.dataset.tooltip = "Hybrid mode keeps the default keyboard layout and any live gamepad. Custom mode lets you remap race inputs. Bindings update immediately and persist between sessions.";

    if (uiState.tooltipButton && !refs.tooltip.classList.contains("hidden")) {
      showTooltip(uiState.tooltipButton, uiState.tooltipMode || "click");
    }

    if (onboarding && event.guided) refs.launchBtn.classList.add("cta-recommended");
    else refs.launchBtn.classList.remove("cta-recommended");

    updateMenuScale();
  }

  function updateHud() {
    if (!state.currentEvent || !state.player) return;
    const player = state.player;
    refs.eventName.textContent = state.currentEvent.name;
    refs.eventMeta.textContent = getLiveGoal(state, player);
    refs.placePill.textContent = `P${player.place}`;
    refs.progressRing.textContent = state.track.type === "circuit" ? `Lap ${Math.min(player.currentLap, state.currentEvent.laps)} / ${state.currentEvent.laps}` : `${Math.round((player.progress || 0) * 100)}% to finish`;

    const pressure = getPressureState(state, player);
    refs.rivalPill.textContent = pressure.text;
    refs.rivalPill.dataset.tone = pressure.tone;
    refs.damageValue.textContent = `${Math.max(0, 100 - Math.round((player.damage / player.def.durability) * 100))}%`;
    refs.damageFill.style.width = `${Math.max(4, 100 - (player.damage / player.def.durability) * 100)}%`;

    const speed = Math.hypot(player.vx, player.vy);
    refs.speedValue.textContent = String(Math.round(speed)).padStart(3, "0");
    refs.speedFill.style.width = `${Math.min(100, (speed / 420) * 100)}%`;
    refs.pickupChip.textContent = player.pickup ? `Hold ${PICKUP_DEFS[player.pickup].hud}` : "Pickup empty";
    refs.pickupChip.dataset.tone = player.pickup || "none";

    const assist = getAssistState(state, player);
    refs.assistChip.textContent = assist.text;
    refs.assistChip.dataset.tone = assist.tone;

    const flow = getFlowState(player);
    refs.slipstreamChip.textContent = flow.text;
    refs.slipstreamChip.dataset.tone = flow.tone;

    const ghost = getGhostState(state);
    refs.ghostChip.textContent = ghost.text;
    refs.ghostChip.dataset.tone = ghost.tone;
    updateTutorial();
    if (!refs.pause.classList.contains("hidden")) syncPause();
  }

  function updateTimers(dt) {
    if (uiState.toastTimer > 0) {
      uiState.toastTimer -= dt;
      if (uiState.toastTimer <= 0) refs.toast.classList.add("hidden");
    }
    if (uiState.bannerTimer > 0) {
      uiState.bannerTimer -= dt;
      if (uiState.bannerTimer <= 0) refs.banner.classList.add("hidden");
    }
  }

  function renderGameToText() {
    return JSON.stringify({
      coordinateSystem: "world origin near track center, +x right, +y down",
      mode: state.mode,
      menuStage: state.menuStage || "splash",
      menuView: state.menuView || "home",
      profilePane: uiState.profilePane,
      settingsPane: uiState.settingsPane,
      bindingAction: state.bindingAction || null,
      selectedEvent: state.events[state.selectedEventIndex]?.name || null,
      selectedCar: state.selectedCarId,
      wallet: {
        flux: getCurrencyBalance(state.save, "flux"),
        scrap: getCurrencyBalance(state.save, "scrap"),
      },
      garageRoll: state.garageRoll ? {
        status: state.garageRoll.status,
        keptSlots: state.garageRoll.keptSlots,
        revealedSlots: state.garageRoll.revealedSlots,
      } : null,
      menuIntro: refs.menuIntro.textContent,
      tooltip: !refs.tooltip.classList.contains("hidden") ? { text: refs.tooltip.textContent, mode: refs.tooltip.dataset.mode || null } : null,
      currentEvent: state.currentEvent ? { name: state.currentEvent.name, type: state.currentEvent.type, seed: state.currentEvent.seed, theme: state.currentEvent.biomeId, laps: state.currentEvent.laps } : null,
      player: state.player ? {
        x: Number(state.player.x.toFixed(1)),
        y: Number(state.player.y.toFixed(1)),
        angle: Number(state.player.angle.toFixed(2)),
        speed: Number(Math.hypot(state.player.vx, state.player.vy).toFixed(1)),
        damagePct: Number(((state.player.damage / state.player.def.durability) * 100).toFixed(1)),
        pickup: state.player.pickup,
        lap: state.player.currentLap,
        place: state.player.place,
        destroyed: state.player.destroyed,
        respawn: Number(state.player.respawnTimer.toFixed(2)),
        slipstream: Number(state.player.slipstream.toFixed(2)),
      } : null,
      settings: {
        assistLevel: state.save.settings.assistLevel,
        reducedShake: state.save.settings.reducedShake,
        muted: state.save.settings.muted,
        highContrast: state.save.settings.highContrast,
        controlMode: state.save.settings.controlMode,
        gamepadConnected: Boolean(state.gamepad?.connected),
      },
      hud: state.mode === "race" || state.mode === "results" || state.mode === "paused" ? {
        goal: refs.eventMeta.textContent,
        pickup: refs.pickupChip.textContent,
        assist: refs.assistChip.textContent,
        flow: refs.slipstreamChip.textContent,
        ghost: refs.ghostChip.textContent,
      } : null,
      pause: !refs.pause.classList.contains("hidden") ? { goal: refs.pauseGoal.textContent, meta: refs.pauseMeta.textContent } : null,
      results: !refs.results.classList.contains("hidden") ? { title: refs.resultsTitle.textContent, note: refs.resultsNote.textContent, next: refs.resultsNext.textContent } : null,
      leaderboard: state.cars.map((car) => car.label),
      banner: refs.banner.textContent,
      countdown: Number(Math.max(0, state.countdown).toFixed(2)),
      tutorial: !refs.tutorialCard.classList.contains("hidden") ? refs.tutorialCopy.textContent : null,
    });
  }

  tooltipButtons.forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-haspopup", "dialog");
    button.addEventListener("pointerenter", () => scheduleTooltip(button));
    button.addEventListener("pointerleave", () => {
      clearTooltipTimer();
      if (uiState.tooltipMode === "hover" && uiState.tooltipButton === button) dismissTooltip();
    });
    button.addEventListener("focus", () => scheduleTooltip(button));
    button.addEventListener("blur", () => {
      clearTooltipTimer();
      if (uiState.tooltipMode === "hover" && uiState.tooltipButton === button) dismissTooltip();
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (uiState.tooltipMode === "click" && uiState.tooltipButton === button) {
        dismissTooltip();
        return;
      }
      showTooltip(button, "click");
    });
  });

  refs.splashStartBtn?.addEventListener("click", () => callbacks.onEnterGarage?.());
  refs.launchBtn.addEventListener("click", () => callbacks.onStartSelected?.());
  refs.dailyBtn.addEventListener("click", () => callbacks.onStartDaily?.());
  refs.quickRaceBtn.addEventListener("click", () => callbacks.onQuickRace?.());
  refs.garageRollBtn?.addEventListener("click", () => callbacks.onGarageRollStart?.());
  refs.garageRollConfirmBtn?.addEventListener("click", () => callbacks.onGarageRollConfirm?.());
  refs.resultsRetry.addEventListener("click", () => callbacks.onRetry?.());
  refs.resultsMenu.addEventListener("click", () => callbacks.onBackToMenu?.());
  refs.pauseResume.addEventListener("click", () => callbacks.onPauseResume?.());
  refs.pauseRetry.addEventListener("click", () => callbacks.onPauseRetry?.());
  refs.pauseMenu.addEventListener("click", () => callbacks.onPauseMenu?.());
  refs.menuTabHome.addEventListener("click", () => callbacks.onMenuViewChange?.("home"));
  refs.menuTabProfile.addEventListener("click", () => callbacks.onMenuViewChange?.("profile"));
  refs.menuTabSettings.addEventListener("click", () => callbacks.onMenuViewChange?.("settings"));
  refs.profileTabGarage.addEventListener("click", () => {
    uiState.profilePane = "garage";
    showProfilePane("garage");
    updateMenuScale();
  });
  refs.profileTabFoundry.addEventListener("click", () => {
    uiState.profilePane = "foundry";
    showProfilePane("foundry");
    updateMenuScale();
  });
  refs.profileTabStyle.addEventListener("click", () => {
    uiState.profilePane = "style";
    showProfilePane("style");
    updateMenuScale();
  });
  refs.profileTabCareer.addEventListener("click", () => {
    uiState.profilePane = "career";
    showProfilePane("career");
    updateMenuScale();
  });
  refs.settingsTabComfort.addEventListener("click", () => {
    uiState.settingsPane = "comfort";
    showSettingsPane("comfort");
    updateMenuScale();
  });
  refs.settingsTabControls.addEventListener("click", () => {
    uiState.settingsPane = "controls";
    showSettingsPane("controls");
    updateMenuScale();
  });
  refs.settingsVolume.addEventListener("input", (event) => callbacks.onSettingChange?.("masterVolume", Number(event.target.value) / 100));
  refs.pauseVolume.addEventListener("input", (event) => callbacks.onSettingChange?.("masterVolume", Number(event.target.value) / 100));
  refs.settingsMute.addEventListener("change", (event) => callbacks.onSettingChange?.("muted", event.target.checked));
  refs.pauseMute.addEventListener("change", (event) => callbacks.onSettingChange?.("muted", event.target.checked));
  refs.settingsShake.addEventListener("change", (event) => callbacks.onSettingChange?.("reducedShake", event.target.checked));
  refs.pauseShake.addEventListener("change", (event) => callbacks.onSettingChange?.("reducedShake", event.target.checked));
  refs.settingsContrast.addEventListener("change", (event) => callbacks.onSettingChange?.("highContrast", event.target.checked));
  refs.settingsAssist.addEventListener("change", (event) => callbacks.onSettingChange?.("assistLevel", event.target.value));
  refs.pauseAssist.addEventListener("change", (event) => callbacks.onSettingChange?.("assistLevel", event.target.value));
  refs.settingsControlMode.addEventListener("change", (event) => callbacks.onSettingChange?.("controlMode", event.target.value));
  document.addEventListener("click", () => {
    if (uiState.tooltipMode === "click") dismissTooltip();
  });
  window.addEventListener("resize", updateMenuScale);

  return {
    refs,
    hideResults,
    renderGameToText,
    setMenuOpen,
    setPauseOpen,
    showBanner,
    showResults,
    showToast,
    syncMenu,
    syncPause,
    syncSettingsInputs,
    syncVisualSettings,
    updateHud,
    updateMenuScale,
    updateTimers,
  };
}

export function buildRunSummary(state, leaderboard) {
  const player = state.player;
  const place = leaderboard.findIndex((car) => car.isPlayer) + 1;
  const previousEventResult = state.save.eventResults[state.currentEvent.id] || null;
  const previousEventBest = previousEventResult?.bestTime ?? null;
  const previousDailyBest = state.currentEvent.daily ? state.save.daily.bestTime : null;
  const ghostKey = createKey(state.currentEvent.id, state.selectedCarId);
  const previousGhost = state.save.ghostRuns?.[ghostKey] || null;
  const wasTutorialRun = state.currentEvent.guided && !state.save.settings.tutorialCompleted;
  const selectedCar = getSelectedGarageCar(state);

  const result = {
    event: state.currentEvent,
    eventId: state.currentEvent.id,
    seed: state.currentEvent.seed,
    carId: state.selectedCarId,
    carName: selectedCar?.name || state.selectedCarId,
    place,
    placeLabel: place === 1 ? "Victory" : `Finished P${place}`,
    fieldSize: state.cars.length,
    finishTime: state.finishTime,
    respawns: player.respawns,
    wallHits: player.wallHits,
    pickupUses: player.pickupUses,
    pulseHits: player.pulseHits,
    destroyedCount: player.destroyedCount,
    previousEventBest,
    previousDailyBest,
    wasTutorialRun,
    deltaToPar: state.finishTime - state.currentEvent.parTime,
    newEventBest: previousEventBest === null || state.finishTime < previousEventBest,
    newDailyBest: state.currentEvent.daily && (previousDailyBest === null || state.finishTime < previousDailyBest),
    ghostAvailable: Boolean(previousGhost),
    newGhost: !previousGhost || state.finishTime < previousGhost.finishTime,
    completions: (previousEventResult?.completions || 0) + 1,
    bestPlace: previousEventResult?.bestPlace ? Math.min(previousEventResult.bestPlace, place) : place,
    projectedScrap: getCurrencyBalance(state.save, "scrap"),
    saveSnapshot: {
      currency: getCurrencyBalance(state.save, "flux"),
      scrap: getCurrencyBalance(state.save, "scrap"),
    },
    goals: state.currentEvent.goals.map((goal) => {
      let complete = false;
      if (goal.type === "finish") complete = state.finishTime !== null;
      if (goal.type === "max_place") complete = place <= goal.target;
      if (goal.type === "par_time") complete = state.finishTime <= state.currentEvent.parTime;
      if (goal.type === "max_wrecks") complete = player.destroyedCount <= goal.target;
      if (goal.type === "pickup_use") complete = player.pickupUses >= goal.target;
      if (goal.type === "pickup_kind") {
        const key = createKey(goal.pickupId, "count");
        complete = (state.runPickupCounts[key] || 0) >= goal.target;
      }
      if (goal.type === "pulse_hits") complete = player.pulseHits >= goal.target;
      return { ...goal, complete };
    }),
  };
  result.goalsMet = result.goals.filter((goal) => goal.complete).length;
  result.tutorialPickupMet = result.goals.find((goal) => goal.type === "pickup_use")?.complete ?? false;
  return result;
}
