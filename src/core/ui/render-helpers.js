export function renderTags(tags = []) {
  return tags.map((tag) => `<span class="mini-tag">${tag}</span>`).join("");
}

export function renderInfoButton(id, label, tooltip) {
  return `<button id="${id}" class="info-btn" type="button" aria-label="${label}" aria-haspopup="dialog" aria-expanded="false" data-tooltip="${tooltip}">i</button>`;
}

export function renderSummaryGrid(items = []) {
  return items.map((item) => `
    <div class="profile-item profile-item-compact">
      <div class="section-label">${item.label}</div>
      <div class="profile-value">${item.value}</div>
      <div class="profile-note">${item.note}</div>
    </div>
  `).join("");
}

export function renderIsoCarFigure(car, options = {}) {
  if (!car) return `<div class="iso-car-figure iso-car-figure-empty"><span>No chassis online</span></div>`;
  const def = car.def || car;
  const body = car.visuals?.bodyColor || car.cosmetics?.bodyColor || def.color || "#ffb100";
  const accent = car.visuals?.accentColor || car.cosmetics?.accentColor || def.color || "#8df7ff";
  const silhouette = def.silhouetteKit || "vector-touring";
  const trim = def.trimProfile || "alloy";
  const role = options.role || car.role || def.role || "Selected";
  return `
    <div class="iso-car-figure" data-silhouette="${silhouette}" data-trim="${trim}" style="--iso-car-body:${body};--iso-car-accent:${accent};">
      <div class="iso-car-shadow"></div>
      <div class="iso-car-trail"></div>
      <div class="iso-car-shell">
        <span class="iso-car-roof"></span>
        <span class="iso-car-cabin"></span>
        <span class="iso-car-stripe"></span>
        <span class="iso-car-wing"></span>
      </div>
      <div class="iso-car-meta">${role}</div>
    </div>
  `;
}

export function renderRecentRuns(runs = []) {
  if (!runs.length) {
    return [
      `<div class="results-item"><strong>First line</strong> <span class="results-inline">Finish any event to start logging pressure.</span></div>`,
      `<div class="results-item"><strong>Daily push</strong> <span class="results-inline">Plant a time on today's gauntlet and start chasing the field.</span></div>`,
      `<div class="results-item"><strong>Foundry pull</strong> <span class="results-inline">Keep stacking Flux until the next three-car reveal is live.</span></div>`,
    ].join("");
  }
  return runs.map((run) => `
    <div class="results-item">
      <strong>${run.eventName}</strong>
      <span class="results-inline">P${run.place} // ${run.finishTime} // +${run.reward} Flux // ${run.wrecks} wrecks</span>
    </div>
  `).join("");
}
