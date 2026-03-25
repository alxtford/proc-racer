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

test("button states stay distinct and compact launch actions stay legible @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await enterHub(page);

  const launchMetrics = await page.evaluate(() => Array.from(document.querySelectorAll(".workspace-launch-actions > button")).map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      label: button.textContent?.trim() || "",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      clientHeight: button.clientHeight,
      scrollHeight: button.scrollHeight,
    };
  }));
  expect(launchMetrics.length).toBeGreaterThan(0);
  expect(launchMetrics.every((button) => button.width >= 120), JSON.stringify(launchMetrics, null, 2)).toBeTruthy();
  expect(launchMetrics.every((button) => button.height <= 68), JSON.stringify(launchMetrics, null, 2)).toBeTruthy();

  const launchRowState = await page.evaluate(() => {
    const row = document.querySelector(".workspace-launch-actions");
    const rect = row?.getBoundingClientRect();
    return {
      rowHeight: rect ? Math.round(rect.height) : 0,
      viewportHeight: document.documentElement.clientHeight,
      pageHeight: document.documentElement.scrollHeight,
    };
  });
  expect(launchRowState.rowHeight).toBeLessThanOrEqual(124);
  expect(launchRowState.pageHeight).toBe(launchRowState.viewportHeight);

  const raceSelected = await page.locator("#menu-tab-home").evaluate((button) => {
    const cs = getComputedStyle(button);
    return {
      borderColor: cs.borderColor,
      background: cs.backgroundImage || cs.backgroundColor,
    };
  });
  await page.hover("#menu-tab-profile");
  const garageHover = await page.locator("#menu-tab-profile").evaluate((button) => {
    const cs = getComputedStyle(button);
    return {
      borderColor: cs.borderColor,
      background: cs.backgroundImage || cs.backgroundColor,
    };
  });
  expect(
    garageHover.borderColor !== raceSelected.borderColor || garageHover.background !== raceSelected.background,
    JSON.stringify({ raceSelected, garageHover }, null, 2),
  ).toBeTruthy();

  await page.keyboard.press("Tab");
  const focusState = await page.locator("#menu-tab-home").evaluate((button) => {
    const cs = getComputedStyle(button);
    return {
      outline: cs.outline,
      boxShadow: cs.boxShadow,
    };
  });
  expect(focusState.boxShadow === "none" && focusState.outline === "none", JSON.stringify(focusState, null, 2)).toBeFalsy();

  await goToSection(page, "tools");
  await page.waitForTimeout(80);
  const disabledState = await page.locator("#event-custom-seed-clear").evaluate((button) => {
    const cs = getComputedStyle(button);
    return {
      opacity: Number(cs.opacity),
      cursor: cs.cursor,
      pointerEvents: cs.pointerEvents,
    };
  });
  expect(disabledState.opacity).toBeLessThan(0.8);
  expect(disabledState.pointerEvents).toBe("none");
  expect(disabledState.cursor).toBe("default");

  await goToSection(page, "launch");
  await page.waitForTimeout(80);
  const launchButton = page.locator("#launch-btn");
  const launchBox = await launchButton.boundingBox();
  if (!launchBox) throw new Error("Launch button is not visible.");
  await page.mouse.move(launchBox.x + launchBox.width / 2, launchBox.y + launchBox.height / 2);
  await page.mouse.down();
  const pressedTransform = await launchButton.evaluate((button) => getComputedStyle(button).transform);
  await page.mouse.up();
  expect(pressedTransform).not.toBe("none");

  expectNoPageErrors(errors);
});

