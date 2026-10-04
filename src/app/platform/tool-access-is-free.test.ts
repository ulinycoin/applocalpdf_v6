import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASIC_ENTITLEMENTS, PRO_ENTITLEMENTS } from './billing-contract';

/**
 * The business model (project memory) is: every tool runs on every plan, and the free tier is capped
 * by downloads per day. These guards fail the moment someone re-introduces a paywall on execution.
 */
const pluginsDir = fileURLToPath(new URL('../../plugins', import.meta.url));

function definitionSources(): Array<{ name: string; source: string }> {
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: `${pluginsDir}/${entry.name}/definition.ts` }))
    .filter((entry) => existsSync(entry.path))
    .map((entry) => ({ name: entry.name, source: readFileSync(entry.path, 'utf8') }));
}

describe('tool access is free on every plan', () => {
  const basic = new Set<string>(BASIC_ENTITLEMENTS);

  test('the free plan owns every entitlement', () => {
    assert.deepStrictEqual([...BASIC_ENTITLEMENTS].sort(), [...PRO_ENTITLEMENTS].sort());
  });

  test('every plugin entitlement is available on the free plan', () => {
    const sources = definitionSources();
    assert.ok(sources.length >= 15, `expected every plugin definition, found ${sources.length}`);

    const missing: string[] = [];
    for (const { name, source } of sources) {
      for (const list of source.matchAll(/entitlements:\s*\[([^\]]*)\]/gu)) {
        for (const id of list[1].matchAll(/'([^']+)'/gu)) {
          if (!basic.has(id[1])) {
            missing.push(`${name}: ${id[1]}`);
          }
        }
      }
    }
    assert.deepStrictEqual(missing, []);
  });

  test('no plugin declares a Pro feature tier', () => {
    const proTier = definitionSources()
      .filter(({ source }) => /featureTier:\s*'pro'/u.test(source))
      .map(({ name }) => name);
    assert.deepStrictEqual(proTier, []);
  });
});
