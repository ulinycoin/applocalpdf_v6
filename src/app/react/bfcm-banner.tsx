import { useEffect } from 'react';
import {
  BFCM_DISCOUNT_CODE,
  BFCM_PRICE_USD,
  PRO_LIFETIME_PRICE_USD,
  isBfcmActive,
} from '../platform/checkout-offers';
import { trackMonetizationEvent } from './monetization-telemetry';

export type BfcmPlacement = 'paywall' | 'post_run';

/**
 * Campaign strip for the in-app surfaces where the buying decision actually happens.
 *
 * Renders nothing outside the campaign window, so the offer disappears on 1 Dec without a deploy.
 * The code is also prefilled into the CTA itself — this strip only explains the price the buyer is
 * about to see, it is never the only way to get the discount.
 */
export function BfcmBanner({ placement }: { placement: BfcmPlacement }) {
  const active = isBfcmActive();

  useEffect(() => {
    if (!isBfcmActive()) {
      return;
    }
    trackMonetizationEvent('bfcm_banner_shown', { source: 'bfcm', placement });
  }, [placement]);

  if (!active) {
    return null;
  }

  return (
    <div className="bfcm-banner" role="note">
      <span className="bfcm-banner-label">Black Friday</span>
      <span className="bfcm-banner-text">
        <strong>50% off</strong> Pro Lifetime — ${BFCM_PRICE_USD.toFixed(2)} instead of $
        {PRO_LIFETIME_PRICE_USD}, until Nov 30.
      </span>
      <span className="bfcm-banner-code">Code {BFCM_DISCOUNT_CODE}</span>
    </div>
  );
}
