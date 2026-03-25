import { renderInfoButton, renderIsoCarFigure, renderSummaryGrid, renderTags } from "../render-helpers.js";

function renderGarageHero(model) {
  return `
    <section class="selection-block workspace-garage-hero">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Selected Car</div>
          ${renderInfoButton("car-info-btn", "Car help", "Pick the car you want to launch next.")}
        </div>
        <div id="car-focus-badge" class="section-note">${model.hero?.badge || "No car selected"}</div>
      </div>
      <div class="garage-hero workspace-car-hero">
        <div class="garage-hero-figure">
          ${renderIsoCarFigure(model.selectedCar, { role: model.hero?.badge || "Selected" })}
        </div>
        <div class="garage-hero-copy">
          <div id="car-focus-role" class="focus-meta">${model.hero?.role || ""}</div>
          <div id="car-focus-title" class="focus-title">${model.hero?.title || "No car selected"}</div>
          <div id="car-focus-copy" class="focus-copy">${model.hero?.copy || "Select a car to launch."}</div>
          <div id="car-focus-tags" class="focus-tags">${(model.hero?.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
        </div>
        <div id="car-focus-stats" class="stat-bars garage-focus-stats">${model.hero?.statsHtml || ""}</div>
      </div>
    </section>
  `;
}

function renderGarageSlots(model) {
  return `
    <section class="selection-block workspace-garage-slots">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Garage Slots</div>
          <div id="garage-slots-note" class="section-note">${model.liveCars} live // ${model.openSlots} open</div>
        </div>
        <button class="secondary-btn section-action-btn" data-route-screen="foundry" type="button">Open Foundry</button>
      </div>
      <div id="car-list" class="car-list garage-slot-list">
        ${model.cars.map((car) => `
          <button class="car-card${car.selected ? " selected" : ""}${car.filled ? "" : " open-slot"}" ${car.filled ? `data-car-id="${car.id}"` : 'data-route-screen="foundry"'} type="button">
            <div class="card-head">
              <div class="card-title">${car.title}</div>
              <div class="card-kicker">${car.kicker}</div>
            </div>
            <div class="card-meta">${car.meta}</div>
            <div class="card-footer">
              <div class="mini-tags">${renderTags(car.tags)}</div>
            </div>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderGarageSnapshot(model) {
  return `
    <section class="selection-block workspace-career-strip">
      <div class="section-head">
        <div class="section-label">Lineup Snapshot</div>
      </div>
      <div id="profile-summary" class="profile-grid profile-grid-compact">${renderSummaryGrid(model.summary)}</div>
    </section>
  `;
}

export function renderGarageScreen(model) {
  return `
    <div class="workspace-screen workspace-screen-garage">
      ${renderGarageHero(model)}
      ${renderGarageSlots(model)}
      ${renderGarageSnapshot(model)}
    </div>
  `;
}
