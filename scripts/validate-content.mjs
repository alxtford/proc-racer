import { buildTrack } from "../src/core/generator.js";
import { EVENT_TEMPLATES, createDailyEvent } from "../src/data/content.js";

const events = [...EVENT_TEMPLATES, createDailyEvent(new Date("2026-03-21T00:00:00Z"))];
const requiredTags = ["high-speed", "technical", "recovery", "hazard"];
const maxSummaryLength = 72;
const failures = [];

for (const event of events) {
  const track = buildTrack(event);
  const tags = new Set(track.sectors.map((sector) => sector.tag));

  if (track.points.length < 40) failures.push(`${event.id}: track too short`);
  if (track.checkpoints.length < 6) failures.push(`${event.id}: not enough checkpoints`);
  if (!track.safeRespawnNodes.length) failures.push(`${event.id}: no safe respawn nodes`);
  if ((event.summary || "").length > maxSummaryLength) {
    failures.push(`${event.id}: summary exceeds ${maxSummaryLength} characters`);
  }

  for (const tag of requiredTags) {
    if (!tags.has(tag)) failures.push(`${event.id}: missing sector tag ${tag}`);
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
  }
}

if (failures.length) {
  console.error("Content validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated ${events.length} events with seeded track generation.`);