test("topbar bands stay stable and selected nav follows the active screen @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await enterHub(page);

  const wideSamples = [];
  for (const screen of ["race", "garage", "style", "settings"]) {
    await goToScreen(page, screen);
    await page.waitForTimeout(80);
    wideSamples.push(await page.evaluate((activeScreen) => {
      const nav = document.querySelector(".workspace-nav")?.getBoundingClientRect();
      const meta = document.querySelector(".workspace-topbar-meta")?.getBoundingClientRect();
      const chipStrip = document.querySelector(".workspace-chip-strip");
      const subtabTops = Array.from(document.querySelectorAll(".workspace-subnav .workspace-subtab"))
        .map((button) => Math.round(button.getBoundingClientRect().top));
      return {
        activeScreen,
        navWidth: Math.round(nav?.width || 0),
        metaWidth: Math.round(meta?.width || 0),
        chipOverflow: chipStrip ? chipStrip.scrollWidth > chipStrip.clientWidth + 1 : false,
        selectedTabs: Array.from(document.querySelectorAll(".workspace-nav .menu-tab.selected")).map((button) => button.id),
        subnavWrap: subtabTops.length > 1 ? Math.max(...subtabTops) - Math.min(...subtabTops) > 1 : false,
      };
    }, screen));
  }

  const navWidths = wideSamples.map((sample) => sample.navWidth);
  const metaWidths = wideSamples.map((sample) => sample.metaWidth);
  expect(Math.max(...navWidths) - Math.min(...navWidths), JSON.stringify(wideSamples, null, 2)).toBeLessThanOrEqual(4);
  expect(Math.max(...metaWidths) - Math.min(...metaWidths), JSON.stringify(wideSamples, null, 2)).toBeLessThanOrEqual(4);
  expect(wideSamples.every((sample) => !sample.chipOverflow), JSON.stringify(wideSamples, null, 2)).toBeTruthy();
  expect(wideSamples.every((sample) => !sample.subnavWrap), JSON.stringify(wideSamples, null, 2)).toBeTruthy();
  expect(wideSamples.find((sample) => sample.activeScreen === "race")?.selectedTabs).toEqual(["menu-tab-home"]);
  expect(wideSamples.find((sample) => sample.activeScreen === "garage")?.selectedTabs).toEqual(["menu-tab-profile"]);
  expect(wideSamples.find((sample) => sample.activeScreen === "style")?.selectedTabs).toEqual(["menu-tab-profile"]);
  expect(wideSamples.find((sample) => sample.activeScreen === "settings")?.selectedTabs).toEqual(["menu-tab-settings"]);

  await page.setViewportSize({ width: 844, height: 390 });
  await goToScreen(page, "style");
  await page.waitForTimeout(120);
  const compactStyleChrome = await page.evaluate(() => {
    const chipStrip = document.querySelector(".workspace-chip-strip");
    const subtabTops = Array.from(document.querySelectorAll(".workspace-subnav .workspace-subtab"))
      .map((button) => Math.round(button.getBoundingClientRect().top));
    return {
      chipOverflow: chipStrip ? chipStrip.scrollWidth > chipStrip.clientWidth + 1 : false,
      subnavWrap: subtabTops.length > 1 ? Math.max(...subtabTops) - Math.min(...subtabTops) > 1 : false,
      selectedTabs: Array.from(document.querySelectorAll(".workspace-nav .menu-tab.selected")).map((button) => button.id),
    };
  });
  expect(compactStyleChrome.chipOverflow, JSON.stringify(compactStyleChrome, null, 2)).toBeFalsy();
  expect(compactStyleChrome.subnavWrap, JSON.stringify(compactStyleChrome, null, 2)).toBeFalsy();
  expect(compactStyleChrome.selectedTabs).toEqual(["menu-tab-profile"]);

  await page.setViewportSize({ width: 812, height: 375 });
  await goToScreen(page, "settings");
  await page.waitForTimeout(120);
  const compactSettingsChrome = await page.evaluate(() => {
    const chipStrip = document.querySelector(".workspace-chip-strip");
    const subtabTops = Array.from(document.querySelectorAll(".workspace-subnav .workspace-subtab"))
      .map((button) => Math.round(button.getBoundingClientRect().top));
    return {
      chipOverflow: chipStrip ? chipStrip.scrollWidth > chipStrip.clientWidth + 1 : false,
      subnavWrap: subtabTops.length > 1 ? Math.max(...subtabTops) - Math.min(...subtabTops) > 1 : false,
      selectedTabs: Array.from(document.querySelectorAll(".workspace-nav .menu-tab.selected")).map((button) => button.id),
    };
  });
  expect(compactSettingsChrome.chipOverflow, JSON.stringify(compactSettingsChrome, null, 2)).toBeFalsy();
  expect(compactSettingsChrome.subnavWrap, JSON.stringify(compactSettingsChrome, null, 2)).toBeFalsy();
  expect(compactSettingsChrome.selectedTabs).toEqual(["menu-tab-settings"]);

  expectNoPageErrors(errors);
});

