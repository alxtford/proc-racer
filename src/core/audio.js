import { clamp, lerp } from "./utils.js";

export function createAudioSystem(bus, getState) {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineSubOsc = null;
  let engineGain = null;
  let engineSubGain = null;
  let engineFilter = null;
  let ambienceOsc = null;
  let ambienceGain = null;
  let initialized = false;
  let muted = false;
  let baseVolume = 0.65;
  let mode = "menu";

  function syncMasterGain() {
    if (!master) return;
    master.gain.value = muted ? 0 : clamp(baseVolume, 0, 1) * 0.12;
  }

  function ensureContext() {
    if (initialized) return;
    initialized = true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    master = context.createGain();
    syncMasterGain();
    master.connect(context.destination);

    engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 420;
    engineFilter.Q.value = 2.4;
    engineFilter.connect(master);

    engineOsc = context.createOscillator();
    engineOsc.type = "sawtooth";
    engineSubOsc = context.createOscillator();
    engineSubOsc.type = "square";
    engineGain = context.createGain();
    engineSubGain = context.createGain();
    engineGain.gain.value = 0;
    engineSubGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(engineFilter);
    engineSubOsc.connect(engineSubGain).connect(engineFilter);
    engineOsc.start();
    engineSubOsc.start();

    ambienceOsc = context.createOscillator();
    ambienceOsc.type = "triangle";
    ambienceGain = context.createGain();
    ambienceGain.gain.value = 0;
    ambienceOsc.connect(ambienceGain).connect(master);
    ambienceOsc.start();
  }

  function trigger(freq, duration, type = "square", volume = 0.05) {
    if (!context || !master) return;
    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(master);
    const now = context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  function cascade(notes, gap = 0.06) {
    notes.forEach((note, index) => {
      window.setTimeout(() => {
        const [freq, duration, type = "square", volume = 0.05] = note;
        trigger(freq, duration, type, volume);
      }, index * gap * 1000);
    });
  }

  function bindUnlock() {
    const unlock = () => {
      ensureContext();
      if (context?.state === "suspended") {
        context.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  bindUnlock();

  bus.on("countdown_tick", ({ tick }) => {
    trigger(tick <= 1 ? 880 : 660, 0.08, "square", 0.05);
  });
  bus.on("race_start", () => {
    trigger(980, 0.22, "sawtooth", 0.05);
  });
  bus.on("pickup_collect", ({ pickupId }) => {
    const freq = pickupId === "boost" ? 740 : pickupId === "shield" ? 520 : 620;
    trigger(freq, 0.12, "triangle", 0.05);
  });
  bus.on("pickup_fire", ({ pickupId }) => {
    const freq = pickupId === "boost" ? 420 : pickupId === "shield" ? 320 : 280;
    trigger(freq, 0.18, "sawtooth", 0.05);
  });
  bus.on("heavy_impact", () => {
    trigger(180, 0.2, "sawtooth", 0.07);
  });
  bus.on("wreck", () => {
    trigger(110, 0.4, "square", 0.08);
  });
  bus.on("finish", () => {
    trigger(660, 0.2, "triangle", 0.06);
    trigger(880, 0.25, "triangle", 0.05);
  });
  bus.on("garage_roll_start", () => {
    cascade([
      [190, 0.14, "square", 0.05],
      [260, 0.16, "triangle", 0.05],
      [360, 0.22, "sawtooth", 0.05],
    ], 0.08);
  });
  bus.on("garage_roll_reveal", ({ offer, slotIndex = 0 }) => {
    const tierPitch = offer?.tierId === "apex" ? 940 : offer?.tierId === "pro" ? 820 : offer?.tierId === "club" ? 700 : 580;
    cascade([
      [tierPitch - 80, 0.08, "triangle", 0.05],
      [tierPitch, 0.18, "square", 0.055],
      [tierPitch + 110 + slotIndex * 18, 0.24, "triangle", 0.045],
    ], 0.05);
  });
  bus.on("garage_roll_confirm", ({ keptCount = 1 }) => {
    cascade([
      [420, 0.12, "triangle", 0.05],
      [540, 0.12, "triangle", 0.05],
      [740 + keptCount * 40, 0.28, "sawtooth", 0.05],
    ], 0.07);
  });
  bus.on("cosmetic_buy", () => {
    cascade([
      [560, 0.08, "triangle", 0.045],
      [760, 0.18, "triangle", 0.05],
    ], 0.06);
  });
  bus.on("cosmetic_equip", () => {
    trigger(620, 0.12, "triangle", 0.04);
  });

  return {
    setSettings(nextSettings = {}) {
      if (typeof nextSettings.masterVolume === "number") baseVolume = nextSettings.masterVolume;
      if (typeof nextSettings.muted === "boolean") muted = nextSettings.muted;
      syncMasterGain();
    },
    setMode(nextMode) {
      mode = nextMode || "menu";
    },
    update() {
      if (!context || !engineOsc || !engineSubOsc) return;
      const player = getState().player;
      const loopsLive = mode === "race" && Boolean(player);
      if (!loopsLive) {
        engineGain.gain.value = lerp(engineGain.gain.value, 0, 0.32);
        engineSubGain.gain.value = lerp(engineSubGain.gain.value, 0, 0.28);
        ambienceGain.gain.value = lerp(ambienceGain.gain.value, 0, 0.2);
        return;
      }
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      const throttleLoad = clamp(Math.abs(player.throttle || 0), 0, 1);
      const targetEngine = clamp(speed / 420, 0, 1);
      const boost = player.boostTimer > 0 ? 1 : 0;
      const damagePressure = clamp(player.damage / Math.max(1, player.def?.durability || 1), 0, 1);
      const engineLoad = clamp(targetEngine * 0.7 + throttleLoad * 0.45 + damagePressure * 0.12, 0, 1);
      engineGain.gain.value = lerp(engineGain.gain.value, 0.038 + engineLoad * 0.082 + boost * 0.024, 0.2);
      engineSubGain.gain.value = lerp(engineSubGain.gain.value, 0.018 + engineLoad * 0.052, 0.18);
      engineOsc.frequency.value = 94 + speed * 0.74 + throttleLoad * 26 + boost * 34;
      engineSubOsc.frequency.value = 46 + speed * 0.34 + throttleLoad * 9;
      engineFilter.frequency.value = 320 + engineLoad * 1080 + boost * 260;
      ambienceGain.gain.value = lerp(ambienceGain.gain.value, player.destroyed ? 0.008 : 0.022 + targetEngine * 0.018, 0.08);
      ambienceOsc.frequency.value = 38 + targetEngine * 26;
    },
    debugState() {
      return {
        mode,
        contextState: context?.state || "unavailable",
        masterGain: master?.gain?.value ?? 0,
        engineGain: engineGain?.gain?.value ?? 0,
        engineSubGain: engineSubGain?.gain?.value ?? 0,
        ambienceGain: ambienceGain?.gain?.value ?? 0,
        engineFrequency: engineOsc?.frequency?.value ?? 0,
        engineSubFrequency: engineSubOsc?.frequency?.value ?? 0,
      };
    },
    ensureContext,
  };
}
