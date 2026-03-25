import { CAR_DEFS } from "../data/content.js";
import { GARAGE_ROLL_COST, getCurrencyBalance } from "./economy.js";
import { clamp, createKey, createRng, pickOne } from "./utils.js";

export const GARAGE_SIZE = 3;
export const GARAGE_SCRAP_VALUE = 18;
export { GARAGE_ROLL_COST } from "./economy.js";

const TIER_DEFS = [
  { id: "street", label: "Street", weight: 44, min: 0.9, max: 0.99, tint: "#74f0ff" },
  { id: "club", label: "Club", weight: 31, min: 0.98, max: 1.05, tint: "#00ffb8" },
  { id: "pro", label: "Pro", weight: 17, min: 1.04, max: 1.11, tint: "#ffb100" },
  { id: "apex", label: "Apex", weight: 8, min: 1.1, max: 1.18, tint: "#ff1fd1" },
];

const NAME_PREFIXES = ["Neon", "Arc", "Hyper", "Flux", "Vanta", "Pulse", "Zero", "Turbo", "Halo", "Nova", "Signal", "Chrome"];
const NAME_SUFFIXES = {
  grip: ["Latch", "Vector", "Needle", "Swerve", "Ribbon", "Circuit"],
  muscle: ["Ram", "Breaker", "Torque", "Hammer", "Howl", "Burner"],
  interceptor: ["Drift", "Fang", "Streak", "Phantom", "Shiver", "Rush"],
  balanced: ["Axis", "Relay", "Union", "Shift", "Frame", "Glide"],
};

const TEMPLATE_POOL = ["grip", "muscle", "interceptor", "balanced"];
const STAT_LIMITS = {
  accel: { min: 320, max: 620 },
  maxSpeed: { min: 300, max: 430 },
  handling: { min: 0, max: 100 },
  durability: { min: 92, max: 156 },
};

