import { COURSE_REROLL_COST, getCurrencyBalance } from "../../economy.js";
import { BIOME_DEFS } from "../../../data/content.js";
import {
  HOME_BOARD_PAGE_SIZE,
  formatCourseSeed,
  getBoardRerollLabel,
  getDisplayEvent,
  getDisplayedEvents,
  getEventBadge,
  getEventReason,
  getEventResult,
  getEventUtilityStatus,
  getFocusTags,
  getGhostReady,
  getHeroDailyCopy,
  getHeroNextCopy,
  getHeroRecoveryCopy,
  getLaunchHint,
  getPrimaryGoal,
  getQuickLabel,
  getReplayHook,
  getSavedCustomCourseSeed,
  getStartLabel,
  getStoredMedal,
  supportsCustomCourseSeed,
} from "../legacy.js";
import { formatTime } from "../../utils.js";

function clampPage(page, pageCount) {
  return Math.max(0, Math.min(pageCount - 1, Number.isInteger(page) ? page : 0));
}

export function buildRaceModel(state, route) {
  const baseEvent = state.events[state.selectedEventIndex] || null;
  const event = baseEvent ? getDisplayEvent(state, baseEvent) : null;
  const eventResult = event ? getEventResult(state, event) : null;
  const displayedEvents = getDisplayedEvents(state);
  const selectedIndex = Math.max(0, displayedEvents.findIndex((item) => item.id === baseEvent?.id));
  const selectedPage = Math.floor(selectedIndex / HOME_BOARD_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(displayedEvents.length / HOME_BOARD_PAGE_SIZE));
  const currentPage = clampPage(route.boardPage ?? selectedPage, pageCount);
  const visibleEvents = displayedEvents
    .slice(currentPage * HOME_BOARD_PAGE_SIZE, (currentPage + 1) * HOME_BOARD_PAGE_SIZE)
    .map((item) => {
      const displayItem = getDisplayEvent(state, item);
      const cardResult = getEventResult(state, displayItem);
      const eventIndex = state.events.findIndex((candidate) => candidate.id === item.id);
      return {
        id: item.id,
        eventIndex,
        selected: eventIndex === state.selectedEventIndex,
        kind: item.daily ? "daily" : item.guided ? "guided" : "event",
        name: displayItem.name,
        badge: getEventBadge(state, displayItem),
        meta: `${displayItem.guided ? "~1:12" : `~${formatTime(displayItem.parTime)}`} // ${formatCourseSeed(displayItem.seed)}`,
        goal: getPrimaryGoal(displayItem),
        cardTags: [
          getStoredMedal(cardResult)
            ? `${getStoredMedal(cardResult)} banked`
            : cardResult?.bestTime
              ? `Best ${formatTime(cardResult.bestTime)}`
              : "Fresh run",
          displayItem.daily ? "Gauntlet" : BIOME_DEFS[displayItem.biomeId]?.name || "Biome",
          displayItem.customSeed ? formatCourseSeed(displayItem.seed) : null,
          getGhostReady(state, displayItem) ? "Ghost" : null,
        ].filter(Boolean),
      };
    });
  const savedCustomSeed = baseEvent ? getSavedCustomCourseSeed(state, baseEvent) : null;
  return {
    type: "race",
    baseEvent,
    event,
    eventResult,
    selectedPage,
    currentPage,
    pageCount,
    visibleEvents,
    startLabel: event ? getStartLabel(state, event) : "Hit The Grid",
    dailyLabel: getQuickLabel(state).includes("Daily") ? getQuickLabel(state) : "Run Daily Gauntlet",
    quickLabel: getQuickLabel(state),
    launchHint: getLaunchHint(state),
    rerollLabel: getBoardRerollLabel(state),
    rerollDisabled: Boolean(state.garageRoll) || getCurrencyBalance(state.save, "flux") < COURSE_REROLL_COST,
    customSeedEnabled: supportsCustomCourseSeed(baseEvent),
    customSeedValue: savedCustomSeed !== null ? String(savedCustomSeed) : "",
    customSeedPlaceholder: event ? String(event.seed) : "Seed",
    customSeedApplyLabel: savedCustomSeed !== null ? "Update Seed" : "Lock Seed",
    customSeedClearDisabled: savedCustomSeed === null,
    customSeedNote: !baseEvent
      ? "Select an event to pin a replay seed."
      : !supportsCustomCourseSeed(baseEvent)
        ? "Daily gauntlets stay locked to today's seed."
        : savedCustomSeed === null
          ? "Pin a favourite seed to keep replaying the same line after the board shifts."
          : event?.customSeedMatchesBoard
            ? "Replay seed locked. This line currently matches the live board."
            : "Replay seed locked. PBs and ghosts now track this favourite line separately.",
    hero: event ? {
      title: event.name,
      badge: getEventBadge(state, event),
      meta: `${event.guided ? "~1:12" : `~${formatTime(event.parTime)}`} // ${formatCourseSeed(event.seed)} // Goal: ${getPrimaryGoal(event).toLowerCase()}`,
      copy: getEventReason(state, event, eventResult),
      tags: getFocusTags(state, event, eventResult),
      ghostStatus: getGhostReady(state, event) ? "Ghost ready" : "Ghost cold",
      utilityStatus: event.customSeed ? "Replay seed pinned" : getEventUtilityStatus(state, event),
      nextCopy: getHeroNextCopy(state, event),
      recoveryCopy: getHeroRecoveryCopy(state),
      replayCopy: getReplayHook(state, event),
      dailyCopy: getHeroDailyCopy(state),
    } : null,
  };
}
