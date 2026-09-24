import assert from 'node:assert/strict';
import test from 'node:test';
import { PRO_ENTITLEMENTS as CLIENT_PRO_ENTITLEMENTS } from './billing-contract';
import { PRO_ENTITLEMENTS as SERVER_PRO_ENTITLEMENTS } from '../../../api/billing/restore';

/**
 * Server-issued tokens carry their own entitlement list, which the client trusts verbatim (see
 * BillingService.verifyToken). Any drift silently paywalls a feature the customer paid for — that is
 * exactly how `pdf.redact.verify` went missing for licence-key buyers.
 */
test('server PRO entitlements match the client allow-list', () => {
  const client = [...CLIENT_PRO_ENTITLEMENTS].sort();
  const server = [...SERVER_PRO_ENTITLEMENTS].sort();
  assert.deepEqual(server, client);
});