test("splash fills widescreen layouts and keeps the CTA reachable @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const splash1440 = await page.evaluate(() => {
    const shell = document.querySelector("#menu-splash")?.getBoundingClientRect();
    const frame = document.querySelector(".splash-frame")?.getBoundingClientRect();
    const rail = document.querySelector(".splash-feature-rail")?.getBoundingClientRect();
    const copy = document.querySelector(".splash-copy");
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      shellWidth: Math.round(shell?.width || 0),
      shellHeight: Math.round(shell?.height || 0),
      frameWidth: Math.round(frame?.width || 0),
      railWidth: Math.round(rail?.width || 0),
      copyVisible: Boolean(copy && getComputedStyle(copy).display !== "none"),
    };
  });
  expect(splash1440.shellWidth / splash1440.viewportWidth).toBeGreaterThan(0.95);
  expect(splash1440.shellHeight / splash1440.viewportHeight).toBeGreaterThan(0.95);
  expect(splash1440.railWidth / splash1440.frameWidth).toBeGreaterThan(0.24);
  expect(splash1440.copyVisible).toBeTruthy();

  const startButtonReachability = await page.locator("#start-btn").evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const sampleX = rect.left + rect.width / 2;
    const sampleY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(sampleX, sampleY);
    return {
      sampleX: Math.round(sampleX),
      sampleY: Math.round(sampleY),
      topElementId: topElement?.id || "",
      reachable: topElement === button || button.contains(topElement),
    };
  });
  expect(startButtonReachability.reachable, JSON.stringify(startButtonReachability, null, 2)).toBeTruthy();

  await enterHub(page);
  const state = await readGameState(page);
  expect(state.menuStage).toBe("hub");

  expectNoPageErrors(errors);
});

test("workspace shell stays compact on landscape mobile and fills wide settings panels @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await enterHub(page);

  const shortLandscapeRace = await page.evaluate(() => {
    const viewportHeight = document.documentElement.clientHeight;
    const topbar = document.querySelector(".workspace-topbar")?.getBoundingClientRect();
    const screen = document.querySelector(".workspace-screen")?.getBoundingClientRect();
    const blocks = Array.from(document.querySelectorAll(".selection-block")).map((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height };
    });
    return {
      viewportHeight,
      pageHeight: document.documentElement.scrollHeight,
      topbarHeight: topbar?.height || 0,
      screenBottom: screen?.bottom || 0,
      blocks,
    };
  });
  expect(shortLandscapeRace.pageHeight).toBe(shortLandscapeRace.viewportHeight);
  expect(shortLandscapeRace.topbarHeight / shortLandscapeRace.viewportHeight).toBeLessThan(0.16);
  expect(shortLandscapeRace.screenBottom).toBeLessThanOrEqual(shortLandscapeRace.viewportHeight);
  expect(
    shortLandscapeRace.blocks.every((block) => block.bottom <= shortLandscapeRace.viewportHeight + 1),
    JSON.stringify(shortLandscapeRace, null, 2),
  ).toBeTruthy();

  for (const screen of ["garage", "foundry", "style", "career", "settings"]) {
    await goToScreen(page, screen);
    const layout = await page.evaluate(() => {
      const viewportHeight = document.documentElement.clientHeight;
      const blocks = Array.from(document.querySelectorAll(".selection-block")).map((element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, height: rect.height };
      });
      return {
        viewportHeight,
        pageHeight: document.documentElement.scrollHeight,
        blocks,
      };
    });
    expect(layout.pageHeight).toBe(layout.viewportHeight);
    expect(
      layout.blocks.every((block) => block.bottom <= layout.viewportHeight + 1),
      JSON.stringify({ screen, layout }, null, 2),
    ).toBeTruthy();
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await goToScreen(page, "settings");
  await page.waitForTimeout(120);
  const wideSettings = await page.evaluate(() => {
    const viewportHeight = document.documentElement.clientHeight;
    const screen = document.querySelector(".workspace-screen")?.getBoundingClientRect();
    const block = document.querySelector(".workspace-screen-settings > .selection-block")?.getBoundingClientRect();
    return {
      viewportHeight,
      pageHeight: document.documentElement.scrollHeight,
      screenHeight: screen?.height || 0,
      blockHeight: block?.height || 0,
    };
  });
  expect(wideSettings.pageHeight).toBe(wideSettings.viewportHeight);
  expect(wideSettings.blockHeight / wideSettings.screenHeight).toBeGreaterThan(0.8);

  expectNoPageErrors(errors);
});

