export function renderShell(refs, shellModel, route) {
  refs.menuEyebrow.textContent = shellModel.eyebrow;
  refs.hubTitle.textContent = shellModel.title;
  refs.menuIntro.textContent = shellModel.intro;
  refs.menuOverviewInfo.dataset.tooltip = shellModel.tooltip;
  refs.menuOverviewInfo.setAttribute("aria-expanded", "false");
  refs.hubChipStrip.innerHTML = shellModel.chips
    .filter(Boolean)
    .map((chip, index) => `<span class="hero-chip${index === 0 ? " hero-chip-hero" : ""}">${chip}</span>`)
    .join("");
  refs.hubSubnav.innerHTML = (shellModel.subnav || [])
    .map((item) => `<button class="workspace-subtab${item.active ? " selected" : ""}" data-route-section="${item.id}" type="button">${item.label}</button>`)
    .join("");
  refs.hubSubnav.classList.toggle("hidden", !shellModel.subnav?.length);
  refs.hubSubnav.dataset.screen = route.screen;
  shellModel.tabs.forEach((tab) => {
    const button = refs[tab.id];
    if (!button) return;
    button.textContent = tab.label;
    button.classList.toggle("selected", route.screen === tab.screen);
    button.dataset.screen = tab.screen;
  });
}

export function renderOverlays(refs, route) {
  const splash = route.stage === "splash";
  refs.menuSplash.classList.toggle("hidden", !splash);
  refs.splashShell.classList.toggle("hidden", !splash);
  refs.menuShell.classList.toggle("hidden", splash);
  refs.menu.dataset.stage = splash ? "splash" : "hub";
  refs.menu.dataset.screen = route.screen;
}
