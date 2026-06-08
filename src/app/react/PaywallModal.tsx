import { trackMonetizationEvent } from './monetization-telemetry';
import { openCheckout } from './billing';

interface PaywallModalProps {
  toolId: string;
  toolName: string;
  reason: string;
  details?: string;
  onClose: () => void;
}

const PRO_FEATURES = [
  'OCR PDF — text recognition in scans and images',
  'PDF Editor — modify text, images, and annotations',
  'Password protection & encryption',
  'Convert to/from Word, Excel, JPG',
  'Delete, rotate, and reorder pages',
  'Extract images from PDFs',
  'Up to 500 MB per file',
  'No ads, no daily limits',
];

export function PaywallModal({ toolId, toolName, reason, details, onClose }: PaywallModalProps) {
  const handleUpgrade = () => {
    const checkoutUrl = import.meta.env.VITE_LS_CHECKOUT_URL_PRO_MONTHLY;
    trackMonetizationEvent('paywall_cta_clicked', {
      source: 'paywall_modal',
      toolId,
      trigger: reason,
      destination: checkoutUrl ?? null,
      plan: 'pro',
      userState: 'local',
      hadPriorSuccessfulRun: true,
    });
    openCheckout(checkoutUrl, {
      source: 'paywall_modal',
      trigger: reason,
      plan: 'pro',
      variant: 'monthly',
      userState: 'local',
      hadPriorSuccessfulRun: true,
    });
  };

  return (
    <div className="paywall-overlay" onClick={onClose}>
      <div className="paywall-modal" onClick={(e) => e.stopPropagation()}>
        <button className="paywall-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="paywall-lock-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2 className="paywall-title">{toolName}</h2>
        <p className="paywall-subtitle">
          This feature requires <strong>LocalPDF Pro</strong>
        </p>

        {details && (
          <p className="paywall-details">{details}</p>
        )}

        <div className="paywall-divider" />

        <div className="paywall-features">
          <p className="paywall-features-title">With Pro you get:</p>
          <ul className="paywall-feature-list">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="paywall-feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <button className="btn-primary paywall-cta" onClick={handleUpgrade}>
          <span className="btn-inline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Upgrade to Pro — from $3.99/mo
          </span>
        </button>

        <p className="paywall-note">No credit card required to start</p>
      </div>
    </div>
  );
}
