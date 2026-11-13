import { QpdfPipelineError } from './qpdf-errors';
import {
  buildQpdfEncryptArgs,
  type DecryptPdfOptions,
  type EncryptPdfOptions,
  type QpdfEngine,
} from './qpdf-engine';

/**
 * The browser half of the qpdf toolchain: the same CLI compiled to WebAssembly, so unlocking a PDF
 * or opening a password-protected document does not need a server. The Node engine shells out to the
 * binary instead; both share `buildQpdfEncryptArgs` so the two cannot drift.
 *
 * qpdf itself is imported on first use — a user who never touches a protected file downloads neither
 * the module nor the 1.2 MB wasm.
 */
export interface QpdfWasmRuntime {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
}

export type QpdfWasmLoader = () => Promise<QpdfWasmRuntime>;

let modulePromise: Promise<QpdfWasmRuntime> | null = null;

interface BrowserModuleFactory {
  (options: { noInitialRun?: boolean; locateFile?: (path: string) => string }): Promise<QpdfWasmRuntime>;
}

/**
 * The package is an Emscripten UMD build: loaded as a classic script it assigns itself to a global
 * `exports` object (that is what its own `browser.js` does). Bundling it as a module breaks that
 * handshake, so the files are copied into `public/vendor/qpdf` and loaded at runtime instead.
 */
async function loadRuntimeFromScripts(): Promise<QpdfWasmRuntime> {
  const { default: scriptUrl } = await import('@jspawn/qpdf-wasm/qpdf.js?url');
  const { default: wasmUrl } = await import('@jspawn/qpdf-wasm/qpdf.wasm?url');

  const globals = globalThis as { exports?: { Module?: BrowserModuleFactory } };
  globals.exports = {};
  if (typeof document !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new QpdfPipelineError('PROTECT_QPDF_UNAVAILABLE', 'qpdf engine script failed to load.'));
      document.head.appendChild(script);
    });
  } else {
    // Module worker: the classic Emscripten script has no imports or exports of its own, it only
    // assigns itself to the global `exports` created above, so evaluating it as a module is safe.
    await import(/* @vite-ignore */ scriptUrl);
  }

  const createModule = globals.exports?.Module;
  delete globals.exports;
  if (typeof createModule !== 'function') {
    throw new QpdfPipelineError('PROTECT_QPDF_UNAVAILABLE', 'qpdf engine did not register itself.');
  }
  return createModule({ noInitialRun: true, locateFile: () => wasmUrl });
}

export const loadQpdfWasm: QpdfWasmLoader = () => {
  if (!modulePromise) {
    modulePromise = loadRuntimeFromScripts().catch((error) => {
      // A failed load must not poison every later attempt.
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
};

function pdfBlobFrom(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: 'application/pdf' });
}

let callCounter = 0;

/**
 * qpdf works on a single virtual filesystem, so two calls must never interleave: opening a document
 * and protecting another one can arrive at the same time on the main thread.
 */
export function createQpdfWasmEngine(load: QpdfWasmLoader = loadQpdfWasm): QpdfEngine {
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  }
  async function runCli(
    makeArgs: (inputPath: string, outputPath: string) => string[],
    input: Uint8Array,
  ): Promise<Uint8Array> {
    const runtime = await load();
    const stamp = `${Date.now()}-${callCounter += 1}`;
    const inputPath = `/localpdf-${stamp}-in.pdf`;
    const outputPath = `/localpdf-${stamp}-out.pdf`;

    runtime.FS.writeFile(inputPath, input);
    let exitCode: number;
    try {
      exitCode = runtime.callMain(makeArgs(inputPath, outputPath));
    } catch (error) {
      // In the browser the wasm build reports a failed call by throwing an Emscripten ExitStatus
      // instead of returning from callMain, so the exit code has to be read from the exception too.
      const status = (error as { status?: unknown })?.status;
      throw new QpdfPipelineError(
        'PROTECT_QPDF_EXECUTION_FAILED',
        status === 2
          ? 'qpdf could not open the file with that password.'
          : error instanceof Error ? error.message : String(error),
      );
    } finally {
      try { runtime.FS.unlink(inputPath); } catch { /* already gone */ }
    }

    if (exitCode !== 0) {
      try { runtime.FS.unlink(outputPath); } catch { /* nothing was written */ }
      throw new QpdfPipelineError(
        'PROTECT_QPDF_EXECUTION_FAILED',
        exitCode === 2
          ? 'qpdf could not open the file with that password.'
          : `qpdf exited with code ${exitCode}.`,
      );
    }

    try {
      return new Uint8Array(runtime.FS.readFile(outputPath));
    } catch {
      throw new QpdfPipelineError('PROTECT_QPDF_EXECUTION_FAILED', 'qpdf reported success but wrote no output.');
    } finally {
      try { runtime.FS.unlink(outputPath); } catch { /* already gone */ }
    }
  }

  return {
    encrypt(pdfBlob: Blob, options: EncryptPdfOptions): Promise<Blob> {
      const userPassword = options.userPassword;
      const ownerPassword = options.ownerPassword ?? options.userPassword;
      const keyLength = options.keyLength ?? 256;
      if (!userPassword && !ownerPassword) {
        return Promise.reject(new QpdfPipelineError('PROTECT_INVALID_OPTIONS', 'Either userPassword or ownerPassword is required for PDF encryption.'));
      }
      if (keyLength !== 128 && keyLength !== 256) {
        return Promise.reject(new QpdfPipelineError('PROTECT_INVALID_OPTIONS', `Unsupported keyLength: ${keyLength}.`));
      }
      return enqueue(async () => {
        const input = new Uint8Array(await pdfBlob.arrayBuffer());
        const output = await runCli(
          (inputPath, outputPath) => buildQpdfEncryptArgs(inputPath, outputPath, {
            ...options,
            userPassword,
            ownerPassword,
            keyLength,
          }),
          input,
        );
        return pdfBlobFrom(output);
      });
    },

    decrypt(pdfBlob: Blob, options?: DecryptPdfOptions): Promise<Blob> {
      return enqueue(async () => {
        const input = new Uint8Array(await pdfBlob.arrayBuffer());
        const output = await runCli(
          (inputPath, outputPath) => [
            ...(options?.password ? [`--password=${options.password}`] : []),
            '--decrypt',
            inputPath,
            outputPath,
          ],
          input,
        );
        return pdfBlobFrom(output);
      });
    },
  };
}
