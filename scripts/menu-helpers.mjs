export function getMenuSnapshot() {
  const state = window.__procRacer || {};
  return {
    menuStage: state.menuStage || null,
    menuScreen: state.menuScreen || null,
    menuView: state.menuView || null,
  };
}

export async function waitForMenuStage(page, stage) {
  await page.waitForFunction((expectedStage) => {
    const state = window.__procRacer || {};
    return state.menuStage === expectedStage;
  }, stage);
}

export async function waitForMenuScreen(page, screen) {
  await page.waitForFunction((expectedScreen) => {
    const state = window.__procRacer || {};
    return state.menuScreen === expectedScreen || state.menuView === expectedScreen;
  }, screen);
}

export async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click();
      return selector;
    }
  }
  throw new Error(`No matching selector found: ${selectors.join(", ")}`);
}

const SCREEN_SELECTORS = {
  race: ["#menu-tab-home"],
  garage: ["#menu-tab-profile", '[data-route-screen="garage"]'],
  settings: ["#menu-tab-settings"],
};

export async function goToMenuScreen(page, screen) {
  if (screen === "foundry" || screen === "style" || screen === "career") {
    await clickFirst(page, SCREEN_SELECTORS.garage);
    await waitForMenuScreen(page, "garage");
    await clickFirst(page, [`[data-route-screen="${screen}"]`]);
    await waitForMenuScreen(page, screen);
    return;
  }
  const selectors = SCREEN_SELECTORS[screen];
  if (!selectors) throw new Error(`Unsupported menu screen: ${screen}`);
  await clickFirst(page, selectors);
  await waitForMenuScreen(page, screen);
}
