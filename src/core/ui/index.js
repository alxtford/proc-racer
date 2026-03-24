import { CONTROL_LABELS } from "../controls.js";
import { getCurrencyBalance } from "../economy.js";
import { GARAGE_ROLL_COST, getGarageScore, getScrapValue, isGarageSlotFilled } from "../garage.js";
import { formatTime } from "../utils.js";
import { PICKUP_DEFS } from "../../data/content.js";
import {
  TOOLTIP_DELAY_MS,
  clampTagCopy,
  formatCarMeta,
  formatCourseSeed,
  formatDelta,
  formatGain,
  getAssistState,
  getFlowState,
  getGhostState,
  getLiveGoal,
  getResultsMenuLabel,
  getResultsNext,
  getResultsNote,
  getResultsRetryLabel,
  getResultsSubtitle,
  medalForResult,
  renderStatTiles,
} from "./legacy.js";
import { deriveShellModel, deriveScreenModel } from "./model.js";
import {
  createRouteState,
  getLegacyMenuView,
  getLegacyPaneState,
  normalizeMenuScreen,
  normalizeMenuStage,
  syncRuntimeMenuState,
} from "./routes.js";
import { getRouteSection, getSectionOptions, setRouteSection as assignRouteSection } from "./sections.js";
import { renderActiveScreen, renderOverlays, renderShell } from "./screens.js";
import { renderStylePreviewCards } from "./renderers/style.js";

function createRefs() {
  return {
    root: document.getElementById("hud"),
    menu: document.getElementById("menu"),
    menuSplash: document.getElementById("menu-splash"),
    splashShell: document.getElementById("splash-shell"),
    menuShell: document.getElementById("menu-shell"),
    splashStartBtn: document.getElementById("start-btn"),
    menuEyebrow: document.getElementById("menu-eyebrow"),
    hubTitle: document.getElementById("hub-title"),
    menuIntro: document.getElementById("menu-intro"),
    menuOverviewInfo: document.getElementById("menu-overview-info"),
    hubChipStrip: document.getElementById("hub-chip-strip"),
    hubSubnav: document.getElementById("hub-subnav"),
    hubScreen: document.getElementById("hub-screen"),
    menuTabHome: document.getElementById("menu-tab-home"),
    menuTabProfile: document.getElementById("menu-tab-profile"),
    menuTabSettings: document.getElementById("menu-tab-settings"),
    banner: document.getElementById("banner"),
    toast: document.getElementById("race-toast"),
    eventName: document.getElementById("event-name"),
    eventMeta: document.getElementById("event-meta"),
    tutorialCard: document.getElementById("tutorial-card"),
    tutorialStep: document.getElementById("tutorial-step"),
    tutorialCopy: document.getElementById("tutorial-copy"),
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
    garageRollModal: document.getElementById("garage-roll-modal"),
    garageRollShell: document.querySelector(".garage-roll-shell"),
    garageRollStatus: document.getElementById("garage-roll-status"),
    garageRollGrid: document.getElementById("garage-roll-grid"),
    garageRollSummary: document.getElementById("garage-roll-summary"),
    garageRollConfirmBtn: document.getElementById("garage-roll-confirm-btn"),
    tooltip: document.getElementById("ui-tooltip"),
  };
}

function getPressureState(state, player) {
  if (state.rivalStatus?.text) return state.rivalStatus;
  if (player.damage > player.def.durability * 0.7) return { text: "Integrity critical", tone: "danger" };
  if (player.damage > player.def.durability * 0.35) return { text: "Integrity bruised", tone: "neutral" };
  return { text: "Field pressure live", tone: "good" };
}

