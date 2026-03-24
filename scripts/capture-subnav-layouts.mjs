import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { goToMenuScreen, waitForMenuStage } from "./menu-helpers.mjs";

const outDir = path.resolve("output");
const BASE_URL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => window.localStorage.clear());
await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(400);
await page.click("#start-btn");
await waitForMenuStage(page, "hub");

const captures = [
  { screen: "race", section: "board", file: "subnav-race-board-1280x720.png" },
  { screen: "race", section: "tools", file: "subnav-race-tools-1280x720.png" },
  { screen: "garage", file: "subnav-garage-hub-1280x720.png" },
  { screen: "foundry", file: "subnav-foundry-hub-1280x720.png" },
  { screen: "style", file: "subnav-style-hub-1280x720.png" },
  { screen: "settings", section: "controls", file: "subnav-settings-controls-1280x720.png" },
];

const report = [];

for (const capture of captures) {
  await goToMenuScreen(page, capture.screen);
  await page.waitForTimeout(160);
  if (capture.section) {
    await page.click(`[data-route-section="${capture.section}"]`);
    await page.waitForTimeout(160);
  }
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: path.join(outDir, capture.file) });
  report.push({
    file: capture.file,
    menuScreen: state.menuScreen,
    menuSection: state.menuSection,
    errors: state.errors || [],
  });
}

await fs.writeFile(path.join(outDir, "subnav-layouts.json"), JSON.stringify(report, null, 2));
await browser.close();

console.log(JSON.stringify(report, null, 2));
