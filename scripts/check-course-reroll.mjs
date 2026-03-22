import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { waitForMenuStage } from "./menu-helpers.mjs";

const outDir = path.resolve("output");
const BASE_URL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => window.localStorage.clear());

const errors = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (text.includes("The AudioContext encountered an error from the audio device or the WebAudio renderer.")) return;
  errors.push(`console: ${text}`);
});

await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(400);
await page.click("#start-btn");
await waitForMenuStage(page, "hub");
await page.waitForSelector("#board-reroll-btn:not(.hidden)");

const initialState = await page.evaluate(() => ({
  wallet: window.__procRacer.save.wallet,
  strikeBoard: window.__procRacer.save.strikeBoard,
  events: window.__procRacer.events
    .filter((event) => !event.guided && !event.daily)
    .map((event) => ({ id: event.id, seed: event.seed })),
  dailyId: window.__procRacer.events.find((event) => event.daily)?.id || null,
}));

await page.click("#board-reroll-btn");
await page.waitForTimeout(220);

const rerolledState = await page.evaluate(() => ({
  wallet: window.__procRacer.save.wallet,
  strikeBoard: window.__procRacer.save.strikeBoard,
  events: window.__procRacer.events
    .filter((event) => !event.guided && !event.daily)
    .map((event) => ({ id: event.id, seed: event.seed })),
  dailyId: window.__procRacer.events.find((event) => event.daily)?.id || null,
}));

await page.screenshot({ path: path.join(outDir, "course-reroll.png") });
await fs.writeFile(path.join(outDir, "course-reroll.json"), JSON.stringify({
  errors,
  initialState,
  rerolledState,
}, null, 2));

await browser.close();

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (initialState.wallet.flux !== 220) {
  console.error(`Expected fresh save Flux to start at 220, got ${initialState.wallet.flux}.`);
  process.exit(1);
}

if (rerolledState.wallet.flux !== 190) {
  console.error(`Expected 190 Flux after a course reroll, got ${rerolledState.wallet.flux}.`);
  process.exit(1);
}

if ((rerolledState.strikeBoard?.rerolls || 0) !== 1) {
  console.error(`Expected strike board rerolls to be 1, got ${rerolledState.strikeBoard?.rerolls ?? "missing"}.`);
  process.exit(1);
}

if (!rerolledState.events.every((event) => event.id.includes("@board:"))) {
  console.error("Expected all non-daily events to become board-scoped after reroll.");
  process.exit(1);
}

if (JSON.stringify(initialState.events) === JSON.stringify(rerolledState.events)) {
  console.error("Expected the strike board events to change after reroll.");
  process.exit(1);
}

if (initialState.dailyId !== rerolledState.dailyId) {
  console.error("Daily event should not change when the strike board is rerolled.");
  process.exit(1);
}

console.log(JSON.stringify({
  errors,
  initialState,
  rerolledState,
}, null, 2));
