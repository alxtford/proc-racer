import { formatKeyLabel } from "../legacy.js";
import { renderInfoButton } from "../render-helpers.js";

function renderSettingsComfort() {
  return `
    <section class="selection-block settings-block workspace-settings-comfort">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Comfort + Audio</div>
          ${renderInfoButton("settings-audio-info", "Audio and comfort help", "Volume, visibility, shake, and assist all update live. Keep comfort tuning visible without another subtab.")}
        </div>
        <div class="section-note">Live updates</div>
      </div>
      <div class="settings-split workspace-settings-grid">
        <div class="settings-subcard">
          <div class="section-label">Audio</div>
          <div class="settings-stack">
            <label class="settings-row">
              <span>Master volume</span>
              <input id="settings-volume" class="settings-range" type="range" min="0" max="100" step="1" value="65">
            </label>
            <label class="settings-row settings-row-toggle">
              <span>Mute audio</span>
              <input id="settings-mute" type="checkbox">
            </label>
          </div>
        </div>
        <div class="settings-subcard">
          <div class="section-label">Visibility + Assist</div>
          <div class="settings-stack">
            <label class="settings-row settings-row-toggle">
              <span>Reduced shake</span>
              <input id="settings-shake" type="checkbox">
            </label>
            <label class="settings-row settings-row-toggle">
              <span>High contrast</span>
              <input id="settings-contrast" type="checkbox">
            </label>
            <label class="settings-row">
              <span>Assist level</span>
              <select id="settings-assist" class="settings-select">
                <option value="high">High</option>
                <option value="standard">Standard</option>
                <option value="off">Off</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSettingsControls(model) {
  return `
    <section class="selection-block settings-block workspace-settings-controls">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Controls + Devices</div>
          ${renderInfoButton("settings-controls-info", "Controls help", "Hybrid keeps the default keyboard layout and live gamepad support. Custom mode lets you remap race inputs immediately.")}
        </div>
        <div id="bind-status" class="section-note">${model.bindStatus}</div>
      </div>
      <div class="settings-split settings-split-controls workspace-settings-grid">
        <div class="settings-subcard">
          <div class="section-label">Input Mode</div>
          <div class="settings-stack">
            <label class="settings-row">
              <span>Binding mode</span>
              <select id="settings-control-mode" class="settings-select">
                <option value="hybrid">Hybrid</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>
        </div>
        <div class="settings-subcard settings-subcard-wide">
          <div class="section-label">Bindings</div>
          <div id="settings-bindings" class="binding-grid">
            ${model.bindings.map((binding) => `
              <button class="binding-btn${binding.active ? " selected" : ""}" data-action="${binding.action}" type="button">
                <span>${binding.label}</span>
                <strong>${formatKeyLabel(binding.key)}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderSettingsScreen(model, section) {
  return `
    <div class="workspace-screen workspace-screen-settings workspace-screen-sectioned">
      ${section === "controls" ? renderSettingsControls(model) : renderSettingsComfort()}
    </div>
  `;
}