export function createUi(state, callbacks = {}) {
  const refs = createRefs();
  const route = createRouteState(state);
  const uiState = {
    menuOpen: true,
    toastTimer: 0,
    bannerTimer: 0,
    tooltipTimer: null,
    tooltipButton: null,
    tooltipMode: null,
    lastStage: null,
    lastScreen: null,
    resultsPane: "summary",
  };
  let resizeFrame = null;

  function getScreenEl(id) {
    return refs.hubScreen?.querySelector(`#${id}`) || null;
  }

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
    if (top + tooltipRect.height > window.innerHeight - edge) top = buttonRect.top - tooltipRect.height - 12;
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
    positionTooltip(button);
  }

  function scheduleTooltip(button) {
    if (!button?.dataset.tooltip || uiState.tooltipMode === "click") return;
    clearTooltipTimer();
    uiState.tooltipTimer = window.setTimeout(() => showTooltip(button, "hover"), TOOLTIP_DELAY_MS);
  }

  function updateMenuScale() {
    if (uiState.tooltipButton && !refs.tooltip.classList.contains("hidden")) positionTooltip(uiState.tooltipButton);
  }

  function handleViewportResize() {
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      if (uiState.menuOpen) syncMenu();
      else updateMenuScale();
    });
  }

  function syncVisualSettings() {
    document.body.dataset.contrast = state.save.settings.highContrast ? "high" : "normal";
  }

  function syncSettingsInputs() {
    const volume = Math.round((state.save.settings.masterVolume ?? 0.65) * 100);
    const settingsVolume = getScreenEl("settings-volume");
    const settingsMute = getScreenEl("settings-mute");
    const settingsShake = getScreenEl("settings-shake");
    const settingsContrast = getScreenEl("settings-contrast");
    const settingsAssist = getScreenEl("settings-assist");
    const settingsControlMode = getScreenEl("settings-control-mode");
    const bindStatus = getScreenEl("bind-status");
    if (settingsVolume) settingsVolume.value = String(volume);
    refs.pauseVolume.value = String(volume);
    if (settingsMute) settingsMute.checked = Boolean(state.save.settings.muted);
    refs.pauseMute.checked = Boolean(state.save.settings.muted);
    if (settingsShake) settingsShake.checked = Boolean(state.save.settings.reducedShake);
    refs.pauseShake.checked = Boolean(state.save.settings.reducedShake);
    if (settingsContrast) settingsContrast.checked = Boolean(state.save.settings.highContrast);
    if (settingsAssist) settingsAssist.value = state.save.settings.assistLevel || "standard";
    refs.pauseAssist.value = state.save.settings.assistLevel || "standard";
    if (settingsControlMode) settingsControlMode.value = state.save.settings.controlMode || "hybrid";
    const deviceStatus = state.gamepad?.connected ? " // gamepad live" : "";
    const statusText = state.bindingAction
      ? `Press a key for ${CONTROL_LABELS[state.bindingAction]}`
      : state.save.settings.controlMode === "custom"
        ? `Custom bindings${deviceStatus}`
        : `Hybrid bindings${deviceStatus}`;
    if (bindStatus) bindStatus.textContent = statusText;
  }
  function getCurrentResultsPane() {
    return uiState.resultsPane || "summary";
  }

  function showResultsPane(pane) {
    const nextPane = pane || "summary";
    uiState.resultsPane = nextPane;
    refs.results.dataset.pane = nextPane;
    refs.resultsPaneSummary.classList.toggle("hidden", nextPane !== "summary");
    refs.resultsPaneTiming.classList.toggle("hidden", nextPane !== "timing");
    refs.resultsPaneField.classList.toggle("hidden", nextPane !== "field");
    refs.resultsTabSummary.classList.toggle("selected", nextPane === "summary");
    refs.resultsTabTiming.classList.toggle("selected", nextPane === "timing");
    refs.resultsTabField.classList.toggle("selected", nextPane === "field");
  }

  function setRouteScreen(screen) {
    const nextScreen = normalizeMenuScreen(screen);
    if (nextScreen !== "style") route.stylePreviewItemId = null;
    route.stage = "hub";
    route.screen = nextScreen;
    assignRouteSection(route, nextScreen, getRouteSection(route, nextScreen));
    syncRuntimeMenuState(state, route);
    callbacks.onMenuScreenChange?.(nextScreen);
    callbacks.onMenuViewChange?.(getLegacyMenuView(nextScreen));
    syncMenu();
  }

  function setRouteSection(section) {
    const nextSection = assignRouteSection(route, route.screen, section);
    if (route.screen === "style") route.stylePreviewItemId = null;
    callbacks.onMenuSectionChange?.(route.screen, nextSection);
    syncMenu();
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
    if (isOpen) syncPause();
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
    dismissTooltip();
  }

  function setHomePane(pane) {
    const nextSection = pane === "board" ? "board" : "launch";
    assignRouteSection(route, "race", nextSection);
    if (nextSection === "board" && !Number.isInteger(route.boardPage)) route.boardPage = 0;
    syncMenu();
  }

  function cycleHomePane(direction = 1) {
    const sections = getSectionOptions("race").map((option) => option.id);
    const currentIndex = sections.indexOf(getRouteSection(route, "race"));
    const nextSection = sections[(currentIndex + direction + sections.length) % sections.length];
    assignRouteSection(route, "race", nextSection);
    if (nextSection === "board" && !Number.isInteger(route.boardPage)) route.boardPage = 0;
    syncMenu();
  }

  function setResultsPane(pane) {
    showResultsPane(pane);
  }

  function cycleResultsPane(direction = 1) {
    const panes = ["summary", "timing", "field"];
    const currentIndex = panes.indexOf(getCurrentResultsPane());
    showResultsPane(panes[(currentIndex + direction + panes.length) % panes.length]);
  }

  function showResults(result) {
    dismissTooltip();
    refs.results.classList.remove("hidden");
    refs.pause.classList.add("hidden");
    refs.root.classList.add("results-open");
    showResultsPane("summary");
    const walletFlux = result.postRaceFlux ?? getCurrencyBalance(state.save, "flux");
    const replayPocket = (walletFlux >= GARAGE_ROLL_COST)
      ? "Foundry pull ready"
      : result.nextMedal
        ? `${result.nextMedal} chase live`
        : result.rivalName && !result.rivalBeat
          ? `${result.rivalName} ahead`
          : result.place <= 3 ? "Gold line live" : "Podium still live";
    const deltaPocket = result.place === 1
      ? result.winnerMargin !== null ? `Won by ${formatGain(result.winnerMargin)}` : "Field cleared"
      : result.gapToWinner !== null ? `Gap ${formatGain(result.gapToWinner)}` : `Par ${formatDelta(result.deltaToPar)}`;
    refs.resultsTitle.textContent = result.medalImproved ? `${result.medal} Carved` : `${result.event.name} Complete`;
    refs.resultsSubtitle.textContent = getResultsSubtitle(result);
    refs.resultsNote.textContent = getResultsNote(result);
    refs.resultsNext.textContent = getResultsNext(result);
    refs.resultsMedal.textContent = medalForResult(result);
    refs.resultsPlace.textContent = `Place ${result.place} / ${result.fieldSize} // ${formatCourseSeed(result.event?.seed)}`;
    refs.resultsPocketTime.textContent = formatTime(result.finishTime);
    refs.resultsPocketDelta.textContent = deltaPocket;
    refs.resultsPocketWallet.textContent = `+${result.currencyEarned || 0} Flux`;
    refs.resultsPocketReplay.textContent = replayPocket;
    refs.resultsStats.innerHTML = [
      `Total time <strong>${formatTime(result.finishTime)}</strong>`,
      result.place === 1
        ? `Margin <strong>${result.winnerMargin !== null ? formatGain(result.winnerMargin) : "solo run"}</strong>`
        : `Gap to winner <strong>${result.gapToWinner !== null ? formatGain(result.gapToWinner) : "--"}</strong>`,
      result.playerBestLap !== null ? `Best lap <strong>${formatTime(result.playerBestLap)}</strong>` : "Best lap <strong>no clean mark</strong>",
      result.fieldBestLap?.time !== null && result.fieldBestLap?.time !== undefined
        ? `Field fastest <strong>${formatTime(result.fieldBestLap.time)}</strong><span class="results-inline">${result.fieldBestLap.player ? "you" : result.fieldBestLap.label}</span>`
        : "Field fastest <strong>pending</strong>",
    ].map((item) => `<div class="results-item">${item}</div>`).join("");
    refs.resultsLaps.innerHTML = result.playerLapTimes.length
      ? result.playerLapTimes.map((lapTime, index) => `<div class="results-item">Lap ${index + 1} <strong>${formatTime(lapTime)}</strong></div>`).join("")
      : `<div class="results-item">Sprint format <strong>No lap splits</strong></div>`;
    refs.resultsGoals.innerHTML = result.goals.map((goal) => `
      <div class="results-item ${goal.complete ? "results-item-pass" : "results-item-fail"}">
        ${goal.complete ? "PASS" : "MISS"} <strong>${goal.label}</strong>
      </div>
    `).join("");
    refs.resultsClassification.innerHTML = `
      <div class="classification-head"><div>Pos</div><div>Driver</div><div>Total</div><div>Gap</div><div>Best</div></div>
      ${result.classification.map((entry) => `
        <div class="classification-row ${entry.player ? "classification-row-player" : ""} ${entry.rival ? "classification-row-rival" : ""}">
          <div class="classification-cell classification-pos">P${entry.place}</div>
          <div class="classification-cell classification-driver"><span>${entry.label}</span>${entry.player ? '<span class="classification-tag">YOU</span>' : entry.rival ? '<span class="classification-tag classification-tag-rival">RIVAL</span>' : ""}</div>
          <div class="classification-cell classification-stack"><strong>${entry.totalDisplay}</strong><small>${entry.timingLabel}</small></div>
          <div class="classification-cell classification-stack"><strong>${entry.gapDisplay}</strong><small>${entry.intervalDisplay}</small></div>
          <div class="classification-cell classification-stack"><strong>${entry.bestLapDisplay}</strong><small>${entry.bestLapLabel}</small></div>
        </div>
      `).join("")}
    `;
    refs.resultsRetry.textContent = getResultsRetryLabel(result);
    refs.resultsMenu.textContent = getResultsMenuLabel(result);
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
    if (!roll) return;
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
                <div><div class="card-title">${offer.name}</div><div class="card-kicker">${offer.tierLabel}</div></div>
                <button class="secondary-btn garage-roll-toggle garage-roll-toggle-head${kept ? " selected" : ""}" data-roll-slot="${offer.slotIndex}" type="button">${kept ? "Keeping" : "Keep"}</button>
              </div>
              <div class="event-meta">${formatCarMeta(offer)}</div>
              <div class="card-footer"><div class="mini-tags"><span class="mini-tag">Slot ${targetSlot + 1}</span><span class="mini-tag">${compareDelta >= 0 ? "+" : ""}${compareDelta} rating</span><span class="mini-tag">${getScrapValue(offer)} Scrap</span></div></div>
              <div class="roll-target-row"><div class="section-label">Replace slot</div><div class="garage-roll-targets">${targetButtons}</div></div>
              <div class="roll-compare-grid"><div class="roll-compare-panel roll-compare-panel-new"><div class="section-label">Rolled machine</div><div class="roll-compare-title">${offer.name}</div><div class="stat-bars compact">${renderStatTiles(offer, currentCar)}</div></div></div>
            ` : `
              <div class="roll-capsule-shell"><div class="roll-capsule-core"></div><div class="section-label">Capsule ${offer.slotIndex + 1}</div><div class="card-meta">Scanning chassis line...</div></div>
            `}
          </div>
        </div>
      `;
    }).join("");
    const scrapPreview = roll.offers.filter((offer) => !roll.keptSlots.includes(offer.slotIndex)).reduce((sum, offer) => sum + getScrapValue(offer), 0);
    const assignedCount = roll.keptSlots.filter((slotIndex) => Number.isInteger(roll.assignments?.[slotIndex])).length;
    refs.garageRollSummary.textContent = roll.status === "revealed"
      ? `Keep the machines worth a slot, then assign each one. Unkept rides sell for ${scrapPreview} Scrap.`
      : "The Foundry is cracking three procedural cars.";
    refs.garageRollConfirmBtn.disabled = roll.status !== "revealed" || !roll.keptSlots.length || assignedCount !== roll.keptSlots.length;
    refs.garageRollConfirmBtn.textContent = roll.status !== "revealed" ? "Revealing..." : `Keep ${roll.keptSlots.length} Car${roll.keptSlots.length === 1 ? "" : "s"}`;
  }

  function updateTutorial() {
    const player = state.player;
    const event = state.currentEvent;
    const shouldGuide = event?.guided && !state.save.settings.tutorialCompleted;
    refs.tutorialCard.classList.toggle("hidden", !shouldGuide);
    if (!shouldGuide || !player) return;
    let copy = "Hold the line into turn one.";
    let step = "Launch";
    if (state.countdown > 0) {
      copy = "Clean launch first. This opener is built to teach impacts, shields, and pickup timing.";
      step = "Start";
    } else if (player.pickup && player.pickupUses < 1) {
      copy = `Use your ${PICKUP_DEFS[player.pickup].label.toLowerCase()} now.`;
      step = "Use it";
    } else if ((player.pickupCollects || 0) < 1 && !player.pickup) {
      copy = "Drive through the bright pickup ahead.";
      step = "Collect";
    } else if (player.destroyedCount < 1) {
      copy = "Push through contact. Scrapes should cost pace before they kill the run.";
      step = "Push";
    } else {
      copy = "Respawns return you with pace and protection. Use that window instantly.";
      step = "Recover";
    }
    refs.tutorialStep.textContent = step;
    refs.tutorialCopy.textContent = copy;
  }

  function syncMenu() {
    route.stage = normalizeMenuStage(state.menuStage);
    route.screen = normalizeMenuScreen(state.menuScreen || state.menuView || route.screen);
    assignRouteSection(route, route.screen, getRouteSection(route, route.screen));
    syncRuntimeMenuState(state, route);
    if (uiState.lastStage !== route.stage || uiState.lastScreen !== route.screen) dismissTooltip();
    uiState.lastStage = route.stage;
    uiState.lastScreen = route.screen;
    const shellModel = deriveShellModel(state, route);
    const screenModel = deriveScreenModel(state, route);
    renderOverlays(refs, route);
    renderShell(refs, shellModel, route);
    renderActiveScreen(refs, state, route, screenModel);
    renderGarageRoll();
    syncVisualSettings();
    syncSettingsInputs();
    updateMenuScale();
  }

  function updateHud() {
    if (!state.currentEvent || !state.player) return;
    const player = state.player;
    refs.eventName.textContent = state.currentEvent.name;
    refs.eventMeta.textContent = getLiveGoal(state, player);
    refs.placePill.textContent = `P${player.place}`;
    refs.progressRing.textContent = state.track.type === "circuit"
      ? `Lap ${Math.min(player.currentLap, state.currentEvent.laps)} / ${state.currentEvent.laps}`
      : `${Math.round((player.progress || 0) * 100)}% to finish`;
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
    const legacyPanes = getLegacyPaneState(route);
    const effectiveStage = !refs.results.classList.contains("hidden")
      ? "results"
      : !refs.pause.classList.contains("hidden")
        ? "pause"
        : state.garageRoll
          ? "garageRoll"
          : route.stage;
    return JSON.stringify({
      coordinateSystem: "world origin near track center, +x right, +y down",
      mode: state.mode,
      menuStage: effectiveStage,
      menuScreen: route.screen,
      menuSection: getRouteSection(route),
      menuView: state.menuView || getLegacyMenuView(route.screen),
      ...legacyPanes,
      homeBoardPage: route.boardPage,
      stylePage: route.stylePage,
      resultsPane: uiState.resultsPane,
      bindingAction: state.bindingAction || null,
      selectedEvent: selectedEvent?.name || null,
      selectedEventSeed: selectedEvent?.seed ?? null,
      selectedCar: state.selectedCarId,
      wallet: { flux: getCurrencyBalance(state.save, "flux"), scrap: getCurrencyBalance(state.save, "scrap") },
      garageRoll: state.garageRoll ? { status: state.garageRoll.status, keptSlots: state.garageRoll.keptSlots, revealedSlots: state.garageRoll.revealedSlots, assignments: state.garageRoll.assignments } : null,
      menuIntro: refs.menuIntro.textContent,
      tooltip: !refs.tooltip.classList.contains("hidden") ? { text: refs.tooltip.textContent, mode: refs.tooltip.dataset.mode || null } : null,
      currentEvent: state.currentEvent ? { name: state.currentEvent.name, type: state.currentEvent.type, seed: state.currentEvent.seed, theme: state.currentEvent.biomeId, laps: state.currentEvent.laps } : null,
      rivalStatus: state.rivalStatus ? { phase: state.rivalStatus.phase, text: state.rivalStatus.text, tone: state.rivalStatus.tone } : null,
      hud: state.mode === "race" || state.mode === "results" || state.mode === "paused" ? {
        goal: refs.eventMeta.textContent,
        pickup: refs.pickupChip.textContent,
        assist: refs.assistChip.textContent,
        flow: refs.slipstreamChip.textContent,
        ghost: getGhostState(state).text,
      } : null,
      pause: !refs.pause.classList.contains("hidden") ? { goal: refs.pauseGoal.textContent, meta: refs.pauseMeta.textContent } : null,
      results: !refs.results.classList.contains("hidden") ? { title: refs.resultsTitle.textContent, note: refs.resultsNote.textContent, next: refs.resultsNext.textContent, pane: uiState.resultsPane } : null,
      banner: refs.banner.textContent,
      countdown: Number(Math.max(0, state.countdown).toFixed(2)),
      tutorial: !refs.tutorialCard.classList.contains("hidden") ? refs.tutorialCopy.textContent : null,
    });
  }

  function closestButtonTarget(target) {
    return target instanceof Element ? target.closest("button") : null;
  }

  function closestTooltipButton(target) {
    return target instanceof Element ? target.closest(".info-btn[data-tooltip]") : null;
  }

  function closestStyleCard(target) {
    return target instanceof Element ? target.closest(".style-card[data-style-id]") : null;
  }

  function updateStylePreview(nextItemId = null) {
    const normalized = typeof nextItemId === "string" ? nextItemId : null;
    if (route.stylePreviewItemId === normalized) return;
    route.stylePreviewItemId = normalized;
    if (route.screen !== "style") return;
    const previewHost = getScreenEl("equipped-style");
    if (!previewHost) return;
    previewHost.innerHTML = renderStylePreviewCards(deriveScreenModel(state, route));
    refs.hubScreen.querySelectorAll(".style-card").forEach((card) => {
      card.classList.toggle("previewing", card.dataset.styleId === route.stylePreviewItemId);
    });
    updateMenuScale();
  }

  refs.splashStartBtn?.addEventListener("click", () => callbacks.onEnterGarage?.());
  refs.pauseResume.addEventListener("click", () => callbacks.onPauseResume?.());
  refs.pauseRetry.addEventListener("click", () => callbacks.onPauseRetry?.());
  refs.pauseMenu.addEventListener("click", () => callbacks.onPauseMenu?.());
  refs.pauseVolume.addEventListener("input", (event) => callbacks.onSettingChange?.("masterVolume", Number(event.target.value) / 100));
  refs.pauseMute.addEventListener("change", (event) => callbacks.onSettingChange?.("muted", event.target.checked));
  refs.pauseShake.addEventListener("change", (event) => callbacks.onSettingChange?.("reducedShake", event.target.checked));
  refs.pauseAssist.addEventListener("change", (event) => callbacks.onSettingChange?.("assistLevel", event.target.value));
  refs.resultsRetry.addEventListener("click", () => callbacks.onRetry?.());
  refs.resultsMenu.addEventListener("click", () => callbacks.onBackToMenu?.());
  refs.resultsTabSummary.addEventListener("click", () => setResultsPane("summary"));
  refs.resultsTabTiming.addEventListener("click", () => setResultsPane("timing"));
  refs.resultsTabField.addEventListener("click", () => setResultsPane("field"));
  refs.menuTabHome?.addEventListener("click", () => setRouteScreen("race"));
  refs.menuTabProfile?.addEventListener("click", () => setRouteScreen("garage"));
  refs.menuTabSettings?.addEventListener("click", () => setRouteScreen("settings"));
  refs.hubSubnav?.addEventListener("click", (event) => {
    const target = closestButtonTarget(event.target);
    if (target?.dataset.routeScreen) {
      setRouteScreen(target.dataset.routeScreen);
      return;
    }
    if (!target?.dataset.routeSection) return;
    setRouteSection(target.dataset.routeSection);
  });
  refs.garageRollConfirmBtn?.addEventListener("click", () => callbacks.onGarageRollConfirm?.());

  refs.hubScreen.addEventListener("click", (event) => {
    const target = closestButtonTarget(event.target);
    if (!target) return;
    if (target.dataset.routeScreen) {
      setRouteScreen(target.dataset.routeScreen);
      return;
    }
    if (target.dataset.routeSection) {
      setRouteSection(target.dataset.routeSection);
      return;
    }
    const eventCard = target.closest(".event-card");
    if (eventCard?.dataset.eventIndex) {
      callbacks.onEventSelect?.(Number(eventCard.dataset.eventIndex));
      return;
    }
    if (target.id === "launch-btn") callbacks.onStartSelected?.();
    if (target.id === "daily-btn") callbacks.onStartDaily?.();
    if (target.id === "quick-race-btn") callbacks.onQuickRace?.();
    if (target.id === "board-reroll-btn") callbacks.onBoardReroll?.();
    if (target.id === "event-custom-seed-apply") callbacks.onCustomCourseSeedApply?.(getScreenEl("event-custom-seed")?.value);
    if (target.id === "event-custom-seed-clear") callbacks.onCustomCourseSeedClear?.();
    if (target.id === "home-board-prev") {
      route.boardPage = Math.max(0, (route.boardPage ?? 0) - 1);
      assignRouteSection(route, "race", "board");
      syncMenu();
    }
    if (target.id === "home-board-next") {
      route.boardPage = (route.boardPage ?? 0) + 1;
      assignRouteSection(route, "race", "board");
      syncMenu();
    }
    if (target.dataset.carId) callbacks.onCarSelect?.(target.dataset.carId);
    if (target.id === "garage-roll-btn") callbacks.onGarageRollStart?.();
    if (target.dataset.styleSlot) {
      route.styleSlot = target.dataset.styleSlot;
      route.stylePage = 0;
      route.stylePreviewItemId = null;
      syncMenu();
    }
    if (target.dataset.stylePageNav) {
      route.stylePage = Math.max(0, (route.stylePage || 0) + Number(target.dataset.stylePageNav));
      route.stylePreviewItemId = null;
      syncMenu();
    }
    if (target.dataset.styleId && target.dataset.styleAction === "buy") callbacks.onCosmeticBuy?.(target.dataset.styleId);
    if (target.dataset.styleId && target.dataset.styleAction === "equip") callbacks.onCosmeticEquip?.(target.dataset.styleId);
    if (target.classList.contains("binding-btn") && target.dataset.action) callbacks.onBindingStart?.(target.dataset.action);
    if (target.dataset.rollSlot && target.dataset.rollTarget) callbacks.onGarageRollAssign?.(Number(target.dataset.rollSlot), Number(target.dataset.rollTarget));
    if (target.dataset.rollSlot && !target.dataset.rollTarget) callbacks.onGarageRollToggle?.(Number(target.dataset.rollSlot));
  });

  refs.hubScreen.addEventListener("input", (event) => {
    const target = event.target;
    if (target.id === "settings-volume") callbacks.onSettingChange?.("masterVolume", Number(target.value) / 100);
  });
  refs.hubScreen.addEventListener("pointerover", (event) => {
    const card = closestStyleCard(event.target);
    if (!card) return;
    const previousCard = closestStyleCard(event.relatedTarget);
    if (previousCard === card) return;
    updateStylePreview(card.dataset.styleId);
  });
  refs.hubScreen.addEventListener("pointerout", (event) => {
    const card = closestStyleCard(event.target);
    if (!card) return;
    const nextCard = closestStyleCard(event.relatedTarget);
    if (nextCard === card) return;
    updateStylePreview(null);
  });
  refs.hubScreen.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "settings-mute") callbacks.onSettingChange?.("muted", target.checked);
    if (target.id === "settings-shake") callbacks.onSettingChange?.("reducedShake", target.checked);
    if (target.id === "settings-contrast") callbacks.onSettingChange?.("highContrast", target.checked);
    if (target.id === "settings-assist") callbacks.onSettingChange?.("assistLevel", target.value);
    if (target.id === "settings-control-mode") callbacks.onSettingChange?.("controlMode", target.value);
  });
  refs.hubScreen.addEventListener("keydown", (event) => {
    if (event.target.id === "event-custom-seed" && event.key === "Enter") {
      event.preventDefault();
      callbacks.onCustomCourseSeedApply?.(event.target.value);
    }
  });
  refs.hubScreen.addEventListener("focusin", (event) => {
    const card = closestStyleCard(event.target);
    if (card) updateStylePreview(card.dataset.styleId);
  });
  refs.hubScreen.addEventListener("focusout", (event) => {
    const card = closestStyleCard(event.target);
    if (!card) return;
    const nextCard = closestStyleCard(event.relatedTarget);
    if (nextCard === card) return;
    updateStylePreview(null);
  });

  document.addEventListener("pointerenter", (event) => {
    const button = closestTooltipButton(event.target);
    if (button) scheduleTooltip(button);
  }, true);
  document.addEventListener("pointerleave", (event) => {
    const button = closestTooltipButton(event.target);
    if (!button) return;
    clearTooltipTimer();
    if (uiState.tooltipMode === "hover" && uiState.tooltipButton === button) dismissTooltip();
  }, true);
  document.addEventListener("focusin", (event) => {
    const button = closestTooltipButton(event.target);
    if (button) scheduleTooltip(button);
  });
  document.addEventListener("focusout", (event) => {
    const button = closestTooltipButton(event.target);
    if (!button) return;
    clearTooltipTimer();
    if (uiState.tooltipMode === "hover" && uiState.tooltipButton === button) dismissTooltip();
  });
  document.addEventListener("click", (event) => {
    const button = closestTooltipButton(event.target);
    if (!button) {
      if (uiState.tooltipMode === "click") dismissTooltip();
      return;
    }
    event.stopPropagation();
    if (uiState.tooltipMode === "click" && uiState.tooltipButton === button) {
      dismissTooltip();
      return;
    }
    showTooltip(button, "click");
  });
  window.addEventListener("resize", handleViewportResize);

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

export { buildRunSummary } from "./legacy.js";
