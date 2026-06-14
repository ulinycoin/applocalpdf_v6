import { useEffect, useRef, useState } from 'react';
import { usePlatform } from './platform-context';
import type { RunnerTelemetryEvent } from '../../core/public/contracts';
import { openCheckout } from './billing';
import { trackMonetizationEvent } from './monetization-telemetry';
import { getTrialState } from '../platform/trial-manager';
import { handleTrialStart } from './studio-paywall';

interface UiToastItem {
  id: string;
  message: string;
  level: 'info' | 'error';
}

interface UpsellState {
  runId: string;
  toolId: string;
  reason: string;
}

const TOAST_DEDUPE_MS = 4_000;
const MAX_ACTIVE_TOASTS = 4;

export function toToastKey(toolId: string, level: UiToastItem['level'], message: string): string {
  return `${toolId}|${level}|${message.trim().toLowerCase()}`;
}

export function shouldDisplayToast(
  lastSeenAtMs: number | undefined,
  nowMs: number,
  dedupeWindowMs = TOAST_DEDUPE_MS,
): boolean {
  if (lastSeenAtMs === undefined) {
    return true;
  }
  return nowMs - lastSeenAtMs >= dedupeWindowMs;
}

function isUiToastEvent(event: RunnerTelemetryEvent): event is Extract<RunnerTelemetryEvent, { type: 'UI_TOAST_SHOWN' }> {
  return event.type === 'UI_TOAST_SHOWN';
}

function isUpsellEvent(event: RunnerTelemetryEvent): event is Extract<RunnerTelemetryEvent, { type: 'UI_UPSELL_SHOWN' }> {
  return event.type === 'UI_UPSELL_SHOWN';
}

const TOOL_UPSELL_MESSAGES: Record<string, string> = {
  'ocr-pdf': 'OCR is a Pro feature',
  'pdf-to-jpg': 'PDF to JPG is a Pro feature',
  'extract-images': 'Download all images requires Pro',
};

function formatUpsellReason(toolId: string, rawReason: string): string {
  return TOOL_UPSELL_MESSAGES[toolId] ?? rawReason;
}

function buildCheckoutUrlWithDistinctId(baseCheckoutUrl: string): string {
  if (typeof window === 'undefined') return baseCheckoutUrl;
  const distinctId = (window as any).posthog?.get_distinct_id?.();
  if (!distinctId) return baseCheckoutUrl;
  return `${baseCheckoutUrl}${baseCheckoutUrl.includes('?') ? '&' : '?'}checkout[custom][distinct_id]=${distinctId}`;
}

