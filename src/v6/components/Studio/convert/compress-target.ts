/** Parses the target-size field of the Compress panel into bytes. */
export function targetBytesFromMb(value: string): number | undefined {
  // A comma decimal is what a European keyboard produces; silently ignoring it would look like "no target".
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return undefined;
  }
  const megabytes = Number.parseFloat(normalized);
  return Number.isFinite(megabytes) && megabytes > 0 ? Math.round(megabytes * 1024 * 1024) : undefined;
}
