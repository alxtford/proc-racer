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
