import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { normalizeTier } from './billing-contract';

describe('billing-contract', () => {
  test('accepts monthly and yearly pro tiers', () => {
    assert.strictEqual(normalizeTier('pro_monthly', 'pro'), 'pro_monthly');
    assert.strictEqual(normalizeTier('pro_yearly', 'pro'), 'pro_yearly');
  });

  test('rejects lifetime tiers', () => {
    assert.strictEqual(normalizeTier('pro_lifetime', 'pro'), null);
    assert.strictEqual(normalizeTier('pro_lifetime', 'basic'), null);
  });
});
