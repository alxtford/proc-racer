import { renderRecentRuns, renderSummaryGrid } from "../render-helpers.js";

function renderCareerSnapshot(model) {
  return `
    <section class="selection-block profile-block">
      <div class="section-head">
        <div class="section-label">Career Snapshot</div>
        <div class="section-note">Run by run</div>
      </div>
      <div id="profile-summary" class="profile-grid profile-grid-compact">${renderSummaryGrid(model.summary)}</div>
    </section>
  `;
}

function renderCareerRuns(model) {
  return `
    <section class="selection-block profile-block">
      <div class="section-head">
        <div class="section-label">Recent Runs</div>
        <div class="section-note">Latest pressure log</div>
      </div>
      <div id="profile-runs" class="results-list results-list-compact">${renderRecentRuns(model.recentRuns)}</div>
    </section>
  `;
}

export function renderCareerScreen(model, section) {
  return `
    <div class="workspace-screen workspace-screen-career workspace-screen-sectioned">
      ${section === "runs" ? renderCareerRuns(model) : renderCareerSnapshot(model)}
    </div>
  `;
}
