import { CONTROL_DEFAULTS, CONTROL_LABELS } from "../../controls.js";

export function buildSettingsModel(state) {
  const deviceStatus = state.gamepad?.connected ? " // gamepad live" : "";
  const masterVolume = Math.round((state.save.settings.masterVolume ?? 0.65) * 100);
  const muted = Boolean(state.save.settings.muted);
  const reducedShake = Boolean(state.save.settings.reducedShake);
  const highContrast = Boolean(state.save.settings.highContrast);
  const assistLevel = state.save.settings.assistLevel || "standard";
  return {
    type: "settings",
    bindStatus: state.bindingAction
      ? `Press a key for ${CONTROL_LABELS[state.bindingAction]}`
      : state.save.settings.controlMode === "custom"
        ? `Custom bindings${deviceStatus}`
        : `Hybrid bindings${deviceStatus}`,
    comfortSummary: [
      {
        label: "Audio profile",
        value: muted ? "Muted" : `${masterVolume}% master`,
        note: muted ? "Audio muted." : "Live across menu and race.",
      },
      {
        label: "Assist profile",
        value: `${assistLevel.charAt(0).toUpperCase()}${assistLevel.slice(1)} assist`,
        note: `${reducedShake ? "Reduced shake" : "Full shake"} // ${highContrast ? "High contrast" : "Standard contrast"}`,
      },
    ],
    bindings: Object.entries(CONTROL_LABELS).map(([action, label]) => ({
      action,
      label,
      key: state.save.settings.controls?.[action] || CONTROL_DEFAULTS[action],
      active: state.bindingAction === action,
    })),
  };
}
