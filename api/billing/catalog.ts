export type BillingPlan = 'basic' | 'pro';
export type BillingTier = 'free' | 'pro_monthly' | 'pro_yearly';

export function parseIdSet(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

export function selectTierByVariantOrProduct(
  productId: string,
  variantId: string,
  options: {
    monthlyProductIds: Set<string>;
    monthlyVariantIds: Set<string>;
    yearlyProductIds: Set<string>;
    yearlyVariantIds: Set<string>;
  },
): BillingTier | null {
  const {
    monthlyProductIds,
    monthlyVariantIds,
    yearlyProductIds,
    yearlyVariantIds,
  } = options;

  const hasMonthlyVariant = variantId !== '' && monthlyVariantIds.has(variantId);
  const hasYearlyVariant = variantId !== '' && yearlyVariantIds.has(variantId);

  if (hasMonthlyVariant && hasYearlyVariant) {
    return null;
  }
  if (hasMonthlyVariant) {
    return 'pro_monthly';
  }
  if (hasYearlyVariant) {
    return 'pro_yearly';
  }

  const hasMonthlyProduct = productId !== '' && monthlyProductIds.has(productId);
  const hasYearlyProduct = productId !== '' && yearlyProductIds.has(productId);

  if (hasMonthlyProduct && hasYearlyProduct) {
    return null;
  }
  if (hasMonthlyProduct) {
    return 'pro_monthly';
  }
  if (hasYearlyProduct) {
    return 'pro_yearly';
  }

  return null;
}

export function mapProductVariantToTier(productId: string, variantId: string): BillingTier | null {
  return selectTierByVariantOrProduct(productId, variantId, {
    monthlyProductIds: parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS),
    monthlyVariantIds: parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS),
    yearlyProductIds: parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS),
    yearlyVariantIds: parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS),
  });
}

export function getMappedLicense(lsData: any): { plan: BillingPlan; tier: BillingTier } | null {
  const meta = lsData?.meta ?? {};
  const orderItem = lsData?.license_key?.order_item ?? {};
  const productId = String(meta.product_id ?? orderItem.product_id ?? '');
  const variantId = String(meta.variant_id ?? orderItem.variant_id ?? '');

  const tier = mapProductVariantToTier(productId, variantId);
  if (!tier) {
    return null;
  }

  return { plan: 'pro', tier };
}