test("race board keeps previews visible and hero surfaces fit their content @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await enterHub(page);
  await goToScreen(page, "race");

  const launchMetrics = await page.evaluate(() => {
    const hero = document.querySelector(".workspace-hero-block");
    const poster = document.querySelector(".workspace-race-poster");
    const side = document.querySelector(".workspace-race-side");
    const focus = document.querySelector(".workspace-race-poster > .workspace-race-focus");
    const heroRect = hero?.getBoundingClientRect();
    const posterRect = poster?.getBoundingClientRect();
    const sideRect = side?.getBoundingClientRect();
    const focusRect = focus?.getBoundingClientRect();
    return {
      viewportHeight: document.documentElement.clientHeight,
      pageHeight: document.documentElement.scrollHeight,
      heroBottom: Math.round(heroRect?.bottom || 0),
      posterBottom: Math.round(posterRect?.bottom || 0),
      sideBottom: Math.round(sideRect?.bottom || 0),
      focusBottom: Math.round(focusRect?.bottom || 0),
    };
  });
  expect(launchMetrics.pageHeight).toBe(launchMetrics.viewportHeight);
  expect(launchMetrics.posterBottom, JSON.stringify(launchMetrics, null, 2)).toBeLessThanOrEqual(launchMetrics.heroBottom + 1);
  expect(launchMetrics.sideBottom, JSON.stringify(launchMetrics, null, 2)).toBeLessThanOrEqual(launchMetrics.heroBottom + 1);
  expect(launchMetrics.focusBottom, JSON.stringify(launchMetrics, null, 2)).toBeLessThanOrEqual(launchMetrics.posterBottom + 1);

  await goToSection(page, "board");
  await page.waitForTimeout(120);
  const boardMetrics = await page.evaluate(() => {
    const summary = document.querySelector(".workspace-race-summary-block");
    const browser = document.querySelector(".workspace-browser-block");
    const list = document.querySelector(".workspace-event-list");
    const focus = document.querySelector(".workspace-race-summary-block > .workspace-race-focus");
    const summaryRect = summary?.getBoundingClientRect();
    const browserRect = browser?.getBoundingClientRect();
    const listRect = list?.getBoundingClientRect();
    const focusRect = focus?.getBoundingClientRect();
    return {
      viewportHeight: document.documentElement.clientHeight,
      pageHeight: document.documentElement.scrollHeight,
      previewPresent: Boolean(document.querySelector(".workspace-race-summary-block #event-preview")),
      summaryBottom: Math.round(summaryRect?.bottom || 0),
      focusBottom: Math.round(focusRect?.bottom || 0),
      browserBottom: Math.round(browserRect?.bottom || 0),
      listBottom: Math.round(listRect?.bottom || 0),
    };
  });
  expect(boardMetrics.previewPresent, JSON.stringify(boardMetrics, null, 2)).toBeTruthy();
  expect(boardMetrics.pageHeight).toBe(boardMetrics.viewportHeight);
  expect(boardMetrics.focusBottom, JSON.stringify(boardMetrics, null, 2)).toBeLessThanOrEqual(boardMetrics.summaryBottom + 1);
  expect(boardMetrics.listBottom, JSON.stringify(boardMetrics, null, 2)).toBeLessThanOrEqual(boardMetrics.browserBottom + 1);

  expectNoPageErrors(errors);
});

