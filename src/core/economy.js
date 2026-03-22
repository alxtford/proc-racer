import { clamp } from "./utils.js";

export const STARTING_FLUX = 220;
export const STARTING_SCRAP = 0;
export const STARTING_PREMIUM = 0;
export const WALLET_VERSION = 1;
export const GARAGE_ROLL_COST = 180;
export const GARAGE_ROLL_PREMIUM_COST = 3;
export const COURSE_REROLL_COST = 30;

export const CURRENCY_DEFS = {
  flux: {
    id: "flux",
    label: "Flux",
    description: "Earned from racing. Spent on Foundry rolls and strike-board reforges.",
  },
  scrap: {
    id: "scrap",
    label: "Scrap",
    description: "Recovered from unkept cars. Spent on style unlocks.",
  },
  premium: {
    id: "premium",
    label: "Neon Tickets",
    description: "Reserved for future premium purchases.",
  },
};

export const STORE_PRODUCTS = {
  garage_roll: {
    id: "garage_roll",
    label: "Flux Foundry Roll",
    prices: [
      { currency: "flux", amount: GARAGE_ROLL_COST },
      { currency: "premium", amount: GARAGE_ROLL_PREMIUM_COST },
    ],
  },
  course_refresh: {
    id: "course_refresh",
    label: "Strike Board Reforge",
    prices: [
      { currency: "flux", amount: COURSE_REROLL_COST },
    ],
  },
};

export function createDefaultWallet() {
  return {
    flux: STARTING_FLUX,
    scrap: STARTING_SCRAP,
    premium: STARTING_PREMIUM,
  };
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function syncLegacyWalletFields(save) {
  save.currency = save.wallet.flux;
  save.scrap = save.wallet.scrap;
  save.premiumCurrency = save.wallet.premium;
  return save;
}

export function ensureWallet(save) {
  const defaults = createDefaultWallet();
  const nextWallet = {
    flux: toNumber(save.wallet?.flux ?? save.currency, defaults.flux),
    scrap: toNumber(save.wallet?.scrap ?? save.scrap, defaults.scrap),
    premium: toNumber(save.wallet?.premium ?? save.premiumCurrency, defaults.premium),
  };
  save.walletVersion = WALLET_VERSION;
  save.wallet = {
    flux: clamp(nextWallet.flux, 0, 999999),
    scrap: clamp(nextWallet.scrap, 0, 999999),
    premium: clamp(nextWallet.premium, 0, 999999),
  };
  return syncLegacyWalletFields(save);
}

export function getCurrencyBalance(save, currency) {
  ensureWallet(save);
  return Number(save.wallet?.[currency] || 0);
}

export function canAfford(save, currency, amount) {
  return getCurrencyBalance(save, currency) >= Math.max(0, Number(amount) || 0);
}

export function grantCurrency(save, currency, amount) {
  ensureWallet(save);
  const current = Number(save.wallet?.[currency] || 0);
  const next = current + Math.max(0, Number(amount) || 0);
  save.wallet = {
    ...save.wallet,
    [currency]: clamp(next, 0, 999999),
  };
  syncLegacyWalletFields(save);
  return getCurrencyBalance(save, currency);
}

export function spendCurrency(save, currency, amount) {
  ensureWallet(save);
  const total = Math.max(0, Number(amount) || 0);
  if (!canAfford(save, currency, total)) {
    return false;
  }
  const current = Number(save.wallet?.[currency] || 0);
  save.wallet = {
    ...save.wallet,
    [currency]: clamp(current - total, 0, 999999),
  };
  syncLegacyWalletFields(save);
  return true;
}

export function getStoreProduct(productId) {
  return STORE_PRODUCTS[productId] || null;
}

export function getStorePrice(productId, preferredCurrency = null) {
  const product = getStoreProduct(productId);
  if (!product) return null;
  if (preferredCurrency) {
    const preferred = product.prices.find((price) => price.currency === preferredCurrency);
    if (preferred) return preferred;
  }
  return product.prices[0] || null;
}

export function purchaseStoreProduct(save, productId, preferredCurrency = null) {
  const product = getStoreProduct(productId);
  if (!product) {
    return { ok: false, reason: "missing_product" };
  }
  const prices = preferredCurrency
    ? [...product.prices.filter((price) => price.currency === preferredCurrency), ...product.prices.filter((price) => price.currency !== preferredCurrency)]
    : [...product.prices];
  const chosen = prices.find((price) => canAfford(save, price.currency, price.amount));
  if (!chosen) {
    return { ok: false, reason: "insufficient_funds", product };
  }
  spendCurrency(save, chosen.currency, chosen.amount);
  return { ok: true, product, price: chosen };
}

export function getCosmeticDirectPremiumPrice(item) {
  return Math.max(1, Math.ceil((Number(item?.cost) || 0) / 40));
}
