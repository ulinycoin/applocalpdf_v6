import assert from 'node:assert/strict';
import test from 'node:test';
import { STUDIO_EXPORT_OFFER_SOURCE, decideStudioExportOffer } from './studio-export-offer';

test('a free user with two documents on the canvas is qualified for the export offer', () => {
  assert.deepEqual(
    decideStudioExportOffer({ workspaceCount: 2, plan: 'basic', alreadyShownThisSession: false }),
    { show: true, reason: 'multi_document_workspace' },
  );
  assert.deepEqual(
    decideStudioExportOffer({ workspaceCount: 5, plan: 'basic', alreadyShownThisSession: false }),
    { show: true, reason: 'multi_document_workspace' },
  );
});

test('one document on the canvas is not proof of workspace work, so the offer stays away', () => {
  const decision = decideStudioExportOffer({ workspaceCount: 1, plan: 'basic', alreadyShownThisSession: false });
  assert.equal(decision.show, false);
  assert.equal(decision.reason, 'singleton_workspace');
});

test('an empty canvas never shows the offer', () => {
  assert.equal(decideStudioExportOffer({ workspaceCount: 0, plan: 'basic', alreadyShownThisSession: false }).show, false);
});

test('paying users never get the offer, however many documents they have', () => {
  for (const plan of ['pro', 'trial']) {
    const decision = decideStudioExportOffer({ workspaceCount: 4, plan, alreadyShownThisSession: false });
    assert.equal(decision.show, false, plan);
    assert.equal(decision.reason, 'already_paid');
  }
});

test('one qualified impression per session: a second export does not re-show the offer', () => {
  const decision = decideStudioExportOffer({ workspaceCount: 3, plan: 'basic', alreadyShownThisSession: true });
  assert.equal(decision.show, false);
  assert.equal(decision.reason, 'already_shown');
});

test('the offer source is separable from the legacy overlay impressions', () => {
  // The falsifier counts qualified impressions of this offer; reusing `upsell_overlay` would mix them
  // with the 60-day history of a different experiment.
  assert.equal(STUDIO_EXPORT_OFFER_SOURCE, 'studio_export_moment');
});
