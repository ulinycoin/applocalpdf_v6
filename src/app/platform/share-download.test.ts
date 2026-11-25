import assert from 'node:assert/strict';
import test from 'node:test';
import { extractTmpfilesDirectLink, fetchSharedPayload, looksLikeHtml } from './share-download';

const PAYLOAD = 'https://tmpfiles.org/dl/abc123/secured_workspace.pdf';
const DIRECT = 'https://tmpfiles.org/dl/1795591553.b3fdcba9237f6178/abc123/secured_workspace.pdf';

const INTERSTITIAL = `<!DOCTYPE html><html><head><title>/tmp/files - secured_workspace.pdf</title></head>
<body><a href="https://tmpfiles.org/dl/1795591553.b3fdcba9237f6178/abc123/secured_workspace.pdf">Download</a></body></html>`;

function proxyTargets(calls: string[]): (input: string | URL | Request) => Promise<Response> {
  return async (input) => {
    const url = String(input);
    calls.push(url);
    const target = decodeURIComponent(url.split('url=')[1] ?? '');
    if (target === PAYLOAD) {
      return new Response(INTERSTITIAL, { status: 200 });
    }
    if (target === DIRECT) {
      return new Response(new Uint8Array([7, 8, 9, 10]), { status: 200 });
    }
    return new Response('', { status: 404 });
  };
}

test('an interstitial page is followed to the signed link instead of being decrypted', async () => {
  const calls: string[] = [];

  const bytes = await fetchSharedPayload(PAYLOAD, proxyTargets(calls) as typeof fetch);

  assert.deepEqual(Array.from(bytes), [7, 8, 9, 10]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes(encodeURIComponent(PAYLOAD)));
  assert.ok(calls[1].includes(encodeURIComponent(DIRECT)));
});

test('a payload that already is the file is used as-is, without a second request', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
  }) as typeof fetch;

  const bytes = await fetchSharedPayload(PAYLOAD, fetchImpl);

  assert.deepEqual(Array.from(bytes), [37, 80, 68, 70]);
  assert.equal(calls.length, 1);
});

test('an expired link fails with a message a user can act on', async () => {
  const fetchImpl = (async () =>
    new Response('<!DOCTYPE html><html><body>File not found</body></html>', { status: 200 })) as typeof fetch;

  await assert.rejects(
    () => fetchSharedPayload(PAYLOAD, fetchImpl),
    /expired/i,
  );
});

test('a proxy failure surfaces its status instead of an AES error', async () => {
  const fetchImpl = (async () => new Response('', { status: 503 })) as typeof fetch;

  await assert.rejects(
    () => fetchSharedPayload(PAYLOAD, fetchImpl),
    /503/,
  );
});

test('html detection separates a page from file bytes', () => {
  assert.equal(looksLikeHtml(new TextEncoder().encode('  <!DOCTYPE html><html>')), true);
  assert.equal(looksLikeHtml(new TextEncoder().encode('<html lang="en">')), true);
  assert.equal(looksLikeHtml(new Uint8Array([0x25, 0x50, 0x44, 0x46])), false);
  assert.equal(looksLikeHtml(new Uint8Array([0x6c, 0x10, 0x00, 0x00])), false);
});

test('the direct link extractor ignores unrelated anchors', () => {
  assert.equal(extractTmpfilesDirectLink(INTERSTITIAL), DIRECT);
  assert.equal(extractTmpfilesDirectLink('<a href="https://tmpfiles.org/about">about</a>'), null);
});
