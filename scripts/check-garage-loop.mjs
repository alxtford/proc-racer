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
await page.waitForSelector("#start-btn", { state: "visible" });
await page.click("#start-btn");
await waitForMenuStage(page, "hub");
await page.waitForSelector("#launch-btn", { state: "visible" });
await clickFirst(page, ["#menu-tab-foundry", "#profile-tab-foundry"]);
await waitForMenuScreen(page, "foundry");

const initialState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.click("#garage-roll-btn");
await page.waitForSelector("#garage-roll-modal:not(.hidden)");
await page.waitForTimeout(2400);

const revealedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

if (await page.locator("#garage-roll-confirm-btn").isDisabled()) {
  await page.click('[data-roll-slot="0"]');
}

await page.click("#garage-roll-confirm-btn");
await page.waitForSelector("#garage-roll-modal", { state: "hidden" });

const afterRollState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate(() => {
  window.__procRacer.save.wallet.scrap = 500;
  window.__procRacer.save.scrap = 500;
  window.__procRacerUi.syncMenu();
});

await clickFirst(page, ["#menu-tab-style", "#profile-tab-style"]);
await waitForMenuScreen(page, "style");
if (await page.locator('[data-route-section="shop"]').count()) {
  await page.click('[data-route-section="shop"]');
  await page.waitForTimeout(120);
}

const nextStylePageButton = page.locator('[data-style-page-nav="1"]').first();
let pageTurns = 0;
let buyButton = page.locator('.style-card[data-style-action="buy"]').first();
while (!(await buyButton.count())
  && pageTurns < 6
  && await nextStylePageButton.count()
  && !(await nextStylePageButton.isDisabled())) {
  await nextStylePageButton.click();
  await page.waitForTimeout(120);
  pageTurns += 1;
  buyButton = page.locator('.style-card[data-style-action="buy"]').first();
}
if (!(await buyButton.count())) {
  errors.push("No buyable style card was available.");
} else {
  const styleId = await buyButton.getAttribute("data-style-id");
  await buyButton.click();
  const equipButton = page.locator(`.style-card[data-style-id="${styleId}"][data-style-action="equip"]`).first();
  if (await equipButton.count()) {
    await equipButton.click();
  } else {
    errors.push(`Bought style ${styleId} but could not find the equip action.`);
  }
}

if (await page.locator('[data-route-section="loadout"]').count()) {
  await page.click('[data-route-section="loadout"]');
  await page.waitForTimeout(120);
}

await page.waitForTimeout(180);
await page.screenshot({ path: path.join(outDir, "garage-loop.png") });

const finalState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const equippedStyleText = await page.locator("#equipped-style").textContent();

const report = {
  errors,
  initialWallet: initialState.wallet,
  revealedGarageRoll: revealedState.garageRoll,
  afterRollWallet: afterRollState.wallet,
  finalWallet: finalState.wallet,
  equippedStyleText,
};

await fs.writeFile(path.join(outDir, "garage-loop.json"), JSON.stringify(report, null, 2));
await browser.close();

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (initialState.wallet.flux !== 220) {
  console.error(`Expected 220 Flux on a fresh save, got ${initialState.wallet.flux}.`);
  process.exit(1);
}

if (!revealedState.garageRoll || revealedState.garageRoll.status !== "revealed" || (revealedState.garageRoll.revealedSlots || []).length !== 3) {
  console.error("Foundry reveal did not complete cleanly.");
  process.exit(1);
}

if (afterRollState.wallet.flux !== 40) {
  console.error(`Expected 40 Flux after one roll, got ${afterRollState.wallet.flux}.`);
  process.exit(1);
}

if (afterRollState.wallet.scrap <= 0) {
  console.error("Expected Scrap gain from unkept cars.");
  process.exit(1);
}

if (!equippedStyleText || !equippedStyleText.includes("skin")) {
  console.error("Style locker did not render equipped cosmetics.");
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
