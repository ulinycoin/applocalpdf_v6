import React, { useCallback, useState } from 'react';
import { trackMonetizationEvent, trackPaywallShown } from './monetization-telemetry';
import { openCheckout } from './billing';
import { getPrimaryPaidOffer } from '../platform/checkout-offers';
import { getTrialState } from '../platform/trial-manager';

/**
 * Show for free users and for anyone still inside a legacy 3-day trial. Skipped for paid Pro, and
 * skipped entirely when no paid offer is configured — a download must never be gated behind a CTA
 * that goes nowhere.
 */
export function shouldShowDownloadMomentUpsell(plan: string): boolean {
  if (!getPrimaryPaidOffer()) return false;
  if (getTrialState().isActive) return true;
  return plan !== 'pro';
}

function DownloadMomentUpsellOverlay({
  toolId,
  flowId,
  onUpgrade,
  onDismiss,
}: {
  toolId: string;
  flowId: string;
  onUpgrade: () => void;
  onDismiss: () => void;
}) {
  const trialState = getTrialState();
  const offer = getPrimaryPaidOffer();

  if (!offer) return null;

  const title = trialState.isActive
    ? `Trial: ${trialState.daysRemaining}d ${trialState.hoursRemaining}h remaining`
    : 'Your file is ready';
  const subtitle = trialState.isActive
    ? 'Keep every Pro tool after the trial ends — one payment, never renews.'
    : 'One payment, no subscription. Unlimited pages and every Pro tool, for good.';

  const handleUpgrade = () => {
    trackMonetizationEvent('paywall_cta_clicked', {
      source: 'download_moment',
      toolId,
      trigger: 'upgrade_pro',
      destination: offer.url,
      plan: 'pro',
      variant: offer.variant,
      userState: 'local',
      hadPriorSuccessfulRun: true,
      flowId,
    });
    openCheckout(offer.url, {
      source: 'download_moment',
      trigger: 'upgrade_pro',
      plan: 'pro',
      variant: offer.variant,
      userState: 'local',
      hadPriorSuccessfulRun: true,
      flowId,
    });
    onUpgrade();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,32,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onDismiss}
    >
      <div
        style={{ background: '#fffdf8', borderRadius: 12, maxWidth: 400, width: 'calc(100% - 32px)', padding: 24, boxShadow: '0 12px 40px rgba(20,32,40,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#142028' }}>{title}</div>
          <div style={{ fontSize: 13, color: '#52606b', marginBottom: 16, lineHeight: 1.5 }}>{subtitle}</div>
          <button
            type="button"
            onClick={handleUpgrade}
            style={{ background: '#142028', color: '#f9f5ee', border: 'none', borderRadius: 999, padding: '10px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}
          >
            {offer.label}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{ display: 'block', width: '100%', marginTop: 10, background: 'transparent', color: '#8a97a3', border: 'none', padding: '8px 24px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Download anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export function useDownloadMomentUpsell(plan: string) {
  const [downloadUpsell, setDownloadUpsell] = useState<{ toolId: string; flowId: string; pending: () => void } | null>(null);

  const requestDownload = useCallback((toolId: string, downloadFn: () => void | Promise<void>) => {
    if (!shouldShowDownloadMomentUpsell(plan)) {
      void downloadFn();
      return;
    }
    const flowId = crypto.randomUUID();
    const shown = trackPaywallShown({
      source: 'download_moment',
      toolId,
      trigger: 'download_moment',
      userState: 'local',
      hadPriorSuccessfulRun: true,
      flowId,
    });
    if (!shown) {
      void downloadFn();
      return;
    }
    setDownloadUpsell({ toolId, flowId, pending: () => void downloadFn() });
  }, [plan]);

  const overlay = downloadUpsell ? (
    <DownloadMomentUpsellOverlay
      toolId={downloadUpsell.toolId}
      flowId={downloadUpsell.flowId}
      onUpgrade={() => { setDownloadUpsell(null); downloadUpsell.pending(); }}
      onDismiss={() => { setDownloadUpsell(null); downloadUpsell.pending(); }}
    />
  ) : null;

  return { requestDownload, overlay };
}
