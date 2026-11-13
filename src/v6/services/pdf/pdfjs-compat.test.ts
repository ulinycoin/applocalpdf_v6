import assert from 'node:assert/strict';
import test from 'node:test';
import { installByteArrayToHex } from './pdfjs-compat';

type Uint8ArrayWithHex = Uint8Array & { toHex?: () => string };

function withoutNativeToHex(run: () => void): void {
  const proto = Uint8Array.prototype as Uint8ArrayWithHex;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'toHex');
  try {
    if (descriptor) {
      delete proto.toHex;
    }
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(proto, 'toHex', descriptor);
    } else {
      delete proto.toHex;
    }
  }
}

test('the polyfill makes pdf.js fingerprinting work without a native toHex', () => {
  withoutNativeToHex(() => {
    installByteArrayToHex();
    assert.equal(typeof (Uint8Array.prototype as Uint8ArrayWithHex).toHex, 'function');
    const bytes = new Uint8Array([0, 15, 160, 255]);
    assert.equal((bytes as Uint8ArrayWithHex).toHex!(), '000fa0ff');
    assert.equal((new Uint8Array() as Uint8ArrayWithHex).toHex!(), '');
  });
});

test('installing twice does not replace or double-wrap anything', () => {
  withoutNativeToHex(() => {
    installByteArrayToHex();
    const first = (Uint8Array.prototype as Uint8ArrayWithHex).toHex;
    installByteArrayToHex();
    assert.equal((Uint8Array.prototype as Uint8ArrayWithHex).toHex, first);
    assert.equal((new Uint8Array([1, 2]) as Uint8ArrayWithHex).toHex!(), '0102');
  });
});

test('a native implementation is left untouched', () => {
  const proto = Uint8Array.prototype as Uint8ArrayWithHex;
  const native = function nativeToHex(this: Uint8Array) { return `native:${this.length}`; };
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'toHex');
  try {
    Object.defineProperty(proto, 'toHex', { configurable: true, writable: true, value: native });
    installByteArrayToHex();
    assert.equal((new Uint8Array([1, 2, 3]) as Uint8ArrayWithHex).toHex!(), 'native:3');
  } finally {
    if (descriptor) {
      Object.defineProperty(proto, 'toHex', descriptor);
    } else {
      delete proto.toHex;
    }
  }
});