test("compact garage and style screens keep key controls inside the viewport @smoke", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await enterHub(page);

  await goToScreen(page, "garage");
  const garage800 = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    statsBottom: Math.round(document.querySelector(".garage-focus-stats")?.getBoundingClientRect().bottom || 0),
  }));
  expect(garage800.pageHeight).toBe(garage800.viewportHeight);
  expect(garage800.statsBottom).toBeLessThanOrEqual(garage800.viewportHeight + 1);

  await goToScreen(page, "style");
  const style800 = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    loadoutBottom: Math.round(document.querySelector(".style-live-card")?.getBoundingClientRect().bottom || 0),
    cardBottom: Math.round(document.querySelector(".workspace-style-grid .style-card")?.getBoundingClientRect().bottom || 0),
  }));
  expect(style800.pageHeight).toBe(style800.viewportHeight);
  expect(style800.loadoutBottom).toBeLessThanOrEqual(style800.viewportHeight + 1);
  expect(style800.cardBottom).toBeLessThanOrEqual(style800.viewportHeight + 1);

  await page.setViewportSize({ width: 844, height: 390 });
  await goToScreen(page, "race");
  await page.waitForTimeout(120);
  const race844Launch = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    launchBottom: Math.round(document.querySelector(".workspace-launch-actions")?.getBoundingClientRect().bottom || 0),
    heroButtons: document.querySelectorAll(".workspace-launch-actions > button").length,
  }));
  expect(race844Launch.launchBottom).toBeLessThanOrEqual(race844Launch.viewportHeight + 1);
  expect(race844Launch.heroButtons).toBe(1);

  await goToSection(page, "tools");
  await page.waitForTimeout(120);
  const race844Tools = await page.evaluate(() => {
    const clearButton = document.getElementById("event-custom-seed-clear");
    const clearStyle = clearButton ? window.getComputedStyle(clearButton) : null;
    const utilityButtons = document.querySelectorAll(".workspace-utility-actions > button").length;
    return {
      viewportHeight: window.innerHeight,
      lockBottom: Math.round(document.getElementById("event-custom-seed-apply")?.getBoundingClientRect().bottom || 0),
      clearVisible: Boolean(clearButton && clearStyle && clearStyle.display !== "none" && clearStyle.visibility !== "hidden"),
      clearBottom: Math.round(clearButton?.getBoundingClientRect().bottom || 0),
      utilityButtons,
    };
  });
  expect(race844Tools.lockBottom).toBeLessThanOrEqual(race844Tools.viewportHeight + 1);
  expect(race844Tools.utilityButtons).toBe(2);
  expect(
    !race844Tools.clearVisible || race844Tools.clearBottom <= race844Tools.viewportHeight + 1,
    JSON.stringify(race844Tools, null, 2),
  ).toBeTruthy();

  await goToScreen(page, "garage");
  await page.waitForTimeout(120);
  const garage844 = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    statsBottom: Math.round(document.querySelector(".garage-focus-stats")?.getBoundingClientRect().bottom || 0),
  }));
  expect(garage844.statsBottom).toBeLessThanOrEqual(garage844.viewportHeight + 1);

  await goToScreen(page, "style");
  await page.waitForTimeout(120);
  const style844 = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    cardBottom: Math.round(document.querySelector(".workspace-style-grid .style-card")?.getBoundingClientRect().bottom || 0),
    compactGrid: document.querySelector(".workspace-style-grid-compact") !== null,
  }));
  expect(style844.cardBottom).toBeLessThanOrEqual(style844.viewportHeight + 1);
  expect(style844.compactGrid).toBeTruthy();

  await page.setViewportSize({ width: 812, height: 375 });
  await goToScreen(page, "style");
  await page.waitForTimeout(120);
  const style812 = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    cardBottom: Math.round(document.querySelector(".workspace-style-grid .style-card")?.getBoundingClientRect().bottom || 0),
    compactGrid: document.querySelector(".workspace-style-grid-compact") !== null,
  }));
  expect(style812.cardBottom).toBeLessThanOrEqual(style812.viewportHeight + 1);
  expect(style812.compactGrid).toBeTruthy();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await goToScreen(page, "settings");
  await page.waitForTimeout(120);
  const settings1920 = await page.evaluate(() => {
    const block = document.querySelector(".workspace-screen-settings > .selection-block")?.getBoundingClientRect();
    const muteRow = document.getElementById("settings-mute")?.closest(".settings-row-toggle")?.getBoundingClientRect();
    const assist = document.getElementById("settings-assist")?.getBoundingClientRect();
    const shakeToggle = document.getElementById("settings-shake")?.getBoundingClientRect();
    const summary = document.querySelector(".settings-summary-strip")?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      blockBottom: Math.round(block?.bottom || 0),
      muteBottom: Math.round(muteRow?.bottom || 0),
      assistTop: Math.round(assist?.top || 0),
       summaryTop: Math.round(summary?.top || 0),
       summaryBottom: Math.round(summary?.bottom || 0),
      toggleWidth: Math.round(shakeToggle?.width || 0),
    };
  });
  expect(settings1920.toggleWidth).toBeGreaterThanOrEqual(40);
  expect(settings1920.summaryTop).toBeGreaterThan(settings1920.viewportHeight * 0.78);
  expect(settings1920.summaryBottom).toBeLessThanOrEqual(settings1920.viewportHeight + 1);
  expect(settings1920.muteBottom).toBeGreaterThan(settings1920.summaryTop - 80);
  expect(settings1920.assistTop).toBeGreaterThan(settings1920.viewportHeight * 0.75);

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

  const equippedSkin = await page.evaluate(() => window.__procRacer.save.equippedCosmetics?.skin || null);
  expect(equippedSkin).toBe(styleId);
  const finalState = await readGameState(page);
  expect(finalState.wallet.scrap).toBeLessThan(500);

  expectNoPageErrors(errors);
});

