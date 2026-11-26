import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import {
  canAddDocumentToStudio,
  canCreateWorkspace,
  canUseDocumentWithPageCount,
  getPlanLimits,
} from './plan-limits';

describe('plan-limits', () => {
  test('resolves free plan limits', () => {
    const limits = getPlanLimits('basic');
    assert.strictEqual(limits.maxWorkspaces, Number.POSITIVE_INFINITY);
    assert.strictEqual(limits.maxPagesPerDocument, Number.POSITIVE_INFINITY);
  });

  test('resolves pro plan limits', () => {
    const limits = getPlanLimits('pro');
    assert.strictEqual(limits.maxWorkspaces, Number.POSITIVE_INFINITY);
    assert.strictEqual(limits.maxPagesPerDocument, Number.POSITIVE_INFINITY);
  });

  // Workspaces are unlimited on every plan: the canvas never sends a file anywhere, and the old
  // 3-document cap stopped free users before they had a result to pay for.
  test('allows a fourth workspace on the free plan', () => {
    const result = canCreateWorkspace({ plan: 'basic' }, 3);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.current, 3);
  });

  test('allows a large number of workspaces on the free plan', () => {
    const result = canCreateWorkspace({ plan: 'basic' }, 40);
    assert.strictEqual(result.allowed, true);
  });

  test('allows document import without page limits on the free plan', () => {
    const allowed25 = canUseDocumentWithPageCount({ plan: 'basic' }, 25);
    assert.strictEqual(allowed25.allowed, true);
    const allowedLarge = canUseDocumentWithPageCount({ plan: 'basic' }, 1000);
    assert.strictEqual(allowedLarge.allowed, true);
  });

  test('allows document creation past the old workspace cap', () => {
    const result = canAddDocumentToStudio({ plan: 'basic' }, 3, 100);
    assert.strictEqual(result.allowed, true);
  });
});
