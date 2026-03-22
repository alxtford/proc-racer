import { chromium } from "playwright";
import fs from "node:fs/promises";

const browser = await chromium.launch({ headless: true });
const url = "http://127.0.0.1:4173";
const allTargets = [
  { title: "Forgewash", label: "industrial" },
  { title: "Sunspike Draft", label: "freeway" },
  { title: "Rift Collar", label: "void" },
];
const targetFilter = (process.argv[2] || "").trim().toLowerCase();
const targets = targetFilter
  ? allTargets.filter((target) => target.label === targetFilter || target.title.toLowerCase() === targetFilter)
  : allTargets;
const results = [];

for (const target of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const raw = localStorage.getItem("proc-racer-save-v5");
    if (!raw) return;
    const save = JSON.parse(raw);
    save.settings = { ...(save.settings || {}), tutorialCompleted: true };
    localStorage.setItem("proc-racer-save-v5", JSON.stringify(save));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const startButton = page.locator("#start-btn");
  if (await startButton.count()) await startButton.click();
  await page.waitForSelector(".event-card");
  await page.locator(".event-card", { hasText: target.title }).click();
  await page.waitForTimeout(100);
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.click("#launch-btn");
  await page.waitForTimeout(120);
  await page.evaluate(() => window.advanceTime(3600));
  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const shotPath = `output/review-race-${target.label}.png`;
  await page.screenshot({ path: shotPath });
  results.push({ label: target.label, before, after, path: shotPath });
  await page.close();
}

await fs.writeFile("output/review-race-scenes.json", JSON.stringify(results, null, 2));
await browser.close();
