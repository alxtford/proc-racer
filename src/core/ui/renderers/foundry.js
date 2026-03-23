import { renderInfoButton, renderIsoCarFigure, renderSummaryGrid } from "../render-helpers.js";

function renderFoundryForge(model) {
  return `
    <section class="selection-block workspace-foundry-machine">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Flux Foundry</div>
          ${renderInfoButton("gacha-info-btn", "Foundry help", "Flux buys three procedural car reveals. Keep any subset, assign each one to a slot, and scrap the rest.")}
        </div>
        <div id="garage-currency" class="section-note">${model.flux} Flux</div>
      </div>
      <div class="gacha-machine workspace-foundry-machine-body">
        <div class="gacha-machine-hero">
          <div class="workspace-foundry-car">
            ${renderIsoCarFigure(model.selectedCar, { role: "Forge anchor" })}
          </div>
          <div class="gacha-core"></div>
          <div class="gacha-ring gacha-ring-a"></div>
          <div class="gacha-ring gacha-ring-b"></div>
          <div class="gacha-capsule capsule-a"></div>
          <div class="gacha-capsule capsule-b"></div>
          <div class="gacha-capsule capsule-c"></div>
        </div>
        <div class="gacha-machine-side">
          <div class="gacha-machine-copy">
            <div class="focus-title">Crack 3 Procedural Cars</div>
            <div id="gacha-roll-copy" class="focus-copy">${model.rollCopy}</div>
            <div class="mini-tags">
              <span class="mini-tag">3 capsules</span>
              <span class="mini-tag">Replace any slot</span>
              <span class="mini-tag">Unused cars scrap back</span>
            </div>
          </div>
          <div class="action-row gacha-actions">
            <button id="garage-roll-btn" class="start-btn" ${model.rollDisabled ? "disabled" : ""}>${model.rollLabel}</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderFoundryReadout(model) {
  return `
    <section class="selection-block workspace-foundry-insights">
      <div class="section-head">
        <div class="section-label">Foundry Readout</div>
        <div id="profile-badge" class="section-note hero-note">${model.rollReady ? "Foundry ready" : "Build more Flux"}</div>
      </div>
      <div id="foundry-insights" class="profile-grid profile-grid-compact foundry-insights">${renderSummaryGrid(model.insights)}</div>
    </section>
  `;
}

function renderFoundrySlots(model) {
  return `
    <section class="selection-block workspace-foundry-slots">
      <div class="section-head">
        <div class="section-label">Slot Pressure</div>
        <div class="section-note">Replace only what earns it</div>
      </div>
      <div id="garage-slot-summary" class="results-list results-list-compact">
        ${model.slotSummary.map((item) => `
          <div class="results-item">
            ${item.label} <strong>${item.value}</strong>
            <span class="results-inline">${item.note}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderFoundryScreen(model, section) {
  if (section === "readout") {
    return `
      <div class="workspace-screen workspace-screen-foundry workspace-screen-sectioned">
        ${renderFoundryReadout(model)}
      </div>
    `;
  }
  if (section === "slots") {
    return `
      <div class="workspace-screen workspace-screen-foundry workspace-screen-sectioned">
        ${renderFoundrySlots(model)}
      </div>
    `;
  }
  return `
    <div class="workspace-screen workspace-screen-foundry workspace-screen-sectioned">
      ${renderFoundryForge(model)}
      ${renderFoundryReadout(model)}
    </div>
  `;
}
