import { buildRaceModel } from "./race.js";
import { buildGarageModel } from "./garage.js";
import { buildFoundryModel } from "./foundry.js";
import { buildStyleModel } from "./style.js";
import { buildCareerModel } from "./career.js";
import { buildSettingsModel } from "./settings.js";

export function deriveScreenModel(state, route) {
  if (route.screen === "race") return buildRaceModel(state, route);
  if (route.screen === "garage") return buildGarageModel(state);
  if (route.screen === "foundry") return buildFoundryModel(state);
  if (route.screen === "style") return buildStyleModel(state, route);
  if (route.screen === "career") return buildCareerModel(state);
  return buildSettingsModel(state);
}
