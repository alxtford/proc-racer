import { getCurrencyBalance } from "../../economy.js";
import { GARAGE_ROLL_COST } from "../../garage.js";
import { formatTime } from "../../utils.js";

function formatGain(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  return formatTime(Math.abs(seconds));
}

function getRunHistoryEventName(state, run) {
  const normalizedEventId = typeof run.eventId === "string" ? run.eventId.split("@board:")[0] : run.eventId;
  return run.eventName
    || state.events.find((event) => event.id === run.eventId || event.id === normalizedEventId || event.templateId === normalizedEventId)?.name
    || normalizedEventId
    || run.eventId
    || "Unknown route";
}

function averageMetric(runs, getValue) {
  const values = runs.map(getValue).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countRunsMatching(runs, predicate) {
  return runs.filter(predicate).length;
}

function formatTrendNote(current, previous, formatter, fasterIsBetter = false) {
  if (current === null) return "No completed runs logged yet.";
  if (previous === null) return "Need 10 logged runs to compare momentum.";
  if (Math.abs(current - previous) < 0.01) return "Holding steady against the previous five.";
  const improved = fasterIsBetter ? current < previous : current > previous;
  const delta = formatter(Math.abs(current - previous));
  return improved
    ? `${delta} better than the previous five.`
    : `${delta} worse than the previous five.`;
}

function buildTrendSummary(state) {
  const history = state.save.runHistory || [];
  const recentWindow = history.slice(0, 5);
  const previousWindow = history.slice(5, 10);
  const latestRun = history[0] || null;
  const totalPodiums = countRunsMatching(history, (run) => Number.isFinite(run.place) && run.place <= 3);
  const totalWins = countRunsMatching(history, (run) => run.place === 1);
  const paceAverage = averageMetric(recentWindow, (run) => run.finishTime);
  const previousPaceAverage = averageMetric(previousWindow, (run) => run.finishTime);
  const wreckAverage = averageMetric(recentWindow, (run) => run.wrecks);
  const previousWreckAverage = averageMetric(previousWindow, (run) => run.wrecks);
  const fluxAverage = averageMetric(recentWindow, (run) => run.currencyEarned || 0);
  const previousFluxAverage = averageMetric(previousWindow, (run) => run.currencyEarned || 0);

  return [
    {
      label: "Pressure Log",
      value: history.length ? `${history.length} runs` : "No runs",
      note: history.length
        ? `${totalPodiums} podiums, ${totalWins} wins. Latest: ${latestRun ? getRunHistoryEventName(state, latestRun) : "Unknown route"}.`
        : "Finish any event to start building the pressure log.",
    },
    {
      label: "Pace Window",
      value: paceAverage !== null ? formatTime(paceAverage) : "--",
      note: paceAverage !== null
        ? `Last five average. ${formatTrendNote(paceAverage, previousPaceAverage, formatGain, true)}`
        : "Log finishes to compare current pace against older runs.",
    },
    {
      label: "Wreck Rate",
      value: wreckAverage !== null ? `${wreckAverage.toFixed(wreckAverage >= 10 ? 0 : 1)} / run` : "--",
      note: wreckAverage !== null
        ? `Last five average. ${formatTrendNote(wreckAverage, previousWreckAverage, (value) => `${value.toFixed(value >= 10 ? 0 : 1)} wrecks`, true)}`
        : "Take a few runs to see whether the field is chewing the chassis up.",
    },
    {
      label: "Flux Flow",
      value: fluxAverage !== null ? `+${Math.round(fluxAverage)} / run` : "--",
      note: fluxAverage !== null
        ? `Last five average. ${formatTrendNote(fluxAverage, previousFluxAverage, (value) => `${Math.round(value)} Flux`)}`
        : "Reward flow appears once the pressure log has completed runs.",
    },
  ];
}

function buildRunHistory(state) {
  const history = state.save.runHistory || [];
  if (!history.length) {
    return [
      {
        kind: "fallback",
        title: "Daily killline",
        detail: state.save.daily.bestTime ? `Beat ${formatTime(state.save.daily.bestTime)}` : "Plant the first gauntlet time.",
      },
      {
        kind: "fallback",
        title: "Foundry target",
        detail: `${Math.max(0, GARAGE_ROLL_COST - getCurrencyBalance(state.save, "flux"))} Flux to the next pull.`,
      },
      {
        kind: "fallback",
        title: "First pressure log",
        detail: "Finish any run to bank pace, wreck, and reward trends here.",
      },
    ];
  }

  return history.map((run, index) => {
    const eventName = getRunHistoryEventName(state, run);
    const eventLabel = eventName.length > 26 ? `${eventName.slice(0, 25)}...` : eventName;
    const placeLabel = Number.isFinite(run.place) ? `P${run.place}` : "P--";
    const wreckCount = Number.isFinite(run.wrecks) ? run.wrecks : 0;
    const wreckLabel = `${wreckCount} wreck${wreckCount === 1 ? "" : "s"}`;
    const fluxLabel = `+${run.currencyEarned || 0} Flux`;
    const lapLabel = Number.isFinite(run.bestLapTime) ? `Lap ${formatTime(run.bestLapTime)}` : "Lap --";
    return {
      kind: "entry",
      orderLabel: String(index + 1).padStart(2, "0"),
      eventLabel,
      finishTime: formatTime(run.finishTime),
      detail: `${placeLabel} // ${wreckLabel} // ${fluxLabel} // ${lapLabel}`,
    };
  });
}

export function buildCareerModel(state) {
  const history = state.save.runHistory || [];
  return {
    type: "career",
    summary: buildTrendSummary(state),
    historyCountLabel: history.length ? `${history.length} logged` : "Waiting for first finish",
    runHistory: buildRunHistory(state),
  };
}
