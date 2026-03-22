import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve(process.cwd(), "output");
const BASE_URL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";
const states = [
  { name: "post-polish-splash" },
  {
    name: "post-polish-home",
    action: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
    },
  },
  {
    name: "post-polish-tooltip",
    action: async (page) => {
      await page.click("#menu-overview-info");
      await page.waitForSelector("#ui-tooltip:not(.hidden)");
    },
  },
  { name: "post-polish-profile", action: async (page) => page.click("#menu-tab-profile") },
  {
    name: "post-polish-foundry",
    action: async (page) => {
      await page.click("#profile-tab-foundry");
    },
  },
  {
    name: "post-polish-garage-roll",
    action: async (page) => {
      await page.click("#profile-tab-foundry");
      await page.click("#garage-roll-btn");
      await page.waitForSelector("#garage-roll-modal:not(.hidden)");
      await page.waitForTimeout(2400);
    },
  },
  {
    name: "post-polish-style",
    action: async (page) => {
      if (await page.locator("#garage-roll-modal:not(.hidden)").count()) {
        const confirmDisabled = await page.locator("#garage-roll-confirm-btn").isDisabled();
        if (confirmDisabled) {
          await page.click('[data-roll-slot="0"]');
        }
        await page.click("#garage-roll-confirm-btn");
        await page.waitForSelector("#garage-roll-modal", { state: "hidden" });
      }
      await page.click("#profile-tab-style");
    },
  },
  {
    name: "post-polish-career",
    action: async (page) => {
      await page.click("#profile-tab-career");
    },
  },
  {
    name: "post-polish-settings",
    action: async (page) => {
      await page.click("#menu-tab-settings");
      await page.check("#settings-mute");
      await page.selectOption("#settings-assist", "high");
    },
  },
  {
    name: "post-polish-controls",
    action: async (page) => {
      await page.click("#settings-tab-controls");
      await page.selectOption("#settings-control-mode", "custom");
    },
  },
  {
    name: "post-polish-race",
    action: async (page) => {
      await page.click("#menu-tab-home");
      await page.click("#launch-btn");
      await page.evaluate(() => window.advanceTime(3200));
      await page.keyboard.down("w");
      await page.evaluate(() => window.advanceTime(700));
      await page.keyboard.up("w");
    },
  },
  {
    name: "post-polish-pause",
    action: async (page) => {
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "post-polish-results",
    action: async (page) => {
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        const state = window.__procRacer;
        state.cars.forEach((car, index) => {
          car.finished = true;
          car.finishMs = state.elapsed + index * 0.05;
        });
        state.player.finishMs = state.elapsed;
      });
      await page.evaluate(() => window.advanceTime(120));
    },
  },
];

async function capture(page, name) {
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
  const text = await page.evaluate(() => window.render_game_to_text());
  fs.writeFileSync(path.join(outputDir, `${name}.json`), text);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => window.localStorage.clear());
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("The AudioContext encountered an error from the audio device or the WebAudio renderer.")) return;
    errors.push(`console: ${text}`);
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  for (const state of states) {
    if (state.action) await state.action(page);
    await capture(page, state.name);
  }

  if (errors.length) {
    fs.writeFileSync(path.join(outputDir, "post-polish-errors.txt"), errors.join("\n"));
  }

  console.log(JSON.stringify({ errors }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
