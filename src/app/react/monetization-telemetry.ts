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
  | 'trial_convert';

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
