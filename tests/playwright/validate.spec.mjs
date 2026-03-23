import { test, expect } from "playwright/test";
import {
  attachPageErrorCollector,
  enterHub,
  expectNoPageErrors,
  goToScreen,
  goToSection,
  launchRace,
  readGameState,
  resetApp,
} from "./helpers/proc-racer.mjs";

// A minimal v4 save that exercises every significant migration path:
// - legacy `currency` field → wallet.flux
// - legacy `dailyBest` field → daily.bestTime
// - wins and bestTimes carried over
const V4_SAVE = {
  version: 4,
  currency: 350,
  scrap: 8,
  premiumCurrency: 0,
  wins: 2,
  eventProgress: 4,
  dailyBest: 44.2,
  bestTimes: { "sprint-1": 51.6 },
  eventResults: {},
  runHistory: [],
  settings: { assistLevel: "high" },
};

test("menu navigation and race overlays stay reachable @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await enterHub(page);

  for (const screen of ["race", "garage", "foundry", "style", "career", "settings"]) {
    await goToScreen(page, screen);
    const state = await readGameState(page);
    expect(state.menuScreen).toBe(screen);
  }

  await launchRace(page);
  const raceState = await readGameState(page);
  expect(raceState.mode).toBe("race");
  expect(raceState.currentEvent?.name).toBeTruthy();
  expect(raceState.hud).not.toBeNull();

  await page.keyboard.press("Escape");
  const pausedState = await readGameState(page);
  expect(pausedState.pause).not.toBeNull();

  await page.click("#pause-resume-btn");
  await page.evaluate(() => {
    const state = window.__procRacer;
    state.cars.forEach((car, index) => {
      car.finished = true;
      car.finishMs = state.elapsed + index * 0.05;
    });
    state.player.finishMs = state.elapsed;
    window.advanceTime(120);
  });
  const resultsState = await readGameState(page);
  expect(resultsState.results).not.toBeNull();

  expectNoPageErrors(errors);
});

test("garage roll and style equip loop holds together @garage", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await enterHub(page);

  await goToScreen(page, "foundry");
  const initialState = await readGameState(page);
  expect(initialState.wallet.flux).toBe(220);
  expect(initialState.wallet.scrap).toBe(0);

  await page.click("#garage-roll-btn");
  await expect(page.locator("#garage-roll-modal")).toBeVisible();
  await page.waitForFunction(() => {
    const roll = window.__procRacer?.garageRoll;
    return roll?.status === "revealed" && (roll?.revealedSlots || []).length === 3;
  });
  const revealedState = await readGameState(page);
  expect(revealedState.garageRoll?.status).toBe("revealed");
  expect(revealedState.garageRoll?.revealedSlots).toHaveLength(3);

  if (await page.locator("#garage-roll-confirm-btn").isDisabled()) {
    await page.click('[data-roll-slot="0"]');
  }
  await page.click("#garage-roll-confirm-btn");
  await expect(page.locator("#garage-roll-modal")).toBeHidden();

  const afterRollState = await readGameState(page);
  expect(afterRollState.wallet.flux).toBe(40);
  expect(afterRollState.wallet.scrap).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__procRacer.save.wallet.scrap = 500;
    window.__procRacer.save.scrap = 500;
    window.__procRacerUi.syncMenu();
  });

  await goToScreen(page, "style");
  await goToSection(page, "shop");

  let buyButton = page.locator('.style-card[data-style-action="buy"]').first();
  const nextPageButton = page.locator('[data-style-page-nav="1"]').first();
  for (let turns = 0; turns < 6 && !(await buyButton.count()); turns += 1) {
    if (!await nextPageButton.count() || await nextPageButton.isDisabled()) break;
    await nextPageButton.click();
    await page.waitForTimeout(120);
    buyButton = page.locator('.style-card[data-style-action="buy"]').first();
  }

  expect(await buyButton.count(), "Expected at least one buyable style card.").toBeGreaterThan(0);
  const styleId = await buyButton.getAttribute("data-style-id");
  expect(styleId).toBeTruthy();
  await buyButton.click();

  const equipButton = page.locator(`.style-card[data-style-id="${styleId}"][data-style-action="equip"]`).first();
  await expect(equipButton).toBeVisible();
  await equipButton.click();

  await goToSection(page, "loadout");
  await expect(page.locator("#equipped-style")).toContainText("Current loadout");
  const finalState = await readGameState(page);
  expect(finalState.wallet.scrap).toBeLessThan(500);

  expectNoPageErrors(errors);
});

