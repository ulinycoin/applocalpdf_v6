import type { ReactNode } from 'react';
import { StudioExportOfferContext } from './studio-export-offer-context';
import { useStudioExportOffer, type StudioExportOfferBannerState } from './use-studio-export-offer';

/**
 * One offer instance for the whole Studio, above both the top nav (which renders the banner) and the
 * tool surfaces that deliver files (convert panel, Auto-TOC). Before this, only the top-nav export could
 * trigger the offer, so qualified downloads made from a tool panel were invisible to the funnel.
 */
export function StudioExportOfferProvider({ children }: { children: ReactNode }): JSX.Element {
  const offer: StudioExportOfferBannerState = useStudioExportOffer();
  return <StudioExportOfferContext.Provider value={offer}>{children}</StudioExportOfferContext.Provider>;
}
