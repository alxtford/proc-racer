export const COSMETIC_SLOTS = ["skin", "trail", "skid", "emote"];

export const COSMETIC_DEFS = {
  "skin-default": {
    id: "skin-default",
    slot: "skin",
    name: "Factory Glow",
    cost: 0,
    ownedByDefault: true,
    description: "Keeps the generated chassis paint and neon edge.",
    tint: "#8df7ff",
    mix: 0.12,
  },
  "skin-inferno": {
    id: "skin-inferno",
    slot: "skin",
    name: "Inferno Lattice",
    cost: 72,
    description: "Hot orange-magenta body wash with a harsher neon shell.",
    tint: "#ff6d2d",
    mix: 0.32,
  },
  "skin-radioactive": {
    id: "skin-radioactive",
    slot: "skin",
    name: "Radioactive Mint",
    cost: 80,
    description: "Blacklight mint shell with stronger green edge light.",
    tint: "#14ff8a",
    mix: 0.34,
  },
  "skin-ultraviolet": {
    id: "skin-ultraviolet",
    slot: "skin",
    name: "Ultraviolet Grid",
    cost: 96,
    description: "Deep magenta-violet repaint tuned for nightclub tracks.",
    tint: "#ff1fd1",
    mix: 0.38,
  },
  "trail-default": {
    id: "trail-default",
    slot: "trail",
    name: "Factory Ribbon",
    cost: 0,
    ownedByDefault: true,
    description: "Short clean speed ribbon.",
    color: "#8df7ff",
  },
  "trail-comet": {
    id: "trail-comet",
    slot: "trail",
    name: "Comet Wash",
    cost: 68,
    description: "Longer cyan-white comet trail.",
    color: "#d8fbff",
  },
  "trail-hotwire": {
    id: "trail-hotwire",
    slot: "trail",
    name: "Hotwire Burst",
    cost: 84,
    description: "Aggressive magenta-yellow trail split.",
    color: "#ff67db",
  },
  "trail-aurora": {
    id: "trail-aurora",
    slot: "trail",
    name: "Aurora Sweep",
    cost: 90,
    description: "Mint-gold ribbon that blooms harder at speed.",
    color: "#00ffb8",
  },
  "skid-default": {
    id: "skid-default",
    slot: "skid",
    name: "Factory Marks",
    cost: 0,
    ownedByDefault: true,
    description: "Neutral grey tyre marks.",
    color: "rgba(220, 232, 255, 0.18)",
  },
  "skid-plasma": {
    id: "skid-plasma",
    slot: "skid",
    name: "Plasma Chalk",
    cost: 62,
    description: "Luminous cyan drift marks.",
    color: "rgba(47, 246, 255, 0.36)",
  },
  "skid-cinder": {
    id: "skid-cinder",
    slot: "skid",
    name: "Cinder Melt",
    cost: 74,
    description: "Amber-red scorch trails on hard slides.",
    color: "rgba(255, 136, 52, 0.3)",
  },
  "skid-vapor": {
    id: "skid-vapor",
    slot: "skid",
    name: "Vapor Lattice",
    cost: 82,
    description: "Magenta tyre marks with a softer fade.",
    color: "rgba(255, 31, 209, 0.28)",
  },
  "emote-default": {
    id: "emote-default",
    slot: "emote",
    name: "Steady Nod",
    cost: 0,
    ownedByDefault: true,
    description: "Low-key post-race cool.",
    badge: "LOCKED IN",
  },
  "emote-crown": {
    id: "emote-crown",
    slot: "emote",
    name: "Crown Flash",
    cost: 88,
    description: "Loud winner callout for podium finishes.",
    badge: "CROWN UP",
  },
  "emote-static": {
    id: "emote-static",
    slot: "emote",
    name: "Static Charge",
    cost: 76,
    description: "High-energy glitch stinger in results.",
    badge: "STATIC SPIKE",
  },
  "emote-victory": {
    id: "emote-victory",
    slot: "emote",
    name: "Victory Pulse",
    cost: 96,
    description: "Gold-lit celebration stinger for clean finishes.",
    badge: "VICTORY PULSE",
  },
};

export function getDefaultOwnedCosmetics() {
  return Object.values(COSMETIC_DEFS)
    .filter((item) => item.ownedByDefault)
    .map((item) => item.id);
}

export function createDefaultEquippedCosmetics() {
  return {
    skin: "skin-default",
    trail: "trail-default",
    skid: "skid-default",
    emote: "emote-default",
  };
}

export function getCosmeticsBySlot(slot) {
  return Object.values(COSMETIC_DEFS).filter((item) => item.slot === slot);
}
