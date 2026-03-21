export const CONTROL_DEFAULTS = {
  left: "a",
  right: "d",
  accel: "w",
  brake: "s",
  pickup: "shift",
  retry: "r",
  pause: "escape",
  quick: "q",
  fullscreen: "f",
  daily: "d",
};

export const CONTROL_LABELS = {
  left: "Steer left",
  right: "Steer right",
  accel: "Accelerate",
  brake: "Brake-turn",
  pickup: "Use pickup",
  retry: "Retry race",
  pause: "Pause / resume",
  quick: "Instant remix",
  fullscreen: "Fullscreen",
  daily: "Daily challenge",
};

export function getControlBinding(settings = {}, action) {
  const customKey = settings.controls?.[action];
  return customKey || CONTROL_DEFAULTS[action];
}
