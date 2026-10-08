import { useCallback, useRef, useState } from 'react';
import { usePlatform } from './platform-context';
import { useStudioStore, type StudioState } from '../../v6/components/Studio/studio-store';
import { openCheckout } from './billing';
import { trackMonetizationEvent, trackPaywallShown } from './monetization-telemetry';
import { getPrimaryPaidOffer } from '../platform/checkout-offers';
import { STUDIO_EXPORT_OFFER_SOURCE, decideStudioExportOffer } from './studio-export-offer';

const SESSION_KEY = 'localpdf_studio_export_offer_seen';

function seenThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    // Storage restrictions must not block the offer; the in-memory ref still limits it to once.
    return false;
  }
}

function markSeenThisSession(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export interface StudioExportOfferBannerState {
  visible: boolean;
  showOffer: () => void;
  dismiss: () => void;
  startCheckout: () => void;
}

/**
 * The one place that decides whether a qualified user sees the $19 Pro offer right after a successful
 * export. It is deliberately NOT a modal: the download that just finished is the product working, and
 * blocking it repeats the mistake of the deleted download-moment modal (78% of all paywall impressions,
 * zero purchases, a broken export path). The banner sits in the corner next to the download it follows
 * and waits to be dismissed or clicked.
 *
 * Timing comes from the caller: `handleConfirmDownload` in `studio-top-nav` calls `showOffer()` only after
 * the file was actually delivered (`recordDownloadOutcome(..., 'success')`).
 */
export function useStudioExportOffer(): StudioExportOfferBannerState {
  const { runtime } = usePlatform();
  const workspaceCount = useStudioStore((state: StudioState) => state.documents.length);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  const showOffer = useCallback(() => {
    if (shownRef.current) {
      return;
    }
    const decision = decideStudioExportOffer({
      workspaceCount,
      plan: runtime.billing.getContext().plan,
      alreadyShownThisSession: seenThisSession(),
    });
    if (!decision.show) {
      return;
    }
    const offer = getPrimaryPaidOffer();
    if (!offer) {
      // No resolvable price: showing a generic upsell would spend a qualified impression on nothing.
      return;
    }
    shownRef.current = true;
    markSeenThisSession();
    setVisible(true);
    // Same funnel name the monetization dashboards already read, with the new source so this test stays
    // separable from the legacy `upsell_overlay` impressions.
    console.log('[dbg] showing', decision.reason, 'key', (() => { try { return window.sessionStorage.getItem('localpdf_paywall_seen:studio:export_success'); } catch { return 'err'; } })());
    const trackedResult = trackPaywallShown({
      source: STUDIO_EXPORT_OFFER_SOURCE,
      toolId: 'studio',
      trigger: 'export_success',
      reason: decision.reason,
      userState: 'local',
      hadPriorSuccessfulRun: true,
    });
    console.log('[dbg] tracked', trackedResult);
  }, [runtime, workspaceCount]);

  const dismiss = useCallback(() => {
    setVisible(false);
    trackMonetizationEvent('paywall_dismissed', {
      source: STUDIO_EXPORT_OFFER_SOURCE,
      toolId: 'studio',
      trigger: 'export_success',
    });
  }, []);

  const startCheckout = useCallback(() => {
    const offer = getPrimaryPaidOffer();
    if (!offer) {
      setVisible(false);
      return;
    }
    trackMonetizationEvent('paywall_cta_clicked', {
      source: STUDIO_EXPORT_OFFER_SOURCE,
      toolId: 'studio',
      trigger: 'export_success',
      destination: offer.url,
      variant: offer.variant,
      userState: 'local',
      hadPriorSuccessfulRun: true,
    });
    openCheckout(offer.url, {
      source: STUDIO_EXPORT_OFFER_SOURCE,
      trigger: 'export_success',
      plan: 'pro',
      variant: offer.variant,
      userState: 'local',
      hadPriorSuccessfulRun: true,
    });
    setVisible(false);
  }, []);

  return { visible, showOffer, dismiss, startCheckout };
}
