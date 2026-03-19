export type BillingPlan = 'basic' | 'pro';
export type BillingTier = 'free' | 'pro_monthly' | 'pro_lifetime';

export const BASIC_ENTITLEMENTS = [
  'pdf.merge',
  'pdf.split',
  'pdf.compress',
] as const;

export const PRO_ENTITLEMENTS = [
  ...BASIC_ENTITLEMENTS,
  'pdf.ocr',
  'pdf.rotate',
  'pdf.delete_pages',
  'pdf.edit',
  'pdf.to_image',
  'office.convert',
  'pdf.protect.encrypt',
  'pdf.protect.unlock',
] as const;

export const ALL_ENTITLEMENTS = [...PRO_ENTITLEMENTS] as const;

export type BillingEntitlement = (typeof ALL_ENTITLEMENTS)[number];

const ENTITLEMENT_SET = new Set<string>(ALL_ENTITLEMENTS);

export function sanitizeEntitlements(raw: unknown, plan: BillingPlan): BillingEntitlement[] {
  const source = Array.isArray(raw) ? raw : [];
  const unique = Array.from(new Set(source.filter((value): value is string => typeof value === 'string')));
  const filtered = unique.filter((value): value is BillingEntitlement => ENTITLEMENT_SET.has(value));
  const allowed = plan === 'pro' ? new Set<string>(PRO_ENTITLEMENTS) : new Set<string>(BASIC_ENTITLEMENTS);
  return filtered.filter((value) => allowed.has(value));
}

export function getDefaultEntitlementsForPlan(plan: BillingPlan): BillingEntitlement[] {
  return [...(plan === 'pro' ? PRO_ENTITLEMENTS : BASIC_ENTITLEMENTS)];
}

export function normalizePlan(raw: unknown): BillingPlan {
  return raw === 'pro' ? 'pro' : 'basic';
}

export function normalizeTier(raw: unknown, plan: BillingPlan): BillingTier {
  if (raw === 'pro_monthly' || raw === 'pro_lifetime') {
    return raw;
  }
  return plan === 'pro' ? 'pro_monthly' : 'free';
}

export function getDefaultTierForPlan(plan: BillingPlan): BillingTier {
  return plan === 'pro' ? 'pro_monthly' : 'free';
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
