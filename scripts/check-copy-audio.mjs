import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

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
await page.waitForTimeout(350);
await page.click("#start-btn");
await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
await page.screenshot({ path: path.join(outDir, "check-copy-menu.png") });

await page.click("#menu-overview-info");
await page.waitForSelector("#ui-tooltip:not(.hidden)");
const clickTooltip = await page.evaluate(() => {
  const tooltip = document.getElementById("ui-tooltip");
  return {
    text: tooltip?.textContent || "",
    mode: tooltip?.dataset.mode || null,
    visible: tooltip ? !tooltip.classList.contains("hidden") : false,
  };
});
await page.mouse.click(14, 14);
await page.hover("#event-info-btn");
await page.waitForTimeout(3100);
const hoverTooltip = await page.evaluate(() => {
  const tooltip = document.getElementById("ui-tooltip");
  return {
    text: tooltip?.textContent || "",
    mode: tooltip?.dataset.mode || null,
    visible: tooltip ? !tooltip.classList.contains("hidden") : false,
  };
});
await page.mouse.move(14, 14);
await page.waitForTimeout(120);
const hoverTooltipAfterLeave = await page.evaluate(() => {
  const tooltip = document.getElementById("ui-tooltip");
  return tooltip ? !tooltip.classList.contains("hidden") : false;
});

const copyMetrics = await page.evaluate(() => {
  const longSummary = "This is an intentionally extended course description used to verify that overflow is clamped, wrapped, and line-limited even when authors accidentally paste far too much copy into the spotlight area.";
  window.__procRacer.events[1].summary = longSummary;
  window.__procRacer.selectedEventIndex = 1;
  window.__procRacerUi.syncMenu();
  const el = document.getElementById("event-focus-copy");
  const stack = el?.closest(".focus-copy-stack");
  return {
    renderedText: el?.textContent || "",
    renderedLength: el?.textContent?.length || 0,
    title: el?.title || "",
    elScrollHeight: el?.scrollHeight || 0,
    elClientHeight: el?.clientHeight || 0,
    stackScrollHeight: stack?.scrollHeight || 0,
    stackClientHeight: stack?.clientHeight || 0,
    overflow: Boolean(el && el.scrollHeight > el.clientHeight + 1) || Boolean(stack && stack.scrollHeight > stack.clientHeight + 1),
  };
});

await page.screenshot({ path: path.join(outDir, "check-copy-overflow.png") });

await page.click("#launch-btn");
await page.waitForTimeout(100);
await page.keyboard.down("ArrowUp");
await page.evaluate(() => window.advanceTime(1600));
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(100);
const raceAudio = await page.evaluate(() => window.__procRacerAudio.debugState());
await page.screenshot({ path: path.join(outDir, "check-audio-race.png") });

await page.keyboard.press("Escape");
await page.evaluate(() => window.advanceTime(800));
const pausedAudio = await page.evaluate(() => window.__procRacerAudio.debugState());
await page.screenshot({ path: path.join(outDir, "check-audio-pause.png") });

await page.click("#pause-menu-btn");
await page.waitForSelector("#menu-shell");
await page.evaluate(() => window.advanceTime(800));
const menuAudio = await page.evaluate(() => window.__procRacerAudio.debugState());

await browser.close();

const report = { errors, clickTooltip, hoverTooltip, hoverTooltipAfterLeave, copyMetrics, raceAudio, pausedAudio, menuAudio };
await fs.writeFile(path.join(outDir, "check-copy-audio.json"), JSON.stringify(report, null, 2));

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (copyMetrics.overflow) {
  console.error("Overflow detected in event focus copy.");
  process.exit(1);
}

if (copyMetrics.renderedLength > 88) {
  console.error(`Rendered event copy exceeds 88 characters: ${copyMetrics.renderedLength}`);
  process.exit(1);
}

if (!clickTooltip.visible || clickTooltip.mode !== "click" || !clickTooltip.text.includes("Daily Gauntlet")) {
  console.error("Click tooltip did not open with the expected menu guidance.");
  process.exit(1);
}

if (!hoverTooltip.visible || hoverTooltip.mode !== "hover" || !hoverTooltip.text.includes("Primary goal")) {
  console.error("Hover tooltip did not open after the required delay.");
  process.exit(1);
}

if (hoverTooltipAfterLeave) {
  console.error("Hover tooltip stayed open after leaving the info button.");
  process.exit(1);
}

if (raceAudio.contextState !== "running" || raceAudio.engineGain <= 0.02 || raceAudio.engineSubGain <= 0.01) {
  console.error("Race audio did not spin up with the expected engine grunt.");
  process.exit(1);
}

if (pausedAudio.engineGain >= raceAudio.engineGain * 0.35 || pausedAudio.engineSubGain >= raceAudio.engineSubGain * 0.35) {
  console.error("Paused audio did not decay as expected.");
  process.exit(1);
}

if (menuAudio.engineGain >= 0.01 || menuAudio.engineSubGain >= 0.01 || menuAudio.ambienceGain >= 0.01) {
  console.error("Menu audio loops are still active.");
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