test("oversized event progress auto-selects the last strike-board event instead of the daily", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page, { tutorialCompleted: true });

  await page.evaluate(() => {
    const raw = localStorage.getItem("proc-racer-save-v5");
    const save = JSON.parse(raw);
    save.eventProgress = 999;
    localStorage.setItem("proc-racer-save-v5", JSON.stringify(save));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await enterHub(page);

  const selection = await page.evaluate(() => {
    const events = window.__procRacer.events;
    const selectedEventIndex = window.__procRacer.selectedEventIndex;
    const selectedEvent = events[selectedEventIndex] || null;
    const dailyIndex = events.findIndex((event) => event.daily);
    const lastBoardIndex = dailyIndex - 1;
    return {
      selectedEventIndex,
      selectedEventId: selectedEvent?.id || null,
      selectedEventDaily: Boolean(selectedEvent?.daily),
      lastBoardIndex,
      lastBoardId: events[lastBoardIndex]?.id || null,
    };
  });

  expect(selection.selectedEventIndex).toBe(selection.lastBoardIndex);
  expect(selection.selectedEventId).toBe(selection.lastBoardId);
  expect(selection.selectedEventDaily).toBe(false);

  expectNoPageErrors(errors);
});

test("reloading during a garage roll restores the pre-roll save instead of burning Flux", async ({ page }) => {
  const errors = attachPageErrorCollector(page);
  await resetApp(page);
  await enterHub(page);
  await goToScreen(page, "foundry");

  expect(await page.evaluate(() => window.__procRacer.save.wallet.flux)).toBe(220);

  await page.click("#garage-roll-btn");
  await expect(page.locator("#garage-roll-modal")).toBeVisible();
  const spinningState = await page.evaluate(() => ({
    flux: window.__procRacer.save.wallet.flux,
    garageRollStatus: window.__procRacer.garageRoll?.status || null,
  }));
  expect(spinningState.flux).toBe(40);
  expect(spinningState.garageRollStatus).toBe("spinning");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await enterHub(page);
  await goToScreen(page, "foundry");

  const restoredState = await page.evaluate(() => ({
    flux: window.__procRacer.save.wallet.flux,
    scrap: window.__procRacer.save.wallet.scrap,
    garageRoll: window.__procRacer.garageRoll,
  }));
  expect(restoredState.flux).toBe(220);
  expect(restoredState.scrap).toBe(0);
  expect(restoredState.garageRoll).toBeNull();

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
  expect(clickTooltip.text).toContain("Enter launch");

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
  expect(hoverTooltip.text).toContain("Route, goal, and seed status.");

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
  expect(reparsed.daily.bestTime).toBeCloseTo(44.2, 5);

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
