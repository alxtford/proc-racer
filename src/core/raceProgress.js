import { clamp } from "./utils.js";

function getCheckpointCount(track) {
  return Math.max(1, track?.checkpoints?.length || 1);
}

function getProgressUnitScale(track) {
  const checkpointCount = getCheckpointCount(track);
  return track?.type === "sprint" ? Math.max(1, checkpointCount - 1) : checkpointCount;
}

function getNormalizedProgress(progress) {
  return clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
}

export function getTrackRaceUnits(state) {
  const unitScale = getProgressUnitScale(state.track);
  return state.track?.type === "circuit"
    ? Math.max(1, (state.currentEvent?.laps || 1) * unitScale)
    : unitScale;
}

export function getCarRaceUnits(state, car) {
  const unitScale = getProgressUnitScale(state.track);
  const progressUnits = getNormalizedProgress(car.progress) * unitScale;
  if (state.track?.type === "circuit") {
    return Math.max(0, (Math.max(1, car.currentLap) - 1) * unitScale + progressUnits);
  }
  return Math.max(0, progressUnits);
}
