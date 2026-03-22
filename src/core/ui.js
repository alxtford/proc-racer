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
import { COURSE_REROLL_COST, getCurrencyBalance } from "./economy.js";
import { ensureStyleLocker, getEquippedCosmeticDefs, isCosmeticOwned } from "./styleLocker.js";
import { createKey, formatTime } from "./utils.js";
import { BIOME_DEFS, MODIFIER_DEFS, PICKUP_DEFS } from "../data/content.js";
import { COSMETIC_DEFS, COSMETIC_SLOTS, getCosmeticsBySlot } from "../data/cosmetics.js";

const COURSE_COPY_LIMIT = 72;
const HEADER_COPY_LIMIT = 58;
const TAG_COPY_LIMIT = 52;
const TOOLTIP_DELAY_MS = 1400;
const HOME_BOARD_PAGE_SIZE = 4;
const STYLE_PAGE_SIZE = 2;

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
    resultsPocketTime: document.getElementById("results-pocket-time"),
    resultsPocketDelta: document.getElementById("results-pocket-delta"),
    resultsPocketWallet: document.getElementById("results-pocket-wallet"),
    resultsPocketReplay: document.getElementById("results-pocket-replay"),
    resultsTabSummary: document.getElementById("results-tab-summary"),
    resultsTabTiming: document.getElementById("results-tab-timing"),
    resultsTabField: document.getElementById("results-tab-field"),
    resultsPaneSummary: document.getElementById("results-pane-summary"),
    resultsPaneTiming: document.getElementById("results-pane-timing"),
    resultsPaneField: document.getElementById("results-pane-field"),
    resultsGrid: document.querySelector(".results-grid"),
    resultsStats: document.getElementById("results-stats"),
    resultsLaps: document.getElementById("results-laps"),
    resultsGoals: document.getElementById("results-goals"),
    resultsClassification: document.getElementById("results-classification"),
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
    boardRerollInfoBtn: document.getElementById("board-reroll-info-btn"),
    boardRerollBtn: document.getElementById("board-reroll-btn"),
    eventFocusTitle: document.getElementById("event-focus-title"),
    eventFocusMeta: document.getElementById("event-focus-meta"),
    eventFocusCopy: document.getElementById("event-focus-copy"),
    eventFocusModifiers: document.getElementById("event-focus-modifiers"),
    eventCustomSeed: document.getElementById("event-custom-seed"),
    eventCustomSeedApply: document.getElementById("event-custom-seed-apply"),
    eventCustomSeedClear: document.getElementById("event-custom-seed-clear"),
    eventCustomSeedNote: document.getElementById("event-custom-seed-note"),
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
    homeTabLaunch: document.getElementById("home-tab-launch"),
    homeTabBoard: document.getElementById("home-tab-board"),
    homePaneLaunch: document.getElementById("home-pane-launch"),
    homePaneBoard: document.getElementById("home-pane-board"),
    homeBoardPrev: document.getElementById("home-board-prev"),
    homeBoardPage: document.getElementById("home-board-page"),
    homeBoardNext: document.getElementById("home-board-next"),
    homeBoardSelectedTitle: document.getElementById("home-board-selected-title"),
    homeBoardSelectedMeta: document.getElementById("home-board-selected-meta"),
    profileTabGarage: document.getElementById("profile-tab-garage"),
    profileTabFoundry: document.getElementById("profile-tab-foundry"),
    profileTabStyle: document.getElementById("profile-tab-style"),
    profileTabCareer: document.getElementById("profile-tab-career"),
    profilePaneGarage: document.getElementById("profile-pane-garage"),
    profilePaneFoundry: document.getElementById("profile-pane-foundry"),
    profilePaneStyle: document.getElementById("profile-pane-style"),
    profilePaneCareer: document.getElementById("profile-pane-career"),
    foundryTabForge: document.getElementById("foundry-tab-forge"),
    foundryTabReadout: document.getElementById("foundry-tab-readout"),
    foundryPaneForge: document.getElementById("foundry-pane-forge"),
    foundryPaneReadout: document.getElementById("foundry-pane-readout"),
    garageSlotsNote: document.getElementById("garage-slots-note"),
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

function formatCourseSeed(seed) {
  return Number.isFinite(seed) ? `Seed ${Math.round(seed)}` : "Seed --";
}

function getEventTemplateId(event) {
  return event?.templateId || event?.id || null;
}

function supportsCustomCourseSeed(event) {
  return Boolean(event) && !event.daily;
}

function normalizeCourseSeed(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(4294967295, Math.trunc(Math.abs(numeric))));
}

function getSavedCustomCourseSeed(state, event) {
  if (!supportsCustomCourseSeed(event)) return null;
  const templateId = getEventTemplateId(event);
  if (!templateId) return null;
  return normalizeCourseSeed(state.save.customCourseSeeds?.[templateId]);
}

