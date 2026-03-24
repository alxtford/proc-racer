const DEFAULT_HUB_PANE_SIZE = {
  width: 1280,
  height: 720,
};

function getFallbackHubPaneSize(viewportWidth, viewportHeight) {
  if (viewportHeight <= 430 && viewportWidth >= 760) {
    return {
      width: viewportWidth - 16,
      height: viewportHeight - 102,
    };
  }
  if (viewportHeight <= 640) {
    return {
      width: viewportWidth - 24,
      height: viewportHeight - 170,
    };
  }
  if (viewportWidth <= 960 || viewportHeight <= 700) {
    return {
      width: viewportWidth - 32,
      height: viewportHeight - 188,
    };
  }
  return {
    width: viewportWidth - 48,
    height: viewportHeight - 200,
  };
}

export function getHubPaneSize() {
  if (typeof document !== "undefined") {
    const host = document.getElementById("hub-screen");
    const rect = host?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
  }

  if (typeof window !== "undefined") {
    const fallbackSize = getFallbackHubPaneSize(window.innerWidth, window.innerHeight);
    return {
      width: Math.max(320, Math.round(fallbackSize.width)),
      height: Math.max(240, Math.round(fallbackSize.height)),
    };
  }

  return DEFAULT_HUB_PANE_SIZE;
}

export function isCompactHubPane(width, height) {
  return height <= 340 || (width <= 760 && height <= 420);
}
