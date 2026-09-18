import { useEffect, useState } from 'react';
import { getTrialState, rescheduleTrialExpiryWatch } from '../platform/trial-manager';
import { getPrimaryPaidOffer } from '../platform/checkout-offers';

function buildCheckoutUrlWithDistinctId(baseCheckoutUrl: string): string {
  if (typeof window === 'undefined') return baseCheckoutUrl;
  const distinctId = (window as any).posthog?.get_distinct_id?.();
  if (!distinctId) return baseCheckoutUrl;
  return `${baseCheckoutUrl}${baseCheckoutUrl.includes('?') ? '&' : '?'}checkout[custom][distinct_id]=${distinctId}`;
}

export function TrialBanner() {
  const [trialState, setTrialState] = useState(getTrialState());

  useEffect(() => {
    const interval = setInterval(() => {
      setTrialState(getTrialState());
    }, 60_000);
    rescheduleTrialExpiryWatch();
    return () => clearInterval(interval);
  }, []);

  if (!trialState.isActive) return null;

  const offer = getPrimaryPaidOffer();
  if (!offer) return null;

  const checkoutUrl = buildCheckoutUrlWithDistinctId(offer.url);

  return (
    <div className="trial-banner">
      <span>⚡ Pro Trial: <strong>{trialState.daysRemaining}d {trialState.hoursRemaining}h remaining</strong></span>
      <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="trial-banner-link">
        {offer.label}
      </a>
    </div>
  );
}
