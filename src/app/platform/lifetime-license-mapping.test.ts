import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { getMappedLicense } from '../../../api/billing/restore';

describe('lifetime licence mapping', () => {
  test('maps the one-time LocalPDF Pro product to the lifetime tier', () => {
    const mapped = getMappedLicense({ meta: { product_id: 1371816, variant_id: 2143549 } });
    assert.deepStrictEqual(mapped, { plan: 'pro', tier: 'pro_lifetime' });
  });

  test('reads the ids from order_item when meta is absent', () => {
    const mapped = getMappedLicense({ license_key: { order_item: { product_id: 1371816, variant_id: 2143549 } } });
    assert.deepStrictEqual(mapped, { plan: 'pro', tier: 'pro_lifetime' });
  });

  test('maps the subscription variants when their env ids are configured', () => {
    // Subscription ids are configuration, not constants — mirror what production sets.
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '917519';
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '1442622';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS = '917519';
    process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS = '1442621';

    assert.deepStrictEqual(
      getMappedLicense({ meta: { product_id: 917519, variant_id: 1442622 } }),
      { plan: 'pro', tier: 'pro_monthly' },
    );
    assert.deepStrictEqual(
      getMappedLicense({ meta: { product_id: 917519, variant_id: 1442621 } }),
      { plan: 'pro', tier: 'pro_yearly' },
    );

    delete process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS;
    delete process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS;
    delete process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS;
    delete process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS;
  });

  test('rejects a licence from a foreign product', () => {
    assert.strictEqual(getMappedLicense({ meta: { product_id: 999999, variant_id: 888888 } }), null);
    assert.strictEqual(getMappedLicense({}), null);
  });
});
