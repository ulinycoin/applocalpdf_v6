/**
 * Paid-offer checkout links.
 *
 * The one-time "Pro Lifetime" purchase is the primary offer; the yearly subscription is the
 * recurring anchor. The $3.99 monthly plan was retired in Sep 2026 — its LemonSqueezy variant still
 * exists for legacy subscribers and the backend keeps mapping `pro_monthly`, but no UI offers it.
 *
 * Both URLs come from build-time env vars, with literal fallbacks so production keeps working when a
 * Vercel env var is missing — these are public buy links, never secrets.
 */

export const PRO_LIFETIME_PRICE_USD = 19;
export const PRO_YEARLY_PRICE_USD = 39.99;

/** One-time "LocalPDF Pro" product 1371816, variant 2143549 ($19, license keys, never expires). */
const LIFETIME_CHECKOUT_URL_FALLBACK = 'https://localpdf.lemonsqueezy.com/checkout/buy/e42c57ec-d7a3-4bd9-9595-3f38f6f2a8f5';

/** "LocalPDF Pro" subscription product 917519, yearly variant 1442621 ($39.99/year). */
const YEARLY_CHECKOUT_URL_FALLBACK = 'https://localpdf.lemonsqueezy.com/checkout/buy/fe9368a5-c232-4f35-a33f-2b75cea5aa85?enabled=1442621';

type EnvRecord = Record<string, string | undefined>;

function readEnv(key: string): string {
  const raw = (import.meta.env as EnvRecord | undefined)?.[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return /^https?:\/\//i.test(value) ? value : '';
}

export function getLifetimeCheckoutUrl(): string | null {
  return readEnv('VITE_LS_CHECKOUT_URL_PRO_LIFETIME') || LIFETIME_CHECKOUT_URL_FALLBACK || null;
}

export function getYearlyCheckoutUrl(): string | null {
  return readEnv('VITE_LS_CHECKOUT_URL_PRO_YEARLY') || YEARLY_CHECKOUT_URL_FALLBACK || null;
}

/**
 * Black Friday 2026 campaign: public 50% code on Pro Lifetime, one window a year.
 *
 * The discount itself lives in LemonSqueezy (variant-locked, capped, hard expiry). These constants
 * only decide whether we prefill it into the buy link, so a stale client can never invent a
 * discount that the store does not honour.
 */
export const BFCM_DISCOUNT_CODE = 'BFCM50';
/** 11 Nov 2026 00:00 Europe/Riga. */
export const BFCM_STARTS_AT_MS = Date.parse('2026-11-10T22:00:00Z');
/** End of November; LemonSqueezy expires the code at the same instant. */
export const BFCM_ENDS_AT_MS = Date.parse('2026-12-01T00:00:00Z');
export const BFCM_PRICE_USD = PRO_LIFETIME_PRICE_USD / 2;

export function isBfcmActive(nowMs: number = Date.now()): boolean {
  return Number.isFinite(nowMs) && nowMs >= BFCM_STARTS_AT_MS && nowMs < BFCM_ENDS_AT_MS;
}

/** Appends one raw query field, keeping any existing query string intact. */
export function appendCheckoutQuery(url: string, field: string): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed || !field) {
    return trimmed;
  }
  return `${trimmed}${trimmed.includes('?') ? '&' : '?'}${field}`;
}

/**
 * Prefills the campaign code into the buy link. Lifetime only: the yearly anchor is deliberately
 * left out of the campaign, and LemonSqueezy would reject a variant the code was not attached to.
 */
export function applyBfcmDiscount(
  url: string,
  variant: 'lifetime' | 'yearly',
  nowMs: number = Date.now(),
): string {
  if (variant !== 'lifetime' || !isBfcmActive(nowMs)) {
    return url;
  }
  return appendCheckoutQuery(url, `checkout[discount_code]=${BFCM_DISCOUNT_CODE}`);
}

/** Whether a buy link already carries a discount code, in either raw or percent-encoded form. */
export function hasDiscountCode(url: string): boolean {
  return /[?&]checkout(?:%5B|\[)discount_code/i.test(typeof url === 'string' ? url : '');
}

export type PaidOffer = {
  url: string;
  variant: 'lifetime' | 'yearly';
  label: string;
  /** True while a campaign code is prefilled into `url`. */
  discounted: boolean;
};

/** Pure resolver so the offer ladder can be tested without build-time env vars. */
export function resolvePrimaryOffer(
  lifetimeUrl: string | null | undefined,
  yearlyUrl: string | null | undefined,
): PaidOffer | null {
  const lifetime = typeof lifetimeUrl === 'string' ? lifetimeUrl.trim() : '';
  if (lifetime) {
    return {
      url: lifetime,
      variant: 'lifetime',
      label: `Get Pro Lifetime — $${PRO_LIFETIME_PRICE_USD} once`,
      discounted: false,
    };
  }
  const yearly = typeof yearlyUrl === 'string' ? yearlyUrl.trim() : '';
  return yearly
    ? {
        url: yearly,
        variant: 'yearly',
        label: `Upgrade to Pro — $${PRO_YEARLY_PRICE_USD}/year`,
        discounted: false,
      }
    : null;
}

/**
 * The offer shown to free users. Falls back to the yearly plan while the lifetime variant is not
 * configured yet, so a missing env var can never leave a CTA pointing at nothing.
 *
 * During the campaign the lifetime CTA carries the code and the discounted price: a banner that
 * promises $9.50 above a button that says $19 loses the sale it was meant to win.
 */
export function getPrimaryPaidOffer(nowMs: number = Date.now()): PaidOffer | null {
  const offer = resolvePrimaryOffer(getLifetimeCheckoutUrl(), getYearlyCheckoutUrl());
  if (!offer) {
    return null;
  }
  if (offer.variant !== 'lifetime' || !isBfcmActive(nowMs)) {
    return offer;
  }
  return {
    ...offer,
    url: applyBfcmDiscount(offer.url, offer.variant, nowMs),
    label: `Get Pro Lifetime — $${BFCM_PRICE_USD.toFixed(2)} once (was $${PRO_LIFETIME_PRICE_USD})`,
    discounted: true,
  };
}
