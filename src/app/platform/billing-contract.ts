export type BillingPlan = 'basic' | 'pro' | 'trial';
export type BillingTier = 'free' | 'pro_monthly' | 'pro_yearly' | 'pro_lifetime';

/**
 * Entitlements describe capabilities, not price. Every tool runs on every plan: the free tier is
 * limited by downloads per day and canvas size, never by tool access (see the project memory
 * "Business model"). Keep the plumbing for the licence payload, but never gate execution with it.
 */
export const PRO_ENTITLEMENTS = [
  'pdf.merge',
  'pdf.split',
  'pdf.compress',
  'pdf.ocr',
  'pdf.rotate',
  'pdf.delete_pages',
  'pdf.edit',
  'pdf.to_image',
  'office.convert',
  'pdf.protect.encrypt',
  'pdf.protect.unlock',
  'pdf.redact.verify',
] as const;

export const BASIC_ENTITLEMENTS = PRO_ENTITLEMENTS;

export const ALL_ENTITLEMENTS = [...PRO_ENTITLEMENTS] as const;

export type BillingEntitlement = (typeof ALL_ENTITLEMENTS)[number];

export function getDefaultEntitlementsForPlan(plan: BillingPlan): BillingEntitlement[] {
  return [...((plan === 'pro' || plan === 'trial') ? PRO_ENTITLEMENTS : BASIC_ENTITLEMENTS)];
}

export function normalizePlan(raw: unknown): BillingPlan {
  if (raw === 'pro') return 'pro';
  if (raw === 'trial') return 'trial';
  return 'basic';
}

export function normalizeTier(raw: unknown, plan: BillingPlan): BillingTier | null {
  if (raw === 'free') {
    return plan === 'basic' ? 'free' : null;
  }
  if (raw === 'pro_monthly' || raw === 'pro_yearly' || raw === 'pro_lifetime') {
    return (plan === 'pro' || plan === 'trial') ? raw : null;
  }
  if (raw === undefined || raw === null || raw === '') {
    return getDefaultTierForPlan(plan);
  }
  return null;
}

export function getDefaultTierForPlan(plan: BillingPlan): BillingTier {
  return (plan === 'pro' || plan === 'trial') ? 'pro_monthly' : 'free';
}