function weightedPick(rng, list) {
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

function getTierPool(progression = 0) {
  const t = clamp(progression, 0, 1);
  return [
    { ...TIER_DEFS[0], weight: 46 - t * 18 },
    { ...TIER_DEFS[1], weight: 30 + t * 4 },
    { ...TIER_DEFS[2], weight: 16 + t * 8 },
    { ...TIER_DEFS[3], weight: 8 + t * 6 },
  ];
}

function randomHexPair(value) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function mixColor(colorA, colorB, amount) {
  const a = colorA.replace("#", "");
  const b = colorB.replace("#", "");
  const mix = clamp(amount, 0, 1);
  const av = [0, 2, 4].map((offset) => Number.parseInt(a.slice(offset, offset + 2), 16));
  const bv = [0, 2, 4].map((offset) => Number.parseInt(b.slice(offset, offset + 2), 16));
  return `#${av.map((value, index) => randomHexPair(value + (bv[index] - value) * mix)).join("")}`;
}

function createName(templateId, rng) {
  const prefix = pickOne(rng, NAME_PREFIXES);
  const suffix = pickOne(rng, NAME_SUFFIXES[templateId] || NAME_SUFFIXES.grip);
  return `${prefix} ${suffix}`;
}

export function createEmptyGarageSlot(slotIndex = 0) {
  return {
    id: `garage-open-slot-${slotIndex + 1}`,
    empty: true,
    slotIndex,
    name: "Open Slot",
    tierId: "open",
    tierLabel: "Vacant",
    role: "Open slot",
    guidance: "Fill this slot from the Foundry.",
    traits: ["vacant", "expand"],
    color: "#13213d",
    accentColor: "#2ff6ff",
    bodyStyle: "touring",
    visualLength: 48,
    visualWidth: 26,
    accel: 0,
    maxSpeed: 0,
    turn: 0,
    grip: 0,
    durability: 0,
    mass: 1,
    brakeTurn: 1,
    slipstreamAffinity: 1,
    score: 0,
  };
}

export function isGarageSlotFilled(car) {
  return Boolean(car && !car.empty);
}

export function getFilledGarageCars(save) {
  return (save?.garage || []).filter((car) => isGarageSlotFilled(car));
}

export function getGarageHandling(car) {
  if (!isGarageSlotFilled(car)) return 0;
  return clamp(((car.turn / 2.95) * 58) + ((car.grip / 9.1) * 42), 0, 100);
}

export function getGarageStatValue(car, statId) {
  if (!isGarageSlotFilled(car)) return 0;
  if (statId === "accel") return car.accel;
  if (statId === "maxSpeed") return car.maxSpeed;
  if (statId === "durability") return car.durability;
  if (statId === "handling") return getGarageHandling(car);
  return 0;
}

export function getGarageStatPercent(car, statId) {
  const stat = STAT_LIMITS[statId];
  if (!stat) return 0;
  return clamp(((getGarageStatValue(car, statId) - stat.min) / (stat.max - stat.min)) * 100, 0, 100);
}

export function getGarageScore(car) {
  if (!isGarageSlotFilled(car)) return 0;
  const accel = getGarageStatPercent(car, "accel");
  const topEnd = getGarageStatPercent(car, "maxSpeed");
  const handling = getGarageStatPercent(car, "handling");
  const durability = getGarageStatPercent(car, "durability");
  return Math.round(accel * 0.27 + topEnd * 0.27 + handling * 0.28 + durability * 0.18);
}

function buildGuidance(base, tier) {
  if (tier.id === "apex") return `${base.guidance} High ceiling.`;
  if (tier.id === "pro") return `${base.guidance} Built for medal runs.`;
  if (tier.id === "street") return `${base.guidance} Lower ceiling, still race-ready.`;
  return base.guidance;
}

function createGarageCar(templateId, seed, options = {}) {
  const rng = createRng(seed);
  const base = CAR_DEFS[templateId];
  const tier = options.forceTier || weightedPick(rng, options.tierPool || TIER_DEFS);
  const quality = clamp(tier.min + (tier.max - tier.min) * rng() + (options.qualityBias || 0), 0.86, 1.22);
  const handlingBias = 0.94 + rng() * 0.14;
  const durabilityBias = 0.92 + rng() * 0.18;
  const speedBias = 0.93 + rng() * 0.16;
  const accelBias = 0.93 + rng() * 0.16;
  const car = {
    id: createKey("garage", templateId, seed.toString(36), Math.floor(rng() * 999999).toString(36)),
    templateId,
    name: createName(templateId, rng),
    tierId: tier.id,
    tierLabel: tier.label,
    role: base.role,
    baseColor: base.color,
    color: mixColor(base.color, tier.tint, 0.36 + rng() * 0.22),
    accentColor: tier.tint,
    bodyStyle: base.bodyStyle,
    visualLength: base.visualLength,
    visualWidth: base.visualWidth,
    accel: Math.round(clamp(base.accel * quality * accelBias, 320, 620)),
    maxSpeed: Math.round(clamp(base.maxSpeed * quality * speedBias, 300, 430)),
    turn: Number(clamp(base.turn * quality * handlingBias, 1.9, 3.08).toFixed(3)),
    grip: Number(clamp(base.grip * quality * (0.95 + rng() * 0.12), 5.3, 9.4).toFixed(3)),
    durability: Math.round(clamp(base.durability * quality * durabilityBias, 92, 156)),
    mass: Number(clamp(base.mass * (0.96 + rng() * 0.08), 0.9, 1.2).toFixed(3)),
    brakeTurn: Number(clamp(base.brakeTurn * (0.95 + rng() * 0.09), 0.98, 1.36).toFixed(3)),
    slipstreamAffinity: Number(clamp(base.slipstreamAffinity * (0.94 + rng() * 0.12), 0.88, 1.26).toFixed(3)),
    traits: [...base.traits],
    guidance: buildGuidance(base, tier),
    seed,
  };
  car.score = getGarageScore(car);
  return car;
}

function createStarterCar(seed) {
  const starter = createGarageCar("balanced", seed, {
    forceTier: TIER_DEFS[0],
    qualityBias: -0.12,
  });
  const tuned = {
    ...starter,
    tierId: "starter",
    tierLabel: "Starter",
    name: "Factory Mule",
    role: "Starter",
    guidance: "Starter steel with enough bite to stay in the fight.",
    traits: ["balanced", "underpowered"],
    color: "#6a84a8",
    accentColor: "#7de9ff",
    accel: 372,
    maxSpeed: 330,
    turn: 2.28,
    grip: 6.58,
    durability: 112,
    mass: 1.01,
    brakeTurn: 1.08,
    slipstreamAffinity: 0.98,
    bodyStyle: "touring",
    visualLength: 48,
    visualWidth: 27,
  };
  tuned.score = getGarageScore(tuned);
  return tuned;
}

function pickTemplateForRoll(rng, slotIndex, currentCar) {
  const weights = TEMPLATE_POOL.map((templateId) => {
    let weight = 1;
    if (templateId === currentCar?.templateId) weight += 0.55;
    if (slotIndex === 0 && templateId === "grip") weight += 0.3;
    if (slotIndex === 1 && templateId === "muscle") weight += 0.3;
    if (slotIndex === 2 && templateId === "interceptor") weight += 0.3;
    if (templateId === "balanced") weight += 0.22;
    return { templateId, weight };
  });
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) return item.templateId;
  }
  return weights[weights.length - 1].templateId;
}

