import { renderSummaryGrid } from "../render-helpers.js";

function renderCareerSnapshot(model) {
  return `
    <section class="selection-block profile-block">
      <div class="section-head">
        <div class="section-label">Pressure Trends</div>
        <div class="section-note">Last five vs previous five</div>
      </div>
      <div id="profile-summary" class="profile-grid profile-grid-compact">${renderSummaryGrid(model.summary)}</div>
    </section>
  `;
}

function renderCareerRuns(model) {
  const runHistory = model.runHistory.map((item) => {
    if (item.kind === "fallback") {
      return `
        <div class="results-item">
          <strong>${item.title}</strong>
          <span class="results-inline">${item.detail}</span>
        </div>
      `;
    }
    return `
      <div class="results-item profile-run-entry">
        <div class="profile-run-head">
          <strong>${item.orderLabel}. ${item.eventLabel}</strong>
          <span class="profile-run-time">${item.finishTime}</span>
        </div>
        <span class="results-inline">${item.detail}</span>
      </div>
    `;
  }).join("");

  return `
    <section class="selection-block profile-block">
      <div class="section-head">
        <div class="section-label">Run History</div>
        <div class="section-note">${model.historyCountLabel}</div>
      </div>
      <div id="profile-runs" class="results-list results-list-compact">${runHistory}</div>
    </section>
  `;
}

export function renderCareerScreen(model) {
  return `
    <div class="workspace-screen workspace-screen-career">
      ${renderCareerSnapshot(model)}
      ${renderCareerRuns(model)}
    </div>
  `;
}
