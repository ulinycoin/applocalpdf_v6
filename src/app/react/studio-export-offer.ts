/**
 * Qualification for the contextual Pro offer shown after a successful export (`studio_export_moment`).
 *
 * The export-anchored offer only makes sense for someone who actually worked in the multi-document
 * workspace: two documents on the canvas is the cheapest available proof of that, and it is the
 * behaviour the aggregate data shows (117 workspace-limit hits in 60 days). Text edits are deliberately
 * NOT part of the rule — someone who merged two PDFs without typing is exactly the buyer this test is for.
 *
 * Kept out of the component so the rule, the once-per-session limit and the paid-plan skip are testable.
 */
export const STUDIO_EXPORT_OFFER_SOURCE = 'studio_export_moment';

export interface StudioExportOfferSignals {
  /** Documents currently on the Studio canvas. */
  workspaceCount: number;
  plan: string;
  /** Whether an offer has already been shown in this browser session. */
  alreadyShownThisSession: boolean;
}

export type StudioExportOfferDecision = { show: true; reason: 'multi_document_workspace' } | { show: false; reason: 'singleton_workspace' | 'already_paid' | 'already_shown' };

export function decideStudioExportOffer(signals: StudioExportOfferSignals): StudioExportOfferDecision {
  if (signals.plan !== 'basic') {
    return { show: false, reason: 'already_paid' };
  }
  if (signals.alreadyShownThisSession) {
    return { show: false, reason: 'already_shown' };
  }
  if (signals.workspaceCount < 2) {
    return { show: false, reason: 'singleton_workspace' };
  }
  return { show: true, reason: 'multi_document_workspace' };
}
