export interface PdfFontInfo {
  name: string;
  type?: string;
  embedded: boolean;
  instances?: number;
}

export function normalizeFontFamily(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '').trim();
}

function isInternalPdfFontRef(name: string): boolean {
  return /^g_[a-z0-9_]+$/i.test(name) || /^[a-z]\d+$/i.test(name);
}

type PdfJsModule = {
  getDocument(params: { data: Uint8Array; disableWorker: boolean; verbosity?: number }): { promise: Promise<PdfDocumentLike> };
  GlobalWorkerOptions?: { workerSrc?: string };
  VerbosityLevel?: { ERRORS?: number };
  OPS?: { setFont?: number; setFontDict?: number };
};

type PdfDocumentLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
};

type PdfPageLike = {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  commonObjs: {
    get(name: string): Promise<unknown>;
  };
};

type ResolvedPdfFont = {
  name?: string;
  fallbackName?: string;
  type?: string;
};

let pdfJsPromise: Promise<PdfJsModule | null> | null = null;

function addFont(
  fonts: Map<string, PdfFontInfo>,
  rawName: string,
  options?: { type?: string; embedded?: boolean },
): void {
  if (!rawName || isInternalPdfFontRef(rawName)) {
    return;
  }

  const family = normalizeFontFamily(rawName);
  if (!family) {
    return;
  }

  const embedded = options?.embedded ?? false;
  const existing = fonts.get(family);
  if (existing) {
    existing.embedded = existing.embedded || embedded;
    existing.instances = (existing.instances ?? 1) + 1;
    if (!existing.type && options?.type) {
      existing.type = options.type;
    }
    return;
  }

  fonts.set(family, {
    name: family,
    type: options?.type,
    embedded,
    instances: 1,
  });
}

function mergeFontLists(...lists: PdfFontInfo[][]): PdfFontInfo[] {
  const merged = new Map<string, PdfFontInfo>();
  for (const list of lists) {
    for (const font of list) {
      const family = normalizeFontFamily(font.name);
      if (!family) {
        continue;
      }
      const existing = merged.get(family);
      if (existing) {
        existing.embedded = existing.embedded || font.embedded;
        existing.instances = Math.max(existing.instances ?? 1, font.instances ?? 1);
        if (!existing.type && font.type) {
          existing.type = font.type;
        }
        continue;
      }
      merged.set(family, {
        name: family,
        type: font.type,
        embedded: font.embedded,
        instances: font.instances ?? 1,
      });
    }
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function loadPdfJs(): Promise<PdfJsModule | null> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const loaders: Array<() => Promise<unknown>> = [
        () => import('pdfjs-dist/legacy/build/pdf.mjs'),
        () => import('pdfjs-dist/build/pdf.mjs'),
        () => import('pdfjs-dist'),
      ];

      for (const load of loaders) {
        try {
          const mod = (await load()) as PdfJsModule;
          if (mod && typeof mod.getDocument === 'function') {
            if (mod.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc) {
              const workerLoaders: Array<() => Promise<{ default?: string }>> = [
                () => import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
                () => import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
              ];
              for (const loadWorkerSrc of workerLoaders) {
                try {
                  const workerMod = await loadWorkerSrc();
                  if (workerMod.default) {
                    mod.GlobalWorkerOptions.workerSrc = workerMod.default;
                    break;
                  }
                } catch {
                  // try next worker bundle
                }
              }
            }
            return mod;
          }
        } catch {
          // try next loader
        }
      }
      return null;
    })();
  }
  return pdfJsPromise;
}

export interface PdfDocumentInfo {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

export interface PdfXmpInfo {
  present: boolean;
  selfDeclared: true;
  pdfAClaim?: string;
  part?: string;
  conformance?: string;
}

export interface PdfInfoReport {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  pdfVersion: string | null;
  linearized: boolean;
  encrypted: boolean;
  passwordProtected: boolean;
  encryptionMethod?: string | null;
  documentInfo: PdfDocumentInfo;
  fonts: PdfFontInfo[];
  xmp?: PdfXmpInfo;
  error?: string;
}

function formatPdfDate(value: Date | undefined): string | undefined {
  if (!value || Number.isNaN(value.getTime())) {
    return undefined;
  }
  return value.toISOString();
}

function decodePdfText(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    output += String.fromCharCode(bytes[index]!);
  }
  return output;
}

