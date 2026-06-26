import { after, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import { getMappedLicense } from './restore';
import { encryptString, decryptString } from './restore';

const originalEnv = {
  monthlyProducts: process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS,
  monthlyVariants: process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS,
  yearlyProducts: process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS,
  yearlyVariants: process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS,
};

describe('billing restore mapping', () => {

  test('encrypts and decrypts string correctly using secret key', () => {
    const text = 'my-secret-license-key-123';
    const secret = 'super-secret-key-material';
    const encrypted = encryptString(text, secret);
    assert.notStrictEqual(encrypted, text);
    assert.ok(encrypted.includes(':'));

    const decrypted = decryptString(encrypted, secret);
    assert.strictEqual(decrypted, text);
  });

  beforeEach(() => {
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '917519';
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '1442622';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS = '917519';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS = '1442621';
  });

  test('prefers yearly variant match even when product ids overlap', () => {
    const mapped = getMappedLicense({
      meta: {
        product_id: 917519,
        variant_id: 1442621,
      },
    });

    assert.deepStrictEqual(mapped, { plan: 'pro', tier: 'pro_yearly' });
  });

  test('maps monthly variant correctly when product ids overlap', () => {
    const mapped = getMappedLicense({
      meta: {
        product_id: 917519,
        variant_id: 1442622,
      },
    });

    assert.deepStrictEqual(mapped, { plan: 'pro', tier: 'pro_monthly' });
  });

  test('returns null on ambiguous product-only overlap without variant signal', () => {
    const mapped = getMappedLicense({
      meta: {
        product_id: 917519,
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
