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
    assert.strictEqual(limits.maxWorkspaces, 3);
    assert.strictEqual(limits.maxPagesPerDocument, Number.POSITIVE_INFINITY);
  });

  test('resolves pro plan limits', () => {
    const limits = getPlanLimits('pro');
    assert.strictEqual(limits.maxWorkspaces, Number.POSITIVE_INFINITY);
    assert.strictEqual(limits.maxPagesPerDocument, Number.POSITIVE_INFINITY);
  });

  test('blocks a fourth workspace on the free plan', () => {
    const result = canCreateWorkspace({ plan: 'basic' }, 3);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'workspace_limit');
    assert.strictEqual(result.limit, 3);
    assert.strictEqual(result.current, 3);
  });

  test('allows document import without page limits on the free plan', () => {
    const allowed25 = canUseDocumentWithPageCount({ plan: 'basic' }, 25);
    assert.strictEqual(allowed25.allowed, true);
    const allowedLarge = canUseDocumentWithPageCount({ plan: 'basic' }, 1000);
    assert.strictEqual(allowedLarge.allowed, true);
  });

  test('blocks document creation when workspace limit is exceeded', () => {
    const workspaceBlocked = canAddDocumentToStudio({ plan: 'basic' }, 3, 100);
    assert.strictEqual(workspaceBlocked.allowed, false);
    assert.strictEqual(workspaceBlocked.reason, 'workspace_limit');
  });
});
