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

export type PaidOffer = {
  url: string;
  variant: 'lifetime' | 'yearly';
  label: string;
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
    };
  }
  const yearly = typeof yearlyUrl === 'string' ? yearlyUrl.trim() : '';
  return yearly
    ? { url: yearly, variant: 'yearly', label: `Upgrade to Pro — $${PRO_YEARLY_PRICE_USD}/year` }
    : null;
}

/**
 * The offer shown to free users. Falls back to the yearly plan while the lifetime variant is not
 * configured yet, so a missing env var can never leave a CTA pointing at nothing.
 */
export function getPrimaryPaidOffer(): PaidOffer | null {
  return resolvePrimaryOffer(getLifetimeCheckoutUrl(), getYearlyCheckoutUrl());
}
