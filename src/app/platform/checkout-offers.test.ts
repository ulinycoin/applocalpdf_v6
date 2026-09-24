import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { PRO_LIFETIME_PRICE_USD, PRO_YEARLY_PRICE_USD, resolvePrimaryOffer } from './checkout-offers';

const LIFETIME_URL = 'https://localpdf.lemonsqueezy.com/checkout/buy/lifetime-variant-slug';
const YEARLY_URL = 'https://localpdf.lemonsqueezy.com/checkout/buy/yearly-variant-slug';

describe('checkout-offers', () => {
  test('prefers the one-time lifetime offer', () => {
    const offer = resolvePrimaryOffer(LIFETIME_URL, YEARLY_URL);
    assert.strictEqual(offer?.variant, 'lifetime');
    assert.strictEqual(offer?.url, LIFETIME_URL);
    assert.match(offer?.label ?? '', new RegExp(`\\$${PRO_LIFETIME_PRICE_USD}`));
  });

  test('falls back to the yearly anchor while lifetime is not configured', () => {
    const offer = resolvePrimaryOffer('', YEARLY_URL);
    assert.strictEqual(offer?.variant, 'yearly');
    assert.strictEqual(offer?.url, YEARLY_URL);
    assert.match(offer?.label ?? '', new RegExp(`\\$${PRO_YEARLY_PRICE_USD}`));
  });

  test('returns null when no paid offer is configured', () => {
    assert.strictEqual(resolvePrimaryOffer('', undefined), null);
    assert.strictEqual(resolvePrimaryOffer('   ', '   '), null);
  });

  test('prices match the live LemonSqueezy products', () => {
    assert.strictEqual(PRO_LIFETIME_PRICE_USD, 19);
    assert.strictEqual(PRO_YEARLY_PRICE_USD, 39.99);
  });

  test('the retired monthly plan is no longer part of the offer ladder', () => {
    const offer = resolvePrimaryOffer('', YEARLY_URL);
    assert.notStrictEqual(offer?.variant, 'monthly');
    assert.doesNotMatch(offer?.label ?? '', /\/mo\b/);
  });
});