test("strike-board reroll mutates the board without touching the daily @reroll", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await enterHub(page);

  const initialState = await page.evaluate(() => ({
    wallet: structuredClone(window.__procRacer.save.wallet),
    strikeBoard: structuredClone(window.__procRacer.save.strikeBoard),
    events: window.__procRacer.events
      .filter((event) => !event.guided && !event.daily)
      .map((event) => ({ id: event.id, seed: event.seed })),
    dailyId: window.__procRacer.events.find((event) => event.daily)?.id || null,
  }));

  expect(initialState.wallet.flux).toBe(220);
  await page.click("#board-reroll-btn");
  await expect.poll(async () => page.evaluate(() => window.__procRacer.save.strikeBoard?.rerolls || 0)).toBe(1);

  const rerolledState = await page.evaluate(() => ({
    wallet: structuredClone(window.__procRacer.save.wallet),
    strikeBoard: structuredClone(window.__procRacer.save.strikeBoard),
    events: window.__procRacer.events
      .filter((event) => !event.guided && !event.daily)
      .map((event) => ({ id: event.id, seed: event.seed })),
    dailyId: window.__procRacer.events.find((event) => event.daily)?.id || null,
  }));

  expect(rerolledState.wallet.flux).toBe(190);
  expect(rerolledState.strikeBoard?.rerolls).toBe(1);
  expect(rerolledState.events.every((event) => event.id.includes("@board:"))).toBeTruthy();
  expect(JSON.stringify(rerolledState.events)).not.toBe(JSON.stringify(initialState.events));
  expect(rerolledState.dailyId).toBe(initialState.dailyId);

  expectNoPageErrors(errors);
});

test("copy clamp, tooltip timing, and audio transitions stay stable @copy-audio", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await enterHub(page);

  await page.click("#menu-overview-info");
  await expect(page.locator("#ui-tooltip")).toBeVisible();
  const clickTooltip = await page.evaluate(() => {
    const tooltip = document.getElementById("ui-tooltip");
    return {
      text: tooltip?.textContent || "",
      mode: tooltip?.dataset.mode || null,
      visible: tooltip ? !tooltip.classList.contains("hidden") : false,
    };
  });
  expect(clickTooltip.visible).toBeTruthy();
  expect(clickTooltip.mode).toBe("click");
  expect(clickTooltip.text).toContain("Daily Gauntlet");

  await page.mouse.click(14, 14);
  await page.hover("#event-info-btn");
  await expect(page.locator("#ui-tooltip")).toBeVisible({ timeout: 3500 });
  const hoverTooltip = await page.evaluate(() => {
    const tooltip = document.getElementById("ui-tooltip");
    return {
      text: tooltip?.textContent || "",
      mode: tooltip?.dataset.mode || null,
      visible: tooltip ? !tooltip.classList.contains("hidden") : false,
    };
  });
  expect(hoverTooltip.visible).toBeTruthy();
  expect(hoverTooltip.mode).toBe("hover");
  expect(hoverTooltip.text).toContain("Selected event detail");

  await page.mouse.move(14, 14);
  await expect(page.locator("#ui-tooltip")).toBeHidden();

  const copyMetrics = await page.evaluate(() => {
    const longSummary = "This is an intentionally extended course description used to verify that overflow is clamped, wrapped, and line-limited even when authors accidentally paste far too much copy into the spotlight area.";
    window.__procRacer.events[1].summary = longSummary;
    window.__procRacer.selectedEventIndex = 1;
    window.__procRacerUi.syncMenu();
    const el = document.getElementById("event-focus-copy");
    const stack = el?.closest(".focus-copy-stack");
    return {
      renderedLength: el?.textContent?.length || 0,
      overflow: Boolean(el && el.scrollHeight > el.clientHeight + 1) || Boolean(stack && stack.scrollHeight > stack.clientHeight + 1),
    };
  });
  expect(copyMetrics.overflow).toBeFalsy();
  expect(copyMetrics.renderedLength).toBeLessThanOrEqual(88);

  await page.click("#launch-btn");
  await page.waitForTimeout(100);
  await page.keyboard.down("ArrowUp");
  await page.evaluate(() => window.advanceTime(1600));
  await page.keyboard.up("ArrowUp");
  const raceAudio = await page.evaluate(() => window.__procRacerAudio.debugState());
  expect(raceAudio.contextState).toBe("running");
  expect(raceAudio.engineGain).toBeGreaterThan(0.02);
  expect(raceAudio.engineSubGain).toBeGreaterThan(0.01);

  await page.keyboard.press("Escape");
  await page.evaluate(() => window.advanceTime(800));
  const pausedAudio = await page.evaluate(() => window.__procRacerAudio.debugState());
  expect(pausedAudio.engineGain).toBeLessThan(raceAudio.engineGain * 0.35);
  expect(pausedAudio.engineSubGain).toBeLessThan(raceAudio.engineSubGain * 0.35);

  await page.click("#pause-menu-btn");
  await expect(page.locator("#menu-shell")).toBeVisible();
  await page.evaluate(() => window.advanceTime(800));
  const menuAudio = await page.evaluate(() => window.__procRacerAudio.debugState());
  expect(menuAudio.engineGain).toBeLessThan(0.01);
  expect(menuAudio.engineSubGain).toBeLessThan(0.01);
  expect(menuAudio.ambienceGain).toBeLessThan(0.01);

  expectNoPageErrors(errors);
});

