import { renderInfoButton, renderTags } from "../render-helpers.js";

function renderRaceFocus(model, options = {}) {
  const hero = model.hero;
  const {
    compact = false,
    showActions = false,
    showHint = false,
    showPreview = true,
    showSecondaryActions = true,
  } = options;
  return `
    <div class="focus-card focus-card-event workspace-race-focus${compact ? " workspace-race-focus-compact" : ""}">
      <div class="workspace-race-brief">
        ${showPreview ? '<canvas id="event-preview" class="track-preview workspace-track-preview" width="320" height="180"></canvas>' : ""}
        <div class="focus-copy-stack workspace-race-copy">
          <div class="workspace-race-copy-core">
            <div class="focus-title-row">
              <div id="event-focus-title" class="focus-title">${hero?.title || "No run selected"}</div>
            </div>
            <div id="event-focus-meta" class="focus-meta">${hero?.meta || "Select a run to see the route."}</div>
            <div id="event-focus-copy" class="focus-copy">${hero?.copy || "Pick a run and launch."}</div>
          </div>
          <div class="workspace-race-status">
            <div id="event-focus-modifiers" class="focus-tags">${(hero?.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
            <div class="focus-inline-meta">
              <span id="event-ghost-status" class="mini-tag">${hero?.ghostStatus || "No ghost"}</span>
              <span id="event-reward-status" class="mini-tag">${hero?.utilityStatus || "Fresh board"}</span>
            </div>
          </div>
        </div>
      </div>
      ${showActions ? `
        <div class="workspace-race-action-stack">
          <div class="action-row action-row-primary workspace-launch-actions${showSecondaryActions ? "" : " workspace-launch-actions-primary-only"}">
            <button id="launch-btn" class="start-btn">${model.startLabel || "Hit The Grid"}</button>
            ${showSecondaryActions ? `<button id="daily-btn" class="secondary-btn">${model.dailyLabel || "Run Daily Gauntlet"}</button>` : ""}
            ${showSecondaryActions ? `<button id="quick-race-btn" class="secondary-btn">${model.quickLabel || "Instant Remix"}</button>` : ""}
          </div>
          ${showHint ? `<div id="launch-hint" class="launch-hint workspace-launch-hint">${model.launchHint}</div>` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function renderRaceToolsPanel(model, options = {}) {
  const hero = model.hero;
  const compact = options.compact ? " workspace-utility-panel-compact" : "";
  const condensed = Boolean(options.condensed);
  const condensedClass = condensed ? " workspace-utility-panel-side" : "";
  const showLaunchOverflow = Boolean(options.showLaunchOverflow);
  const utilityCopy = condensed
    ? (showLaunchOverflow
      ? "Daily, remix, and seed tools."
      : "Reforge the board or lock a replay seed.")
    : (showLaunchOverflow
      ? "Daily, remix, and seed tools."
      : "Reforge the board or lock a replay seed.");
  const seedClearAction = !condensed || !model.customSeedClearDisabled
    ? `<button id="event-custom-seed-clear" class="secondary-btn section-action-btn" type="button" ${model.customSeedEnabled && !model.customSeedClearDisabled ? "" : "disabled"}>Clear</button>`
    : "";
  return `
    <section class="selection-block workspace-utility-panel${compact}${condensedClass}">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Course Tools</div>
          ${renderInfoButton("board-reroll-info-btn", "Board tools", "Reforge the board or lock a replay seed.")}
        </div>
        <button id="board-reroll-btn" class="secondary-btn section-action-btn" type="button" ${model.rerollDisabled ? "disabled" : ""}>${model.rerollLabel}</button>
      </div>
      <div class="workspace-utility-stack">
        <div class="workspace-utility-copy">
          <div class="section-label">Tools</div>
          <div id="home-board-selected-meta" class="focus-meta">${utilityCopy}</div>
          ${condensed ? "" : `<div class="focus-inline-meta">
            <span class="mini-tag">${hero?.badge || "Selected run"}</span>
            <span class="mini-tag">${hero?.utilityStatus || "Fresh board"}</span>
          </div>`}
        </div>
        ${showLaunchOverflow ? `
          <div class="workspace-utility-cta">
            <div class="section-label">Alternate launch paths</div>
            <div class="workspace-utility-actions">
              <button id="daily-btn" class="secondary-btn">${model.dailyLabel || "Run Daily Gauntlet"}</button>
              <button id="quick-race-btn" class="secondary-btn">${model.quickLabel || "Instant Remix"}</button>
            </div>
          </div>
        ` : ""}
        <label class="seed-locker" for="event-custom-seed">
          <span class="section-label">Replay Seed</span>
          <input id="event-custom-seed" class="seed-input" type="number" min="0" step="1" inputmode="numeric" value="${model.customSeedValue}" placeholder="${model.customSeedPlaceholder}" ${model.customSeedEnabled ? "" : "disabled"}>
        </label>
        <div class="seed-locker-actions">
          <button id="event-custom-seed-apply" class="secondary-btn section-action-btn" type="button" ${model.customSeedEnabled ? "" : "disabled"}>${model.customSeedApplyLabel}</button>
          ${seedClearAction}
        </div>
        ${condensed ? "" : `<div id="event-custom-seed-note" class="focus-meta focus-seed-note">${model.customSeedNote}</div>`}
        ${condensed ? "" : `<div class="workspace-utility-readout">
          <div class="workspace-utility-item">
            <div class="point-label">Run</div>
            <div id="event-format-hero" class="point-value">${hero?.nextCopy || ""}</div>
          </div>
          <div class="workspace-utility-item">
            <div class="point-label">Damage</div>
            <div id="hero-recovery-copy" class="point-value">${hero?.recoveryCopy || ""}</div>
          </div>
          <div class="workspace-utility-item">
            <div class="point-label">Replay</div>
            <div id="hero-replay-copy" class="point-value">${hero?.replayCopy || ""}</div>
          </div>
          <div class="workspace-utility-item">
            <div class="point-label">Daily</div>
            <div id="hero-daily-copy" class="point-value">${hero?.dailyCopy || ""}</div>
          </div>
        </div>`}
      </div>
    </section>
  `;
}

function renderRaceBoard(model) {
  return `
    <section class="selection-block workspace-browser-block">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Strike Board</div>
        </div>
        <div class="section-head-actions">
          <button id="home-board-prev" class="secondary-btn section-action-btn" type="button" ${model.currentPage <= 0 ? "disabled" : ""}>Prev</button>
          <div id="home-board-page" class="section-note">Page ${model.currentPage + 1} / ${model.pageCount}</div>
          <button id="home-board-next" class="secondary-btn section-action-btn" type="button" ${model.currentPage >= model.pageCount - 1 ? "disabled" : ""}>Next</button>
        </div>
      </div>
      <div id="event-list" class="event-list workspace-event-list">
        ${model.visibleEvents.map((event) => `
          <button class="event-card${event.selected ? " selected" : ""}" data-event-index="${event.eventIndex}" data-kind="${event.kind}" type="button">
            <div class="card-head">
              <div class="card-title">${event.name}</div>
              <div class="card-kicker">${event.badge}</div>
            </div>
            <div class="event-meta">${event.meta}</div>
            <div class="event-meta">${event.goal}</div>
            <div class="card-footer">
              <div class="mini-tags">${renderTags(event.cardTags)}</div>
            </div>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRaceSummary(model, options = {}) {
  const hero = model.hero;
  const showPreview = Boolean(options.showPreview);
  return `
    <section class="selection-block workspace-race-summary-block">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Selected Run</div>
          ${renderInfoButton("event-info-btn", "Run help", "Route, goal, and seed status.")}
        </div>
        <div id="event-focus-badge" class="section-note hero-note">${hero?.badge || "Selected run"}</div>
      </div>
      ${renderRaceFocus(model, { compact: !showPreview, showPreview })}
    </section>
  `;
}

export function renderRaceScreen(model, section) {
  if (section === "board") {
    return `
      <div class="workspace-screen workspace-screen-race workspace-screen-race-board">
        ${renderRaceSummary(model, { showPreview: true })}
        ${renderRaceBoard(model)}
      </div>
    `;
  }
  if (section === "tools") {
    return `
      <div class="workspace-screen workspace-screen-race workspace-screen-race-tools">
        ${renderRaceSummary(model)}
        ${renderRaceToolsPanel(model, { showLaunchOverflow: model.toolsShowLaunchOverflow })}
      </div>
    `;
  }
  const soloLaunch = !model.showLaunchUtility;
  return `
    <div class="workspace-screen workspace-screen-race workspace-screen-race-launch">
      <section class="selection-block workspace-hero-block">
        <div class="workspace-race-hero${soloLaunch ? " workspace-race-hero-solo" : ""}">
          <div class="workspace-race-poster">
            <div class="section-head">
              <div class="section-head-main">
                <div class="section-label">Selected Run</div>
                ${renderInfoButton("event-info-btn", "Run help", "Route, goal, and seed status.")}
              </div>
              <div id="event-focus-badge" class="section-note hero-note">${model.hero?.badge || "Selected run"}</div>
            </div>
            ${renderRaceFocus(model, {
              showActions: true,
              showHint: !soloLaunch,
              showPreview: true,
              showSecondaryActions: model.heroShowsSecondaryActions,
            })}
          </div>
          ${model.showLaunchUtility ? `
            <div class="workspace-race-side">
              ${renderRaceToolsPanel(model, {
                compact: true,
                condensed: true,
                showLaunchOverflow: model.toolsShowLaunchOverflow,
              })}
            </div>
          ` : ""}
        </div>
      </section>
    </div>
  `;
}
