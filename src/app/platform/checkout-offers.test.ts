import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { PRO_LIFETIME_PRICE_USD, resolvePrimaryOffer } from './checkout-offers';

const LIFETIME_URL = 'https://localpdf.lemonsqueezy.com/checkout/buy/lifetime-variant-slug';
const MONTHLY_URL = 'https://localpdf.lemonsqueezy.com/checkout/buy/monthly-variant-slug';

describe('checkout-offers', () => {
  test('prefers the one-time lifetime offer', () => {
    const offer = resolvePrimaryOffer(LIFETIME_URL, MONTHLY_URL);
    assert.strictEqual(offer?.variant, 'lifetime');
    assert.strictEqual(offer?.url, LIFETIME_URL);
    assert.match(offer?.label ?? '', new RegExp(`\\$${PRO_LIFETIME_PRICE_USD}`));
  });

  test('falls back to the monthly anchor while lifetime is not configured', () => {
    const offer = resolvePrimaryOffer('', MONTHLY_URL);
    assert.strictEqual(offer?.variant, 'monthly');
    assert.strictEqual(offer?.url, MONTHLY_URL);
  });

  test('returns null when no paid offer is configured', () => {
    assert.strictEqual(resolvePrimaryOffer('', undefined), null);
    assert.strictEqual(resolvePrimaryOffer('   ', '   '), null);
  });

  test('lifetime price is the decided one-time $19', () => {
    assert.strictEqual(PRO_LIFETIME_PRICE_USD, 19);
  });
});
