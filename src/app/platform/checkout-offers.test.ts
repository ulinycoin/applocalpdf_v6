import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import {
  BFCM_DISCOUNT_CODE,
  BFCM_ENDS_AT_MS,
  BFCM_STARTS_AT_MS,
  PRO_LIFETIME_PRICE_USD,
  PRO_YEARLY_PRICE_USD,
  appendCheckoutQuery,
  applyBfcmDiscount,
  getPrimaryPaidOffer,
  isBfcmActive,
  resolvePrimaryOffer,
} from './checkout-offers';

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

describe('BFCM campaign window', () => {
  test('is closed one millisecond before the window opens', () => {
    assert.strictEqual(isBfcmActive(BFCM_STARTS_AT_MS - 1), false);
    assert.strictEqual(isBfcmActive(BFCM_STARTS_AT_MS), true);
  });

  test('is closed at the advertised end and stays closed', () => {
    assert.strictEqual(isBfcmActive(BFCM_ENDS_AT_MS - 1), true);
    assert.strictEqual(isBfcmActive(BFCM_ENDS_AT_MS), false);
    assert.strictEqual(isBfcmActive(Date.parse('2026-12-05T00:00:00Z')), false);
  });

  test('window opens while Tokyo is already on 11 Nov and covers all of Black Friday weekend', () => {
    assert.strictEqual(isBfcmActive(Date.parse('2026-11-10T15:59:00Z')), false);
    // 01:00 on 11 Nov in Tokyo — the biggest traffic market is awake before the US window opens.
    assert.strictEqual(isBfcmActive(Date.parse('2026-11-10T16:01:00Z')), true);
    assert.strictEqual(isBfcmActive(Date.parse('2026-11-27T12:00:00Z')), true);
    assert.strictEqual(isBfcmActive(Date.parse('2026-11-30T12:00:00Z')), true);
  });

  test('the last hours of 30 Nov in the US are still inside the window', () => {
    // 23:59 on 30 Nov in New York (05:00Z) and in Los Angeles (08:00Z minus a minute).
    assert.strictEqual(isBfcmActive(Date.parse('2026-12-01T04:59:00Z')), true);
    assert.strictEqual(isBfcmActive(Date.parse('2026-12-01T07:59:00Z')), true);
    assert.strictEqual(isBfcmActive(Date.parse('2026-12-01T08:00:00Z')), false);
  });
});

describe('applyBfcmDiscount', () => {
  const inWindow = BFCM_STARTS_AT_MS + 1000;

  test('adds the code to the lifetime link during the window', () => {
    const url = applyBfcmDiscount(LIFETIME_URL, 'lifetime', inWindow);
    assert.strictEqual(url, `${LIFETIME_URL}?checkout[discount_code]=${BFCM_DISCOUNT_CODE}`);
  });

  test('keeps an existing query string intact', () => {
    const withQuery = `${LIFETIME_URL}?checkout[custom][distinct_id]=abc`;
    const url = applyBfcmDiscount(withQuery, 'lifetime', inWindow);
    assert.strictEqual(url, `${withQuery}&checkout[discount_code]=${BFCM_DISCOUNT_CODE}`);
  });

  test('never touches the yearly anchor', () => {
    assert.strictEqual(applyBfcmDiscount(YEARLY_URL, 'yearly', inWindow), YEARLY_URL);
  });

  test('leaves links untouched outside the window', () => {
    assert.strictEqual(applyBfcmDiscount(LIFETIME_URL, 'lifetime', BFCM_ENDS_AT_MS), LIFETIME_URL);
    assert.strictEqual(applyBfcmDiscount(LIFETIME_URL, 'lifetime', BFCM_STARTS_AT_MS - 1), LIFETIME_URL);
  });

  test('tolerates empty urls', () => {
    assert.strictEqual(appendCheckoutQuery('', 'a=b'), '');
    assert.strictEqual(applyBfcmDiscount('', 'lifetime', inWindow), '');
  });
});

describe('getPrimaryPaidOffer during the campaign', () => {
  test('prefills the code and shows the discounted price once the window opens', () => {
    const offer = getPrimaryPaidOffer(BFCM_STARTS_AT_MS + 1000);
    assert.strictEqual(offer?.variant, 'lifetime');
    assert.strictEqual(offer?.discounted, true);
    assert.match(offer?.url ?? '', new RegExp(`checkout\\[discount_code\\]=${BFCM_DISCOUNT_CODE}`));
    assert.match(offer?.label ?? '', /\$9\.50/);
  });

  test('sells at the regular price outside the window', () => {
    const offer = getPrimaryPaidOffer(BFCM_ENDS_AT_MS + 1000);
    assert.strictEqual(offer?.discounted, false);
    assert.doesNotMatch(offer?.label ?? '', /\$9\.50/);
    assert.match(offer?.label ?? '', new RegExp(`\\$${PRO_LIFETIME_PRICE_USD}`));
  });
});
