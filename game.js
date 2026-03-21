(function () {
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hud = {
    root: document.getElementById("hud"),
    menuShell: document.getElementById("menu-shell"),
    eventName: document.getElementById("event-name"),
    eventMeta: document.getElementById("event-meta"),
    raceStatus: document.getElementById("race-status"),
    lapStatus: document.getElementById("lap-status"),
    pickupStatus: document.getElementById("pickup-status"),
    damageStatus: document.getElementById("damage-status"),
    banner: document.getElementById("banner"),
    menu: document.getElementById("menu"),
    eventList: document.getElementById("event-list"),
    carList: document.getElementById("car-list"),
    startBtn: document.getElementById("start-btn"),
    quickRaceBtn: document.getElementById("quick-race-btn"),
    careerStatus: document.getElementById("career-status"),
    dailyStatus: document.getElementById("daily-status"),
    eventFormatHero: document.getElementById("event-format-hero"),
    eventFocusBadge: document.getElementById("event-focus-badge"),
    eventFocusTitle: document.getElementById("event-focus-title"),
    eventFocusMeta: document.getElementById("event-focus-meta"),
    eventFocusCopy: document.getElementById("event-focus-copy"),
    eventFocusModifiers: document.getElementById("event-focus-modifiers"),
    carFocusBadge: document.getElementById("car-focus-badge"),
    carFocusTitle: document.getElementById("car-focus-title"),
    carFocusCopy: document.getElementById("car-focus-copy"),
    carFocusStats: document.getElementById("car-focus-stats"),
  };

  const palettes = {
    industrial: { bg: "#061020", track: "#17284d", trackEdge: "#8cf2ff", inside: "#0a1529", decoA: "#ff5ccb", decoB: "#50f9d8", glow: "rgba(141,247,255,0.22)" },
    freeway: { bg: "#080617", track: "#25184a", trackEdge: "#ffd36e", inside: "#0d0820", decoA: "#8df7ff", decoB: "#ff74e2", glow: "rgba(255,211,110,0.18)" },
    void: { bg: "#02050d", track: "#13213d", trackEdge: "#50f9d8", inside: "#050b17", decoA: "#b68cff", decoB: "#ff5ccb", glow: "rgba(80,249,216,0.2)" },
  };

  const archetypes = {
    grip: { id: "grip", name: "Grip", color: "#50f9d8", accel: 430, maxSpeed: 360, turn: 2.8, grip: 8.5, durability: 124, mass: 1, description: "hooks hard into corners, weaker top end" },
    muscle: { id: "muscle", name: "Muscle", color: "#ff8d6e", accel: 520, maxSpeed: 332, turn: 2.2, grip: 6.4, durability: 138, mass: 1.12, description: "brutal launch, wide arc steering" },
    interceptor: { id: "interceptor", name: "Interceptor", color: "#8df7ff", accel: 410, maxSpeed: 396, turn: 2.35, grip: 5.7, durability: 116, mass: 0.96, description: "highest velocity, twitchier under impact" },
    balanced: { id: "balanced", name: "Balanced", color: "#ffd36e", accel: 455, maxSpeed: 352, turn: 2.5, grip: 7.2, durability: 126, mass: 1.03, description: "unlocked all-rounder with stable recovery" },
  };

  const eventLadder = [
    { name: "Neon Runoff", type: "circuit", laps: 3, aiCount: 5, seed: 1103, theme: "industrial", modifiers: ["fragile-barriers"], summary: "Tight industrial loop that gets you into contact quickly without overcomplicating the opener." },
    { name: "Grid Slipstream", type: "sprint", laps: 1, aiCount: 5, seed: 2088, theme: "freeway", modifiers: ["dense-pickups"], summary: "Long freeway sprint with generous boost lines and clean one-shot readability." },
    { name: "Void Collar", type: "circuit", laps: 4, aiCount: 6, seed: 3155, theme: "void", modifiers: ["high-damage-hazards"], summary: "A harsher loop where staying tidy matters more than raw pace." },
    { name: "Pulse Causeway", type: "sprint", laps: 1, aiCount: 6, seed: 4410, theme: "industrial", modifiers: ["dense-traffic"], summary: "Sprint event built for disruption, with quick overtake windows and pressure from traffic." },
    { name: "Arc Halo", type: "circuit", laps: 4, aiCount: 6, seed: 5723, theme: "freeway", modifiers: ["extra-pulse"], summary: "Fast outer-ring circuit where pulse timing is stronger than brute force." },
    { name: "Shatterline", type: "sprint", laps: 1, aiCount: 7, seed: 6991, theme: "void", modifiers: ["fragile-barriers", "high-damage-hazards"], summary: "High-chaos late ladder route that rewards clean exits and quick recovery." },
  ];

  const modifierLabels = {
    "fragile-barriers": "Fragile barriers",
    "dense-pickups": "Dense pickups",
    "high-damage-hazards": "High-damage hazards",
    "dense-traffic": "Dense traffic",
    "extra-pulse": "Extra pulse drops",
  };

  const saveKey = "proc-racer-save-v1";
  const defaultSave = { unlockedCars: ["grip", "muscle", "interceptor"], eventProgress: 0, bestTimes: {}, wins: 0, cosmeticsUnlocked: [], dailyBest: null };
  const state = {
    mode: "menu",
    keys: new Set(),
    width: 1280,
    height: 720,
    viewScale: 1,
    camera: { x: 0, y: 0, shake: 0 },
    selectedEventIndex: 0,
    selectedCarId: "grip",
    events: [],
    currentEvent: null,
    track: null,
    player: null,
    cars: [],
    debris: [],
    fx: [],
    pickups: [],
    hazards: [],
    finishTime: null,
    bannerTimer: 0,
    elapsed: 0,
    countdown: 0,
    lastTick: 0,
    save: loadSave(),
  };

  function loadSave() {
    try {
      const raw = localStorage.getItem(saveKey);
      if (!raw) return structuredClone(defaultSave);
      return { ...structuredClone(defaultSave), ...JSON.parse(raw) };
    } catch (error) {
      return structuredClone(defaultSave);
    }
  }

  function persistSave() {
    localStorage.setItem(saveKey, JSON.stringify(state.save));
  }

  function createEvents() {
    const todaySeed = Number(new Date().toISOString().slice(0, 10).replaceAll("-", ""));
    const daily = {
      name: "Daily Rift",
      type: todaySeed % 2 === 0 ? "circuit" : "sprint",
      laps: todaySeed % 2 === 0 ? 4 : 1,
      aiCount: 6,
      seed: todaySeed,
      theme: ["industrial", "freeway", "void"][todaySeed % 3],
      modifiers: todaySeed % 3 === 0 ? ["dense-pickups"] : ["high-damage-hazards"],
      daily: true,
      summary: "Fresh seeded challenge that rotates daily for quick replay value without setup friction.",
    };
    state.events = [...eventLadder, daily];
  }

  function formatRaceType(event) {
    return event.type === "circuit" ? `${event.laps} lap circuit` : "point-to-point sprint";
  }

  function formatEventMeta(event) {
    return `${formatRaceType(event)} // AI ${event.aiCount} // ${event.theme}`;
  }

  function formatModifierTag(modifier) {
    return modifierLabels[modifier] || modifier.replaceAll("-", " ");
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds - mins * 60;
    return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
  }

  function getSelectedEvent() {
    return state.events[state.selectedEventIndex];
  }

  function createRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  function samplePath(points, t) {
    const count = points.length;
    const scaled = ((t % 1) + 1) % 1 * count;
    const i0 = Math.floor(scaled) % count;
    const i1 = (i0 + 1) % count;
    const mix = scaled - Math.floor(scaled);
    return { x: lerp(points[i0].x, points[i1].x, mix), y: lerp(points[i0].y, points[i1].y, mix) };
  }

  function nearestPathInfo(track, x, y) {
    let best = { distance: Infinity, index: 0, t: 0, point: track.points[0], tangent: { x: 1, y: 0 } };
    for (let i = 0; i < track.points.length - (track.type === "circuit" ? 0 : 1); i += 1) {
      const a = track.points[i];
      const b = track.points[(i + 1) % track.points.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = x - a.x;
      const apy = y - a.y;
      const denom = abx * abx + aby * aby || 1;
      const proj = clamp((apx * abx + apy * aby) / denom, 0, 1);
      const px = a.x + abx * proj;
      const py = a.y + aby * proj;
      const distance = Math.hypot(x - px, y - py);
      if (distance < best.distance) {
        best = { distance, index: i, t: (i + proj) / track.points.length, point: { x: px, y: py }, tangent: normalize(abx, aby) };
      }
    }
    return best;
  }

  function buildTrack(event) {
    const rng = createRng(event.seed);
    const controlPoints = [];
    const width = event.type === "circuit" ? 180 + rng() * 24 : 170 + rng() * 20;
    const theme = palettes[event.theme];
    if (event.type === "circuit") {
      const count = 10 + Math.floor(rng() * 4);
      const baseRadius = 760 + rng() * 120;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU;
        const radius = baseRadius + (rng() - 0.5) * 320;
        controlPoints.push({ x: Math.cos(angle) * radius * (0.9 + rng() * 0.25), y: Math.sin(angle) * radius * (0.7 + rng() * 0.28) });
      }
    } else {
      const count = 12;
      for (let i = 0; i < count; i += 1) {
        const t = i / (count - 1);
        controlPoints.push({ x: lerp(-1100, 1100, t), y: (rng() - 0.5) * 900 + Math.sin(t * TAU * 1.5) * 260 });
      }
    }

    const points = [];
    const segmentsPer = event.type === "circuit" ? 18 : 15;
    for (let i = 0; i < controlPoints.length - (event.type === "circuit" ? 0 : 1); i += 1) {
      const prev = controlPoints[(i - 1 + controlPoints.length) % controlPoints.length];
      const a = controlPoints[i];
      const b = controlPoints[(i + 1) % controlPoints.length];
      const next = controlPoints[(i + 2) % controlPoints.length];
      for (let s = 0; s < segmentsPer; s += 1) {
        const t = s / segmentsPer;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2 * a.x) + (-prev.x + b.x) * t + (2 * prev.x - 5 * a.x + 4 * b.x - next.x) * t2 + (-prev.x + 3 * a.x - 3 * b.x + next.x) * t3);
        const y = 0.5 * ((2 * a.y) + (-prev.y + b.y) * t + (2 * prev.y - 5 * a.y + 4 * b.y - next.y) * t2 + (-prev.y + 3 * a.y - 3 * b.y + next.y) * t3);
        points.push({ x, y });
      }
    }
    if (event.type === "sprint") points.push({ ...controlPoints[controlPoints.length - 1] });

    const checkpoints = [];
    const checkpointCount = event.type === "circuit" ? 10 : 8;
    for (let i = 0; i < checkpointCount; i += 1) {
      const idx = Math.floor((i / checkpointCount) * points.length);
      checkpoints.push({ index: idx, ...points[idx] });
    }

    const pickups = [];
    const pickupCount = event.modifiers.includes("dense-pickups") ? 10 : 6;
    for (let i = 0; i < pickupCount; i += 1) {
      const idx = Math.floor((i + 1) * (points.length / (pickupCount + 1)));
      const base = points[idx];
      const tangent = normalize(points[(idx + 1) % points.length].x - base.x, points[(idx + 1) % points.length].y - base.y);
      const normal = { x: -tangent.y, y: tangent.x };
      pickups.push({
        x: base.x + normal.x * ((rng() - 0.5) * width * 0.45),
        y: base.y + normal.y * ((rng() - 0.5) * width * 0.45),
        kind: i % 3 === 0 || event.modifiers.includes("extra-pulse") ? "pulse" : "boost",
        active: true,
        respawn: 0,
      });
    }

    const hazards = [];
    const hazardCount = event.modifiers.includes("high-damage-hazards") ? 7 : 4;
    for (let i = 0; i < hazardCount; i += 1) {
      const idx = Math.floor(rng() * points.length);
      const p = points[idx];
      hazards.push({ x: p.x + (rng() - 0.5) * width * 0.5, y: p.y + (rng() - 0.5) * width * 0.5, radius: 18 + rng() * 16, damage: 8 + rng() * 5 });
    }

    const props = [];
    for (let i = 0; i < points.length; i += 8) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const tangent = normalize(b.x - a.x, b.y - a.y);
      const normal = { x: -tangent.y, y: tangent.x };
      const distanceOut = width * (0.7 + rng() * 0.45);
      props.push({ x: a.x + normal.x * distanceOut, y: a.y + normal.y * distanceOut, size: 20 + rng() * 28, alive: true });
      props.push({ x: a.x - normal.x * distanceOut, y: a.y - normal.y * distanceOut, size: 16 + rng() * 24, alive: true });
    }

    return {
      type: event.type,
      width,
      theme,
      points,
      checkpoints,
      pickups,
      hazards,
      props,
      start: samplePath(points, event.type === "circuit" ? 0 : 0.03),
      finish: samplePath(points, event.type === "circuit" ? 0 : 0.97),
    };
  }

  function createCar(archetypeId, isPlayer, slot) {
    const spec = archetypes[archetypeId];
    const track = state.track;
    const offsetT = 0.02 + slot * 0.012;
    const start = samplePath(track.points, offsetT);
    const look = samplePath(track.points, offsetT + 0.003);
    const dir = Math.atan2(look.y - start.y, look.x - start.x);
    const laneOffset = (slot % 2 === 0 ? -1 : 1) * Math.floor(slot / 2) * 24;
    return {
      id: `${isPlayer ? "player" : "ai"}-${slot}`,
      label: isPlayer ? "You" : `AI-${slot}`,
      x: start.x + Math.cos(dir + Math.PI / 2) * laneOffset,
      y: start.y + Math.sin(dir + Math.PI / 2) * laneOffset,
      vx: 0,
      vy: 0,
      angle: dir,
      steer: 0,
      throttle: 0,
      width: 26,
      length: 48,
      archetypeId,
      spec,
      isPlayer,
      aiProgress: offsetT,
      currentLap: 1,
      finished: false,
      finishMs: 0,
      checkpointIndex: 0,
      respawnCheckpoint: 0,
      pickup: null,
      pickupCooldown: 0,
      boostTimer: 0,
      invuln: 0,
      damage: 0,
      health: spec.durability,
      visibleParts: ["bumper", "door", "spoiler", "panel"],
      destroyed: false,
      respawnTimer: 0,
      chassisFlash: 0,
      place: slot + 1,
      powerPenalty: 0,
    };
  }

  function showBanner(text) {
    hud.banner.textContent = text;
    hud.banner.classList.remove("hidden");
    state.bannerTimer = 2;
  }

  function updateMenuScale() {
    const shell = hud.menuShell;
    if (!shell) return;
    shell.style.setProperty("--menu-scale", "1");
    const availableWidth = window.innerWidth - 24;
    const availableHeight = window.innerHeight - 24;
    const width = shell.scrollWidth || 1;
    const height = shell.scrollHeight || 1;
    const scale = Math.min(1, availableWidth / width, availableHeight / height);
    shell.style.setProperty("--menu-scale", scale.toFixed(4));
  }

  function setMenuOpen(isOpen) {
    hud.menu.classList.toggle("hidden", !isOpen);
    hud.root.classList.toggle("menu-open", isOpen);
    if (isOpen) updateMenuScale();
  }

  function startRace(eventIndex, carId) {
    state.selectedEventIndex = eventIndex;
    state.selectedCarId = carId;
    state.currentEvent = state.events[eventIndex];
    state.track = buildTrack(state.currentEvent);
    state.player = createCar(carId, true, 0);
    state.cars = [state.player];
    const aiPool = ["grip", "muscle", "interceptor", "balanced"];
    for (let i = 0; i < state.currentEvent.aiCount; i += 1) {
      state.cars.push(createCar(aiPool[(i + eventIndex) % aiPool.length], false, i + 1));
    }
    state.pickups = state.track.pickups.map((pickup) => ({ ...pickup }));
    state.hazards = state.track.hazards.map((hazard) => ({ ...hazard }));
    state.debris = [];
    state.fx = [];
    state.finishTime = null;
    state.elapsed = 0;
    state.countdown = 2.5;
    state.mode = "race";
    setMenuOpen(false);
    showBanner(`${state.currentEvent.name} // ${state.currentEvent.type}`);
    updateHud();
  }

  function startSelectedRace() {
    startRace(state.selectedEventIndex, state.selectedCarId);
  }

  function startQuickRace() {
    const unlockedCars = state.save.unlockedCars;
    const rng = createRng(Date.now());
    state.selectedEventIndex = Math.floor(rng() * state.events.length);
    state.selectedCarId = unlockedCars[Math.floor(rng() * unlockedCars.length)] || state.selectedCarId;
    syncMenu();
    startSelectedRace();
  }

  function usePickup(car) {
    if (!car.pickup || car.pickupCooldown > 0 || car.destroyed) return;
    if (car.pickup === "boost") {
      car.boostTimer = 1.5;
      state.fx.push({ kind: "ring", x: car.x, y: car.y, radius: 18, life: 0.5, color: "#ffd36e" });
    } else if (car.pickup === "pulse") {
      state.fx.push({ kind: "pulse", x: car.x, y: car.y, radius: 40, maxRadius: 180, life: 0.45, color: "#ff5ccb", owner: car.id });
      for (const target of state.cars) {
        if (target.id === car.id || target.destroyed || target.invuln > 0) continue;
        const distance = Math.hypot(target.x - car.x, target.y - car.y);
        if (distance < 180) {
          const power = (1 - distance / 180) * 22;
          applyDamage(target, power, "pulse");
          const away = normalize(target.x - car.x, target.y - car.y);
          target.vx += away.x * 130;
          target.vy += away.y * 130;
        }
      }
    }
    car.pickup = null;
    car.pickupCooldown = 0.6;
  }

  function applyDamage(car, amount, source) {
    if (car.destroyed || car.invuln > 0) return;
    car.damage += amount;
    car.health = Math.max(0, car.spec.durability - car.damage);
    car.chassisFlash = 0.22;
    car.powerPenalty = clamp(car.damage / car.spec.durability, 0, 0.45);
    state.camera.shake = Math.max(state.camera.shake, amount * 0.18);
    const thresholds = [0.22, 0.45, 0.68, 0.82];
    while (car.visibleParts.length && car.damage / car.spec.durability > thresholds[4 - car.visibleParts.length]) {
      car.visibleParts.shift();
      state.debris.push({
        x: car.x,
        y: car.y,
        vx: car.vx * 0.3 + (Math.random() - 0.5) * 120,
        vy: car.vy * 0.3 + (Math.random() - 0.5) * 120,
        size: 8 + Math.random() * 12,
        life: 2 + Math.random(),
        color: car.spec.color,
      });
    }
    if (source !== "scrape") {
      state.fx.push({ kind: "spark", x: car.x, y: car.y, radius: 10 + amount, life: 0.24, color: "#ffffff" });
    }
    if (car.damage >= car.spec.durability) {
      destroyCar(car);
    }
  }

  function destroyCar(car) {
    if (car.destroyed) return;
    car.destroyed = true;
    car.respawnTimer = 2.4;
    car.vx = 0;
    car.vy = 0;
    state.fx.push({ kind: "pulse", x: car.x, y: car.y, radius: 24, maxRadius: 220, life: 0.8, color: "#ff6d7f", owner: car.id });
    for (let i = 0; i < 8; i += 1) {
      state.debris.push({
        x: car.x,
        y: car.y,
        vx: Math.cos((i / 8) * TAU) * (80 + Math.random() * 120),
        vy: Math.sin((i / 8) * TAU) * (80 + Math.random() * 120),
        size: 10 + Math.random() * 14,
        life: 1.4 + Math.random() * 1.2,
        color: i % 2 === 0 ? car.spec.color : "#f7f2ff",
      });
    }
    if (car.isPlayer) showBanner("Vehicle destroyed");
  }

  function respawnCar(car) {
    const checkpoint = state.track.checkpoints[car.respawnCheckpoint] || state.track.checkpoints[0];
    const next = state.track.checkpoints[(car.respawnCheckpoint + 1) % state.track.checkpoints.length];
    car.x = checkpoint.x;
    car.y = checkpoint.y;
    car.vx = 0;
    car.vy = 0;
    car.angle = Math.atan2(next.y - checkpoint.y, next.x - checkpoint.x);
    car.destroyed = false;
    car.invuln = 1.5;
    car.damage = Math.max(0, car.spec.durability * 0.2);
    car.health = car.spec.durability - car.damage;
    car.visibleParts = ["bumper", "door", "spoiler", "panel"].slice(Math.floor((car.damage / car.spec.durability) * 4));
    car.powerPenalty = clamp(car.damage / car.spec.durability, 0, 0.25);
    if (car.isPlayer) showBanner("Respawned");
  }

  function updateCarInput(car, dt) {
    if (car.isPlayer) {
      const left = state.keys.has("arrowleft") || state.keys.has("a");
      const right = state.keys.has("arrowright") || state.keys.has("d");
      const accel = state.keys.has("arrowup") || state.keys.has("w");
      const brake = state.keys.has("arrowdown") || state.keys.has("s") || state.keys.has(" ");
      car.steer = (right ? 1 : 0) - (left ? 1 : 0);
      car.throttle = accel ? 1 : brake ? -0.65 : 0;
      const use = state.keys.has("shift") || state.keys.has("x");
      if (use && !car.pickupLatch) {
        usePickup(car);
      }
      car.pickupLatch = use;
    } else {
      const info = nearestPathInfo(state.track, car.x, car.y);
      const lookAhead = samplePath(state.track.points, info.t + 0.015 + clamp(car.place * 0.0015, 0, 0.01));
      const desired = Math.atan2(lookAhead.y - car.y, lookAhead.x - car.x);
      const delta = wrapAngle(desired - car.angle);
      car.steer = clamp(delta * 1.8, -1, 1);
      car.throttle = info.distance > state.track.width * 0.3 ? 0.7 : 1;
      if (car.pickup === "boost" && Math.abs(delta) < 0.12 && Math.random() < dt * 0.35) usePickup(car);
      if (car.pickup === "pulse") {
        const closeTarget = state.cars.find((other) => other.id !== car.id && !other.destroyed && dist(car, other) < 150);
        if (closeTarget && Math.random() < dt * 1.2) usePickup(car);
      }
    }
  }

  function updateCheckpointProgress(car, pathInfo) {
    const checkpoints = state.track.checkpoints;
    const nextIndex = (car.checkpointIndex + 1) % checkpoints.length;
    const nextCheckpoint = checkpoints[nextIndex];
    if (Math.hypot(car.x - nextCheckpoint.x, car.y - nextCheckpoint.y) < state.track.width * 0.42) {
      car.checkpointIndex = nextIndex;
      car.respawnCheckpoint = nextIndex;
      if (nextIndex === 0) {
        if (state.track.type === "circuit") {
          car.currentLap += 1;
          if (car.currentLap > state.currentEvent.laps && !car.finished) finishCar(car);
        } else if (!car.finished && pathInfo.t > 0.92) {
          finishCar(car);
        }
      }
    }
    if (state.track.type === "sprint" && !car.finished && pathInfo.t > 0.98) finishCar(car);
  }

  function finishCar(car) {
    car.finished = true;
    car.finishMs = state.elapsed;
    if (car.isPlayer) {
      state.finishTime = state.elapsed;
      concludeEvent();
    }
  }

  function concludeEvent() {
    const leaderboard = computeLeaderboard();
    const playerPlace = leaderboard.findIndex((car) => car.isPlayer) + 1;
    const key = `${state.currentEvent.name}-${state.selectedCarId}`;
    if (!state.save.bestTimes[key] || state.finishTime < state.save.bestTimes[key]) {
      state.save.bestTimes[key] = state.finishTime;
    }
    if (state.currentEvent.daily && (!state.save.dailyBest || state.finishTime < state.save.dailyBest)) {
      state.save.dailyBest = state.finishTime;
    }
    if (playerPlace === 1) {
      state.save.wins += 1;
      state.save.eventProgress = Math.max(state.save.eventProgress, state.selectedEventIndex + 1);
      if (state.save.wins >= 2 && !state.save.unlockedCars.includes("balanced")) {
        state.save.unlockedCars.push("balanced");
        showBanner("Balanced archetype unlocked");
      } else {
        showBanner("Event won");
      }
    } else {
      showBanner(`Finished P${playerPlace}`);
    }
    persistSave();
    setTimeout(() => {
      state.mode = "menu";
      setMenuOpen(true);
      syncMenu();
    }, 2400);
  }

  function handleBoundaryCollision(car, pathInfo, dt) {
    const limit = state.track.width * 0.5;
    if (pathInfo.distance > limit) {
      const normal = normalize(car.x - pathInfo.point.x, car.y - pathInfo.point.y);
      const penetration = pathInfo.distance - limit;
      car.x -= normal.x * penetration * 0.92;
      car.y -= normal.y * penetration * 0.92;
      const hitSpeed = Math.hypot(car.vx, car.vy);
      const dot = car.vx * normal.x + car.vy * normal.y;
      car.vx -= normal.x * dot * 1.65;
      car.vy -= normal.y * dot * 1.65;
      applyDamage(car, clamp(hitSpeed * dt * 1.35, 0.7, 10), penetration > 10 ? "wall" : "scrape");
    }
    for (const prop of state.track.props) {
      if (!prop.alive) continue;
      if (Math.hypot(car.x - prop.x, car.y - prop.y) < car.width + prop.size) {
        prop.alive = false;
        applyDamage(car, 12, "prop");
        state.debris.push({ x: prop.x, y: prop.y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, size: prop.size * 0.6, life: 1.8, color: "#8df7ff" });
      }
    }
  }

  function handlePickups(car) {
    for (const pickup of state.pickups) {
      if (!pickup.active) {
        pickup.respawn -= 1 / 60;
        if (pickup.respawn <= 0) pickup.active = true;
        continue;
      }
      if (car.pickup) continue;
      if (Math.hypot(car.x - pickup.x, car.y - pickup.y) < 24) {
        pickup.active = false;
        pickup.respawn = 5;
        car.pickup = pickup.kind;
        state.fx.push({ kind: "ring", x: pickup.x, y: pickup.y, radius: 14, life: 0.45, color: pickup.kind === "boost" ? "#ffd36e" : "#ff5ccb" });
      }
    }
  }

  function handleHazards(car) {
    for (const hazard of state.hazards) {
      if (Math.hypot(car.x - hazard.x, car.y - hazard.y) < hazard.radius + 8) {
        applyDamage(car, hazard.damage * 0.05, "hazard");
      }
    }
  }

  function integrateCar(car, dt) {
    if (car.destroyed) {
      car.respawnTimer -= dt;
      if (car.respawnTimer <= 0) respawnCar(car);
      return;
    }
    car.invuln = Math.max(0, car.invuln - dt);
    car.pickupCooldown = Math.max(0, car.pickupCooldown - dt);
    car.boostTimer = Math.max(0, car.boostTimer - dt);
    car.chassisFlash = Math.max(0, car.chassisFlash - dt);
    updateCarInput(car, dt);
    const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const lateral = { x: -forward.y, y: forward.x };
    const speedForward = car.vx * forward.x + car.vy * forward.y;
    const speedLateral = car.vx * lateral.x + car.vy * lateral.y;
    const turnScale = clamp(Math.abs(speedForward) / 150, 0.25, 1.15);
    const turnPenalty = 1 - clamp(car.powerPenalty * 0.45, 0, 0.35);
    car.angle += car.steer * car.spec.turn * turnScale * turnPenalty * dt;
    const boostFactor = car.boostTimer > 0 ? 1.28 : 1;
    const accelForce = car.spec.accel * (1 - car.powerPenalty * 0.55) * boostFactor;
    const maxSpeed = car.spec.maxSpeed * (1 - car.powerPenalty * 0.28) * boostFactor;
    car.vx += forward.x * car.throttle * accelForce * dt;
    car.vy += forward.y * car.throttle * accelForce * dt;
    const gripStrength = clamp(car.spec.grip * dt, 0, 0.28);
    car.vx -= lateral.x * speedLateral * gripStrength;
    car.vy -= lateral.y * speedLateral * gripStrength;
    car.vx *= 0.992;
    car.vy *= 0.992;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      car.vx *= scale;
      car.vy *= scale;
    }
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    const pathInfo = nearestPathInfo(state.track, car.x, car.y);
    car.aiProgress = pathInfo.t;
    updateCheckpointProgress(car, pathInfo);
    handleBoundaryCollision(car, pathInfo, dt);
    handlePickups(car);
    handleHazards(car);
  }

  function handleCarCollisions() {
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.destroyed || b.destroyed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minDist = a.width + b.width;
        if (distance > 0 && distance < minDist) {
          const normal = { x: dx / distance, y: dy / distance };
          const overlap = minDist - distance;
          a.x -= normal.x * overlap * 0.5;
          a.y -= normal.y * overlap * 0.5;
          b.x += normal.x * overlap * 0.5;
          b.y += normal.y * overlap * 0.5;
          const relVx = b.vx - a.vx;
          const relVy = b.vy - a.vy;
          const impact = relVx * normal.x + relVy * normal.y;
          if (impact > 0) {
            const impulse = impact * 0.8;
            a.vx += normal.x * impulse * 0.5;
            a.vy += normal.y * impulse * 0.5;
            b.vx -= normal.x * impulse * 0.5;
            b.vy -= normal.y * impulse * 0.5;
            applyDamage(a, impact * 0.045 * b.spec.mass, "car");
            applyDamage(b, impact * 0.045 * a.spec.mass, "car");
          }
        }
      }
    }
  }

  function computeLeaderboard() {
    return [...state.cars].sort((a, b) => {
      const aProgress = (a.currentLap - 1) * 10 + a.checkpointIndex + nearestPathInfo(state.track, a.x, a.y).t;
      const bProgress = (b.currentLap - 1) * 10 + b.checkpointIndex + nearestPathInfo(state.track, b.x, b.y).t;
      if (a.finished && b.finished) return a.finishMs - b.finishMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return bProgress - aProgress;
    });
  }

  function updateHud() {
    if (!state.currentEvent || !state.player) return;
    const leaderboard = computeLeaderboard();
    leaderboard.forEach((car, index) => { car.place = index + 1; });
    hud.eventName.textContent = state.currentEvent.name;
    hud.eventMeta.textContent = `${state.currentEvent.type.toUpperCase()} // Seed ${state.currentEvent.seed} // ${state.currentEvent.theme}`;
    hud.raceStatus.textContent = `Position ${state.player.place}/${state.cars.length}`;
    hud.lapStatus.textContent = state.track.type === "circuit"
      ? `Lap ${Math.min(state.player.currentLap, state.currentEvent.laps)}/${state.currentEvent.laps}`
      : `Progress ${Math.round(nearestPathInfo(state.track, state.player.x, state.player.y).t * 100)}%`;
    hud.pickupStatus.textContent = `Pickup: ${state.player.pickup || "none"}`;
    hud.damageStatus.textContent = `Damage ${Math.round((state.player.damage / state.player.spec.durability) * 100)}%`;
  }

  function updateRace(dt) {
    if (state.mode !== "race") return;
    state.elapsed += dt;
    if (state.countdown > 0) {
      state.countdown -= dt;
      if (state.countdown <= 0) showBanner("Go");
      return;
    }
    for (const car of state.cars) integrateCar(car, dt);
    handleCarCollisions();
    state.debris = state.debris.filter((piece) => {
      piece.life -= dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.vx *= 0.985;
      piece.vy *= 0.985;
      return piece.life > 0;
    });
    state.fx = state.fx.filter((effect) => {
      effect.life -= dt;
      if (effect.kind === "pulse") effect.radius = lerp(effect.radius, effect.maxRadius, dt * 8);
      return effect.life > 0;
    });
    state.camera.shake = Math.max(0, state.camera.shake - dt * 18);
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) hud.banner.classList.add("hidden");
    }
    updateHud();
  }

  function drawBackground() {
    const palette = state.track ? state.track.theme : palettes.industrial;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, palette.bg);
    gradient.addColorStop(1, "#02050d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    for (let i = 0; i < 30; i += 1) {
      const radius = 110 + i * 45;
      ctx.strokeStyle = i % 2 === 0 ? "rgba(141,247,255,0.07)" : "rgba(255,92,203,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function setCamera() {
    const shake = state.camera.shake;
    const jitterX = shake ? (Math.random() - 0.5) * shake * 1.4 : 0;
    const jitterY = shake ? (Math.random() - 0.5) * shake * 1.4 : 0;
    state.camera.x = lerp(state.camera.x, state.player ? state.player.x : 0, 0.08);
    state.camera.y = lerp(state.camera.y, state.player ? state.player.y : 0, 0.08);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(canvas.width / 2 + jitterX, canvas.height / 2 + jitterY);
    const scale = clamp(Math.min(window.innerWidth / 1280, window.innerHeight / 720), 0.72, 1.24);
    state.viewScale = scale;
    ctx.scale(scale, scale);
    ctx.translate(-state.camera.x, -state.camera.y);
  }

  function drawTrack() {
    const track = state.track;
    const palette = track.theme;
    ctx.shadowBlur = 24;
    ctx.shadowColor = palette.glow;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = palette.track;
    ctx.lineWidth = track.width;
    ctx.beginPath();
    track.points.forEach((p, index) => { if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    if (track.type === "circuit") ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.trackEdge;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = palette.inside;
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const checkpoint of track.checkpoints) {
      ctx.fillStyle = "rgba(141,247,255,0.12)";
      ctx.beginPath();
      ctx.arc(checkpoint.x, checkpoint.y, 12, 0, TAU);
      ctx.fill();
    }
    for (const prop of track.props) {
      if (!prop.alive) continue;
      ctx.fillStyle = "rgba(141,247,255,0.12)";
      ctx.strokeStyle = palette.decoA;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(prop.x - prop.size / 2, prop.y - prop.size / 2, prop.size, prop.size);
      ctx.fill();
      ctx.stroke();
    }
    for (const hazard of state.hazards) {
      ctx.fillStyle = "rgba(255,109,127,0.18)";
      ctx.strokeStyle = "rgba(255,109,127,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(state.elapsed * 1.5);
      ctx.strokeStyle = pickup.kind === "boost" ? "#ffd36e" : "#ff5ccb";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(12, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-12, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCar(car) {
    if (car.destroyed) return;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.globalAlpha = car.invuln > 0 ? 0.65 + Math.sin(state.elapsed * 25) * 0.25 : 1;
    ctx.shadowBlur = 20;
    ctx.shadowColor = car.spec.color;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(-car.length * 0.38, -car.width * 0.55, car.length * 0.76, car.width * 1.1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = car.chassisFlash > 0 ? "#ffffff" : car.spec.color;
    ctx.fillRect(-car.length * 0.48, -car.width * 0.42, car.length * 0.96, car.width * 0.84);
    ctx.fillStyle = "#08101d";
    ctx.fillRect(-car.length * 0.12, -car.width * 0.26, car.length * 0.32, car.width * 0.52);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(car.length * 0.34, -car.width * 0.28, 6, 8);
    ctx.fillRect(car.length * 0.34, car.width * 0.2, 6, 8);
    const parts = {
      bumper: () => ctx.fillRect(car.length * 0.42, -car.width * 0.36, 7, car.width * 0.72),
      door: () => ctx.fillRect(-4, -car.width * 0.46, 6, 8),
      spoiler: () => ctx.fillRect(-car.length * 0.5, -car.width * 0.38, 8, car.width * 0.76),
      panel: () => ctx.fillRect(-car.length * 0.18, car.width * 0.34, car.length * 0.22, 5),
    };
    ctx.fillStyle = "#dff6ff";
    for (const part of car.visibleParts) parts[part]();
    if (car.pickup) {
      ctx.strokeStyle = car.pickup === "boost" ? "#ffd36e" : "#ff5ccb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, car.length * 0.7, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEffects() {
    for (const piece of state.debris) {
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.life * 4);
      ctx.fillStyle = piece.color;
      ctx.globalAlpha = clamp(piece.life / 2, 0.15, 0.9);
      ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.7);
      ctx.restore();
    }
    for (const effect of state.fx) {
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.globalAlpha = clamp(effect.life * 1.6, 0, 1);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = effect.kind === "spark" ? 3 : 4;
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMinimap() {
    if (!state.track) return;
    const mapW = 170;
    const mapH = 112;
    const x = window.innerWidth - mapW - 28;
    const y = window.innerHeight - mapH - 28;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(5, 9, 18, 0.72)";
    ctx.strokeStyle = "rgba(141,247,255,0.22)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, mapW, mapH);
    ctx.strokeRect(x, y, mapW, mapH);
    const bounds = state.track.points.reduce((acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const scale = Math.min((mapW - 18) / (bounds.maxX - bounds.minX || 1), (mapH - 18) / (bounds.maxY - bounds.minY || 1));
    ctx.beginPath();
    state.track.points.forEach((point, index) => {
      const px = x + 9 + (point.x - bounds.minX) * scale;
      const py = y + 9 + (point.y - bounds.minY) * scale;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (state.track.type === "circuit") ctx.closePath();
    ctx.strokeStyle = state.track.theme.trackEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const car of state.cars) {
      if (car.destroyed) continue;
      const px = x + 9 + (car.x - bounds.minX) * scale;
      const py = y + 9 + (car.y - bounds.minY) * scale;
      ctx.fillStyle = car.isPlayer ? "#ffffff" : car.spec.color;
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
  }

  function render() {
    drawBackground();
    if (state.mode === "race" && state.track) {
      setCamera();
      drawTrack();
      for (const car of state.cars) drawCar(car);
      drawEffects();
      drawMinimap();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  function renderStatBars(car) {
    const metrics = [
      { label: "Acceleration", score: Math.round(clamp(car.accel / 520, 0, 1) * 100) },
      { label: "Top speed", score: Math.round(clamp(car.maxSpeed / 400, 0, 1) * 100) },
      { label: "Handling", score: Math.round(clamp(car.turn / 2.9, 0, 1) * 100) },
      { label: "Durability", score: Math.round(clamp(car.durability / 140, 0, 1) * 100) },
    ];
    return metrics.map((metric) => `
      <div class="stat-row">
        <span>${metric.label}</span>
        <strong>${metric.score}</strong>
      </div>
    `).join("");
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.width = width;
    state.height = height;
    updateMenuScale();
  }

  function syncMenu() {
    const selectedEvent = getSelectedEvent();
    const selectedCar = archetypes[state.selectedCarId];
    const eventBestKey = `${selectedEvent.name}-${state.selectedCarId}`;
    const bestTime = state.save.bestTimes[eventBestKey];
    hud.careerStatus.textContent = `${state.save.wins} wins // ${state.save.unlockedCars.length}/${Object.keys(archetypes).length} cars`;
    hud.dailyStatus.textContent = state.save.dailyBest ? `Daily best ${formatTime(state.save.dailyBest)}` : "Daily challenge live";
    hud.eventFormatHero.textContent = `${formatRaceType(selectedEvent)} with ${selectedEvent.modifiers.length ? formatModifierTag(selectedEvent.modifiers[0]).toLowerCase() : "clean racing"}`;
    hud.eventFocusBadge.textContent = selectedEvent.daily ? "Daily challenge" : `Event ${state.selectedEventIndex + 1}`;
    hud.eventFocusTitle.textContent = selectedEvent.name;
    hud.eventFocusMeta.textContent = `${formatEventMeta(selectedEvent)} // seed ${selectedEvent.seed}`;
    hud.eventFocusCopy.textContent = selectedEvent.summary;
    hud.eventFocusModifiers.innerHTML = "";
    const bestTag = document.createElement("span");
    bestTag.className = "tag";
    bestTag.textContent = bestTime ? `Best ${formatTime(bestTime)}` : "No best time yet";
    hud.eventFocusModifiers.appendChild(bestTag);
    selectedEvent.modifiers.forEach((modifier) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = formatModifierTag(modifier);
      hud.eventFocusModifiers.appendChild(tag);
    });
    hud.carFocusBadge.textContent = state.save.unlockedCars.includes(state.selectedCarId) ? "Ready" : "Locked";
    hud.carFocusTitle.textContent = selectedCar.name;
    hud.carFocusCopy.textContent = selectedCar.description;
    hud.carFocusStats.innerHTML = renderStatBars(selectedCar);
    hud.eventList.innerHTML = "";
    hud.carList.innerHTML = "";
    state.events.forEach((event, index) => {
      const button = document.createElement("button");
      button.className = `event-card${index === state.selectedEventIndex ? " selected" : ""}`;
      button.innerHTML = `
        <div class="card-head">
          <div class="card-title">${event.name}</div>
          <div class="card-kicker">${event.daily ? "Daily" : event.type}</div>
        </div>
        <div class="event-meta">${event.type === "circuit" ? `${event.laps} laps` : "sprint"} // AI ${event.aiCount}</div>
        <div class="event-meta">${event.theme}</div>
        <div class="mini-tags">${event.modifiers.slice(0, 1).map((modifier) => `<span class="mini-tag">${formatModifierTag(modifier)}</span>`).join("")}</div>
      `;
      button.addEventListener("click", () => {
        state.selectedEventIndex = index;
        syncMenu();
      });
      hud.eventList.appendChild(button);
    });
    Object.values(archetypes).forEach((car) => {
      const unlocked = state.save.unlockedCars.includes(car.id);
      const button = document.createElement("button");
      button.disabled = !unlocked;
      button.className = `car-card${state.selectedCarId === car.id ? " selected" : ""}`;
      button.innerHTML = `
        <div class="card-head">
          <div class="card-title">${car.name}</div>
          <div class="card-kicker">${unlocked ? "Ready" : "Locked"}</div>
        </div>
        <div class="card-meta">${car.description}</div>
        <div class="card-meta">accel ${car.accel} // top ${car.maxSpeed} // turn ${car.turn.toFixed(1)}</div>
      `;
      button.addEventListener("click", () => {
        if (!unlocked) return;
        state.selectedCarId = car.id;
        syncMenu();
      });
      hud.carList.appendChild(button);
    });
    updateMenuScale();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    state.keys.add(key);
    if (key === "f") toggleFullscreen();
    if (key === "r" && state.mode === "race") startRace(state.selectedEventIndex, state.selectedCarId);
    if (key === "enter" && state.mode === "menu") startSelectedRace();
    if (key === "q" && state.mode === "menu") startQuickRace();
    if (key === "escape" && state.mode === "race" && state.finishTime !== null) {
      state.mode = "menu";
      setMenuOpen(true);
      syncMenu();
    }
  }

  function handleKeyUp(event) {
    state.keys.delete(event.key.toLowerCase());
  }

  function renderGameToText() {
    const leaderboard = state.track ? computeLeaderboard().map((car) => car.label) : [];
    return JSON.stringify({
      coordinateSystem: "world origin near track center, +x right, +y down",
      mode: state.mode,
      selectedEvent: state.events[state.selectedEventIndex]?.name || null,
      selectedCar: state.selectedCarId,
      currentEvent: state.currentEvent ? { name: state.currentEvent.name, type: state.currentEvent.type, seed: state.currentEvent.seed, theme: state.currentEvent.theme, laps: state.currentEvent.laps } : null,
      player: state.player ? {
        x: Number(state.player.x.toFixed(1)),
        y: Number(state.player.y.toFixed(1)),
        angle: Number(state.player.angle.toFixed(2)),
        speed: Number(Math.hypot(state.player.vx, state.player.vy).toFixed(1)),
        damagePct: Number(((state.player.damage / state.player.spec.durability) * 100).toFixed(1)),
        pickup: state.player.pickup,
        lap: state.player.currentLap,
        place: state.player.place,
        destroyed: state.player.destroyed,
        respawn: Number(state.player.respawnTimer.toFixed(2)),
      } : null,
      pickups: state.pickups.filter((pickup) => pickup.active).slice(0, 8).map((pickup) => ({ x: Number(pickup.x.toFixed(1)), y: Number(pickup.y.toFixed(1)), kind: pickup.kind })),
      hazards: state.hazards.slice(0, 8).map((hazard) => ({ x: Number(hazard.x.toFixed(1)), y: Number(hazard.y.toFixed(1)), radius: Number(hazard.radius.toFixed(1)) })),
      leaderboard,
      banner: hud.banner.textContent,
      countdown: Number(Math.max(0, state.countdown).toFixed(2)),
    });
  }

  function loop(timestamp) {
    if (!state.lastTick) state.lastTick = timestamp;
    const dt = clamp((timestamp - state.lastTick) / 1000, 0.001, 0.033);
    state.lastTick = timestamp;
    updateRace(dt);
    render();
    requestAnimationFrame(loop);
  }

  function initialize() {
    createEvents();
    resize();
    setMenuOpen(true);
    syncMenu();
    hud.startBtn.addEventListener("click", startSelectedRace);
    hud.quickRaceBtn.addEventListener("click", startQuickRace);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("fullscreenchange", resize);
    window.render_game_to_text = renderGameToText;
    window.advanceTime = (ms) => {
      const step = 1000 / 60;
      let remaining = ms;
      while (remaining > 0) {
        const dt = Math.min(step, remaining) / 1000;
        updateRace(dt);
        remaining -= step;
      }
      render();
    };
    render();
    requestAnimationFrame(loop);
  }

  initialize();
})();
