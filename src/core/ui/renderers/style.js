import { isStarterCosmetic, renderCosmeticPreview, renderStyleLivePreview } from "../legacy.js";
import { renderInfoButton } from "../render-helpers.js";

function renderStyleSlotTabs(model) {
  return `
    <div id="style-slot-tabs" class="style-slot-tabs">
      ${model.slots.map((slot) => `<button class="menu-tab${model.activeSlot === slot ? " selected" : ""}" data-style-slot="${slot}" type="button">${slot}</button>`).join("")}
    </div>
  `;
}

function renderStyleItemCard(item, activeSlot, options = {}) {
  const compact = options.compact ? " style-card-compact" : "";
  return `
    <button class="style-card${compact}${item.selected ? " selected" : ""}${item.previewing ? " previewing" : ""}" data-style-id="${item.id}" data-style-action="${item.action}" ${item.selected ? "disabled" : ""} type="button">
      ${renderCosmeticPreview(item, activeSlot)}
      <div class="card-head">
        <div class="card-title">${item.name}</div>
        <div class="card-kicker">${item.previewing ? "Preview live" : item.selected ? "Equipped" : item.owned ? "Owned" : "Shop"}</div>
      </div>
      <div class="card-meta">${item.description}</div>
      <div class="mini-tags">
        <span class="mini-tag">${item.owned ? "Owned" : `${item.cost} Scrap`}</span>
        ${item.selected ? '<span class="mini-tag">Equipped</span>' : ""}
        ${item.previewing ? '<span class="mini-tag">Previewing</span>' : ""}
      </div>
      <div class="style-card-action">${item.actionLabel}</div>
    </button>
  `;
}

export function renderStylePreviewCards(model, options = {}) {
  const includeEquipped = options.includeEquipped !== false;
  return `
    <div class="garage-item style-live-card">
      ${renderStyleLivePreview(model.preview.style, model.activeSlot, model.preview.item)}
      <div class="section-label">Live preview</div>
      <div class="profile-value">${model.preview.item?.name || "None"}</div>
      <div class="profile-note">${model.preview.statusCopy}</div>
      <div class="mini-tags">
        <span class="mini-tag">${model.preview.sourceLabel}</span>
        <span class="mini-tag">${model.preview.carName}</span>
        <span class="mini-tag">${model.preview.owned ? "Owned or starter" : `${model.preview.item?.cost || 0} Scrap`}</span>
      </div>
    </div>
    ${includeEquipped ? `
      <div class="garage-item style-equipped-card">
        ${renderCosmeticPreview(model.equippedItem, model.activeSlot)}
        <div class="section-label">${model.activeSlot} loadout</div>
        <div class="profile-value">${model.equippedItem?.name || "None"}</div>
        <div class="profile-note">${model.equippedItem?.description || "No cosmetic equipped for this slot."}</div>
        <div class="mini-tags">
          <span class="mini-tag">${isStarterCosmetic(model.equippedItem) ? "Starter issue" : "Locker owned"}</span>
          <span class="mini-tag">Equipped</span>
          <span class="mini-tag">${model.slotCount} options</span>
        </div>
      </div>
    ` : ""}
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
        <div class="section-note style-loadout-eyebrow">Current loadout</div>
        <div class="workspace-style-preview-stack">
          ${renderStylePreviewCards(model)}
        </div>
      </div>
    </section>
  `;
}

function renderCompactStyleShop(model) {
  const item = model.visibleItems[0] || null;
  return `
    <section class="selection-block workspace-style-shell workspace-style-shell-shop workspace-style-shell-compact">
      <div class="section-head">
        <div class="section-head-main">
          <div class="section-label">Style Shop</div>
          ${renderInfoButton("style-info-btn", "Style help", "Scrap buys cosmetics only. Keep the live preview and the current buy or equip decision in one compact shelf when height is tight.")}
        </div>
        <div id="scrap-currency" class="section-note">${model.scrap} Scrap</div>
      </div>
      ${renderStyleSlotTabs(model)}
      <div id="style-shop" class="style-shop workspace-style-grid workspace-style-grid-compact">
        <div id="equipped-style" class="style-equipped workspace-style-loadout-card workspace-style-loadout-card-compact">
          <div class="workspace-style-preview-stack">
            ${renderStylePreviewCards(model, { includeEquipped: false })}
          </div>
        </div>
        <div class="style-slot-group style-slot-group-compact">
          <div class="section-head style-slot-head style-slot-head-compact">
            <div class="section-head-main">
              <div class="section-label">${model.activeSlot}</div>
              <div class="section-note">${model.visibleCountLabel}</div>
            </div>
            <div class="section-head-actions style-slot-pager style-slot-pager-compact">
              <button class="secondary-btn section-action-btn" data-style-page-nav="-1" type="button" ${model.page <= 0 ? "disabled" : ""}>Prev</button>
              <button class="secondary-btn section-action-btn" data-style-page-nav="1" type="button" ${model.page >= model.pageCount - 1 ? "disabled" : ""}>Next</button>
            </div>
          </div>
          <div class="style-card-grid style-card-grid-compact">
            ${item ? renderStyleItemCard(item, model.activeSlot, { compact: true }) : '<div class="focus-copy">No cosmetics in this slot yet.</div>'}
          </div>
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
          ${renderInfoButton("style-info-btn", "Style help", "Scrap buys cosmetics only. Keep the live loadout and shopping grid together so the locker stays readable while you preview purchases.")}
        </div>
        <div id="scrap-currency" class="section-note">${model.scrap} Scrap</div>
      </div>
      ${renderStyleSlotTabs(model)}
      <div id="style-shop" class="style-shop workspace-style-grid">
        <div id="equipped-style" class="style-equipped workspace-style-loadout-card">
          <div class="section-note style-loadout-eyebrow">Current loadout</div>
          <div class="workspace-style-preview-stack">
            ${renderStylePreviewCards(model)}
          </div>
        </div>
        <div class="style-slot-group">
          <div class="section-head style-slot-head">
            <div class="section-head-main">
              <div class="section-label">${model.activeSlot}</div>
              <div class="section-note">${model.visibleCountLabel}</div>
            </div>
            <div class="section-head-actions">
              <button class="secondary-btn section-action-btn" data-style-page-nav="-1" type="button" ${model.page <= 0 ? "disabled" : ""}>Prev</button>
              <button class="secondary-btn section-action-btn" data-style-page-nav="1" type="button" ${model.page >= model.pageCount - 1 ? "disabled" : ""}>Next</button>
            </div>
          </div>
          <div class="style-card-grid">
            ${model.visibleItems.map((item) => renderStyleItemCard(item, model.activeSlot)).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderStyleScreen(model) {
  return `
    <div class="workspace-screen workspace-screen-style">
      ${model.compactLandscape ? renderCompactStyleShop(model) : renderStyleShop(model)}
    </div>
  `;
}