export function UxFeedbackOverlay() {
  const { runtime } = usePlatform();
  const [toasts, setToasts] = useState<UiToastItem[]>([]);
  const [upsell, setUpsell] = useState<UpsellState | null>(null);
  const [trialState, setTrialState] = useState(getTrialState());
  const recentToastByKeyRef = useRef(new Map<string, number>());
  const suppressedCountByKeyRef = useRef(new Map<string, number>());

  useEffect(() => {
    const interval = setInterval(() => {
      setTrialState(getTrialState());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return runtime.telemetry.subscribe((event) => {
      if (isUiToastEvent(event)) {
        const now = Date.now();
        const toastKey = toToastKey(event.toolId, event.level, event.message);
        const lastSeenAtMs = recentToastByKeyRef.current.get(toastKey);
        if (!shouldDisplayToast(lastSeenAtMs, now)) {
          const nextSuppressed = (suppressedCountByKeyRef.current.get(toastKey) ?? 0) + 1;
          suppressedCountByKeyRef.current.set(toastKey, nextSuppressed);
          runtime.telemetry.track({
            type: 'UI_TOAST_DEDUPED',
            runId: event.runId,
            toolId: event.toolId,
            key: toastKey,
            suppressedCount: nextSuppressed,
          });
          return;
        }
        recentToastByKeyRef.current.set(toastKey, now);
        suppressedCountByKeyRef.current.delete(toastKey);
        for (const [key, ts] of recentToastByKeyRef.current) {
          if (now - ts > TOAST_DEDUPE_MS * 2) {
            recentToastByKeyRef.current.delete(key);
          }
        }

        const toastId = `${event.runId}-${Date.now()}`;
        setToasts((current) => {
          const next = [...current, { id: toastId, message: event.message, level: event.level }];
          if (next.length <= MAX_ACTIVE_TOASTS) {
            return next;
          }
          return next.slice(next.length - MAX_ACTIVE_TOASTS);
        });
        setTimeout(() => {
          setToasts((current) => current.filter((item) => item.id !== toastId));
        }, 5000);
        return;
      }
      if (isUpsellEvent(event)) {
        setUpsell({ runId: event.runId, toolId: event.toolId, reason: event.reason });
      }
    });
  }, [runtime.telemetry]);

  return (
    <>
      <div className="ux-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} data-testid="ux-toast-item" className={`ux-toast-item${toast.level === 'error' ? ' error' : ''}`}>
            {toast.message}
            <button
              type="button"
              className="ux-toast-close"
              aria-label="Dismiss"
              onClick={() => setToasts((c) => c.filter((t) => t.id !== toast.id))}
            >
              ✕
            </button>
            <div className="ux-toast-progress" />
          </div>
        ))}
      </div>

      {upsell && (
        <div className="ux-upsell-overlay" role="presentation" onClick={() => setUpsell(null)}>
          <div className="ux-upsell-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="ux-upsell-header">
              <div className="ux-upsell-icon">⚡</div>
              <div className="ux-upsell-body">
                <h3 className="ux-upsell-title">
                  {trialState.isActive 
                    ? `Trial active — ${trialState.daysRemaining}d ${trialState.hoursRemaining}h left`
                    : formatUpsellReason(upsell.toolId, upsell.reason)}
                </h3>
                <p className="ux-upsell-sub">
                  {trialState.isActive
                    ? 'You have full Pro access during your trial. Upgrade now to keep it after the trial ends.'
                    : trialState.trialAvailable
                    ? 'Start a 3-day free trial to unlock unlimited pages and all Pro tools.'
                    : 'Upgrade to Pro to unlock unlimited pages and all Pro tools.'}
                </p>
              </div>
            </div>
            <div className="ux-upsell-actions">
              <button className="ux-upsell-btn-ghost" onClick={() => setUpsell(null)}>
                {trialState.isActive ? 'Continue trial' : 'Not now'}
              </button>
              <button
                className="ux-upsell-btn-primary"
                onClick={() => {
                  if (trialState.isActive || !trialState.trialAvailable) {
                    const baseCheckoutUrl = import.meta.env.VITE_LS_CHECKOUT_URL_PRO_MONTHLY;
                    const checkoutUrl = buildCheckoutUrlWithDistinctId(baseCheckoutUrl);
                    runtime.telemetry.track({
                      type: 'UI_UPSELL_CTA_CLICKED',
                      runId: upsell.runId,
                      toolId: upsell.toolId,
                      destination: checkoutUrl ?? null,
                    });
                    trackMonetizationEvent('paywall_cta_clicked', {
                      source: 'upsell_overlay',
                      toolId: upsell.toolId,
                      trigger: 'upgrade_pro',
                      destination: checkoutUrl ?? null,
                      userState: 'local',
                      hadPriorSuccessfulRun: true,
                      flowId: upsell.runId,
                    });
                    openCheckout(checkoutUrl, {
                      source: 'upsell_overlay',
                      trigger: 'upgrade_pro',
                      plan: 'pro',
                      variant: 'monthly',
                      userState: 'local',
                      hadPriorSuccessfulRun: true,
                      flowId: upsell.runId,
                    });
                  } else {
                    handleTrialStart(runtime.telemetry, upsell.runId);
                    (runtime.billing as any).startTrial();
                    setTrialState(getTrialState());
                  }
                  setUpsell(null);
                }}
              >
                {(trialState.isActive || !trialState.trialAvailable) ? 'Upgrade to Pro' : 'Start free trial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
