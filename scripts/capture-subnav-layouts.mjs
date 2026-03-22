import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { clickFirst, waitForMenuScreen, waitForMenuStage } from "./menu-helpers.mjs";

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
  { screen: "race", tabSelectors: ["#menu-tab-home"], section: "board", file: "subnav-race-board-1280x720.png" },
  { screen: "race", tabSelectors: ["#menu-tab-home"], section: "tools", file: "subnav-race-tools-1280x720.png" },
  { screen: "garage", tabSelectors: ["#menu-tab-profile"], section: "slots", file: "subnav-garage-slots-1280x720.png" },
  { screen: "foundry", tabSelectors: ["#menu-tab-foundry"], section: "readout", file: "subnav-foundry-readout-1280x720.png" },
  { screen: "style", tabSelectors: ["#menu-tab-style"], section: "shop", file: "subnav-style-shop-1280x720.png" },
  { screen: "settings", tabSelectors: ["#menu-tab-settings"], section: "controls", file: "subnav-settings-controls-1280x720.png" },
];

const report = [];

for (const capture of captures) {
  await clickFirst(page, capture.tabSelectors);
  await waitForMenuScreen(page, capture.screen);
  await page.waitForTimeout(160);
  await page.click(`[data-route-section="${capture.section}"]`);
  await page.waitForTimeout(160);
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