export function createStarterGarage(seed = 20260321) {
  return [
    createStarterCar(seed),
    createEmptyGarageSlot(1),
    createEmptyGarageSlot(2),
  ];
}

export function ensureGarage(save) {
  const starter = createStarterGarage();
  const existing = Array.isArray(save.garage) ? save.garage : [];
  save.garage = Array.from({ length: GARAGE_SIZE }, (_, index) => {
    const current = existing[index];
    if (isGarageSlotFilled(current)) return current;
    if (current?.empty) return { ...createEmptyGarageSlot(index), ...current, empty: true, slotIndex: index };
    return starter[index] || createEmptyGarageSlot(index);
  });
  if (!save.selectedCarId || !save.garage.find((car) => isGarageSlotFilled(car) && car.id === save.selectedCarId)) {
    save.selectedCarId = getFilledGarageCars(save)[0]?.id || null;
  }
  getCurrencyBalance(save, "flux");
  return save;
}

export function createMigratedGarage(rawSave = {}) {
  const starter = createStarterGarage(20260321 + (rawSave.wins || 0) * 11);
  if (rawSave.unlockedCars?.includes("balanced")) {
    starter[2] = createGarageCar("balanced", 20260321 + 811, { forceTier: TIER_DEFS[2], qualityBias: 0.04 });
  }
  return starter;
}

export function getGarageCar(save, carId) {
  return save?.garage?.find((car) => isGarageSlotFilled(car) && car.id === carId) || null;
}

export function getGarageSlotIndex(save, carId) {
  return save?.garage?.findIndex((car) => car.id === carId) ?? -1;
}

export function toRuntimeCarDef(car) {
  return {
    id: car.id,
    name: car.name,
    color: car.color,
    accel: car.accel,
    maxSpeed: car.maxSpeed,
    turn: car.turn,
    grip: car.grip,
    durability: car.durability,
    mass: car.mass,
    brakeTurn: car.brakeTurn,
    slipstreamAffinity: car.slipstreamAffinity,
    bodyStyle: car.bodyStyle,
    visualLength: car.visualLength,
    visualWidth: car.visualWidth,
  };
}

export function generateGarageRoll(save, seed = Date.now()) {
  const rng = createRng(seed);
  const progression = getGarageProgression(save);
  const tierPool = getTierPool(progression);

  return save.garage.slice(0, GARAGE_SIZE).map((currentCar, index) => {
    let offer = null;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const templateId = pickTemplateForRoll(rng, index, currentCar);
      const bias = -0.025 + progression * 0.11 + rng() * 0.055;
      offer = createGarageCar(templateId, seed + index * 173 + attempt * 37 + Math.floor(rng() * 9000), {
        qualityBias: bias,
        tierPool,
      });
      if (offer) break;
    }
    offer.compareToId = isGarageSlotFilled(currentCar) ? currentCar.id : null;
    offer.compareToScore = getGarageScore(currentCar);
    offer.deltaScore = getGarageScore(offer) - getGarageScore(currentCar);
    offer.slotIndex = index;
    return offer;
  });
}

export function getGarageProgression(save) {
  const eventCount = Object.keys(save.eventResults || {}).length;
  const runCount = save.runHistory?.length || 0;
  return clamp(((save.wins || 0) * 1.25 + eventCount * 0.45 + runCount * 0.16) / 18, 0, 1);
}

export function getScrapValue(car) {
  const tierBonus = car.tierId === "apex" ? 22 : car.tierId === "pro" ? 14 : car.tierId === "club" ? 8 : 4;
  return GARAGE_SCRAP_VALUE + tierBonus + Math.max(0, Math.round((getGarageScore(car) - 55) / 10));
}

export function calculateRaceReward(result) {
  let reward = result.event.guided ? 72 : 92;
  if (result.place === 1) reward += 72;
  else if (result.place <= 3) reward += 40;
  reward += result.goalsMet * 24;
  if (result.deltaToPar <= 0) reward += 26;
  reward += Math.max(0, 2 - result.destroyedCount) * 10;
  if (result.newEventBest && !result.event.guided) reward += 18;
  if (result.event.daily) reward += 68;
  if (result.newDailyBest) reward += 36;
  if (result.wasTutorialRun && result.tutorialPickupMet) reward += 48;
  return Math.round(reward);
}

export function getRollReadyStatus(save) {
  return getCurrencyBalance(save, "flux") >= GARAGE_ROLL_COST;
}
