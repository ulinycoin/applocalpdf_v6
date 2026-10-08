import type { StudioExportOfferBannerState } from './use-studio-export-offer';

interface StudioExportOfferBannerProps {
  offer: StudioExportOfferBannerState;
}

/**
 * Corner banner for the post-export Pro offer. Non-blocking by contract: no backdrop, no focus trap,
 * nothing that can swallow the click that saves the file the user just made.
 */
export function StudioExportOfferBanner({ offer }: StudioExportOfferBannerProps): JSX.Element | null {
  if (!offer.visible) {
    return null;
  }

  return (
    <div className="studio-export-offer" role="complementary" aria-label="LocalPDF Pro offer" data-testid="studio-export-offer">
      <div className="studio-export-offer-body">
        <h3 className="studio-export-offer-title">More PDF work to do?</h3>
        <p className="studio-export-offer-sub">
          Get LocalPDF Pro — $19 once. Removes the daily download and workspace caps.
          Your files stay in your browser.
        </p>
      </div>
      <div className="studio-export-offer-actions">
        <button
          type="button"
          className="studio-export-offer-btn-ghost"
          data-testid="studio-export-offer-continue"
          onClick={offer.dismiss}
        >
          Continue free
        </button>
        <button
          type="button"
          className="studio-export-offer-btn-primary"
          data-testid="studio-export-offer-cta"
          onClick={offer.startCheckout}
        >
          Get Pro — $19 once
        </button>
      </div>
    </div>
  );
}