test("v4 save is migrated to current schema on load @migration", async ({ page }) => {
  const errors = attachPageErrorCollector(page);

  // Clear all storage then install the v4 save before the game boots.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.evaluate((save) => {
    localStorage.clear();
    localStorage.setItem("proc-racer-save-v4", JSON.stringify(save));
  }, V4_SAVE);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await enterHub(page);

  const save = await page.evaluate(() => structuredClone(window.__procRacer.save));

  // Legacy `currency` field migrates to wallet.flux.
  expect(save.wallet.flux).toBe(350);

  // Legacy `scrap` field migrates to wallet.scrap.
  expect(save.wallet.scrap).toBe(8);

  // Legacy `dailyBest` migrates to daily.bestTime.
  expect(save.daily.bestTime).toBeCloseTo(44.2, 5);

  // Wins and bestTimes are preserved.
  expect(save.wins).toBe(2);
  expect(save.bestTimes["sprint-1"]).toBeCloseTo(51.6, 5);

  // The save is re-keyed under the current version key (v5).
  const reserialised = await page.evaluate(() => localStorage.getItem("proc-racer-save-v5"));
  expect(reserialised).not.toBeNull();
  const reparsed = JSON.parse(reserialised);
  expect(reparsed.version).toBe(5);

  expectNoPageErrors(errors);
});

test("settings changes persist across a full page reload @persistence", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await enterHub(page);

  // Confirm default state.
  const before = await page.evaluate(() => window.__procRacer.save.settings.reducedShake);
  expect(before).toBe(false);

  // Mutate the setting in the live game object then force-write it to localStorage
  // (mirrors what the settings UI does).
  await page.evaluate(() => {
    window.__procRacer.save.settings.reducedShake = true;
    window.__procRacer.save.settings.assistLevel = "high";
    localStorage.setItem("proc-racer-save-v5", JSON.stringify(window.__procRacer.save));
  });

  // Full reload — the game must re-read from localStorage.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await enterHub(page);

  const after = await page.evaluate(() => ({
    reducedShake: window.__procRacer.save.settings.reducedShake,
    assistLevel: window.__procRacer.save.settings.assistLevel,
  }));
  expect(after.reducedShake).toBe(true);
  expect(after.assistLevel).toBe("high");

  expectNoPageErrors(errors);
});
