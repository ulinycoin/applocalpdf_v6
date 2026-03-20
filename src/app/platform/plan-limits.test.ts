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
    assert.strictEqual(limits.maxPagesPerDocument, 25);
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

  test('allows document import up to the free page limit', () => {
    const allowed = canUseDocumentWithPageCount({ plan: 'basic' }, 25);
    assert.strictEqual(allowed.allowed, true);
    const blocked = canUseDocumentWithPageCount({ plan: 'basic' }, 26);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.reason, 'page_limit');
    assert.strictEqual(blocked.limit, 25);
  });

  test('blocks document creation when either limit is exceeded', () => {
    const workspaceBlocked = canAddDocumentToStudio({ plan: 'basic' }, 3, 1);
    assert.strictEqual(workspaceBlocked.allowed, false);
    assert.strictEqual(workspaceBlocked.reason, 'workspace_limit');

    const pageBlocked = canAddDocumentToStudio({ plan: 'basic' }, 1, 26);
    assert.strictEqual(pageBlocked.allowed, false);
    assert.strictEqual(pageBlocked.reason, 'page_limit');
  });
});
