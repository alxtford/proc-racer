import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = path.resolve("output");
const BASE_URL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";
await fs.mkdir(outDir, { recursive: true });

const views = [
  { name: "splash-1280x720", viewport: { width: 1280, height: 720 }, setup: async () => {} },
  {
    name: "home-1280x720",
    viewport: { width: 1280, height: 720 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
    },
  },
  {
    name: "profile-1280x720",
    viewport: { width: 1280, height: 720 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-profile");
    },
  },
  {
    name: "profile-foundry-1280x720",
    viewport: { width: 1280, height: 720 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-profile");
      await page.click("#profile-tab-foundry");
    },
  },
  {
    name: "profile-style-1280x720",
    viewport: { width: 1280, height: 720 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-profile");
      await page.click("#profile-tab-style");
    },
  },
  {
    name: "profile-career-1280x720",
    viewport: { width: 1280, height: 720 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-profile");
      await page.click("#profile-tab-career");
    },
  },
  {
    name: "garage-roll-1280x720",
    viewport: { width: 1280, height: 720 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-profile");
      await page.click("#profile-tab-foundry");
      await page.click("#garage-roll-btn");
      await page.waitForTimeout(2400);
    },
  },
  {
    name: "settings-1024x640",
    viewport: { width: 1024, height: 640 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-settings");
    },
  },
  {
    name: "settings-controls-1024x640",
    viewport: { width: 1024, height: 640 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
      await page.click("#menu-tab-settings");
      await page.click("#settings-tab-controls");
    },
  },
  {
    name: "home-800x600",
    viewport: { width: 800, height: 600 },
    setup: async (page) => {
      await page.click("#start-btn");
      await page.waitForFunction(() => window.__procRacer?.menuStage === "garage");
    },
  },
];

function parseScale(transform) {
  if (!transform || transform === "none") return 1;
  const matrix = transform.match(/matrix\(([^)]+)\)/);
  if (!matrix) return 1;
  const values = matrix[1].split(",").map((value) => Number.parseFloat(value.trim()));
  return Number.isFinite(values[0]) ? Number(values[0].toFixed(3)) : 1;
}

async function auditView(browser, definition) {
  const page = await browser.newPage({ viewport: definition.viewport });
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
  await page.waitForTimeout(250);
  await definition.setup(page);
  await page.waitForTimeout(280);
  const snapshot = await page.evaluate(() => {
    const rootSelectors = [".splash-shell", ".menu-shell", ".pause-shell", ".results-shell", ".garage-roll-shell"];
    const roots = rootSelectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none" && !element.classList.contains("hidden");
      });
    const rootReports = roots.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: Array.from(element.classList).join("."),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        bottom: Math.round(rect.bottom),
        right: Math.round(rect.right),
        scale: (() => {
          const transform = window.getComputedStyle(element).transform;
          if (!transform || transform === "none") return 1;
          const match = transform.match(/matrix\(([^)]+)\)/);
          if (!match) return 1;
          const values = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
          return Number.isFinite(values[0]) ? Number(values[0].toFixed(3)) : 1;
        })(),
      };
    });
    const visibleCandidates = Array.from(document.querySelectorAll(
      "#menu .selection-block, #menu .hub-header, #menu .focus-card, #menu .event-card, #menu .car-card, #menu .style-card, #menu .garage-roll-shell, #pause .pause-shell, #results .results-shell",
    )).filter((element) => {
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || element.classList.contains("hidden")) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const overflow = visibleCandidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const label = element.id ? `#${element.id}` : `.${Array.from(element.classList).join(".")}`;
        return {
          label,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          overflowX: Math.max(0, Math.round(rect.right - window.innerWidth), Math.round(0 - rect.left)),
          overflowY: Math.max(0, Math.round(rect.bottom - window.innerHeight), Math.round(0 - rect.top)),
        };
      })
      .filter((entry) => entry.overflowX > 0 || entry.overflowY > 0);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rootReports,
      overflow,
      menuStage: window.__procRacer?.menuStage || null,
      menuView: window.__procRacer?.menuView || null,
      text: window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null,
    };
  });
  await page.screenshot({ path: path.join(outDir, `audit-${definition.name}.png`) });
  await page.close();
  return { ...snapshot, errors };
}

const browser = await chromium.launch({ headless: true });
const report = {};
for (const view of views) {
  report[view.name] = await auditView(browser, view);
}
await browser.close();

await fs.writeFile(path.join(outDir, "layout-audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
