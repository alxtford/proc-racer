import { renderInfoButton, renderIsoCarFigure, renderSummaryGrid } from "../render-helpers.js";

function renderFoundryForge(model) {
  const headActions = `
    <div class="section-head-actions workspace-foundry-head-actions">
      <div id="garage-currency" class="section-note">${model.flux} Flux</div>
      <button id="garage-roll-btn" class="start-btn section-action-btn workspace-foundry-head-action" type="button" ${model.rollDisabled ? "disabled" : ""}>${model.rollLabel}</button>
    </div>
  `;
  return `
    <section class="selection-block workspace-foundry-machine">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Flux Foundry</div>
          ${renderInfoButton("gacha-info-btn", "Foundry help", "Roll three cars. Keep what earns a slot and scrap the rest.")}
        </div>
        ${headActions}
      </div>
      <div class="gacha-machine workspace-foundry-machine-body${model.compactLandscape ? " workspace-foundry-machine-body-compact" : ""}">
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
            <div class="focus-title">${model.machineTitle}</div>
            <div id="gacha-roll-copy" class="focus-copy">${model.rollCopy}</div>
            <div class="mini-tags">
              <span class="mini-tag">3 cars</span>
              <span class="mini-tag">Any slot</span>
              <span class="mini-tag">Scrap the rest</span>
            </div>
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
        <div id="profile-badge" class="section-note hero-note">${model.rollReady ? "Ready" : "Need Flux"}</div>
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

export function renderFoundryScreen(model) {
  return `
    <div class="workspace-screen workspace-screen-foundry${model.compactLandscape ? " workspace-screen-foundry-compact" : ""}">
      ${renderFoundryForge(model)}
      ${renderFoundryReadout(model)}
      ${renderFoundrySlots(model)}
    </div>
  `;
}
