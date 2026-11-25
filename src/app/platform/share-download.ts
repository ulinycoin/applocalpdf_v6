/**
 * Reading back the encrypted payload of a "Share to Phone" link.
 *
 * The payload lives on tmpfiles.org, which used to answer `/dl/<id>/<file>` with the bytes. It now
 * answers with an HTML interstitial that carries a short-lived signed link to the real file, so a
 * direct fetch yields a few kilobytes of HTML and AES-GCM then fails with an opaque OperationError.
 * This module hides that: fetch through our own proxy, and if the host handed back a page, follow the
 * signed link it names and fetch the payload again.
 *
 * Everything here is deliberately transport-specific and disposable: when share moves off tmpfiles the
 * resolver goes with it.
 */

/** Proxy route that exists only to bypass CORS; it refuses every host but the share host. */
const PROXY_PATH = '/api/download-proxy';

/** The signed direct link the interstitial page points at. Token is `<expiry>.<hash>`, so it is per page load. */
const DIRECT_LINK_PATTERN = /https:\/\/tmpfiles\.org\/dl\/\d+\.[0-9a-f]+\/[A-Za-z0-9]+\/[^"'\s<>]+/;

/** A page starts with a doctype or an html/head tag; a PDF or a binary blob never does. */
export function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

export function extractTmpfilesDirectLink(html: string): string | null {
  const match = html.match(DIRECT_LINK_PATTERN);
  return match ? match[0] : null;
}

function proxyUrl(target: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(target)}`;
}

async function fetchThroughProxy(target: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const response = await fetchImpl(proxyUrl(target));
  if (!response.ok) {
    throw new Error(`Failed to fetch file. Server returned code ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The encrypted bytes behind a share link, whatever shape the host answers in.
 *
 * `payloadUrl` is the URL from the share link, already stripped of the key material.
 */
export async function fetchSharedPayload(
  payloadUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const first = await fetchThroughProxy(payloadUrl, fetchImpl);
  if (!looksLikeHtml(first)) {
    return first;
  }

  const direct = extractTmpfilesDirectLink(new TextDecoder().decode(first));
  if (!direct) {
    // The host answers an expired or removed file with its own page and no download link.
    throw new Error('The share link has expired. Ask the sender to share the file again.');
  }

  const second = await fetchThroughProxy(direct, fetchImpl);
  if (looksLikeHtml(second)) {
    throw new Error('The share host returned a page instead of the file. Try again in a moment.');
  }
  return second;
}
