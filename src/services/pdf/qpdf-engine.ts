import { QpdfPipelineError } from './qpdf-errors';

export interface EncryptPdfOptions {
  userPassword: string;
  ownerPassword?: string;
  keyLength?: 128 | 256;
}

export interface DecryptPdfOptions {
  password?: string;
}

export interface QpdfEngine {
  encrypt(pdfBlob: Blob, options: EncryptPdfOptions): Promise<Blob>;
  decrypt(pdfBlob: Blob, options?: DecryptPdfOptions): Promise<Blob>;
}

function hasNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

async function dynamicImport<T>(specifier: string): Promise<T> {
  const importer = new Function('s', 'return import(s)') as (s: string) => Promise<T>;
  return importer(specifier);
}

async function runQpdf(args: string[]): Promise<void> {
  if (!hasNodeRuntime()) {
    throw new QpdfPipelineError('PROTECT_QPDF_UNAVAILABLE', 'qpdf is unavailable in browser runtime.');
  }

  const childProcessMod = await dynamicImport<typeof import('node:child_process')>('node:child_process');
  const spawn = childProcessMod.spawn;

  await new Promise<void>((resolve, reject) => {
    const child = spawn('qpdf', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new QpdfPipelineError('PROTECT_QPDF_UNAVAILABLE', 'qpdf binary was not found in PATH.'));
        return;
      }
      reject(new QpdfPipelineError('PROTECT_QPDF_EXECUTION_FAILED', error.message));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const message = stderr.trim() || `qpdf exited with code ${code ?? 'unknown'}`;
      reject(new QpdfPipelineError('PROTECT_QPDF_EXECUTION_FAILED', message));
    });
  });
}

class NodeQpdfEngine implements QpdfEngine {
  async encrypt(pdfBlob: Blob, options: EncryptPdfOptions): Promise<Blob> {
    const userPassword = options.userPassword;
    const ownerPassword = options.ownerPassword ?? options.userPassword;
    const keyLength = options.keyLength ?? 256;

    if (!userPassword) {
      throw new QpdfPipelineError('PROTECT_INVALID_OPTIONS', 'userPassword is required for PDF encryption.');
    }
    if (keyLength !== 128 && keyLength !== 256) {
      throw new QpdfPipelineError('PROTECT_INVALID_OPTIONS', `Unsupported keyLength: ${keyLength}.`);
    }

    if (!hasNodeRuntime()) {
      throw new QpdfPipelineError('PROTECT_QPDF_UNAVAILABLE', 'qpdf is unavailable in browser runtime.');
    }

    const fsMod = await dynamicImport<typeof import('node:fs/promises')>('node:fs/promises');
    const pathMod = await dynamicImport<typeof import('node:path')>('node:path');
    const osMod = await dynamicImport<typeof import('node:os')>('node:os');

    const tempDir = await fsMod.mkdtemp(pathMod.join(osMod.tmpdir(), 'localpdf-qpdf-'));
    const inputPath = pathMod.join(tempDir, 'input.pdf');
    const outputPath = pathMod.join(tempDir, 'output.pdf');

    try {
      const inputBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      await fsMod.writeFile(inputPath, inputBytes);

      await runQpdf([
        '--encrypt',
        userPassword,
        ownerPassword,
        String(keyLength),
        '--',
        inputPath,
        outputPath,
      ]);

      const encryptedBytes = await fsMod.readFile(outputPath);
      const normalized = new Uint8Array(encryptedBytes.byteLength);
      normalized.set(encryptedBytes);
      return new Blob([normalized], { type: 'application/pdf' });
    } finally {
      await fsMod.rm(tempDir, { recursive: true, force: true });
    }
  }

  async decrypt(pdfBlob: Blob, options?: DecryptPdfOptions): Promise<Blob> {
    if (!hasNodeRuntime()) {
      throw new QpdfPipelineError('PROTECT_QPDF_UNAVAILABLE', 'qpdf is unavailable in browser runtime.');
    }

    const fsMod = await dynamicImport<typeof import('node:fs/promises')>('node:fs/promises');
    const pathMod = await dynamicImport<typeof import('node:path')>('node:path');
    const osMod = await dynamicImport<typeof import('node:os')>('node:os');

    const tempDir = await fsMod.mkdtemp(pathMod.join(osMod.tmpdir(), 'localpdf-qpdf-'));
    const inputPath = pathMod.join(tempDir, 'input.pdf');
    const outputPath = pathMod.join(tempDir, 'output.pdf');

    try {
      const inputBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      await fsMod.writeFile(inputPath, inputBytes);

      const args: string[] = [];
      if (options?.password) {
        args.push(`--password=${options.password}`);
      }
      args.push('--decrypt', inputPath, outputPath);
      await runQpdf(args);

      const outputBytes = await fsMod.readFile(outputPath);
      const normalized = new Uint8Array(outputBytes.byteLength);
      normalized.set(outputBytes);
      return new Blob([normalized], { type: 'application/pdf' });
    } finally {
      await fsMod.rm(tempDir, { recursive: true, force: true });
    }
  }
}

export async function createQpdfEngine(): Promise<QpdfEngine> {
  return new NodeQpdfEngine();
}
