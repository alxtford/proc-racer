import { buildTrack } from "../src/core/generator.js";
import { EVENT_TEMPLATES, createDailyEvent } from "../src/data/content.js";

const events = [...EVENT_TEMPLATES, createDailyEvent(new Date("2026-03-21T00:00:00Z"))];
const requiredTags = ["high-speed", "technical", "recovery", "hazard"];
const maxSummaryLength = 72;
const raceTimeLimits = {
  min: 30,
  max: 105,
};
const maxCornerByType = {
  circuit: 1.22,
  sprint: 1.08,
};
const failures = [];

for (const event of events) {
  const track = buildTrack(event);
  const repeatTrack = buildTrack(event);
  const tags = new Set(track.sectors.map((sector) => sector.tag));

  if (track.points.length < 40) failures.push(`${event.id}: track too short`);
  if (track.checkpoints.length < 6) failures.push(`${event.id}: not enough checkpoints`);
  if (!track.safeRespawnNodes.length) failures.push(`${event.id}: no safe respawn nodes`);
  if (!track.elevationSamples?.length) failures.push(`${event.id}: missing elevation samples`);
  if (!track.landmarkAnchors?.length) failures.push(`${event.id}: missing landmark anchors`);
  if ((event.summary || "").length > maxSummaryLength) {
    failures.push(`${event.id}: summary exceeds ${maxSummaryLength} characters`);
  }
  if (!track.metrics) failures.push(`${event.id}: missing geometry metrics`);

  for (const tag of requiredTags) {
    if (!tags.has(tag)) failures.push(`${event.id}: missing sector tag ${tag}`);
  }

  if (track.metrics) {
    if (track.metrics.estimatedRaceTime < raceTimeLimits.min || track.metrics.estimatedRaceTime > raceTimeLimits.max) {
      failures.push(`${event.id}: estimated race time out of bounds (${track.metrics.estimatedRaceTime.toFixed(1)}s)`);
    }
    if (track.metrics.minSegmentLength < (event.type === "circuit" ? 20 : 24)) {
      failures.push(`${event.id}: segment spacing too tight (${track.metrics.minSegmentLength.toFixed(1)})`);
    }
    if (track.metrics.maxCornerAngle > maxCornerByType[event.type]) {
      failures.push(`${event.id}: corner angle too sharp (${track.metrics.maxCornerAngle.toFixed(2)} rad)`);
    }
    if (track.metrics.backToBackSharp > (event.type === "circuit" ? 2 : 3)) {
      failures.push(`${event.id}: too many back-to-back sharp corners (${track.metrics.backToBackSharp})`);
    }
    if (track.metrics.softSwitchbacks > 4) {
      failures.push(`${event.id}: too many soft switchbacks (${track.metrics.softSwitchbacks})`);
    }
    if (track.metrics.turnSwitches >= 3 && track.metrics.switchbackCandidates < 1) {
      failures.push(`${event.id}: switchback pattern is too soft (${track.metrics.turnSwitches} raw switches, ${track.metrics.switchbackCandidates} committed)`);
    }
  }

  if (track.heightRange) {
    const heightSpan = track.heightRange.max - track.heightRange.min;
    if (heightSpan < 24) failures.push(`${event.id}: elevation too flat (${heightSpan.toFixed(1)})`);
    if (heightSpan > 220) failures.push(`${event.id}: elevation too extreme (${heightSpan.toFixed(1)})`);
  }

  const steepSample = (track.elevationSamples || []).find((sample) => Math.abs(sample.grade || 0) > 0.28);
  if (steepSample) failures.push(`${event.id}: grade too steep at t=${steepSample.t.toFixed(2)} (${steepSample.grade.toFixed(2)})`);

  const highBank = (track.elevationSamples || []).find((sample) => Math.abs(sample.bank || 0) > track.width * 0.16);
  if (highBank) failures.push(`${event.id}: bank too aggressive at t=${highBank.t.toFixed(2)} (${highBank.bank.toFixed(1)})`);

  const deterministicMismatch = track.elevationSamples?.some((sample, index) => {
    const repeat = repeatTrack.elevationSamples?.[index];
    return !repeat || Math.abs((sample.height || 0) - (repeat.height || 0)) > 0.001 || Math.abs((sample.bank || 0) - (repeat.bank || 0)) > 0.001;
  });
  if (deterministicMismatch) failures.push(`${event.id}: elevation profile is not deterministic`);

  const sectorTurns = track.sectors.map((sector) => sector.avgTurn || 0);
  const sectorSpread = Math.max(...sectorTurns) - Math.min(...sectorTurns);
  if (sectorSpread < 0.08) failures.push(`${event.id}: sector turn spread too flat (${sectorSpread.toFixed(2)})`);
  const highSpeedAverage = track.sectors.filter((sector) => sector.tag === "high-speed").reduce((sum, sector) => sum + (sector.avgTurn || 0), 0) / Math.max(1, track.sectors.filter((sector) => sector.tag === "high-speed").length);
  const technicalAverage = track.sectors.filter((sector) => sector.tag === "technical").reduce((sum, sector) => sum + (sector.avgTurn || 0), 0) / Math.max(1, track.sectors.filter((sector) => sector.tag === "technical").length);
  if (highSpeedAverage >= technicalAverage) {
    failures.push(`${event.id}: sector ordering does not separate high-speed from technical geometry`);
  }

  if (event.guided && track.hazards.length > 0) {
    failures.push(`${event.id}: guided event spawned hazards`);
  }

  const nearestCheckpointGap = Math.min(...track.checkpoints.map((checkpoint) => Math.hypot(track.start.x - checkpoint.x, track.start.y - checkpoint.y)));
  if (nearestCheckpointGap > track.width * 2.5) failures.push(`${event.id}: start too far from checkpoint chain`);

  for (const pickup of track.pickups) {
    if (!["boost", "pulse", "shield"].includes(pickup.kind)) {
      failures.push(`${event.id}: unknown pickup ${pickup.kind}`);
    }
    if (!Number.isFinite(pickup.z)) failures.push(`${event.id}: pickup missing z`);
  }

  for (const prop of track.props) {
    const nearest = track.points.reduce((best, point) => {
      const gap = Math.hypot(prop.x - point.x, prop.y - point.y);
      return gap < best ? gap : best;
    }, Infinity);
    if (nearest < track.width * 0.56) failures.push(`${event.id}: prop too close to road corridor (${nearest.toFixed(1)})`);
  }
}

if (failures.length) {
  console.error("Content validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated ${events.length} events with seeded track generation.`);