export function parsePdfVersion(bytes: Uint8Array): string | null {
  const header = decodePdfText(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const match = header.match(/%PDF-(\d\.\d)/);
  return match?.[1] ?? null;
}

export function detectLinearized(bytes: Uint8Array): boolean {
  const sample = decodePdfText(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return /\/Linearized\s+1/.test(sample);
}

export function detectEncryption(bytes: Uint8Array): { encrypted: boolean; method?: string | null } {
  const sample = decodePdfText(bytes.subarray(0, Math.min(bytes.length, 65536)));
  if (!/\/Encrypt\b/.test(sample)) {
    return { encrypted: false };
  }

  const filterMatch = sample.match(/\/Filter\s*\/([A-Za-z0-9]+)/);
  return {
    encrypted: true,
    method: filterMatch?.[1] ?? null,
  };
}

export function parsePdfAClaimFromXmp(xmpText: string): Pick<PdfXmpInfo, 'pdfAClaim' | 'part' | 'conformance'> | null {
  const partMatch = xmpText.match(/pdfaid:part(?:>|=)"?\s*(\d+)/i)
    ?? xmpText.match(/<pdfaid:part>\s*(\d+)\s*<\/pdfaid:part>/i);
  const conformanceMatch = xmpText.match(/pdfaid:conformance(?:>|=)"?\s*([A-Za-z])/i)
    ?? xmpText.match(/<pdfaid:conformance>\s*([A-Za-z])\s*<\/pdfaid:conformance>/i);

  if (!partMatch && !conformanceMatch) {
    return null;
  }

  const part = partMatch?.[1];
  const conformance = conformanceMatch?.[1]?.toUpperCase();
  const label = part && conformance ? `PDF/A-${part}${conformance.toLowerCase()}` : undefined;

  return {
    part,
    conformance,
    pdfAClaim: label,
  };
}

export function extractXmpInfo(bytes: Uint8Array): PdfXmpInfo | undefined {
  const raw = decodePdfText(bytes);
  const xmpStart = raw.indexOf('<?xpacket begin');
  const xmpAltStart = raw.indexOf('<x:xmpmeta');
  const start = xmpStart >= 0 ? xmpStart : xmpAltStart;
  if (start < 0) {
    return undefined;
  }

  const xmpEnd = raw.indexOf('<?xpacket end', start);
  const snippetEnd = xmpEnd >= 0 ? xmpEnd + 64 : Math.min(raw.length, start + 12000);
  const xmpText = raw.slice(start, snippetEnd);
  const claim = parsePdfAClaimFromXmp(xmpText);

  return {
    present: true,
    selfDeclared: true,
    ...claim,
  };
}

export function extractFontsFromPdfText(bytes: Uint8Array): PdfFontInfo[] {
  const raw = decodePdfText(bytes);
  const fonts = new Map<string, PdfFontInfo>();

  const fontObjectRegex = /\/Type\s*\/Font\b[\s\S]{0,1800}?\/BaseFont\s*\/([^\s/>[\]()]+)/g;
  for (const match of raw.matchAll(fontObjectRegex)) {
    const matchIndex = match.index ?? 0;
    const block = raw.slice(matchIndex, matchIndex + match[0].length);
    const subtypeMatch = block.match(/\/Subtype\s*\/([A-Za-z0-9]+)/);
    const embedded = /\/FontFile(?:2|3)?\b/.test(block) || /\/FontDescriptor\b/.test(block);
    addFont(fonts, match[1] ?? '', { type: subtypeMatch?.[1], embedded });
  }

  const dictRegex = /<<([\s\S]{0,3000}?)>>/g;
  for (const match of raw.matchAll(dictRegex)) {
    const dict = match[1] ?? '';
    if (!/\/Type\s*\/Font\b/.test(dict)) {
      continue;
    }
    const fontTail = dict.split(/\/Type\s*\/Font\b/)[1] ?? '';
    const baseFontMatch = fontTail.match(/\/BaseFont\s*\/([^\s/>[\]()]+)/);
    if (!baseFontMatch?.[1]) {
      continue;
    }
    const subtypeMatch = fontTail.match(/\/Subtype\s*\/([A-Za-z0-9]+)/);
    const embedded = /\/FontFile(?:2|3)?\b/.test(dict) || /\/FontDescriptor\b/.test(dict);
    addFont(fonts, baseFontMatch[1], { type: subtypeMatch?.[1], embedded });
  }

  return [...fonts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function extractFontsWithPdfJs(bytes: Uint8Array): Promise<PdfFontInfo[]> {
  const pdfJs = await loadPdfJs();
  if (!pdfJs) {
    return [];
  }

  const fonts = new Map<string, PdfFontInfo>();
  const setFontOps = new Set(
    [pdfJs.OPS?.setFont, pdfJs.OPS?.setFontDict].filter((value): value is number => typeof value === 'number'),
  );

  try {
    const pdf = await pdfJs.getDocument({
      data: bytes,
      disableWorker: true,
      verbosity: pdfJs.VerbosityLevel?.ERRORS,
    }).promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const opList = await page.getOperatorList();
      const seenRefs = new Set<string>();

      for (let index = 0; index < opList.fnArray.length; index += 1) {
        if (!setFontOps.has(opList.fnArray[index]!)) {
          continue;
        }

        const args = opList.argsArray[index];
        if (!Array.isArray(args) || typeof args[0] !== 'string') {
          continue;
        }

        const fontRef = args[0];
        if (seenRefs.has(fontRef)) {
          continue;
        }
        seenRefs.add(fontRef);

        try {
          const fontObj = await page.commonObjs.get(fontRef) as ResolvedPdfFont;
          const rawName = fontObj?.name || fontObj?.fallbackName;
          if (!rawName) {
            continue;
          }
          addFont(fonts, rawName, { type: fontObj.type, embedded: true });
        } catch {
          // unresolved font ref on this page
        }
      }
    }
  } catch {
    return [];
  }

  return [...fonts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function readDocumentInfo(bytes: Uint8Array): Promise<{
  pageCount: number;
  documentInfo: PdfDocumentInfo;
  passwordProtected: boolean;
}> {
  const { PDFDocument } = await import('pdf-lib');
  let passwordProtected = false;

  try {
    await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('encrypt')) {
      passwordProtected = true;
    }
  }

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return {
    pageCount: doc.getPageCount(),
    passwordProtected,
    documentInfo: {
      title: doc.getTitle() || undefined,
      author: doc.getAuthor() || undefined,
      subject: doc.getSubject() || undefined,
      keywords: doc.getKeywords() || undefined,
      creator: doc.getCreator() || undefined,
      producer: doc.getProducer() || undefined,
      creationDate: formatPdfDate(doc.getCreationDate()),
      modificationDate: formatPdfDate(doc.getModificationDate()),
    },
  };
}

export async function analyzePdfInfo(blob: Blob, fileName: string): Promise<PdfInfoReport> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileSizeBytes = bytes.byteLength;
  const pdfVersion = parsePdfVersion(bytes);
  const linearized = detectLinearized(bytes);
  const encryption = detectEncryption(bytes);
  const xmp = extractXmpInfo(bytes);
  const fontsFromText = extractFontsFromPdfText(bytes);

  try {
    const [{ pageCount, documentInfo, passwordProtected }, fontsFromPdfJs] = await Promise.all([
      readDocumentInfo(bytes.slice()),
      extractFontsWithPdfJs(bytes.slice()),
    ]);
    const fonts = mergeFontLists(fontsFromText, fontsFromPdfJs);

    return {
      fileName,
      fileSizeBytes,
      pageCount,
      pdfVersion,
      linearized,
      encrypted: encryption.encrypted || passwordProtected,
      passwordProtected,
      encryptionMethod: encryption.method ?? (passwordProtected ? 'Standard' : null),
      documentInfo,
      fonts,
      xmp,
    };
  } catch (error) {
    return {
      fileName,
      fileSizeBytes,
      pageCount: 0,
      pdfVersion,
      linearized,
      encrypted: encryption.encrypted,
      passwordProtected: encryption.encrypted,
      encryptionMethod: encryption.method ?? null,
      documentInfo: {},
      fonts: mergeFontLists(fontsFromText, await extractFontsWithPdfJs(bytes.slice()).catch(() => [])),
      xmp,
      error: error instanceof Error ? error.message : 'Failed to analyze PDF',
    };
  }
}
