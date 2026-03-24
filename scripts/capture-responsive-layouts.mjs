import path from "node:path";
import { chromium } from "playwright";
import { goToMenuScreen, waitForMenuScreen, waitForMenuStage } from "./menu-helpers.mjs";

const outputDir = path.resolve(process.cwd(), "output");
const BASE_URL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";

async function captureSplash(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  await page.close();
}

async function captureSetup(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.click("#start-btn");
  await waitForMenuStage(page, "hub");
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  await page.close();
}

async function captureGarage(browser, viewport, name, pane = "garage") {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.click("#start-btn");
  await waitForMenuStage(page, "hub");
  await goToMenuScreen(page, pane);
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  await page.close();
}

async function captureSettings(browser, viewport, name, pane = "comfort") {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.click("#start-btn");
  await waitForMenuStage(page, "hub");
  await page.click("#menu-tab-settings");
  await waitForMenuScreen(page, "settings");
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  await page.close();
}

async function capturePause(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.click("#start-btn");
  await waitForMenuStage(page, "hub");
  await page.click("#launch-btn");
  await page.evaluate(() => window.advanceTime(3200));
  await page.keyboard.down("w");
  await page.evaluate(() => window.advanceTime(520));
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await captureSplash(browser, { width: 1440, height: 900 }, "responsive-splash-1440x900");
  await captureSetup(browser, { width: 1280, height: 720 }, "responsive-setup-1280x720");
  await captureSetup(browser, { width: 1024, height: 640 }, "responsive-setup-1024x640");
  await captureSetup(browser, { width: 800, height: 600 }, "responsive-setup-800x600");
  await captureGarage(browser, { width: 1280, height: 720 }, "responsive-garage-1280x720");
  await captureGarage(browser, { width: 1024, height: 640 }, "responsive-foundry-1024x640", "foundry");
  await captureSettings(browser, { width: 1024, height: 640 }, "responsive-settings-1024x640");
  await captureSettings(browser, { width: 1024, height: 640 }, "responsive-controls-1024x640", "controls");
  await capturePause(browser, { width: 1024, height: 640 }, "responsive-pause-1024x640");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
