import type { PdfDocumentInfo, PdfFontInfo, PdfInfoReport, PdfXmpInfo } from '../../../services/pdf/pdf-info-analyzer';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function InfoRow({ label, value }: { label: string; value: string | number | boolean | null | undefined }): JSX.Element | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);

  return (
    <div className="pdf-info-row">
      <span className="pdf-info-label">{label}</span>
      <span className="pdf-info-value">{display}</span>
    </div>
  );
}

function MetadataSection({ documentInfo }: { documentInfo: PdfDocumentInfo }): JSX.Element | null {
  const rows = [
    ['Title', documentInfo.title],
    ['Author', documentInfo.author],
    ['Subject', documentInfo.subject],
    ['Keywords', documentInfo.keywords],
    ['Creator', documentInfo.creator],
    ['Producer', documentInfo.producer],
    ['Created', documentInfo.creationDate],
    ['Modified', documentInfo.modificationDate],
  ] as const;

  const hasValues = rows.some(([, value]) => Boolean(value));
  if (!hasValues) {
    return null;
  }

  return (
    <section className="pdf-info-section">
      <h3 className="pdf-info-section-title">Document Info</h3>
      <div className="pdf-info-grid">
        {rows.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function XmpSection({ xmp }: { xmp?: PdfXmpInfo }): JSX.Element | null {
  if (!xmp?.present) {
    return null;
  }

  return (
    <section className="pdf-info-section">
      <h3 className="pdf-info-section-title">XMP Metadata</h3>
      {xmp.pdfAClaim ? (
        <div className="pdf-info-alert">
          <strong>⚠️ Self-declared {xmp.pdfAClaim}</strong>
          <p>This PDF claims archival compliance in metadata. It has not been validated against ISO 19005.</p>
        </div>
      ) : (
        <p className="pdf-info-copy">XMP packet found, but no PDF/A conformance claim detected.</p>
      )}
    </section>
  );
}

function FontsSection({ fonts }: { fonts: PdfFontInfo[] }): JSX.Element {
  return (
    <section className="pdf-info-section">
      <h3 className="pdf-info-section-title">Fonts ({fonts.length})</h3>
      {fonts.length === 0 ? (
        <p className="pdf-info-copy">No font resources detected.</p>
      ) : (
        <ul className="pdf-info-font-list">
          {fonts.map((font) => (
            <li key={font.name} className="pdf-info-font-item">
              <span className="pdf-info-font-name">{font.name}</span>
              <span className="pdf-info-font-meta">
                {[
                  font.type,
                  font.embedded ? 'embedded' : 'not embedded',
                  font.instances && font.instances > 1 ? `${font.instances} subsets` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PdfInfoPanel({ report }: { report: PdfInfoReport }): JSX.Element {
  return (
    <div className="pdf-info-panel">
      <section className="pdf-info-section">
        <h3 className="pdf-info-section-title">Overview</h3>
        <div className="pdf-info-grid">
          <InfoRow label="File" value={report.fileName} />
          <InfoRow label="Size" value={formatBytes(report.fileSizeBytes)} />
          <InfoRow label="Pages" value={report.pageCount} />
          <InfoRow label="PDF version" value={report.pdfVersion ? `PDF ${report.pdfVersion}` : 'Unknown'} />
          <InfoRow label="Fast Web View" value={report.linearized} />
          <InfoRow label="Encrypted" value={report.encrypted} />
          {report.encrypted && <InfoRow label="Encryption" value={report.encryptionMethod ?? 'Standard'} />}
          {report.passwordProtected && <InfoRow label="Password required" value={true} />}
        </div>
      </section>

      <MetadataSection documentInfo={report.documentInfo} />
      <XmpSection xmp={report.xmp} />
      <FontsSection fonts={report.fonts} />

      {report.error && (
        <section className="pdf-info-section">
          <div className="pdf-info-alert pdf-info-alert--error">
            <strong>Partial analysis</strong>
            <p>{report.error}</p>
          </div>
        </section>
      )}
    </div>
  );
}
