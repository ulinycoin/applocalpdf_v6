import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import createQpdf from '@jspawn/qpdf-wasm';
import { createQpdfWasmEngine, type QpdfWasmRuntime } from './qpdf-wasm-engine';

/**
 * The real wasm build, loaded from disk. Emscripten wants a URL it can fetch, and in Node that is a
 * data URL; the browser passes the Vite asset URL instead.
 */
let runtimePromise: Promise<QpdfWasmRuntime> | null = null;
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

function loadTestRuntime(): Promise<QpdfWasmRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const wasm = await readFile(join(process.cwd(), 'node_modules', '@jspawn', 'qpdf-wasm', 'qpdf.wasm'));
      return createQpdf({ noInitialRun: true, noExitRuntime: true, locateFile: () => `data:application/wasm;base64,${wasm.toString('base64')}` });
    })();
  }
  return runtimePromise;
}

async function buildFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  page.drawText('CONFIDENTIAL', { x: 40, y: 240, size: 16, font: await doc.embedFont(StandardFonts.Helvetica) });
  const field = doc.getForm().createTextField('customer');
  field.setText('Alice');
  field.addToPage(page, { x: 40, y: 100, width: 200, height: 24 });
  return new Uint8Array(await doc.save());
}

test('the wasm engine encrypts and decrypts a document without losing form fields', async () => {
  const engine = createQpdfWasmEngine(loadTestRuntime);
  const source = await buildFormPdf();

  const encrypted = await engine.encrypt(new Blob([copy(source)], { type: 'application/pdf' }), {
    userPassword: 'secret',
    ownerPassword: 'owner',
    keyLength: 256,
  });
  // The encrypted bytes must actually be locked: pdf-lib refuses them without a password.
  const encryptedBytes = new Uint8Array(await encrypted.arrayBuffer());
  await assert.rejects(() => PDFDocument.load(encryptedBytes));

  const decrypted = await engine.decrypt(encrypted, { password: 'secret' });
  const loaded = await PDFDocument.load(new Uint8Array(await decrypted.arrayBuffer()));
  assert.deepEqual(loaded.getForm().getFields().map((item) => item.getName()), ['customer']);
  assert.equal(loaded.getPageCount(), 1);
});

test('a wrong password is reported as a password failure', async () => {
  // qpdf reports the failure by exiting with code 2; in Node that exit takes the whole process with
  // it, so the mapping is tested against a stub while the real binary covers the happy path above.
  const runtime: QpdfWasmRuntime = {
    FS: { writeFile() {}, readFile: () => new Uint8Array(), unlink() {} },
    callMain: () => 2,
  };
  const engine = createQpdfWasmEngine(async () => runtime);

  await assert.rejects(() => engine.decrypt(new Blob([new Uint8Array([1])]), { password: 'nope' }), /password/i);
});

test('an Emscripten exit status from the browser build is mapped the same way', async () => {
  const runtime: QpdfWasmRuntime = {
    FS: { writeFile() {}, readFile: () => new Uint8Array(), unlink() {} },
    callMain: () => { throw Object.assign(new Error('Program terminated with exit(2)'), { status: 2 }); },
  };
  const engine = createQpdfWasmEngine(async () => runtime);

  await assert.rejects(() => engine.decrypt(new Blob([new Uint8Array([1])]), { password: 'nope' }), /password/i);
});

test('encryption without any password is refused before qpdf runs', async () => {
  const engine = createQpdfWasmEngine(loadTestRuntime);
  await assert.rejects(
    () => engine.encrypt(new Blob([new Uint8Array([1])]), { userPassword: '', ownerPassword: '', keyLength: 256 }),
    /userPassword or ownerPassword/u,
  );
});
