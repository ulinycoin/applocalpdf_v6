import { createContext, useContext } from 'react';
import type { StudioExportOfferBannerState } from './use-studio-export-offer';

/**
 * The no-op default is deliberate: a component rendered outside the provider must never break a
 * download or throw during render. Monetization is allowed to do nothing; it is not allowed to fail.
 */
export const NO_EXPORT_OFFER: StudioExportOfferBannerState = {
  visible: false,
  showOffer: () => {},
  dismiss: () => {},
  startCheckout: () => {},
};

export const StudioExportOfferContext = createContext<StudioExportOfferBannerState>(NO_EXPORT_OFFER);

/** Banner state for the top nav, and the `showOffer` trigger for every Studio exit point. */
export function useStudioExportOfferState(): StudioExportOfferBannerState {
  return useContext(StudioExportOfferContext);
}
