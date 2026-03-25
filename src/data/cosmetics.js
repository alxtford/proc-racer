export const COSMETIC_SLOTS = ["skin", "trail", "skid", "emote"];

export const COSMETIC_DEFS = {
  "skin-default": {
    id: "skin-default",
    slot: "skin",
    name: "Stock Arc",
    cost: 0,
    ownedByDefault: true,
    description: "Factory steel with an arc edge.",
    tint: "#8df7ff",
    mix: 0.12,
  },
  "skin-inferno": {
    id: "skin-inferno",
    slot: "skin",
    name: "Meltweb",
    cost: 0,
    ownedByDefault: true,
    description: "Heat bloom with a harsher shell line.",
    tint: "#ff6d2d",
    mix: 0.32,
  },
  "skin-radioactive": {
    id: "skin-radioactive",
    slot: "skin",
    name: "Toxic Surge",
    cost: 80,
    description: "Blacklight mint shell with a venom edge.",
    tint: "#14ff8a",
    mix: 0.34,
  },
  "skin-ultraviolet": {
    id: "skin-ultraviolet",
    slot: "skin",
    name: "Night Razor",
    cost: 96,
    description: "Deep magenta-violet repaint for blackout lanes.",
    tint: "#ff1fd1",
    mix: 0.38,
  },
  "trail-default": {
    id: "trail-default",
    slot: "trail",
    name: "Stock Wake",
    cost: 0,
    ownedByDefault: true,
    description: "Short clean wake off the rear.",
    color: "#8df7ff",
  },
  "trail-comet": {
    id: "trail-comet",
    slot: "trail",
    name: "Jetstream",
    cost: 68,
    description: "Long cyan-white wake with a cold outer flare.",
    color: "#d8fbff",
  },
  "trail-hotwire": {
    id: "trail-hotwire",
    slot: "trail",
    name: "Killspark",
    cost: 0,
    ownedByDefault: true,
    description: "Magenta-yellow wake that brightens under throttle.",
    color: "#ff67db",
  },
  "trail-aurora": {
    id: "trail-aurora",
    slot: "trail",
    name: "Shardwake",
    cost: 90,
    description: "Mint-gold wake that blooms at terminal speed.",
    color: "#00ffb8",
  },
  "skid-default": {
    id: "skid-default",
    slot: "skid",
    name: "Stock Scars",
    cost: 0,
    ownedByDefault: true,
    description: "Neutral tyre scars with no bloom.",
    color: "rgba(220, 232, 255, 0.18)",
  },
  "skid-plasma": {
    id: "skid-plasma",
    slot: "skid",
    name: "Arc Chalk",
    cost: 62,
    description: "Luminous cyan drift scars with a brighter hold.",
    color: "rgba(47, 246, 255, 0.36)",
  },
  "skid-cinder": {
    id: "skid-cinder",
    slot: "skid",
    name: "Furnace Scar",
    cost: 0,
    ownedByDefault: true,
    description: "Amber-red scorch scars on hard slides.",
    color: "rgba(255, 136, 52, 0.3)",
  },
  "skid-vapor": {
    id: "skid-vapor",
    slot: "skid",
    name: "Ghostwire",
    cost: 82,
    description: "Magenta tyre scars with a thin ghost fade.",
    color: "rgba(255, 31, 209, 0.28)",
  },
  "emote-default": {
    id: "emote-default",
    slot: "emote",
    name: "Cold Stare",
    cost: 0,
    ownedByDefault: true,
    description: "Quiet post-race menace.",
    badge: "STEEL SET",
  },
  "emote-crown": {
    id: "emote-crown",
    slot: "emote",
    name: "Kill Crown",
    cost: 88,
    description: "A loud stinger for podium finishes.",
    badge: "CROWN SPIKE",
  },
  "emote-static": {
    id: "emote-static",
    slot: "emote",
    name: "Circuit Bite",
    cost: 0,
    ownedByDefault: true,
    description: "High-energy glitch snarl in the results.",
    badge: "STATIC BITE",
  },
  "emote-victory": {
    id: "emote-victory",
    slot: "emote",
    name: "Riot Halo",
    cost: 96,
    description: "Gold-lit flare for clean finishes.",
    badge: "RIOT HALO",
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
