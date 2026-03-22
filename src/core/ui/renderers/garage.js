import { renderInfoButton, renderSummaryGrid, renderTags } from "../render-helpers.js";

function renderGarageHero(model) {
  return `
    <section class="selection-block workspace-garage-hero">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Selected Car</div>
          ${renderInfoButton("car-info-btn", "Car help", "The selected chassis anchors your next launch, with slot browsing and pressure split into their own views.")}
        </div>
        <div id="car-focus-badge" class="section-note">${model.hero?.badge || "No car selected"}</div>
      </div>
      <div class="garage-hero workspace-car-hero">
        <div class="garage-hero-copy">
          <div id="car-focus-role" class="focus-meta">${model.hero?.role || ""}</div>
          <div id="car-focus-title" class="focus-title">${model.hero?.title || "No car selected"}</div>
          <div id="car-focus-copy" class="focus-copy">${model.hero?.copy || "Keep a car selected to launch straight from Race."}</div>
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
        <button class="secondary-btn section-action-btn" data-route-screen="foundry" type="button">Jump To Foundry</button>
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
        <div class="section-note">Pressure at a glance</div>
      </div>
      <div id="profile-summary" class="profile-grid profile-grid-compact">${renderSummaryGrid(model.summary)}</div>
    </section>
  `;
}

export function renderGarageScreen(model, section) {
  if (section === "slots") {
    return `
      <div class="workspace-screen workspace-screen-garage workspace-screen-sectioned">
        ${renderGarageSlots(model)}
      </div>
    `;
  }
  if (section === "snapshot") {
    return `
      <div class="workspace-screen workspace-screen-garage workspace-screen-sectioned">
        ${renderGarageSnapshot(model)}
      </div>
    `;
  }
  return `
    <div class="workspace-screen workspace-screen-garage workspace-screen-sectioned">
      ${renderGarageHero(model)}
      ${renderGarageSnapshot(model)}
    </div>
  `;
}
