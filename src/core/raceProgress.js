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

export function getRelativeTrackProgress(track, rawT) {
  if (!track) return 0;
  if (track.type === "circuit") return ((rawT - (track.startT ?? 0) + 1) % 1 + 1) % 1;
  const startT = track.startT ?? 0;
  const finishT = track.finishT ?? 1;
  return clamp((rawT - startT) / Math.max(0.001, finishT - startT), 0, 1);
}

export function getCheckpointBoundedProgress(track, car, rawT) {
  const relativeProgress = getRelativeTrackProgress(track, rawT);
  if (!track || !car) return relativeProgress;
  if (car.startLineCleared === false) return 0;
  const checkpointCount = getCheckpointCount(track);
  if (checkpointCount < 2) return relativeProgress;
  const maxCheckpointIndex = track.type === "circuit"
    ? checkpointCount - 1
    : Math.max(0, checkpointCount - 1);
  const checkpointIndex = clamp(
    Number.isFinite(car.checkpointIndex) ? car.checkpointIndex : 0,
    0,
    maxCheckpointIndex,
  );
  const segmentSize = track.type === "circuit"
    ? 1 / checkpointCount
    : 1 / Math.max(1, checkpointCount - 1);
  const segmentStart = checkpointIndex * segmentSize;
  if (track.type === "circuit" && checkpointIndex === checkpointCount - 1) {
    return clamp(relativeProgress < segmentStart ? 1 : relativeProgress, segmentStart, 1);
  }
  const nextIndex = Math.min(maxCheckpointIndex, checkpointIndex + 1);
  const segmentEnd = clamp(nextIndex * segmentSize, segmentStart, 1);
  if (segmentEnd <= segmentStart + 0.000001) return segmentStart;
  return clamp(relativeProgress, segmentStart, segmentEnd);
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
