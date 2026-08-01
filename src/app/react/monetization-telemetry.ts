declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
    gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
  }
}

export type MonetizationEventName =
  | 'paywall_shown'
  | 'paywall_cta_clicked'
  | 'checkout_opened'
  | 'trial_started'
  | 'trial_expired'
  | 'trial_convert'
  | 'purchase_completed';

export interface MonetizationEventProps {
  source?: string;
  toolId?: string;
  trigger?: string;
  destination?: string;
  checkoutUrl?: string;
  plan?: string;
  variant?: string;
  route?: string;
  userState?: 'anonymous' | 'signed_in' | 'local';
  hadPriorSuccessfulRun?: boolean;
  reason?: string;
  status?: string;
  flowId?: string;
  trialDaysRemaining?: number;
  trialSource?: string;
}

function withRoute(props: MonetizationEventProps): Record<string, unknown> {
  const route = props.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined);
  return {
    ...props,
    route,
  };
}

export function trackMonetizationEvent(event: MonetizationEventName, props: MonetizationEventProps = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = withRoute(props);
  if (window.posthog) {
    window.posthog.capture(event, payload);
  }

  if (window.gtag) {
    window.gtag('event', event, payload);
  }
}

export function trackPaywallShown(props: MonetizationEventProps = {}): boolean {
  const toolId = props.toolId ?? 'studio';
  const trigger = props.trigger ?? 'upsell_guardrail';
  const key = `localpdf_paywall_seen:${toolId}:${trigger}`;
  let alreadyTracked = false;

  if (typeof window !== 'undefined') {
    try {
      alreadyTracked = window.sessionStorage.getItem(key) === '1';
      if (!alreadyTracked) window.sessionStorage.setItem(key, '1');
    } catch {
      // Storage restrictions must not block the paywall.
    }
  }

  if (alreadyTracked) return false;
  trackMonetizationEvent('paywall_shown', props);
  return true;
}
