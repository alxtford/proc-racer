import { formatTime } from "../../utils.js";
import { getProfileSummaryItems } from "../legacy.js";

export function buildCareerModel(state) {
  const recentRuns = state.save.runHistory.slice(0, 4).map((run) => ({
    eventName: run.eventName || run.eventId,
    place: run.place,
    finishTime: formatTime(run.finishTime),
    reward: run.currencyEarned || 0,
    wrecks: run.wrecks,
  }));
  return {
    type: "career",
    summary: getProfileSummaryItems(state),
    recentRuns,
  };
}
