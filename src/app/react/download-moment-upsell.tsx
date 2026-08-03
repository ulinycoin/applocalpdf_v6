import React, { useCallback, useState } from 'react';
import { trackMonetizationEvent, trackPaywallShown } from './monetization-telemetry';
import { openCheckout } from './billing';
import { activateProTrial } from './studio-paywall';
import { getTrialState } from '../platform/trial-manager';
import type { PlatformRuntime } from '../platform/create-platform';

/** Show for free + active trial; skip paid Pro. */
export function shouldShowDownloadMomentUpsell(plan: string): boolean {
  if (getTrialState().isActive) return true;
  return plan !== 'pro';
}

function DownloadMomentUpsellOverlay({
  toolId,
  flowId,
  onUpgrade,
  onTrial,
  onDismiss,
}: {
  toolId: string;
  flowId: string;
  onUpgrade: () => void;
  onTrial: () => void;
  onDismiss: () => void;
}) {
  const trialState = getTrialState();
  const checkoutUrl = import.meta.env.VITE_LS_CHECKOUT_URL_PRO_MONTHLY;

  const title = trialState.isActive
    ? `Trial: ${trialState.daysRemaining}d ${trialState.hoursRemaining}h remaining`
    : 'Your file is ready';
  const subtitle = trialState.isActive
    ? 'Upgrade to Pro now to keep unlimited pages and all Pro tools after the trial ends.'
    : trialState.trialAvailable
    ? 'Start a 3-day free trial to unlock unlimited pages and all Pro tools — or upgrade instantly.'
    : 'Upgrade to Pro to unlock unlimited pages and all Pro tools.';

  const handleUpgrade = () => {
    trackMonetizationEvent('paywall_cta_clicked', {
      source: 'download_moment',
      toolId,
      trigger: 'upgrade_pro',
      destination: checkoutUrl ?? null,
      plan: 'pro',
      variant: 'monthly',
      userState: 'local',
      hadPriorSuccessfulRun: true,
      flowId,
    });
    openCheckout(checkoutUrl, {
      source: 'download_moment',
      trigger: 'upgrade_pro',
      plan: 'pro',
      variant: 'monthly',
      userState: 'local',
      hadPriorSuccessfulRun: true,
      flowId,
    });
    onUpgrade();
  };

  const handleTrial = () => {
    trackMonetizationEvent('paywall_cta_clicked', {
      source: 'download_moment',
      toolId,
      trigger: 'start_trial',
      userState: 'local',
      hadPriorSuccessfulRun: true,
      flowId,
    });
    onTrial();
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
            Upgrade to Pro — $3.99/mo
          </button>
          {!trialState.isActive && trialState.trialAvailable ? (
            <button
              type="button"
              onClick={handleTrial}
              style={{ display: 'block', width: '100%', marginTop: 10, background: 'transparent', color: '#52606b', border: '1px solid #d5dde3', borderRadius: 999, padding: '10px 24px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Start free trial — 3 days
            </button>
          ) : null}
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

export function useDownloadMomentUpsell(runtime: PlatformRuntime, plan: string) {
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
      onTrial={() => { activateProTrial(runtime.billing, downloadUpsell.flowId, 'download_moment'); setDownloadUpsell(null); downloadUpsell.pending(); }}
      onDismiss={() => { setDownloadUpsell(null); downloadUpsell.pending(); }}
    />
  ) : null;

  return { requestDownload, overlay };
}
