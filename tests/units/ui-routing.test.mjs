import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getControlBinding } from "../../src/core/controls.js";
import {
  createRouteState,
  getLegacyMenuView,
  getLegacyPaneState,
  normalizeMenuScreen,
  normalizeMenuStage,
  syncRuntimeMenuState,
} from "../../src/core/ui/routes.js";
import {
  createSectionByScreen,
  getRouteSection,
  normalizeRouteSection,
  setRouteSection,
} from "../../src/core/ui/sections.js";
import {
  renderInfoButton,
  renderIsoCarFigure,
  renderRecentRuns,
  renderSummaryGrid,
  renderTags,
} from "../../src/core/ui/render-helpers.js";

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

describe("controls.js", () => {
  it("returns default bindings when no custom key is present", () => {
    assert.strictEqual(getControlBinding({}, "accel"), "w");
  });

  it("prefers custom control overrides", () => {
    const settings = { controls: { accel: "arrowup" } };
    assert.strictEqual(getControlBinding(settings, "accel"), "arrowup");
  });
});

describe("ui sections and routing", () => {
  it("normalizes menu stage and screen aliases", () => {
    assert.strictEqual(normalizeMenuStage("anything"), "hub");
    assert.strictEqual(normalizeMenuStage("splash"), "splash");
    assert.strictEqual(normalizeMenuScreen("home"), "race");
    assert.strictEqual(normalizeMenuScreen("unknown"), "race");
  });

  it("normalizes route sections and fills defaults", () => {
    const sectionByScreen = createSectionByScreen({
      race: "tools",
      garage: "bad-section",
    });
    assert.strictEqual(sectionByScreen.race, "tools");
    assert.strictEqual(sectionByScreen.garage, "car");
    assert.strictEqual(normalizeRouteSection("style", "bad-section"), "loadout");
  });

  it("creates a route state from legacy menu state", () => {
    const route = createRouteState({
      menuStage: "splash",
      menuScreen: "foundry",
      homePane: "board",
      foundryPane: "readout",
      settingsPane: "controls",
    });
    assert.strictEqual(route.stage, "splash");
    assert.strictEqual(route.screen, "foundry");
    assert.strictEqual(route.sectionByScreen.race, "board");
    assert.strictEqual(route.sectionByScreen.foundry, "readout");
    assert.strictEqual(route.sectionByScreen.settings, "controls");
    assert.strictEqual(route.styleSlot, "skin");
  });

  it("syncs runtime menu state and legacy pane views", () => {
    const state = {};
    const route = {
      stage: "hub",
      screen: "style",
      sectionByScreen: createSectionByScreen({ style: "shop" }),
    };
    syncRuntimeMenuState(state, route);
    assert.strictEqual(state.menuStage, "hub");
    assert.strictEqual(state.menuScreen, "style");
    assert.strictEqual(state.menuView, getLegacyMenuView("style"));
    assert.strictEqual(state.menuSection, "shop");
  });

  it("derives legacy pane state from the active screen and section", () => {
    const route = {
      screen: "foundry",
      sectionByScreen: createSectionByScreen({
        race: "tools",
        foundry: "readout",
        settings: "controls",
      }),
    };
    const legacy = getLegacyPaneState(route);
    assert.deepStrictEqual(legacy, {
      homePane: "launch",
      profilePane: "foundry",
      foundryPane: "readout",
      settingsPane: "comfort",
    });
  });

  it("sets route sections even when the route starts empty", () => {
    const route = {};
    assert.strictEqual(setRouteSection(route, "career", "runs"), "runs");
    assert.strictEqual(getRouteSection(route, "career"), "runs");
    assert.strictEqual(setRouteSection(route, "career", "bad"), "snapshot");
  });
});

describe("ui render helpers", () => {
  it("renders tags and info buttons", () => {
    const tags = renderTags(["A", "B"]);
    assert.strictEqual(countMatches(tags, /class="mini-tag"/g), 2);
    assert.match(tags, />A<\/span>/);
    assert.match(tags, />B<\/span>/);

    const infoButton = renderInfoButton("info-1", "More info", "Tooltip body");
    assert.match(infoButton, /<button[^>]+id="info-1"/);
    assert.match(infoButton, /class="info-btn"/);
    assert.match(infoButton, /aria-label="More info"/);
    assert.match(infoButton, /aria-haspopup="dialog"/);
    assert.match(infoButton, /aria-expanded="false"/);
    assert.match(infoButton, /data-tooltip="Tooltip body"/);
  });

  it("renders summary grids and empty recent-run copy", () => {
    const summary = renderSummaryGrid([{ label: "Wins", value: "5", note: "Hot streak" }]);
    assert.strictEqual(countMatches(summary, /class="profile-item profile-item-compact"/g), 1);
    assert.match(summary, /<div class="section-label">Wins<\/div>/);
    assert.match(summary, /<div class="profile-value">5<\/div>/);
    assert.match(summary, /<div class="profile-note">Hot streak<\/div>/);

    const emptyRuns = renderRecentRuns([]);
    assert.strictEqual(countMatches(emptyRuns, /class="results-item"/g), 3);
    assert.strictEqual(countMatches(emptyRuns, /<strong>/g), 3);
    assert.strictEqual(countMatches(emptyRuns, /class="results-inline"/g), 3);
  });

  it("renders populated recent runs and iso car figures", () => {
    const runs = renderRecentRuns([{ eventName: "Shatterline", place: 2, finishTime: "1:29.50", reward: 140, wrecks: 1 }]);
    assert.strictEqual(countMatches(runs, /class="results-item"/g), 1);
    assert.match(runs, /<strong>Shatterline<\/strong>/);
    assert.match(runs, /P2\b/);
    assert.match(runs, /1:29\.50/);
    assert.match(runs, /\+140 Flux/);
    assert.match(runs, /1 wreck/);

    const emptyFigure = renderIsoCarFigure(null);
    assert.ok(emptyFigure.includes("No chassis online"));

    const figure = renderIsoCarFigure({
      role: "All-rounder",
      def: {
        color: "#ffb100",
        silhouetteKit: "vector-touring",
        trimProfile: "alloy",
      },
      visuals: {
        bodyColor: "#111111",
        accentColor: "#eeeeee",
      },
    });
    assert.ok(figure.includes(`data-silhouette="vector-touring"`));
    assert.ok(figure.includes("--iso-car-body:#111111"));
    assert.ok(figure.includes("All-rounder"));
  });
});
