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