function getDisplayEvent(state, event) {
  const customSeed = getSavedCustomCourseSeed(state, event);
  if (customSeed === null) return event;
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

function getTrackRaceUnits(state) {
  const checkpointCount = Math.max(1, state.track?.checkpoints?.length || 1);
  return state.track?.type === "circuit"
    ? Math.max(1, (state.currentEvent?.laps || 1) * checkpointCount)
    : Math.max(1, checkpointCount - 1);
}

function getCarRaceUnits(state, car) {
  const checkpointCount = Math.max(1, state.track?.checkpoints?.length || 1);
  const progress = Number.isFinite(car.progress) ? car.progress : 0;
  if (state.track?.type === "circuit") {
    return Math.max(0, (Math.max(1, car.currentLap) - 1) * checkpointCount + car.checkpointIndex + progress);
  }
  return Math.max(0, car.checkpointIndex + progress);
}

function getClassifiedFinishTime(state, car, totalUnits, secondsPerUnit) {
  if (car.finished && Number.isFinite(car.finishMs) && car.finishMs > 0) return car.finishMs;
  const currentUnits = Math.min(totalUnits, getCarRaceUnits(state, car));
  const remainingUnits = Math.max(0, totalUnits - currentUnits);
  const speed = Math.hypot(car.vx || 0, car.vy || 0);
  const paceScalar = speed > 0 ? Math.max(0.86, Math.min(1.16, 220 / Math.max(speed, 160))) : 1.05;
  return state.elapsed + remainingUnits * secondsPerUnit * paceScalar;
}

function buildClassification(state, leaderboard) {
  if (!leaderboard.length) return [];
  const totalUnits = getTrackRaceUnits(state);
  const winner = leaderboard[0];
  const winnerTime = Number.isFinite(winner?.finishMs) && winner.finishMs > 0
    ? winner.finishMs
    : (state.finishTime || state.elapsed || 0);
  const secondsPerUnit = winnerTime / Math.max(totalUnits, 1);
  const rows = leaderboard.map((car, index) => ({
    id: car.id,
    place: index + 1,
    label: car.label,
    player: car.isPlayer,
    rival: Boolean(car.rival),
    finished: Boolean(car.finished),
    classifiedTime: getClassifiedFinishTime(state, car, totalUnits, secondsPerUnit) + (car.finished ? 0 : index * 0.015),
    bestLapTime: Number.isFinite(car.bestLapTime) ? car.bestLapTime : null,
  }));
  return rows.map((row, index) => {
    const gapToLeader = row.classifiedTime - winnerTime;
    const ahead = rows[index - 1] || null;
    const intervalToAhead = ahead ? row.classifiedTime - ahead.classifiedTime : 0;
    return {
      ...row,
      gapToLeader,
      intervalToAhead,
      totalDisplay: formatTime(row.classifiedTime),
      gapDisplay: index === 0 ? "Leader" : formatDelta(gapToLeader),
      intervalDisplay: index === 0 ? "clear air" : `to P${index} ${formatGain(intervalToAhead)}`,
      bestLapDisplay: row.bestLapTime !== null ? formatTime(row.bestLapTime) : "--",
      timingLabel: row.finished ? "finished" : "classified",
      bestLapLabel: row.bestLapTime !== null ? "best lap" : state.track?.type === "circuit" ? "no clean lap" : "sprint",
    };
  });
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
  return `${clipped.slice(0, end).trimEnd()}...`;
}

function clampHeaderCopy(text) {
  return clampCopy(text, HEADER_COPY_LIMIT);
}

function clampTagCopy(text) {
  return clampCopy(text, TAG_COPY_LIMIT);
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

function getPreviewAccent(item, slotOverride = item?.slot) {
  const slot = slotOverride || "skin";
  if (slot === "skin") return item?.tint || "#8df7ff";
  if (slot === "emote") return item?.tint || "#ffb100";
  return item?.color || "#8df7ff";
}

function isStarterCosmetic(item) {
  return Boolean(item?.ownedByDefault && Number(item?.cost || 0) === 0);
}

function renderCosmeticPreview(item, slotOverride = item?.slot) {
  const slot = slotOverride || "skin";
  const accent = getPreviewAccent(item, slot);
  const badge = item?.badge || "LIVE";
  const previewId = item?.id || slot;
  const starter = isStarterCosmetic(item);
  if (slot === "trail") {
    return `
      <div class="style-preview" data-slot="trail" data-preview-id="${previewId}" data-starter="${starter ? "true" : "false"}" style="--preview-accent:${accent};">
        <div class="style-preview-rig style-preview-rig-drive">
          <div class="style-preview-car">
            <span class="style-preview-car-cabin"></span>
          </div>
        </div>
        <div class="style-preview-trail-line"></div>
        <div class="style-preview-trail-line style-preview-trail-line-b"></div>
      </div>
    `;
  }
  if (slot === "skid") {
    return `
      <div class="style-preview" data-slot="skid" data-preview-id="${previewId}" data-starter="${starter ? "true" : "false"}" style="--preview-accent:${accent};">
        <div class="style-preview-skid-line"></div>
        <div class="style-preview-skid-line style-preview-skid-line-b"></div>
        <div class="style-preview-skid-spark"></div>
      </div>
    `;
  }
  if (slot === "emote") {
    return `
      <div class="style-preview" data-slot="emote" data-preview-id="${previewId}" data-starter="${starter ? "true" : "false"}" style="--preview-accent:${accent};">
        <div class="style-preview-emote-wrap">
          <div class="style-preview-emote">${badge}</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="style-preview" data-slot="skin" data-preview-id="${previewId}" data-starter="${starter ? "true" : "false"}" style="--preview-accent:${accent};">
      <div class="style-preview-rig">
        <div class="style-preview-car">
          <span class="style-preview-car-cabin"></span>
        </div>
      </div>
    </div>
  `;
}

function medalForResult(result) {
  if (result.place === 1 && result.goalsMet >= 2) return "Gold";
  if (result.place <= 3 || result.goalsMet >= 2) return "Silver";
  return "Steel";
}

function medalRank(medal) {
  return medal === "Gold" ? 2 : medal === "Silver" ? 1 : 0;
}

function getNextMedal(medal) {
  if (medal === "Steel") return "Silver";
  if (medal === "Silver") return "Gold";
  return null;
}

function getStoredMedal(eventResult) {
  if (!eventResult) return null;
  if (eventResult.medal) return eventResult.medal;
  return medalForResult({
    place: eventResult.bestPlace || 99,
    goalsMet: eventResult.goalsMet || 0,
  });
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
  const eventResult = getEventResult(state, event);
  const medal = getStoredMedal(eventResult);
  if (event.guided && !state.save.settings.tutorialCompleted) return "Recommended opener";
  if (event.daily) return state.save.daily.bestTime ? "Killline banked" : "Daily killline";
  if (!eventResult) return "Fresh run";
  if (medal === "Gold") return getGhostReady(state, event) ? "Ghost revenge" : "Gold line live";
  if (medal === "Silver") return "Silver banked";
  return "Steel on board";
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
    return clampCopy("Fastest route into pickups, hits, and momentum carry.");
  }
  if (event.daily) {
    return clampCopy(state.save.daily.bestTime
      ? `Today's fixed gauntlet. Best ${formatTime(state.save.daily.bestTime)} is live.`
      : "Today's fixed gauntlet. One hard run plants the first time.");
  }
  if (!eventResult) return clampCopy(`${event.summary} Fresh line. No banked best yet.`);
  return clampCopy(`${event.summary} Best ${formatTime(eventResult.bestTime)} with ${eventResult.goalsMet}/${event.goals.length} goals.`);
}

function getCareerStatus(state) {
  const selectedCar = getSelectedGarageCar(state);
  if (!selectedCar) return "Starter garage loading";
  if (!state.save.settings.tutorialCompleted) return `${selectedCar.name} // starter slot`;
  return `${selectedCar.name} // ${selectedCar.tierLabel}`;
}

function getDailyStatus(state) {
  const dailyEvent = state.events?.find((event) => event.daily);
  const dailyResult = dailyEvent ? getEventResult(state, dailyEvent) : null;
  const dailyMedal = getStoredMedal(dailyResult);
  return state.save.daily.bestTime
    ? `Killline ${formatTime(state.save.daily.bestTime)} // ${dailyMedal || "live"}`
    : "Today's killline is fresh";
}

function getGhostStatus(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  const ghostCount = getGhostCount(state);
  if (getRollReadyStatus(state.save)) return `${flux} Flux // pull ready`;
  if (ghostCount) return `${ghostCount} ghosts // ${flux} Flux`;
  return `${flux} Flux // ${Math.max(0, GARAGE_ROLL_COST - flux)} to roll`;
}

function getReplayHook(state, event) {
  if (event.daily) {
    return state.save.daily.bestTime
      ? "Shave the killline best, then hunt a meaner medal line."
      : "Plant the first killline time, then come back swinging.";
  }
  const eventResult = getEventResult(state, event);
  const medal = getStoredMedal(eventResult);
  if (!eventResult) return "Fresh run. Bank a first best, then start attacking goals.";
  if (medal !== "Gold") return `${medal} is banked. Push for ${getNextMedal(medal)} and a cleaner line.`;
  if (getGhostReady(state, event)) return "Gold is banked. Run your ghost down and cut deeper.";
  return `Best ${formatTime(eventResult.bestTime)} is live. Beat it or reroll a new one-shot event.`;
}

function getFocusTags(state, event, eventResult) {
  const medal = getStoredMedal(eventResult);
  const tags = [
    event.daily
      ? state.save.daily.bestTime ? `PB ${formatTime(state.save.daily.bestTime)}` : "Killline seed"
      : medal ? `${medal} banked` : eventResult?.bestTime ? `Best ${formatTime(eventResult.bestTime)}` : "Fresh run",
    `Par ${formatTime(event.parTime)}`,
    getGhostReady(state, event) ? "Ghost ready" : BIOME_DEFS[event.biomeId].name,
  ];
  if (event.modifierIds.length) tags.push(MODIFIER_DEFS[event.modifierIds[0]].label);
  return tags;
}

function getMenuEyebrow(state, event) {
  return "";
}

function getMenuIntro(state, event) {
  if (!state.save.settings.tutorialCompleted) return clampHeaderCopy("Take the guided opener, then move into harder kill-runs.");
  if (event.daily) return clampHeaderCopy("Today's gauntlet is live. Bank a time, then cut deeper.");
  return clampHeaderCopy("Pick a run and launch in seconds.");
}

function getLaunchHint(state) {
  return state.save.settings.tutorialCompleted
    ? "Press Enter to hit this run, D for the daily gauntlet, Q for an instant remix, or R to reforge the whole board."
    : "Press Enter to hit the guided run, D for the daily gauntlet, Q to skip straight to the grid, or R to reforge the board.";
}

function getStartLabel(state, event) {
  if (!state.save.settings.tutorialCompleted && event.guided) return "Hit Guided Run";
  if (event.daily) return "Hit Daily Gauntlet";
  return "Hit This Run";
}

function getDailyLabel(state) {
  return state.save.daily.bestTime ? "Retry Daily Gauntlet" : "Run Daily Gauntlet";
}

function getQuickLabel(state) {
  return state.save.settings.tutorialCompleted ? "Instant Remix" : "Skip To Grid";
}

function getHeroNextCopy(state, event) {
  if (!state.save.settings.tutorialCompleted && !event.guided) {
    return clampCopy("Breakline Trial is still the fastest way to learn pickups and survive the pressure.");
  }
  return clampCopy(`${event.name} is a ${getDifficultyLabel(event).toLowerCase()} ${event.type === "circuit" ? "circuit" : "sprint"} built around ${getPrimaryGoal(event).toLowerCase()}.`);
}

function getHeroRecoveryCopy(state) {
  return state.save.settings.tutorialCompleted
    ? clampCopy("Hits should tear pace and bodywork away before they kill the run.")
    : clampCopy("The opener shows how impacts, shields, and pickups keep the race violent.");
}

function getHeroDailyCopy(state) {
  return state.save.daily.bestTime
    ? clampCopy(`Today's gauntlet best is ${formatTime(state.save.daily.bestTime)}.`)
    : clampCopy("Today's gauntlet is the cleanest reason to come back swinging.");
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
  if (!isGarageSlotFilled(car)) return clampCopy("Open slot. Keep a Foundry roll here to expand the garage.");
  return clampCopy(car.guidance || car.description || "Race ready.");
}

function getMenuOverviewTooltip(state, event) {
  if (state.menuView === "profile") {
    return "Garage keeps three live cars only, so every foundry pull matters.\n\nUse Garage to compare your active slot cars, Foundry to roll three new procedural offers, Style to spend Scrap, and Career to review momentum.\n\nThe goal is simple: keep only meaningful upgrades and sell the misses into cosmetic progress.";
  }
  if (state.menuView === "settings") {
    return "Settings are split into two short surfaces so comfort and controls stay readable on one screen.\n\nComfort covers audio, contrast, shake, and assist level. Controls covers binding mode, remaps, and live device state.\n\nEverything updates immediately and persists between sessions.";
  }
  const currentRun = event.daily
    ? "Daily Gauntlet uses the same seeded course all day, so the value comes from shaving time and carving a harder line."
    : `${event.name} is currently selected. ${getReplayHook(state, event)}`;
  const recommendedPath = !state.save.settings.tutorialCompleted
    ? "Recommended path: take Guided Run first, then move into Daily Gauntlet or Instant Remix once the pickup loop makes sense."
    : "Use Hit This Run for the selected event, Daily Gauntlet for the fixed seed, and Instant Remix when you want a fresh one-shot race immediately.";
  return `${getMenuIntro(state, event)}\n\n${currentRun}\n\n${recommendedPath}\n\n${getLaunchHint(state)}`;
}

function getEventTooltip(state, event, eventResult) {
  const formatLabel = event.type === "circuit" ? `${event.laps} lap circuit` : "Point-to-point sprint";
  const progressCopy = event.daily
    ? state.save.daily.bestTime
      ? `Gauntlet best on record: ${formatTime(state.save.daily.bestTime)}.`
      : "No gauntlet time banked yet."
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
  if (result.previousEventBest === null && !result.event.daily) return `${result.placeLabel} // first mark planted // ${getGoalProgressText(result)}`;
  if (result.medalImproved && result.previousMedal) return `${result.placeLabel} // ${result.medal} forged from ${result.previousMedal.toLowerCase()} // ${getGoalProgressText(result)}`;
  if (result.rivalBeat && result.rivalName) return `${result.placeLabel} // ${result.rivalName} broken // ${getGoalProgressText(result)}`;
  if (result.newDailyBest) return `${result.placeLabel} // new gauntlet best // ${getGoalProgressText(result)}`;
  if (result.newEventBest) return `${result.placeLabel} // new best // ${getGoalProgressText(result)}`;
  if (result.deltaToPar <= 0) return `${result.placeLabel} // par beaten ${formatGain(result.deltaToPar)} // ${getGoalProgressText(result)}`;
  return `${result.placeLabel} // par missed ${formatGain(result.deltaToPar)} // ${getGoalProgressText(result)}`;
}

function getResultsNote(result) {
  if (result.event.guided && result.wasTutorialRun && !result.tutorialPickupMet) return "You finished the opener, but missed the pickup lesson that completes onboarding.";
  if (result.event.guided && result.wasTutorialRun) return "Trial cleared. You used the full loop: pickup, impact, wreck pressure, and finish.";
  if (result.previousEventBest === null && !result.event.daily) return "First mark planted. Now you have a line, a par time, and goals worth chasing.";
  if (result.medalImproved && result.previousMedal) return `${result.previousMedal} gave way to ${result.medal}. The line is getting sharper.`;
  if (result.rivalName && result.rivalBeat) return `${result.rivalName} finished behind you. Rival pressure broke your way this time.`;
  if (result.newDailyBest && result.previousDailyBest !== null) return `New gauntlet best by ${formatGain(result.previousDailyBest - result.finishTime)}.`;
  if (result.newDailyBest) return "First gauntlet time planted.";
  if (result.newEventBest && result.previousEventBest !== null) return `New event best by ${formatGain(result.previousEventBest - result.finishTime)}.`;
  if (result.place === 1) return "Win banked. You broke the field and kept the chassis alive long enough to close it out.";
  if (result.deltaToPar <= 0) return `Par beaten by ${formatGain(result.deltaToPar)}.`;
  return `You missed par by ${formatGain(result.deltaToPar)}.`;
}

function getResultsNext(result) {
  if (result.event.guided && result.wasTutorialRun && !result.tutorialPickupMet) return "Retry once and use the guided pickup to finish onboarding, or back out and hit the grid.";
  if (result.event.guided && result.wasTutorialRun) return "Back out to the strike board and run Forgewash, or use Skip To Grid if you want a faster one-shot race now.";
  if ((result.postRaceFlux || 0) >= GARAGE_ROLL_COST) return "Your Foundry pull is primed. Jump into the garage and crack three new machines.";
  if (result.nextMedal) return `Retry and push this run from ${result.medal} to ${result.nextMedal}.`;
  if (result.rivalName && !result.rivalBeat) return `Retry and put ${result.rivalName} behind you before moving on.`;
  if (result.place > 3) return "Retry and chase the podium. A harder first sector should keep you in the pack.";
  if (result.deltaToPar > 0) return `Retry and beat par ${formatTime(result.event.parTime)} before moving on.`;
  if (result.event.daily) return "Gauntlet pace is banked. Retry if you think the line still has more violence in it.";
  if (result.newGhost) return "Ghost updated. Retry now and hunt your own line before it cools.";
  return "Instant remix is ready if you want a fresh seed without extra setup.";
}

function getResultsRetryLabel(result) {
  if (result.event.guided && result.wasTutorialRun) return "Retry Trial";
  if (result.event.daily) return "Retry Gauntlet";
  return "Instant Retry";
}

function getResultsMenuLabel(result) {
  if (result.event.guided && result.wasTutorialRun) return "Open Strike Board";
  return "Back To Menu";
}

function getLiveGoal(state, player) {
  if (state.currentEvent.guided && !state.save.settings.tutorialCompleted) {
    if (player.pickup && player.pickupUses < 1) return `Fire ${PICKUP_DEFS[player.pickup].hud}`;
    if ((player.pickupCollects || 0) < 1 && !player.pickup) return "Take the pickup";
    if (player.destroyedCount < 1) return "Stay alive through contact";
    return "Finish the trial";
  }
  return getPrimaryGoal(state.currentEvent);
}

function getPressureState(state, player) {
  if (player.wrongWay) return { text: "Turn back", tone: "danger" };
  if (state.rivalStatus && state.rivalStatus.phase !== "cold") return { text: state.rivalStatus.text, tone: state.rivalStatus.tone };
  if (player.place === 1) return { text: "Lead", tone: "good" };
  if (player.place <= Math.min(3, state.cars.length)) return { text: "Podium", tone: "good" };
  return { text: `Chase P${Math.max(1, player.place - 1)}`, tone: "neutral" };
}

function getAssistState(state, player) {
  const damagePct = player.damage / player.def.durability;
  if (state.save.settings.assistLevel === "off") return { text: damagePct > 0.65 ? "Raw" : "Manual", tone: damagePct > 0.65 ? "danger" : "neutral" };
  if (player.invuln > 0 || player.shieldTimer > 0) return { text: "Shielded", tone: "good" };
  if (player.assistTimer > 0) return { text: "Counterpush", tone: "good" };
  if (damagePct > 0.75) return { text: "Critical", tone: "danger" };
  if (damagePct > 0.45) return { text: "Damaged", tone: "danger" };
  return { text: "Steady", tone: "neutral" };
}

function getFlowState(state, player) {
  const sectorTag = state.currentSector?.tag || player.sectorTag;
  if (player.wrongWay) return { text: "Turn back", tone: "danger" };
  if (player.slingshotTimer > 0.12) return { text: "Slingshot", tone: "good" };
  if (player.draftCharge > 0.72) return { text: "Primed", tone: "good" };
  if (player.slipstream > 0.22) return { text: "Drafting", tone: "good" };
  if (sectorTag === "hazard") return { text: "Killbox", tone: "danger" };
  if (sectorTag === "recovery") return { text: "Reset", tone: "good" };
  if (sectorTag === "technical") return { text: "Technical", tone: "neutral" };
  if (sectorTag === "high-speed") return { text: "Overdrive", tone: "good" };
  if (player.place > 3) return { text: "Push", tone: "neutral" };
  return { text: "Clean", tone: "neutral" };
}

function getGhostState(state) {
  if (!state.ghostPlayback) return { text: "Ghost cold", tone: "neutral" };
  return { text: "Ghost live", tone: "good" };
}

function getProfileSummaryItems(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  const liveCars = getFilledGarageCars(state.save);
  const nextPull = Math.max(0, GARAGE_ROLL_COST - flux);
  const bestScore = liveCars.length ? Math.max(...liveCars.map((car) => getGarageScore(car))) : 0;
  const ghostCount = getGhostCount(state);
  return [
    {
      label: "Daily Killline",
      value: state.save.daily.bestTime ? formatTime(state.save.daily.bestTime) : "Uncut",
      note: state.save.daily.bestTime ? "Today's best time is already on the board." : "Plant the first gauntlet time today.",
    },
    {
      label: "Foundry Charge",
      value: flux >= GARAGE_ROLL_COST ? "Roll ready" : `${nextPull} Flux`,
      note: flux >= GARAGE_ROLL_COST ? "Three capsules can crack right now." : `Next pull opens in ${nextPull} Flux.`,
    },
    {
      label: "Ghost Pack",
      value: ghostCount ? `${ghostCount} saved` : "No ghosts",
      note: ghostCount ? "Your best lines are ready to chase." : "Bank cleaner runs to seed rivals and ghosts.",
    },
    {
      label: "Garage Peak",
      value: bestScore ? `Rating ${bestScore}` : "Starter steel",
      note: bestScore ? "Highest live chassis rating in the garage." : "Your first real upgrade is still ahead.",
    },
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
    { label: "Calibration", value: `${progression}%`, note: "Race history lifts the pull ceiling." },
    { label: "Wallet", value: `${flux} Flux`, note: getRollReadyStatus(state.save) ? "Full pull ready now." : `${Math.max(0, GARAGE_ROLL_COST - flux)} Flux to the next pull.` },
    { label: "Scrap", value: `${scrap}`, note: scrap ? "Cosmetic spend is live." : "Missed pulls scrap back here." },
    { label: "Best Slot", value: `${bestScore}`, note: "Highest active garage rating." },
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
        : "Three live bays, procedural pulls, and scrap-funded flex.",
      intro: clampHeaderCopy("Manage metal, crack Foundry rolls, and turn misses into style."),
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
      eyebrow: "Comfort, clarity, and control tuning without burying the next hit.",
      intro: clampHeaderCopy("Tune the feel, confirm the bindings, and get straight back to the grid."),
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
    title: "Strike Board",
    eyebrow: "",
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
      ? clampCopy(`Foundry hot. ${openSlots} open slot${openSlots === 1 ? "" : "s"} can be filled immediately.`)
      : clampCopy("Foundry hot. Crack three cars. Better race history raises the ceiling.");
  }
  return clampCopy(`Calibration ${progression}%. Earn ${GARAGE_ROLL_COST - flux} more Flux to spin again.`);
}

function getCosmeticItem(itemId) {
  return COSMETIC_DEFS[itemId] || null;
}

function getEventUtilityStatus(state, event) {
  if (event.daily) return "Bonus Flux live";
  if (getRollReadyStatus(state.save)) return "Foundry ready";
  return event.modifierIds.includes("rival-pressure") ? "Rival heat live" : `${Math.max(0, GARAGE_ROLL_COST - getCurrencyBalance(state.save, "flux"))} Flux to next pull`;
}

function getBoardRerollLabel(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  if (flux >= COURSE_REROLL_COST) return `Reforge Board // ${COURSE_REROLL_COST} Flux`;
  return `Reforge Board // +${COURSE_REROLL_COST - flux} Flux`;
}

function getBoardRerollTooltip(state) {
  const flux = getCurrencyBalance(state.save, "flux");
  const rerolls = state.save.strikeBoard?.rerolls || 0;
  const liveSeed = state.save.strikeBoard?.seed || 0;
  const availability = flux >= COURSE_REROLL_COST
    ? `You can crack a fresh strike board right now for ${COURSE_REROLL_COST} Flux.`
    : `Need ${COURSE_REROLL_COST - flux} more Flux to reforge the strike board.`;
  const archiveCopy = rerolls
    ? `Current board seed ${String(liveSeed).slice(-6)}. ${rerolls} paid reforge${rerolls === 1 ? "" : "s"} banked on this save.`
    : "This save is still on the stock strike board. Reforging replaces the current non-daily courses.";
  return `${availability}\n\nReforging only replaces the strike-board courses. Guided Run and Daily Killline stay intact.\n\n${archiveCopy}`;
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
      homePane: "launch",
      homeBoardPage: 0,
      styleSlot: "skin",
      stylePage: 0,
      profilePane: "garage",
      foundryPane: "forge",
      settingsPane: "comfort",
      resultsPane: "summary",
    };
  const tooltipButtons = [
    refs.splashOverviewInfo,
    refs.splashRunsInfo,
    refs.splashRecoveryInfo,
    refs.splashReplayInfo,
    refs.menuOverviewInfo,
    refs.eventInfoBtn,
    refs.boardRerollInfoBtn,
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

  function resetScrollRegion(element) {
    if (!element) return;
    element.scrollTop = 0;
    element.scrollLeft = 0;
  }

  function scaleShell(shell, variableName, padding = 24) {
    if (!shell) return;
    shell.style.setProperty(variableName, "1");
    const availableWidth = Math.max(320, window.innerWidth - padding);
    const availableHeight = Math.max(320, window.innerHeight - padding);
    const width = shell.offsetWidth || shell.clientWidth || shell.scrollWidth || 1;
    const height = shell.offsetHeight || shell.clientHeight || shell.scrollHeight || 1;
    const scale = Math.min(1, availableWidth / width, availableHeight / height);
    shell.style.setProperty(variableName, scale.toFixed(4));
  }

  function updateMenuScale() {
    scaleShell(refs.splashShell, "--splash-scale", 18);
    const menuPadding = state.menuView === "profile" || state.menuView === "settings" ? 8 : 18;
    scaleShell(refs.menuShell, "--menu-scale", menuPadding);
    scaleShell(refs.pauseShell, "--pause-scale", 20);
    scaleShell(refs.resultsShell, "--results-scale", window.innerHeight < 760 ? 14 : 20);
    scaleShell(refs.garageRollShell, "--garage-roll-scale", 20);
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
    if (nextPane === "foundry") showFoundryPane(uiState.foundryPane);
    resetScrollRegion(refs.menuShell);
  }

  function showFoundryPane(pane) {
    const nextPane = pane || uiState.foundryPane || "forge";
    uiState.foundryPane = nextPane;
    refs.profilePaneFoundry.dataset.pane = nextPane;
    refs.foundryPaneForge.classList.toggle("hidden", nextPane !== "forge");
    refs.foundryPaneReadout.classList.toggle("hidden", nextPane !== "readout");
    refs.foundryTabForge.classList.toggle("selected", nextPane === "forge");
    refs.foundryTabReadout.classList.toggle("selected", nextPane === "readout");
    resetScrollRegion(refs.menuShell);
  }

  function showSettingsPane(pane) {
    const nextPane = pane || uiState.settingsPane || "comfort";
    uiState.settingsPane = nextPane;
    refs.menuViewSettings.dataset.pane = nextPane;
    refs.settingsPaneComfort.classList.toggle("hidden", nextPane !== "comfort");
    refs.settingsPaneControls.classList.toggle("hidden", nextPane !== "controls");
    refs.settingsTabComfort.classList.toggle("selected", nextPane === "comfort");
    refs.settingsTabControls.classList.toggle("selected", nextPane === "controls");
    resetScrollRegion(refs.menuShell);
  }

  function showHomePane(pane) {
    const nextPane = pane || uiState.homePane || "launch";
    uiState.homePane = nextPane;
    refs.menuViewHome.dataset.pane = nextPane;
    refs.homePaneLaunch.classList.toggle("hidden", nextPane !== "launch");
    refs.homePaneBoard.classList.toggle("hidden", nextPane !== "board");
    refs.homeTabLaunch.classList.toggle("selected", nextPane === "launch");
    refs.homeTabBoard.classList.toggle("selected", nextPane === "board");
    resetScrollRegion(refs.menuShell);
  }

  function showResultsPane(pane) {
    const nextPane = pane || uiState.resultsPane || "summary";
    uiState.resultsPane = nextPane;
    refs.results.dataset.pane = nextPane;
    refs.resultsPaneSummary.classList.toggle("hidden", nextPane !== "summary");
    refs.resultsPaneTiming.classList.toggle("hidden", nextPane !== "timing");
    refs.resultsPaneField.classList.toggle("hidden", nextPane !== "field");
    refs.resultsTabSummary.classList.toggle("selected", nextPane === "summary");
    refs.resultsTabTiming.classList.toggle("selected", nextPane === "timing");
    refs.resultsTabField.classList.toggle("selected", nextPane === "field");
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
    if (view === "home") showHomePane(uiState.homePane);
    if (view === "profile") showProfilePane(uiState.profilePane);
    if (view === "settings") showSettingsPane(uiState.settingsPane);
    resetScrollRegion(refs.menuShell);
  }

  function showMenuStage(stage) {
    if (uiState.lastMenuStage && uiState.lastMenuStage !== stage) dismissTooltip();
    uiState.lastMenuStage = stage;
    const splash = stage !== "garage";
    refs.menuSplash.classList.toggle("hidden", !splash);
    refs.splashShell.classList.toggle("hidden", !splash);
    refs.menuShell.classList.toggle("hidden", splash);
    refs.menu.dataset.stage = splash ? "splash" : "garage";
    resetScrollRegion(refs.menuShell);
  }

  function setMenuOpen(isOpen) {
    uiState.menuOpen = isOpen;
    refs.menu.classList.toggle("hidden", !isOpen);
    refs.root.classList.toggle("menu-open", isOpen);
    if (!isOpen) dismissTooltip();
    if (isOpen) {
      resetScrollRegion(refs.menuShell);
      updateMenuScale();
    }
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

  function showBanner(text, duration = 2, mode = "top") {
    refs.banner.textContent = text;
    refs.banner.dataset.mode = mode;
    refs.banner.classList.add("hidden");
    refs.banner.classList.remove("banner-pop");
    void refs.banner.offsetWidth;
    refs.banner.classList.remove("hidden");
    refs.banner.classList.add("banner-pop");
    uiState.bannerTimer = duration;
  }

  function showToast(text, tone = "neutral", duration = 1.4) {
    refs.toast.textContent = text;
    refs.toast.dataset.tone = tone;
    refs.toast.classList.add("hidden");
    refs.toast.classList.remove("toast-pop");
    void refs.toast.offsetWidth;
    refs.toast.classList.remove("hidden");
    refs.toast.classList.add("toast-pop");
    uiState.toastTimer = duration;
  }

  function hideResults() {
    refs.results.classList.add("hidden");
    refs.root.classList.remove("results-open");
    resetScrollRegion(refs.resultsShell);
    resetScrollRegion(refs.resultsGrid);
    resetScrollRegion(refs.resultsClassification);
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

  function getHomeBoardPage(displayedEvents, baseEvent) {
    const pageCount = Math.max(1, Math.ceil(displayedEvents.length / HOME_BOARD_PAGE_SIZE));
    const selectedIndex = Math.max(0, displayedEvents.findIndex((item) => item.id === baseEvent?.id));
    const selectedPage = Math.floor(selectedIndex / HOME_BOARD_PAGE_SIZE);
    uiState.homeBoardPage = Math.max(0, Math.min(pageCount - 1, uiState.homeBoardPage || 0));
    if (
      uiState.homePane === "board"
      && (selectedIndex < uiState.homeBoardPage * HOME_BOARD_PAGE_SIZE
        || selectedIndex >= (uiState.homeBoardPage + 1) * HOME_BOARD_PAGE_SIZE)
    ) {
      uiState.homeBoardPage = selectedPage;
    }
    return {
      pageCount,
      currentPage: uiState.homePane === "board" ? uiState.homeBoardPage : selectedPage,
      selectedPage,
    };
  }

  function setHomePane(pane) {
    uiState.homePane = pane;
    if (pane === "board") uiState.homeBoardPage = 0;
    syncMenu();
  }

  function cycleHomePane(direction = 1) {
    const panes = ["launch", "board"];
    const currentIndex = panes.indexOf(uiState.homePane);
    const nextPane = panes[(currentIndex + direction + panes.length) % panes.length];
    uiState.homePane = nextPane;
    syncMenu();
  }

  function setResultsPane(pane) {
    showResultsPane(pane);
    updateMenuScale();
  }

  function cycleResultsPane(direction = 1) {
    const panes = ["summary", "timing", "field"];
    const currentIndex = panes.indexOf(uiState.resultsPane);
    showResultsPane(panes[(currentIndex + direction + panes.length) % panes.length]);
    updateMenuScale();
  }

  function showResults(result) {
    dismissTooltip();
    refs.results.classList.remove("hidden");
    refs.pause.classList.add("hidden");
    refs.root.classList.add("results-open");
    showResultsPane("summary");
    const shouldCelebrateBest = result.medalImproved || (result.newEventBest && result.previousEventBest !== null) || (result.newDailyBest && result.previousDailyBest !== null);
    const walletFlux = result.postRaceFlux ?? getCurrencyBalance(state.save, "flux");
    const walletScrap = result.postRaceScrap ?? getCurrencyBalance(state.save, "scrap");
    const replayPocket = (walletFlux >= GARAGE_ROLL_COST)
      ? "Foundry pull ready"
      : result.nextMedal
        ? `${result.nextMedal} chase live`
        : result.rivalName && !result.rivalBeat
          ? `${result.rivalName} ahead`
          : result.place <= 3
            ? "Gold line live"
            : "Podium still live";
    const deltaPocket = result.place === 1
      ? result.winnerMargin !== null
        ? `Won by ${formatGain(result.winnerMargin)}`
        : "Field cleared"
      : result.gapToWinner !== null
        ? `Gap ${formatGain(result.gapToWinner)}`
        : result.rivalName && !result.rivalBeat
          ? `${result.rivalName} ahead`
          : `Par ${formatDelta(result.deltaToPar)}`;
    refs.resultsTitle.textContent = shouldCelebrateBest
      ? result.medalImproved ? `${result.medal} Carved` : "New Apex Carved"
      : `${result.event.name} Complete`;
    refs.resultsSubtitle.textContent = getResultsSubtitle(result);
    refs.resultsNote.textContent = getResultsNote(result);
    refs.resultsNext.textContent = getResultsNext(result);
    refs.resultsMedal.textContent = medalForResult(result);
    refs.resultsPlace.textContent = `Place ${result.place} / ${result.fieldSize} // ${formatCourseSeed(result.event?.seed)}`;
    refs.resultsPocketTime.textContent = formatTime(result.finishTime);
    refs.resultsPocketDelta.textContent = `${deltaPocket} // ${result.fieldClosed ? (result.emoteBadge || "STEEL SET") : "Projected close"}`;
    refs.resultsPocketWallet.textContent = `+${result.currencyEarned || 0} Flux`;
    refs.resultsPocketReplay.textContent = replayPocket;
    refs.resultsStats.innerHTML = [
      `Total time <strong>${formatTime(result.finishTime)}</strong>`,
      result.place === 1
        ? `Margin <strong>${result.winnerMargin !== null ? formatGain(result.winnerMargin) : "solo run"}</strong>`
        : `Gap to winner <strong>${result.gapToWinner !== null ? formatGain(result.gapToWinner) : "--"}</strong>`,
      result.playerBestLap !== null
        ? `Best lap <strong>${formatTime(result.playerBestLap)}</strong>`
        : state.currentEvent.type === "circuit"
          ? "Best lap <strong>no clean mark</strong>"
          : "Format <strong>one-shot sprint</strong>",
      result.fieldBestLap?.time !== null && result.fieldBestLap?.time !== undefined
        ? `Field fastest <strong>${formatTime(result.fieldBestLap.time)}</strong><span class="results-inline">${result.fieldBestLap.player ? "you" : result.fieldBestLap.label}</span>`
        : result.previousEventBest !== null
          ? `Best delta <strong>${formatDelta(result.finishTime - result.previousEventBest)}</strong>`
          : "Best delta <strong>first result</strong>",
      result.fieldClosed
        ? `Classification <strong>full field closed</strong>`
        : `Classification <strong>${result.classifiedCount} / ${result.fieldSize} closed</strong>`,
    ].map((item) => `<div class="results-item">${item}</div>`).join("");
    refs.resultsLaps.innerHTML = result.playerLapTimes.length
      ? [
        ...result.playerLapTimes.map((lapTime, index) => {
          const delta = result.playerBestLap !== null ? lapTime - result.playerBestLap : 0;
          const isBestLap = result.playerBestLap !== null && Math.abs(lapTime - result.playerBestLap) < 0.005;
          return `
            <div class="results-item ${isBestLap ? "results-item-pass" : ""}">
              Lap ${index + 1} <strong>${formatTime(lapTime)}</strong>
              <span class="results-inline">${isBestLap ? "best" : `+${formatTime(Math.max(0, delta))}`}</span>
            </div>
          `;
        }),
        result.fieldBestLap?.time !== null && result.fieldBestLap?.time !== undefined
          ? `<div class="results-item">Fastest overall <strong>${formatTime(result.fieldBestLap.time)}</strong><span class="results-inline">${result.fieldBestLap.player ? "you" : result.fieldBestLap.label}</span></div>`
          : "",
      ].join("")
      : [
        `<div class="results-item">Sprint format <strong>No lap splits</strong></div>`,
        `<div class="results-item">${result.place === 1 ? "Winning time" : "Your time"} <strong>${formatTime(result.finishTime)}</strong></div>`,
        `<div class="results-item">Comparison <strong>${result.place === 1 ? (result.winnerMargin !== null ? `won by ${formatGain(result.winnerMargin)}` : "field cleared") : (result.gapToWinner !== null ? `+${formatTime(result.gapToWinner)}` : "leader time pending")}</strong></div>`,
      ].join("");
    refs.resultsGoals.innerHTML = result.goals.map((goal) => `
      <div class="results-item ${goal.complete ? "results-item-pass" : "results-item-fail"}">
        ${goal.complete ? "PASS" : "MISS"} <strong>${goal.label}</strong>
      </div>
    `).join("");
    refs.resultsClassification.innerHTML = `
      <div class="classification-head">
        <div>Pos</div>
        <div>Driver</div>
        <div>Total</div>
        <div>Gap</div>
        <div>Best</div>
      </div>
      ${result.classification.map((entry) => `
        <div class="classification-row ${entry.player ? "classification-row-player" : ""} ${entry.rival ? "classification-row-rival" : ""}">
          <div class="classification-cell classification-pos">P${entry.place}</div>
          <div class="classification-cell classification-driver">
            <span>${entry.label}</span>
            ${entry.player ? '<span class="classification-tag">YOU</span>' : entry.rival ? '<span class="classification-tag classification-tag-rival">RIVAL</span>' : ""}
          </div>
          <div class="classification-cell classification-stack">
            <strong>${entry.totalDisplay}</strong>
            <small>${entry.timingLabel}</small>
          </div>
          <div class="classification-cell classification-stack">
            <strong>${entry.gapDisplay}</strong>
            <small>${entry.intervalDisplay}</small>
          </div>
          <div class="classification-cell classification-stack">
            <strong>${entry.bestLapDisplay}</strong>
            <small>${entry.bestLapLabel}</small>
          </div>
        </div>
      `).join("")}
    `;
    refs.resultsRetry.textContent = getResultsRetryLabel(result);
    refs.resultsMenu.textContent = getResultsMenuLabel(result);
    resetScrollRegion(refs.resultsShell);
    updateMenuScale();
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
      copy = "Clean launch first. The opener is short and built to show how impacts, shields, and pickups change the fight.";
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
      <div class="profile-item profile-item-compact">
        <div class="section-label">${item.label}</div>
        <div class="profile-value">${item.value}</div>
        <div class="profile-note">${item.note}</div>
      </div>
    `).join("");

    const recentRuns = state.save.runHistory.slice(0, 3);
    refs.profileRuns.innerHTML = recentRuns.length
      ? recentRuns.map((run) => {
        const normalizedEventId = typeof run.eventId === "string" ? run.eventId.split("@board:")[0] : run.eventId;
        const eventName = run.eventName
          || state.events.find((event) => event.id === run.eventId || event.id === normalizedEventId || event.templateId === normalizedEventId)?.name
          || normalizedEventId
          || run.eventId;
        return `<div class="results-item"><strong>${eventName}</strong> <span class="results-inline">P${run.place} // ${formatTime(run.finishTime)} // +${run.currencyEarned || 0} Flux // ${run.wrecks} wrecks</span></div>`;
      }).join("")
      : [
        `<div class="results-item"><strong>Daily killline</strong> <span class="results-inline">${state.save.daily.bestTime ? `Beat ${formatTime(state.save.daily.bestTime)}` : "Plant the first gauntlet time"}</span></div>`,
        `<div class="results-item"><strong>Foundry target</strong> <span class="results-inline">${Math.max(0, GARAGE_ROLL_COST - getCurrencyBalance(state.save, "flux"))} Flux to the next pull</span></div>`,
        `<div class="results-item"><strong>First pressure log</strong> <span class="results-inline">Finish any run to start building the run history.</span></div>`,
      ].join("");

    refs.foundryInsights.innerHTML = getFoundryInsightItems(state).map((item) => `
      <div class="profile-item profile-item-compact">
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
        uiState.stylePage = 0;
        renderProfile();
      });
    });
    const activeSlot = uiState.styleSlot || "skin";
    const slotItems = getCosmeticsBySlot(activeSlot);
    const starterCount = slotItems.filter((item) => isStarterCosmetic(item)).length;
    const stylePageCount = Math.max(1, Math.ceil(slotItems.length / STYLE_PAGE_SIZE));
    uiState.stylePage = Math.min(uiState.stylePage || 0, stylePageCount - 1);
    const visibleSlotItems = slotItems.slice(
      uiState.stylePage * STYLE_PAGE_SIZE,
      (uiState.stylePage + 1) * STYLE_PAGE_SIZE,
    );
    const activeStyleItem = styleDefs[activeSlot] || getCosmeticItem(state.save.equippedCosmetics?.[activeSlot]);
    refs.equippedStyle.innerHTML = `
      <div class="garage-item style-equipped-card">
        ${renderCosmeticPreview(activeStyleItem, activeSlot)}
        <div class="section-label">${activeSlot} loadout</div>
        <div class="profile-value">${activeStyleItem?.name || "None"}</div>
        <div class="profile-note">${activeStyleItem?.description || "No cosmetic equipped for this slot."}</div>
        <div class="mini-tags">
          <span class="mini-tag">${isStarterCosmetic(activeStyleItem) ? "Starter issue" : "Locker owned"}</span>
          <span class="mini-tag">Live</span>
          <span class="mini-tag">${slotItems.length} options</span>
        </div>
      </div>
    `;

    refs.styleShop.innerHTML = `
      <div class="style-slot-group">
        <div class="section-head style-slot-head">
          <div class="section-head-main">
            <div class="section-label">${activeSlot}</div>
            <div class="section-note">${slotItems.length} options // ${starterCount} free</div>
          </div>
          ${stylePageCount > 1 ? `
            <div class="section-head-actions">
              <button class="secondary-btn section-action-btn" data-style-page-nav="-1" type="button" ${uiState.stylePage <= 0 ? "disabled" : ""}>Prev</button>
              <div class="section-note">Page ${uiState.stylePage + 1} / ${stylePageCount}</div>
              <button class="secondary-btn section-action-btn" data-style-page-nav="1" type="button" ${uiState.stylePage >= stylePageCount - 1 ? "disabled" : ""}>Next</button>
            </div>
          ` : ""}
        </div>
        <div class="style-card-grid">
          ${visibleSlotItems.map((item) => {
            const owned = isCosmeticOwned(state.save, item.id);
            const equipped = state.save.equippedCosmetics?.[activeSlot] === item.id;
            const starter = isStarterCosmetic(item);
            const actionLabel = equipped ? "Equipped" : owned ? "Equip" : `Buy ${item.cost} Scrap`;
            return `
              <button class="style-card${equipped ? " selected" : ""}" data-style-id="${item.id}" data-style-action="${owned ? "equip" : "buy"}" ${equipped ? "disabled" : ""} type="button">
                ${renderCosmeticPreview(item, activeSlot)}
                <div class="card-head">
                  <div class="card-title">${item.name}</div>
                  <div class="card-kicker">${starter ? "Starter issue" : owned ? activeSlot : "Shop"}</div>
                </div>
                <div class="card-meta">${item.description}</div>
                <div class="mini-tags">
                  <span class="mini-tag">${starter ? "Free" : owned ? "Owned" : `${item.cost} Scrap`}</span>
                  ${equipped ? '<span class="mini-tag">Live</span>' : ""}
                </div>
                <div class="style-card-action">${actionLabel}</div>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
    refs.styleShop.querySelectorAll("[data-style-page-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        const delta = Number(button.dataset.stylePageNav);
        uiState.stylePage = Math.max(0, Math.min(stylePageCount - 1, (uiState.stylePage || 0) + delta));
        renderProfile();
      });
    });
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
    refs.pauseCopy.textContent = "Resume, restart, or tweak comfort.";
    refs.pauseGoal.textContent = getLiveGoal(state, state.player);
    refs.pauseMeta.textContent = `P${state.player.place} // ${state.track.type === "circuit" ? `Lap ${Math.min(state.player.currentLap, state.currentEvent.laps)}/${state.currentEvent.laps}` : `${Math.round((state.player.progress || 0) * 100)}% to finish`} // ${formatCourseSeed(state.currentEvent.seed)} // ${state.player.pickup ? `Holding ${PICKUP_DEFS[state.player.pickup].label}` : "Pickup empty"}`;
    syncSettingsInputs();
  }

  function renderGarageRoll() {
    const roll = state.garageRoll;
    refs.garageRollModal.classList.toggle("hidden", !roll);
    refs.root.classList.toggle("garage-roll-open", Boolean(roll));
    if (!roll) {
      delete refs.garageRollModal.dataset.status;
      return;
    }
    refs.garageRollModal.dataset.status = roll.status;

    const revealed = new Set(roll.revealedSlots || []);
    refs.garageRollStatus.textContent = roll.status === "revealed"
      ? `${roll.keptSlots.length || 0} selected // ${roll.offers.length} revealed`
      : `Charging capsules // ${revealed.size}/3 cracked`;
    refs.garageRollGrid.innerHTML = roll.offers.map((offer) => {
      const targetSlot = roll.assignments?.[offer.slotIndex] ?? offer.slotIndex;
      const currentCar = state.save.garage[targetSlot];
      const hasCurrentCar = isGarageSlotFilled(currentCar);
      const isRevealed = revealed.has(offer.slotIndex) || roll.status === "revealed";
      const kept = roll.keptSlots.includes(offer.slotIndex);
      const compareDelta = offer.score - (hasCurrentCar ? getGarageScore(currentCar) : 0);
      const compareTags = [
        `Offer ${offer.slotIndex + 1}`,
        `Slot ${targetSlot + 1}`,
        `${compareDelta >= 0 ? "+" : ""}${compareDelta} rating`,
        `${getScrapValue(offer)} Scrap if sold`,
      ];
      const targetButtons = state.save.garage.map((slotCar, slotIndex) => {
        const active = kept && targetSlot === slotIndex;
        const slotLabel = isGarageSlotFilled(slotCar) ? slotCar.name : "Open";
        return `<button class="garage-roll-target${active ? " selected" : ""}" data-roll-slot="${offer.slotIndex}" data-roll-target="${slotIndex}" type="button">S${slotIndex + 1}<span>${clampTagCopy(slotLabel)}</span></button>`;
      }).join("");
      return `
        <div class="garage-roll-card${isRevealed ? " revealed" : " hidden-card"}${kept ? " kept" : ""}">
          <div class="garage-roll-card-inner">
            ${isRevealed ? `
              <div class="card-head">
                <div>
                  <div class="card-title">${offer.name}</div>
                  <div class="card-kicker">${offer.tierLabel}</div>
                </div>
                <button class="secondary-btn garage-roll-toggle garage-roll-toggle-head${kept ? " selected" : ""}" data-roll-slot="${offer.slotIndex}" type="button">${kept ? "Keeping" : "Keep"}</button>
              </div>
              <div class="event-meta">${formatCarMeta(offer)}</div>
              <div class="card-footer">
                <div class="mini-tags">${compareTags.map((tag) => `<span class="mini-tag">${tag}</span>`).join("")}</div>
              </div>
              <div class="roll-target-row">
                <div class="section-label">Replace slot</div>
                <div class="garage-roll-targets">${targetButtons}</div>
              </div>
              <div class="roll-compare-grid">
                <div class="roll-compare-panel">
                  <div class="section-label">Target bay</div>
                  <div class="roll-compare-title">${hasCurrentCar ? currentCar.name : "Open slot"}</div>
                  <div class="roll-compare-copy">${hasCurrentCar ? `${formatCarMeta(currentCar)} // ${currentCar.role}` : "Vacant bay. Keep this reveal to activate the slot instantly."}</div>
                </div>
                <div class="roll-compare-panel roll-compare-panel-new">
                  <div class="section-label">Rolled machine</div>
                  <div class="roll-compare-title">${offer.name}</div>
                  <div class="stat-bars compact">${renderStatTiles(offer, currentCar)}</div>
                </div>
              </div>
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
      if (button.dataset.rollTarget) return;
      button.addEventListener("click", () => callbacks.onGarageRollToggle?.(Number(button.dataset.rollSlot)));
    });
    refs.garageRollGrid.querySelectorAll("[data-roll-target]").forEach((button) => {
      button.addEventListener("click", () => callbacks.onGarageRollAssign?.(
        Number(button.dataset.rollSlot),
        Number(button.dataset.rollTarget),
      ));
    });
    const scrapPreview = roll.offers
      .filter((offer) => !roll.keptSlots.includes(offer.slotIndex))
      .reduce((sum, offer) => sum + getScrapValue(offer), 0);
    const assignedCount = roll.keptSlots.filter((slotIndex) => Number.isInteger(roll.assignments?.[slotIndex])).length;
    refs.garageRollSummary.textContent = roll.status === "revealed"
      ? `Pick what to keep, then choose which slot each car replaces. Unkept cars sell for ${scrapPreview} Scrap.`
      : "The Foundry is cracking three procedural cars.";
    refs.garageRollConfirmBtn.disabled = roll.status !== "revealed" || !roll.keptSlots.length || assignedCount !== roll.keptSlots.length;
    refs.garageRollConfirmBtn.textContent = roll.status !== "revealed"
      ? "Revealing..."
      : `Keep ${roll.keptSlots.length} Car${roll.keptSlots.length === 1 ? "" : "s"}`;
  }

  function syncMenu() {
    const baseEvent = state.events[state.selectedEventIndex];
    const event = getDisplayEvent(state, baseEvent);
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
    refs.menuEyebrow.textContent = "";
    refs.menuIntro.textContent = header.intro;
    refs.careerStatus.textContent = header.chips[0] || "";
    refs.dailyStatus.textContent = header.chips[1] || "";
    refs.ghostStatus.textContent = header.chips[2] || "";
    refs.launchBtn.textContent = getStartLabel(state, event);
    refs.dailyBtn.textContent = getDailyLabel(state);
    refs.quickRaceBtn.textContent = getQuickLabel(state);
    if (refs.boardRerollBtn) {
      const rerollDisabled = Boolean(state.garageRoll) || getCurrencyBalance(state.save, "flux") < COURSE_REROLL_COST;
      refs.boardRerollBtn.textContent = getBoardRerollLabel(state);
      refs.boardRerollBtn.disabled = false;
      refs.boardRerollBtn.classList.toggle("is-disabled", rerollDisabled);
      refs.boardRerollBtn.setAttribute("aria-disabled", rerollDisabled ? "true" : "false");
    }
    refs.launchHint.textContent = getLaunchHint(state);
    refs.eventFormatHero.textContent = getHeroNextCopy(state, event);
    refs.heroRecoveryCopy.textContent = getHeroRecoveryCopy(state);
    refs.heroReplayCopy.textContent = getReplayHook(state, event);
    refs.heroDailyCopy.textContent = getHeroDailyCopy(state);

    const eventMetaText = `${event.guided ? "~1:12" : `~${formatTime(event.parTime)}`} // ${getDifficultyLabel(event)} // ${formatCourseSeed(event.seed)} // Goal: ${getPrimaryGoal(event).toLowerCase()}`;
    refs.eventFocusBadge.textContent = getEventBadge(state, event);
    refs.eventFocusTitle.textContent = event.name;
    refs.eventFocusMeta.textContent = eventMetaText;
    refs.eventFocusCopy.textContent = getEventReason(state, event, eventResult);
    refs.eventFocusCopy.removeAttribute("title");
    if (refs.homeBoardSelectedTitle) refs.homeBoardSelectedTitle.textContent = event.name;
    if (refs.homeBoardSelectedMeta) refs.homeBoardSelectedMeta.textContent = eventMetaText;
    refs.eventFocusModifiers.innerHTML = "";
    for (const tagLabel of getFocusTags(state, event, eventResult)) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = tagLabel;
      refs.eventFocusModifiers.appendChild(tag);
    }
    refs.eventGhostStatus.textContent = getGhostReady(state, event) ? "Ghost ready" : "Ghost cold";
    refs.eventRewardStatus.textContent = event.customSeed
      ? event.customSeedMatchesBoard ? "Replay seed pinned" : "Custom replay live"
      : getEventUtilityStatus(state, event);
    drawTrackPreview(refs.eventPreview, event);
    const customSeedEnabled = supportsCustomCourseSeed(baseEvent);
    const savedCustomSeed = getSavedCustomCourseSeed(state, baseEvent);
    if (refs.eventCustomSeed) {
      refs.eventCustomSeed.disabled = !customSeedEnabled;
      refs.eventCustomSeed.value = savedCustomSeed !== null ? String(savedCustomSeed) : "";
      refs.eventCustomSeed.placeholder = customSeedEnabled ? `${event.seed}` : "Daily seed locked";
    }
    if (refs.eventCustomSeedApply) {
      refs.eventCustomSeedApply.disabled = !customSeedEnabled;
      refs.eventCustomSeedApply.textContent = savedCustomSeed !== null ? "Update Seed" : "Lock Seed";
    }
    if (refs.eventCustomSeedClear) {
      refs.eventCustomSeedClear.disabled = !customSeedEnabled || savedCustomSeed === null;
    }
    if (refs.eventCustomSeedNote) {
      refs.eventCustomSeedNote.textContent = !customSeedEnabled
        ? "Daily gauntlets stay locked to today's seed."
        : savedCustomSeed === null
          ? "Enter a favourite seed to replay this layout exactly. PBs and ghosts will track that line separately when it diverges from the live board."
          : event.customSeedMatchesBoard
            ? "Replay seed locked. This one matches the live board now and will stay playable after the board shifts."
            : "Replay seed locked. This favourite line now runs on its own seed-scoped PB and ghost lane.";
    }
    const boardPage = getHomeBoardPage(displayedEvents, baseEvent);
    if (refs.homeBoardPage) {
      refs.homeBoardPage.textContent = `Page ${boardPage.currentPage + 1} / ${boardPage.pageCount}`;
    }
    if (refs.homeBoardPrev) {
      const atStart = boardPage.currentPage <= 0;
      refs.homeBoardPrev.disabled = atStart;
      refs.homeBoardPrev.classList.toggle("is-disabled", atStart);
    }
    if (refs.homeBoardNext) {
      const atEnd = boardPage.currentPage >= boardPage.pageCount - 1;
      refs.homeBoardNext.disabled = atEnd;
      refs.homeBoardNext.classList.toggle("is-disabled", atEnd);
    }

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
    const visibleEvents = displayedEvents.slice(
      boardPage.currentPage * HOME_BOARD_PAGE_SIZE,
      (boardPage.currentPage + 1) * HOME_BOARD_PAGE_SIZE,
    );
    visibleEvents.forEach((item) => {
      const displayItem = getDisplayEvent(state, item);
      const eventIndex = state.events.findIndex((eventOption) => eventOption.id === item.id);
      const cardResult = getEventResult(state, displayItem);
      const cardMedal = getStoredMedal(cardResult);
      const button = document.createElement("button");
      button.dataset.kind = item.daily ? "daily" : item.guided ? "guided" : "event";
      button.className = `event-card${eventIndex === state.selectedEventIndex ? " selected" : ""}`;
      button.innerHTML = `
        <div class="card-head">
          <div class="card-title">${displayItem.name}</div>
          <div class="card-kicker">${getEventBadge(state, displayItem)}</div>
        </div>
        <div class="event-meta">${displayItem.guided ? "~1:12" : `~${formatTime(displayItem.parTime)}`} // ${getDifficultyLabel(displayItem)}</div>
        <div class="event-meta">${clampTagCopy(getPrimaryGoal(displayItem))}</div>
        <div class="card-footer">
          <div class="mini-tags">
            <span class="mini-tag">${cardMedal ? `${cardMedal} banked` : cardResult?.bestTime ? `Best ${formatTime(cardResult.bestTime)}` : "Fresh run"}</span>
            <span class="mini-tag">${displayItem.daily ? "Gauntlet" : BIOME_DEFS[displayItem.biomeId].name}</span>
            ${displayItem.customSeed ? `<span class="mini-tag">${formatCourseSeed(displayItem.seed)}</span>` : ""}
            ${getGhostReady(state, displayItem) ? '<span class="mini-tag">Ghost</span>' : ""}
          </div>
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
          <div class="card-footer">
            <div class="mini-tags">
              <span class="mini-tag">${item.role}</span>
              <span class="mini-tag">${getGarageScore(item)} rating</span>
              ${getCarTags(item).slice(0, 2).map((trait) => `<span class="mini-tag">${trait}</span>`).join("")}
            </div>
          </div>
        `
        : `
          <div class="card-head">
            <div class="card-title">Open Slot</div>
            <div class="card-kicker">Slot ${slotIndex + 1} // Vacant</div>
          </div>
          <div class="card-meta">Keep a Foundry roll here to activate this bay.</div>
          <div class="card-footer">
            <div class="mini-tags">
              <span class="mini-tag">Vacant</span>
              <span class="mini-tag">Foundry</span>
              <span class="mini-tag">Roll ready</span>
            </div>
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
    if (refs.garageSlotsNote) {
      const liveCars = getFilledGarageCars(state.save).length;
      const openSlots = state.save.garage.length - liveCars;
      refs.garageSlotsNote.textContent = `${liveCars} live // ${openSlots} open`;
    }
    refs.gachaRollCopy.textContent = getRollCallout(state);
    refs.garageRollBtn.textContent = `Roll 3 Cars // ${GARAGE_ROLL_COST} Flux`;
    refs.garageRollBtn.disabled = Boolean(state.garageRoll) || getCurrencyBalance(state.save, "flux") < GARAGE_ROLL_COST;

    renderProfile();
    renderGarageRoll();
    renderBindings();

    if (refs.splashOverviewInfo) refs.splashOverviewInfo.dataset.tooltip = "Built for short, violent runs: seeded kill-courses, glowing wrecks, and a Foundry that keeps feeding new metal into the garage.";
    if (refs.splashRunsInfo) refs.splashRunsInfo.dataset.tooltip = "Every event is seeded. Circuits and sprints reshuffle layout, hazards, and pickup pockets so the next line is never identical.";
    if (refs.splashRecoveryInfo) refs.splashRecoveryInfo.dataset.tooltip = "Impacts peel parts off the shell, chew through integrity, and turn a bad line into smoking scrap. The goal is drama first, not fragility.";
    if (refs.splashReplayInfo) refs.splashReplayInfo.dataset.tooltip = "Daily gauntlets, medal pushes, ghosts, and Foundry rolls keep the next run worth taking.";
    if (refs.menuOverviewInfo) refs.menuOverviewInfo.dataset.tooltip = getMenuOverviewTooltip(state, event);
    if (refs.eventInfoBtn) refs.eventInfoBtn.dataset.tooltip = getEventTooltip(state, event, eventResult);
    if (refs.boardRerollInfoBtn) refs.boardRerollInfoBtn.dataset.tooltip = getBoardRerollTooltip(state);
    if (refs.carInfoBtn) refs.carInfoBtn.dataset.tooltip = car ? getCarTooltip(car) : "Garage data is still loading.";
    if (refs.gachaInfoBtn) refs.gachaInfoBtn.dataset.tooltip = "Flux buys three procedural car rolls at once. Better race history improves the tier pool, but every pull can still miss. Keep any number of reveals, choose which slot each one replaces, and sell the rest automatically for Scrap.";
    if (refs.styleInfoBtn) refs.styleInfoBtn.dataset.tooltip = "Scrap comes from cars you do not keep. Spend it here on skins, trails, tyre marks, and results emotes. The purchase path is isolated so direct premium buys can slot in later without rebuilding the garage flow.";
    if (refs.settingsAudioInfo) refs.settingsAudioInfo.dataset.tooltip = "These settings update live. Use volume and mute for quick comfort, reduced shake to calm collisions, high contrast for clearer track reads, and assist level to soften punishment after mistakes.";
    if (refs.settingsControlsInfo) refs.settingsControlsInfo.dataset.tooltip = "Hybrid mode keeps the default keyboard layout and any live gamepad. Custom mode lets you remap race inputs. Bindings update immediately and persist between sessions.";

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
    refs.pickupChip.textContent = player.pickup ? PICKUP_DEFS[player.pickup].hud : "No pickup";
    refs.pickupChip.dataset.tone = player.pickup || "none";

    const assist = getAssistState(state, player);
    refs.assistChip.textContent = assist.text;
    refs.assistChip.dataset.tone = assist.tone;

    const flow = getFlowState(state, player);
    refs.slipstreamChip.textContent = flow.text;
    refs.slipstreamChip.dataset.tone = flow.tone;

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
    const selectedEvent = state.events[state.selectedEventIndex] || null;
    const displayEvent = selectedEvent ? getDisplayEvent(state, selectedEvent) : null;
    return JSON.stringify({
      coordinateSystem: "world origin near track center, +x right, +y down",
      mode: state.mode,
      menuStage: state.menuStage || "splash",
      menuView: state.menuView || "home",
      homePane: uiState.homePane,
      homeBoardPage: uiState.homeBoardPage,
      profilePane: uiState.profilePane,
      foundryPane: uiState.foundryPane,
      stylePage: uiState.stylePage,
      resultsPane: uiState.resultsPane,
      settingsPane: uiState.settingsPane,
      bindingAction: state.bindingAction || null,
      selectedEvent: displayEvent?.name || null,
      selectedEventSeed: displayEvent?.seed ?? null,
      selectedEventCustomSeed: displayEvent?.customSeedValue ?? null,
      selectedCar: state.selectedCarId,
      wallet: {
        flux: getCurrencyBalance(state.save, "flux"),
        scrap: getCurrencyBalance(state.save, "scrap"),
      },
      garageRoll: state.garageRoll ? {
        status: state.garageRoll.status,
        keptSlots: state.garageRoll.keptSlots,
        revealedSlots: state.garageRoll.revealedSlots,
        assignments: state.garageRoll.assignments,
      } : null,
      menuIntro: refs.menuIntro.textContent,
      tooltip: !refs.tooltip.classList.contains("hidden") ? { text: refs.tooltip.textContent, mode: refs.tooltip.dataset.mode || null } : null,
      currentEvent: state.currentEvent ? { name: state.currentEvent.name, type: state.currentEvent.type, seed: state.currentEvent.seed, theme: state.currentEvent.biomeId, laps: state.currentEvent.laps } : null,
      bannerMode: refs.banner.dataset.mode || "top",
      trackSystems: state.track ? { surgeStrips: state.track.surgeStrips?.length || 0, hazards: state.hazards?.length || 0, pickups: state.pickups?.length || 0 } : null,
      currentSector: state.currentSector ? { id: state.currentSector.id, tag: state.currentSector.tag, name: state.currentSector.name } : null,
      rivalStatus: state.rivalStatus ? { phase: state.rivalStatus.phase, text: state.rivalStatus.text, tone: state.rivalStatus.tone } : null,
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
        draftCharge: Number(state.player.draftCharge.toFixed(2)),
        slingshot: Number(state.player.slingshotTimer.toFixed(2)),
        rivalHeat: Number(state.player.rivalHeat.toFixed(2)),
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
        ghost: getGhostState(state).text,
      } : null,
      pause: !refs.pause.classList.contains("hidden") ? { goal: refs.pauseGoal.textContent, meta: refs.pauseMeta.textContent } : null,
      results: !refs.results.classList.contains("hidden") ? { title: refs.resultsTitle.textContent, note: refs.resultsNote.textContent, next: refs.resultsNext.textContent, pane: uiState.resultsPane } : null,
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
  refs.boardRerollBtn?.addEventListener("click", () => callbacks.onBoardReroll?.());
  refs.eventCustomSeedApply?.addEventListener("click", () => callbacks.onCustomCourseSeedApply?.(refs.eventCustomSeed?.value));
  refs.eventCustomSeedClear?.addEventListener("click", () => callbacks.onCustomCourseSeedClear?.());
  refs.eventCustomSeed?.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key !== "Enter") return;
    event.preventDefault();
    callbacks.onCustomCourseSeedApply?.(event.currentTarget.value);
  });
  refs.garageRollBtn?.addEventListener("click", () => callbacks.onGarageRollStart?.());
  refs.garageRollConfirmBtn?.addEventListener("click", () => callbacks.onGarageRollConfirm?.());
  refs.resultsRetry.addEventListener("click", () => callbacks.onRetry?.());
  refs.resultsMenu.addEventListener("click", () => callbacks.onBackToMenu?.());
  refs.resultsTabSummary.addEventListener("click", () => setResultsPane("summary"));
  refs.resultsTabTiming.addEventListener("click", () => setResultsPane("timing"));
  refs.resultsTabField.addEventListener("click", () => setResultsPane("field"));
  refs.pauseResume.addEventListener("click", () => callbacks.onPauseResume?.());
  refs.pauseRetry.addEventListener("click", () => callbacks.onPauseRetry?.());
  refs.pauseMenu.addEventListener("click", () => callbacks.onPauseMenu?.());
  refs.menuTabHome.addEventListener("click", () => callbacks.onMenuViewChange?.("home"));
  refs.menuTabProfile.addEventListener("click", () => callbacks.onMenuViewChange?.("profile"));
  refs.menuTabSettings.addEventListener("click", () => callbacks.onMenuViewChange?.("settings"));
  refs.homeTabLaunch.addEventListener("click", () => setHomePane("launch"));
  refs.homeTabBoard.addEventListener("click", () => setHomePane("board"));
  refs.homeBoardPrev.addEventListener("click", () => {
    uiState.homePane = "board";
    uiState.homeBoardPage = Math.max(0, uiState.homeBoardPage - 1);
    syncMenu();
  });
  refs.homeBoardNext.addEventListener("click", () => {
    uiState.homePane = "board";
    uiState.homeBoardPage += 1;
    syncMenu();
  });
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
  refs.foundryTabForge.addEventListener("click", () => {
    uiState.foundryPane = "forge";
    showFoundryPane("forge");
    updateMenuScale();
  });
  refs.foundryTabReadout.addEventListener("click", () => {
    uiState.foundryPane = "readout";
    showFoundryPane("readout");
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
    cycleHomePane,
    cycleResultsPane,
    hideResults,
    renderGameToText,
    setHomePane,
    setMenuOpen,
    setPauseOpen,
    setResultsPane,
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
  const rival = leaderboard.find((car) => car.rival) || state.cars.find((car) => car.rival) || null;
  const classification = buildClassification(state, leaderboard);
  const playerClassification = classification.find((entry) => entry.player) || null;
  const fieldBestLap = classification
    .filter((entry) => entry.bestLapTime !== null)
    .sort((a, b) => a.bestLapTime - b.bestLapTime)[0] || null;
  const classifiedCount = classification.filter((entry) => entry.finished).length;

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
    playerLapTimes: player.lapTimes.slice(0, state.currentEvent.type === "circuit" ? state.currentEvent.laps : player.lapTimes.length),
    playerBestLap: Number.isFinite(player.bestLapTime) ? player.bestLapTime : null,
    playerLastLap: Number.isFinite(player.lastLapTime) ? player.lastLapTime : null,
    classification,
    fieldClosed: classifiedCount === classification.length,
    classifiedCount,
    gapToWinner: playerClassification && playerClassification.place > 1 ? playerClassification.gapToLeader : null,
    gapAhead: playerClassification && playerClassification.place > 1 ? playerClassification.intervalToAhead : null,
    gapBehind: playerClassification && playerClassification.place < classification.length ? classification[playerClassification.place]?.intervalToAhead ?? null : null,
    winnerMargin: classification[1]?.gapToLeader ?? null,
    fieldBestLap: fieldBestLap ? {
      label: fieldBestLap.label,
      time: fieldBestLap.bestLapTime,
      player: fieldBestLap.player,
    } : null,
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
  result.medal = medalForResult(result);
  result.previousMedal = getStoredMedal(previousEventResult);
  result.medalImproved = Boolean(result.previousMedal) && medalRank(result.medal) > medalRank(result.previousMedal);
  result.nextMedal = getNextMedal(result.medal);
  result.rivalName = rival?.label || null;
  result.rivalPlace = rival?.place || null;
  result.rivalBeat = Boolean(rival && place < rival.place);
  result.tutorialPickupMet = result.goals.find((goal) => goal.type === "pickup_use")?.complete ?? false;
  return result;
}
