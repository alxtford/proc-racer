import { drawTrackPreview } from "../legacy.js";
import { getRouteSection } from "../sections.js";
import { renderRaceScreen } from "./race.js";
import { renderGarageScreen } from "./garage.js";
import { renderFoundryScreen } from "./foundry.js";
import { renderStyleScreen } from "./style.js";
import { renderCareerScreen } from "./career.js";
import { renderSettingsScreen } from "./settings.js";

export function renderActiveScreen(refs, state, route, model) {
  const section = getRouteSection(route);
  if (route.screen === "race") refs.hubScreen.innerHTML = renderRaceScreen(model, section);
  if (route.screen === "garage") refs.hubScreen.innerHTML = renderGarageScreen(model, section);
  if (route.screen === "foundry") refs.hubScreen.innerHTML = renderFoundryScreen(model, section);
  if (route.screen === "style") refs.hubScreen.innerHTML = renderStyleScreen(model, section);
  if (route.screen === "career") refs.hubScreen.innerHTML = renderCareerScreen(model, section);
  if (route.screen === "settings") refs.hubScreen.innerHTML = renderSettingsScreen(model, section);
  refs.hubScreen.dataset.screen = route.screen;
  refs.hubScreen.dataset.section = section;
  if (route.screen === "race" && model.event) {
    const preview = refs.hubScreen.querySelector("#event-preview");
    if (preview) drawTrackPreview(preview, model.event);
    const launchBtn = refs.hubScreen.querySelector("#launch-btn");
    const dailyBtn = refs.hubScreen.querySelector("#daily-btn");
    const quickBtn = refs.hubScreen.querySelector("#quick-race-btn");
    if (launchBtn) launchBtn.textContent = model.startLabel;
    if (dailyBtn) dailyBtn.textContent = "Run Daily Gauntlet";
    if (quickBtn) quickBtn.textContent = model.quickLabel;
  }
}
