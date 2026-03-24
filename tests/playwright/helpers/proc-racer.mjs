import { expect } from "playwright/test";
import { clickFirst, waitForMenuScreen, waitForMenuStage } from "../../../scripts/menu-helpers.mjs";

const AUDIO_CONTEXT_ERROR = "The AudioContext encountered an error from the audio device or the WebAudio renderer.";

const SCREEN_SELECTORS = {
  race: ["#menu-tab-home"],
  garage: ["#menu-tab-profile", '[data-route-screen="garage"]'],
  settings: ["#menu-tab-settings"],
};

export function attachPageErrorCollector(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes(AUDIO_CONTEXT_ERROR)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

export function expectNoPageErrors(errors) {
  expect(errors, errors.join("\n") || "Expected the page to stay free of runtime errors.").toEqual([]);
}

export async function resetApp(page, options = {}) {
  const { tutorialCompleted } = options;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  if (tutorialCompleted === undefined) return;
  await page.evaluate(({ nextTutorialCompleted }) => {
    const raw = localStorage.getItem("proc-racer-save-v5");
    if (!raw) return;
    const save = JSON.parse(raw);
    save.settings = { ...(save.settings || {}), tutorialCompleted: nextTutorialCompleted };
    localStorage.setItem("proc-racer-save-v5", JSON.stringify(save));
  }, { nextTutorialCompleted: tutorialCompleted });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
}

export async function enterHub(page) {
  await expect(page.locator("#start-btn")).toBeVisible();
  await page.click("#start-btn");
  await waitForMenuStage(page, "hub");
}

export async function goToScreen(page, screen) {
  if (screen === "foundry" || screen === "style" || screen === "career") {
    await clickFirst(page, SCREEN_SELECTORS.garage);
    await waitForMenuScreen(page, "garage");
    const hubTab = page.locator(`[data-route-screen="${screen}"]`).first();
    await expect(hubTab).toBeVisible();
    await hubTab.click();
    await waitForMenuScreen(page, screen);
    return;
  }
  const selectors = SCREEN_SELECTORS[screen];
  if (!selectors) throw new Error(`Unsupported menu screen: ${screen}`);
  await clickFirst(page, selectors);
  await waitForMenuScreen(page, screen);
}

export async function goToSection(page, section) {
  const sectionButton = page.locator(`#hub-subnav [data-route-section="${section}"]`).first();
  await expect(sectionButton).toBeVisible();
  await sectionButton.click();
  await expect.poll(async () => page.locator("#hub-screen").getAttribute("data-section")).toBe(section);
}

export async function launchRace(page, options = {}) {
  const { advanceMs = 3200 } = options;
  await goToScreen(page, "race");
  await expect(page.locator("#launch-btn")).toBeVisible();
  await page.click("#launch-btn");
  await page.evaluate((ms) => window.advanceTime(ms), advanceMs);
  await expect.poll(async () => page.evaluate(() => window.__procRacer?.mode || null)).toBe("race");
}

export async function readGameState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}
