import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { normalizeTier } from './billing-contract';

describe('billing-contract', () => {
  test('accepts monthly, yearly and lifetime pro tiers', () => {
    assert.strictEqual(normalizeTier('pro_monthly', 'pro'), 'pro_monthly');
    assert.strictEqual(normalizeTier('pro_yearly', 'pro'), 'pro_yearly');
    assert.strictEqual(normalizeTier('pro_lifetime', 'pro'), 'pro_lifetime');
  });

  test('rejects pro tiers on a basic plan', () => {
    assert.strictEqual(normalizeTier('pro_lifetime', 'basic'), null);
    assert.strictEqual(normalizeTier('pro_monthly', 'basic'), null);
  });
});
