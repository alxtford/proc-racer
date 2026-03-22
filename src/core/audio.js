import { clamp, lerp } from "./utils.js";

export function createAudioSystem(bus, getState) {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineSubOsc = null;
  let engineBuzzOsc = null;
  let engineGain = null;
  let engineSubGain = null;
  let engineBuzzGain = null;
  let engineFilter = null;
  let ambienceOsc = null;
  let ambienceGain = null;
  let menuPadOsc = null;
  let menuPadGain = null;
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
    engineBuzzOsc = context.createOscillator();
    engineBuzzOsc.type = "triangle";
    engineGain = context.createGain();
    engineSubGain = context.createGain();
    engineBuzzGain = context.createGain();
    engineGain.gain.value = 0;
    engineSubGain.gain.value = 0;
    engineBuzzGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(engineFilter);
    engineSubOsc.connect(engineSubGain).connect(engineFilter);
    engineBuzzOsc.connect(engineBuzzGain).connect(engineFilter);
    engineOsc.start();
    engineSubOsc.start();
    engineBuzzOsc.start();

    ambienceOsc = context.createOscillator();
    ambienceOsc.type = "triangle";
    ambienceGain = context.createGain();
    ambienceGain.gain.value = 0;
    ambienceOsc.connect(ambienceGain).connect(master);
    ambienceOsc.start();

    menuPadOsc = context.createOscillator();
    menuPadOsc.type = "sine";
    menuPadGain = context.createGain();
    menuPadGain.gain.value = 0;
    menuPadOsc.connect(menuPadGain).connect(master);
    menuPadOsc.start();
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

  function noiseBurst(duration = 0.18, filterFreq = 720, volume = 0.04, type = "bandpass") {
    if (!context || !master) return;
    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }
    const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.3;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(master);
    const now = context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.start(now);
    source.stop(now + duration);
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
    trigger(tick <= 1 ? 960 : 720, 0.09, "square", 0.055);
    trigger(tick <= 1 ? 240 : 180, 0.12, "triangle", 0.038);
  });
  bus.on("race_start", () => {
    cascade([
      [160, 0.1, "square", 0.04],
      [540, 0.08, "triangle", 0.045],
      [760, 0.1, "square", 0.05],
      [1040, 0.22, "sawtooth", 0.06],
    ], 0.04);
    noiseBurst(0.2, 840, 0.03, "bandpass");
  });
  bus.on("pickup_collect", ({ pickupId }) => {
    const freq = pickupId === "boost" ? 740 : pickupId === "shield" ? 520 : 620;
    trigger(freq, 0.12, "triangle", 0.05);
    trigger(freq * 0.5, 0.16, "sine", 0.025);
  });
  bus.on("pickup_fire", ({ pickupId }) => {
    const freq = pickupId === "boost" ? 420 : pickupId === "shield" ? 320 : 280;
    trigger(freq, 0.18, "sawtooth", 0.05);
    noiseBurst(pickupId === "pulse" ? 0.16 : 0.1, pickupId === "pulse" ? 980 : 720, pickupId === "pulse" ? 0.028 : 0.02, "highpass");
  });
  bus.on("lap_complete", ({ player, bestLap }) => {
    if (!player) return;
    cascade(bestLap ? [
      [440, 0.08, "triangle", 0.04],
      [660, 0.1, "triangle", 0.045],
      [980, 0.18, "sawtooth", 0.05],
    ] : [
      [360, 0.08, "triangle", 0.032],
      [520, 0.12, "triangle", 0.036],
    ], 0.05);
  });
  bus.on("place_change", ({ player, better }) => {
    if (!player) return;
    if (better) {
      cascade([
        [420, 0.06, "triangle", 0.034],
        [620, 0.08, "triangle", 0.038],
        [860, 0.12, "sawtooth", 0.042],
      ], 0.04);
    } else {
      cascade([
        [320, 0.08, "triangle", 0.03],
        [240, 0.12, "square", 0.03],
      ], 0.04);
    }
  });
  bus.on("sector_enter", ({ player, sectorTag }) => {
    if (!player) return;
    const freq = sectorTag === "hazard" ? 240 : sectorTag === "recovery" ? 520 : sectorTag === "technical" ? 440 : 620;
    trigger(freq, 0.1, sectorTag === "hazard" ? "square" : "triangle", 0.028);
  });
  bus.on("heavy_impact", () => {
    trigger(150, 0.24, "sawtooth", 0.078);
    noiseBurst(0.18, 260, 0.055, "lowpass");
  });
  bus.on("wreck", () => {
    cascade([
      [140, 0.18, "sawtooth", 0.075],
      [96, 0.28, "square", 0.08],
      [62, 0.38, "square", 0.07],
    ], 0.05);
    noiseBurst(0.34, 180, 0.08, "lowpass");
  });
  bus.on("finish", ({ result }) => {
    const win = result?.place === 1;
    cascade(win ? [
      [420, 0.08, "triangle", 0.045],
      [620, 0.1, "triangle", 0.05],
      [920, 0.14, "triangle", 0.056],
      [1280, 0.32, "sawtooth", 0.065],
    ] : [
      [520, 0.1, "triangle", 0.04],
      [740, 0.12, "triangle", 0.045],
      [980, 0.22, "sawtooth", 0.05],
    ], 0.06);
    noiseBurst(win ? 0.22 : 0.16, win ? 1200 : 840, win ? 0.028 : 0.02, "bandpass");
  });
  bus.on("garage_roll_start", () => {
    cascade([
      [170, 0.1, "square", 0.045],
      [210, 0.1, "square", 0.045],
      [280, 0.12, "triangle", 0.05],
      [380, 0.2, "sawtooth", 0.055],
    ], 0.06);
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
      [420, 0.08, "triangle", 0.048],
      [620, 0.1, "triangle", 0.05],
      [860 + keptCount * 44, 0.26, "sawtooth", 0.055],
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
      if (!context || !engineOsc || !engineSubOsc || !engineBuzzOsc || !menuPadOsc) return;
      const player = getState().player;
      const loopsLive = mode === "race" && Boolean(player);
      if (!loopsLive) {
        engineGain.gain.value = lerp(engineGain.gain.value, 0, 0.32);
        engineSubGain.gain.value = lerp(engineSubGain.gain.value, 0, 0.28);
        engineBuzzGain.gain.value = lerp(engineBuzzGain.gain.value, 0, 0.3);
        ambienceGain.gain.value = lerp(ambienceGain.gain.value, 0, 0.2);
        const menuTarget = mode === "menu" ? 0.014 : mode === "results" ? 0.011 : mode === "paused" ? 0.006 : 0;
        menuPadGain.gain.value = lerp(menuPadGain.gain.value, menuTarget, 0.08);
        menuPadOsc.frequency.value = mode === "results" ? 132 : mode === "paused" ? 96 : 108;
        return;
      }
      menuPadGain.gain.value = lerp(menuPadGain.gain.value, 0, 0.18);
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      const throttleLoad = clamp(Math.abs(player.throttle || 0), 0, 1);
      const targetEngine = clamp(speed / 420, 0, 1);
      const boost = player.boostTimer > 0 ? 1 : 0;
      const slingshot = player.slingshotTimer > 0.08 ? 1 : 0;
      const drift = clamp(player.driftLevel || 0, 0, 1);
      const damagePressure = clamp(player.damage / Math.max(1, player.def?.durability || 1), 0, 1);
      const engineLoad = clamp(targetEngine * 0.7 + throttleLoad * 0.45 + damagePressure * 0.12, 0, 1);
      engineGain.gain.value = lerp(engineGain.gain.value, 0.038 + engineLoad * 0.082 + boost * 0.024 + slingshot * 0.012, 0.2);
      engineSubGain.gain.value = lerp(engineSubGain.gain.value, 0.018 + engineLoad * 0.052, 0.18);
      engineBuzzGain.gain.value = lerp(engineBuzzGain.gain.value, 0.004 + engineLoad * 0.026 + drift * 0.016 + boost * 0.012 + slingshot * 0.014, 0.16);
      engineOsc.frequency.value = 94 + speed * 0.74 + throttleLoad * 26 + boost * 34 + slingshot * 18;
      engineSubOsc.frequency.value = 46 + speed * 0.34 + throttleLoad * 9;
      engineBuzzOsc.frequency.value = 142 + speed * 1.08 + throttleLoad * 38 + drift * 42 + boost * 54;
      engineFilter.frequency.value = 320 + engineLoad * 1080 + boost * 260 + drift * 120;
      engineFilter.Q.value = 2.2 + drift * 1.1 + slingshot * 0.6;
      ambienceGain.gain.value = lerp(ambienceGain.gain.value, player.destroyed ? 0.008 : 0.022 + targetEngine * 0.018 + slingshot * 0.01, 0.08);
      ambienceOsc.frequency.value = 38 + targetEngine * 26 + slingshot * 6;
    },
    debugState() {
      return {
        mode,
        contextState: context?.state || "unavailable",
        masterGain: master?.gain?.value ?? 0,
        engineGain: engineGain?.gain?.value ?? 0,
        engineSubGain: engineSubGain?.gain?.value ?? 0,
        engineBuzzGain: engineBuzzGain?.gain?.value ?? 0,
        ambienceGain: ambienceGain?.gain?.value ?? 0,
        menuPadGain: menuPadGain?.gain?.value ?? 0,
        engineFrequency: engineOsc?.frequency?.value ?? 0,
        engineSubFrequency: engineSubOsc?.frequency?.value ?? 0,
        engineBuzzFrequency: engineBuzzOsc?.frequency?.value ?? 0,
      };
    },
    ensureContext,
  };
}
