import { renderCosmeticPreview } from "../legacy.js";
import { renderInfoButton } from "../render-helpers.js";

function renderStyleSlotTabs(model) {
  return `
    <div id="style-slot-tabs" class="style-slot-tabs">
      ${model.slots.map((slot) => `<button class="menu-tab${model.activeSlot === slot ? " selected" : ""}" data-style-slot="${slot}" type="button">${slot}</button>`).join("")}
    </div>
  `;
}

function renderStyleLoadout(model) {
  return `
    <section class="selection-block workspace-style-shell workspace-style-shell-loadout">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Style Locker</div>
          ${renderInfoButton("style-info-btn", "Style help", "Scrap buys cosmetics only. The locker previews the live loadout while keeping the shop in a separate view.")}
        </div>
        <div id="scrap-currency" class="section-note">${model.scrap} Scrap</div>
      </div>
      ${renderStyleSlotTabs(model)}
      <div id="equipped-style" class="style-equipped workspace-style-loadout-card">
        <div class="garage-item style-equipped-card">
          ${renderCosmeticPreview(model.equippedItem, model.activeSlot)}
          <div class="section-label">${model.activeSlot} loadout</div>
          <div class="profile-value">${model.equippedItem?.name || "None"}</div>
          <div class="profile-note">${model.equippedItem?.description || "No cosmetic equipped for this slot."}</div>
        </div>
      </div>
    </section>
  `;
}

function renderStyleShop(model) {
  return `
    <section class="selection-block workspace-style-shell workspace-style-shell-shop">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Style Shop</div>
          ${renderInfoButton("style-info-btn", "Style help", "Scrap buys cosmetics only. Split the live loadout from the shopping grid to keep the locker readable.")}
        </div>
        <div id="scrap-currency" class="section-note">${model.scrap} Scrap</div>
      </div>
      ${renderStyleSlotTabs(model)}
      <div id="style-shop" class="style-shop">
        <div class="style-slot-group">
          <div class="section-head style-slot-head">
            <div class="section-head-main">
              <div class="section-label">${model.activeSlot}</div>
              <div class="section-note">${model.visibleItems.length} visible // page ${model.page + 1} / ${model.pageCount}</div>
            </div>
            <div class="section-head-actions">
              <button class="secondary-btn section-action-btn" data-style-page-nav="-1" type="button" ${model.page <= 0 ? "disabled" : ""}>Prev</button>
              <button class="secondary-btn section-action-btn" data-style-page-nav="1" type="button" ${model.page >= model.pageCount - 1 ? "disabled" : ""}>Next</button>
            </div>
          </div>
          <div class="style-card-grid">
            ${model.visibleItems.map((item) => `
              <button class="style-card${item.selected ? " selected" : ""}" data-style-id="${item.id}" data-style-action="${item.action}" ${item.selected ? "disabled" : ""} type="button">
                ${renderCosmeticPreview(item, model.activeSlot)}
                <div class="card-head">
                  <div class="card-title">${item.name}</div>
                  <div class="card-kicker">${item.owned ? "Owned" : "Shop"}</div>
                </div>
                <div class="card-meta">${item.description}</div>
                <div class="mini-tags">
                  <span class="mini-tag">${item.owned ? "Owned" : `${item.cost} Scrap`}</span>
                  ${item.selected ? '<span class="mini-tag">Live</span>' : ""}
                </div>
                <div class="style-card-action">${item.actionLabel}</div>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderStyleScreen(model, section) {
  return `
    <div class="workspace-screen workspace-screen-style workspace-screen-sectioned">
      ${section === "shop" ? renderStyleShop(model) : renderStyleLoadout(model)}
    </div>
  `;
}
