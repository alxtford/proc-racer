import { CONTROL_DEFAULTS, CONTROL_LABELS } from "../../controls.js";

export function buildSettingsModel(state) {
  const deviceStatus = state.gamepad?.connected ? " // gamepad live" : "";
  return {
    type: "settings",
    bindStatus: state.bindingAction
      ? `Press a key for ${CONTROL_LABELS[state.bindingAction]}`
      : state.save.settings.controlMode === "custom"
        ? `Custom bindings${deviceStatus}`
        : `Hybrid bindings${deviceStatus}`,
    bindings: Object.entries(CONTROL_LABELS).map(([action, label]) => ({
      action,
      label,
      key: state.save.settings.controls?.[action] || CONTROL_DEFAULTS[action],
      active: state.bindingAction === action,
    })),
  };
}
