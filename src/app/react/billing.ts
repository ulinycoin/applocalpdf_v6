import { trackMonetizationEvent } from './monetization-telemetry';

const DEFAULT_BILLING_PATH = '/pricing';

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolveBillingDestination(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (!value) {
    return DEFAULT_BILLING_PATH;
  }
  return value;
}

export function resolveCheckoutUrl(rawValue: string | undefined): string | null {
  const value = rawValue?.trim();
  if (!value) {
    return null;
  }
  return isAbsoluteHttpUrl(value) ? value : null;
}

export function openBillingPlans(rawValue: string | undefined): string {
  const destination = resolveBillingDestination(rawValue);
  if (typeof window === 'undefined') {
    return destination;
  }

  if (isAbsoluteHttpUrl(destination)) {
    window.open(destination, '_blank', 'noopener,noreferrer');
    return destination;
  }

  window.location.assign(destination);
  return destination;
}

export function openCheckout(checkoutUrl: string | undefined, options?: {
  source?: string;
  trigger?: string;
  plan?: string;
  variant?: string;
  userState?: 'anonymous' | 'signed_in' | 'local';
  hadPriorSuccessfulRun?: boolean;
  flowId?: string;
}): void {
  if (typeof window === 'undefined') {
    return;
  }

  const safeCheckoutUrl = resolveCheckoutUrl(checkoutUrl);
  if (!safeCheckoutUrl) {
    return;
  }

  trackMonetizationEvent('checkout_opened', {
    source: options?.source ?? 'billing',
    trigger: options?.trigger,
    checkoutUrl: safeCheckoutUrl,
    destination: safeCheckoutUrl,
    plan: options?.plan,
    variant: options?.variant,
    userState: options?.userState ?? 'local',
    hadPriorSuccessfulRun: options?.hadPriorSuccessfulRun,
    flowId: options?.flowId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ls = (window as any).LemonSqueezy;
  if (ls && ls.Url && typeof ls.Url.Open === 'function') {
    ls.Url.Open(safeCheckoutUrl);
    return;
  }

  window.open(safeCheckoutUrl, '_blank', 'noopener,noreferrer');
}
