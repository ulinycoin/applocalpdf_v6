import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { inflateDeflateBytes } from './inflate-deflate';

const CONTENT = 'BT /F1 12 Tf (Hello inflate) Tj ET';

test('inflates a zlib-wrapped deflate stream', async () => {
  const compressed = new Uint8Array(deflateSync(Buffer.from(CONTENT, 'latin1')));
  const inflated = await inflateDeflateBytes(compressed);
  assert.ok(inflated, 'the stream must inflate');
  assert.equal(Buffer.from(inflated).toString('latin1'), CONTENT);
});

test('inflates a raw deflate stream without the zlib header', async () => {
  const compressed = new Uint8Array(deflateRawSync(Buffer.from(CONTENT, 'latin1')));
  assert.notEqual(compressed[0], 0x78, 'the fixture must not carry a zlib header');
  const inflated = await inflateDeflateBytes(compressed);
  assert.ok(inflated, 'the raw stream must inflate');
  assert.equal(Buffer.from(inflated).toString('latin1'), CONTENT);
});

test('returns null for bytes that are not deflate data instead of throwing', async () => {
  const plain = new Uint8Array(Buffer.from('BT (not compressed) Tj ET', 'latin1'));
  assert.equal(await inflateDeflateBytes(plain), null);
  assert.equal(await inflateDeflateBytes(new Uint8Array(0)), null);
});

test('a truncated stream resolves to null rather than hanging', async () => {
  const compressed = new Uint8Array(deflateSync(Buffer.from(CONTENT.repeat(50), 'latin1')));
  const truncated = compressed.slice(0, Math.floor(compressed.length / 2));
  assert.equal(await inflateDeflateBytes(truncated, 200), null);
});
