import { after, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import { getMappedLicense } from './restore';

const originalEnv = {
  monthlyProducts: process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS,
  monthlyVariants: process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS,
  yearlyProducts: process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS,
  yearlyVariants: process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS,
};

describe('billing restore mapping', () => {

  beforeEach(() => {
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '908866';
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '1429374';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS = '908866';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS = '1429309';
  });

  test('prefers yearly variant match even when product ids overlap', () => {
    const mapped = getMappedLicense({
      meta: {
        product_id: 908866,
        variant_id: 1429309,
      },
    });

    assert.deepStrictEqual(mapped, { plan: 'pro', tier: 'pro_yearly' });
  });

  test('maps monthly variant correctly when product ids overlap', () => {
    const mapped = getMappedLicense({
      meta: {
        product_id: 908866,
        variant_id: 1429374,
      },
    });

    assert.deepStrictEqual(mapped, { plan: 'pro', tier: 'pro_monthly' });
  });

  test('returns null on ambiguous product-only overlap without variant signal', () => {
    const mapped = getMappedLicense({
      meta: {
        product_id: 908866,
      },
    });

    assert.strictEqual(mapped, null);
  });

  test('falls back to product match when ids are unique', () => {
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '1001';
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS = '2002';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS = '';

    const monthly = getMappedLicense({ meta: { product_id: 1001 } });
    const yearly = getMappedLicense({ meta: { product_id: 2002 } });

    assert.deepStrictEqual(monthly, { plan: 'pro', tier: 'pro_monthly' });
    assert.deepStrictEqual(yearly, { plan: 'pro', tier: 'pro_yearly' });
  });

});

after(() => {
  process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = originalEnv.monthlyProducts;
  process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = originalEnv.monthlyVariants;
  process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS = originalEnv.yearlyProducts;
  process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS = originalEnv.yearlyVariants;
});
