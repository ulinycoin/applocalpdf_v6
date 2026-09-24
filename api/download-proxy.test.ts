import assert from 'node:assert/strict';
import test from 'node:test';
import handler from './download-proxy';

function makeRequest(url: string): Request {
  return new Request(`https://localpdf.online/api/download-proxy?url=${encodeURIComponent(url)}`);
}

test('download-proxy rejects requests without a url', async () => {
  const response = await handler(new Request('https://localpdf.online/api/download-proxy'));
  assert.equal(response.status, 400);
});

test('download-proxy refuses arbitrary hosts (open-relay guard)', async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response('nope', { status: 200 });
  };

  try {
    for (const target of [
      'https://example.com/secret',
      'https://169.254.169.254/latest/meta-data/',
      'http://tmpfiles.org/dl/abc',
      'https://tmpfiles.org.evil.example/dl/abc',
    ]) {
      const response = await handler(makeRequest(target));
      assert.equal(response.status, 403, `expected ${target} to be blocked`);
    }
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('download-proxy forwards allowed tmpfiles.org downloads', async () => {
  const originalFetch = global.fetch;
  const seen: string[] = [];
  global.fetch = async (input: string | URL) => {
    seen.push(String(input));
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-length': '3' },
    });
  };

  try {
    const response = await handler(makeRequest('https://tmpfiles.org/dl/abc/secured.pdf'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
    assert.deepEqual(seen, ['https://tmpfiles.org/dl/abc/secured.pdf']);
  } finally {
    global.fetch = originalFetch;
  }
});
