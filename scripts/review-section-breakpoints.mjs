import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { goToMenuScreen, waitForMenuStage } from "./menu-helpers.mjs";

const BASE_URL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";
const outDir = path.resolve("output", "section-review-current");

// Keep the legacy large/short-landscape checks, but add a denser sweep through
// the mid-width panes that better match the actual usable content area.
const largeViewports = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];

const midViewports = [
  { width: 1280, height: 720 },
  { width: 1180, height: 700 },
  { width: 1024, height: 640 },
  { width: 960, height: 640 },
  { width: 800, height: 600 },
  { width: 768, height: 600 },
];

const shortLandscapeViewports = [
  { width: 844, height: 390 },
  { width: 812, height: 375 },
];

function parseBreakpointList(rawValue) {
  if (!rawValue) return null;
  const parsed = rawValue
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const match = token.match(/^(\d+)x(\d+)$/i);
      if (!match) return null;
      return { width: Number(match[1]), height: Number(match[2]) };
    })
    .filter((viewport) => Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height));
  return parsed.length ? parsed : null;
}

const breakpointOverrideArg = process.argv.find((arg) => arg.startsWith("--breakpoints="));
const breakpointOverride = breakpointOverrideArg?.split("=")[1] || process.env.PROC_RACER_BREAKPOINTS || "";
const breakpoints =
  parseBreakpointList(breakpointOverride)
  || [...largeViewports, ...midViewports, ...shortLandscapeViewports];

const screens = ["race", "garage", "foundry", "style", "career", "settings"];

function breakpointId({ width, height }) {
  return `${width}x${height}`;
}

async function captureScreen(browser, viewport, screen) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(320);
  await page.click("#start-btn");
  await waitForMenuStage(page, "hub");
  if (screen !== "race") {
    await goToMenuScreen(page, screen);
  }
  await page.waitForTimeout(260);

  const id = breakpointId(viewport);
  const file = `${screen}-${id}.png`;
  await page.screenshot({ path: path.join(outDir, file) });

  const metrics = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
    };
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      pageHeight: document.documentElement.scrollHeight,
      topbar: rectFor(".workspace-topbar"),
      subnav: rectFor(".workspace-subnav"),
      screen: rectFor(".workspace-screen"),
      blocks: Array.from(document.querySelectorAll(".workspace-screen > .selection-block")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.querySelector(".section-label")?.textContent?.trim() || null,
          className: element.className,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          bottom: Math.round(rect.bottom),
        };
      }),
    };
  });

  await page.close();
  return {
    screen,
    screenshot: file,
    metrics,
  };
}

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {};

for (const viewport of breakpoints) {
  const id = breakpointId(viewport);
  report[id] = [];
  for (const screen of screens) {
    report[id].push(await captureScreen(browser, viewport, screen));
  }
}

await browser.close();
await fs.writeFile(path.join(outDir, "section-review-current.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
