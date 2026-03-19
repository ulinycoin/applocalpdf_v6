const DEFAULT_BILLING_PATH = '/pricing';

export function resolveBillingDestination(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (!value) {
    return DEFAULT_BILLING_PATH;
  }
  return value;
}

export function openBillingPlans(rawValue: string | undefined): string {
  const destination = resolveBillingDestination(rawValue);
  if (typeof window === 'undefined') {
    return destination;
  }

  const isAbsoluteUrl = /^https?:\/\//i.test(destination);
  if (isAbsoluteUrl) {
    window.open(destination, '_blank', 'noopener,noreferrer');
    return destination;
  }

  window.location.assign(destination);
  return destination;
}

export function openCheckout(checkoutUrl: string | undefined): void {
  if (typeof window === 'undefined' || !checkoutUrl) {
    return;
  }
  
  // Try to use LemonSqueezy overlay if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ls = (window as any).LemonSqueezy;
  if (ls && ls.Url && typeof ls.Url.Open === 'function') {
    ls.Url.Open(checkoutUrl);
    return;
  }

  // Fallback to strict _blank navigation
  window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
}

