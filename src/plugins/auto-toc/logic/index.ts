import type { ToolLogicFunction } from '../../../core/types/contracts';
import fontkit from '@pdf-lib/fontkit';

let globalFontUrls: any = null;

/**
 * A single detected heading candidate.
 */
export interface HeaderNode {
    id: string;
    text: string;
    pageIndex: number;   // 0-based
    y: number;           // vertical coordinate in PDF points (top-down: 0 = top)
    level: number;       // 1, 2, or 3 (H1 = biggest, H3 = smallest heading)
    enabled: boolean;    // included in final TOC
}

/** Raw span data extracted from pdfjs text layer */
export interface RawSpan {
    text: string;
    fontSize: number;
    fontName: string;
    x: number;
    y: number;           // PDF coords: bottom-up
    pageHeight: number;  // actual page height for this span's page
    pageIndex: number;
}

/** Options parsed from the tool run */
interface TocRunOptions {
    bodySizeThreshold?: number;   // optional override of auto-detected body size
    levelThresholds?: [number, number]; // e.g. [1.7, 1.25] for H1/H2 cutoff ratios
}

function parseOptions(input: Record<string, unknown> | undefined): TocRunOptions {
    if (!input) return {};
    return {
        bodySizeThreshold: typeof input.bodySizeThreshold === 'number' ? input.bodySizeThreshold : undefined,
        levelThresholds: Array.isArray(input.levelThresholds) && input.levelThresholds.length === 2
            ? [Number(input.levelThresholds[0]), Number(input.levelThresholds[1])]
            : undefined,
    };
}

/**
 * Compute body text size using text-length-weighted mode.
 * Weights each span by its rendered text length so that long body paragraphs
 * dominate over short labels, captions, and headings.
 */
export function computeBodyFontSize(spans: RawSpan[]): number {
    const weighted = spans
        .filter((s) => s.fontSize >= 4 && s.fontSize <= 72)
        .map((s) => ({
            size: Math.round(s.fontSize * 10) / 10,
            weight: Math.max(s.text.length, 1),
        }));
    if (weighted.length === 0) return 12;

    // Weighted mode: sum weights per size, pick max
    const freq = new Map<number, number>();
    let totalWeight = 0;
    for (const { size, weight } of weighted) {
        freq.set(size, (freq.get(size) ?? 0) + weight);
        totalWeight += weight;
    }

    let mode = 12;
    let maxWeight = 0;
    for (const [size, weight] of freq) {
        if (weight > maxWeight) {
            maxWeight = weight;
            mode = size;
        }
    }

    // If mode is based on <20% of total weight, fall back to median
    if (maxWeight < totalWeight * 0.2) {
        const sorted = [...freq.keys()].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? mode;
    }

    return mode;
}

/**
 * Check if text is likely a header/footer running element:
 * - Appears at the very edge (<4% from top or bottom)
 * - Is short and repeated (same text on every page — detected by position+pageIndex)
 * For page 1, we only filter extreme edge (<3%) to preserve title pages.
 */
function isHeaderFooterElements(spansByPage: Map<number, RawSpan[]>): Set<RawSpan> {
    const edgeSpans = new Set<RawSpan>();

    for (const [pageIdx, pageSpans] of spansByPage) {
        const pageHeight = pageSpans.length > 0 ? pageSpans[0].pageHeight : 842;
        const extremeMargin = pageHeight * 0.03;
        const softMargin = pageHeight * 0.08;

        for (const span of pageSpans) {
            const top = pageHeight - span.y;
            const bottom = span.y;

            // Extreme edge filter (always applied — even on page 1)
            if (top < extremeMargin || bottom < extremeMargin) {
                edgeSpans.add(span);
                continue;
            }

            // Soft edge: only filter on pages > 3 to preserve title pages
            if (pageIdx > 3 && (top < softMargin || bottom < softMargin)) {
                edgeSpans.add(span);
            }
        }
    }

    return edgeSpans;
}

/** Check if text is all-caps (heading heuristic) */
export function isAllCaps(text: string): boolean {
    const letters = text.replace(/[^a-zA-Z\u00C0-\u024F]/g, '');
    return letters.length > 3 && letters === letters.toUpperCase();
}

/** Map font name to see if it's a bold variant */
export function isBoldFont(fontName: string): boolean {
    const upper = fontName.toUpperCase();
    return upper.includes('BOLD') || upper.includes('HEAVY') || upper.includes('BLACK') || upper.includes('DEMI');
}

/** Check if a heading candidate looks like a real heading vs noise */
export function isLikelyHeading(text: string): boolean {
    const t = text.trim();
    if (t.length < 3 || t.length > 200) return false;

    // Heading ends in a complete sentence punctuation? Probably not a heading.
    if (/[.!?]$/.test(t) && t.length > 30) return false;

    // Short fragments that are just punctuation/numbers
    if (/^[\d\s\-–—•*#_]+$/.test(t)) return false;

    // Starts with a common heading pattern
    if (/^(chapter|section|part|appendix|table|figure|introduction|conclusion|references?|index|notes?)\b/i.test(t)) return true;

    // Contains numbering pattern like "1.", "1.2", "1.2.3", "Chapter 5"
    if (/^(?:[IVXLCDM]+\.\s|[A-Z]\.\s|\d+(?:\.\d+)*[\s.)]|(?:Chapter|Section|Part)\s+\d)/i.test(t)) return true;

    // Starts with capital letter and is a reasonable line
    if (/^[A-Z\u00C0-\u024F]/.test(t)) return true;

    return false;
}

/** Assign heading level based on font size ratio and formatting */
export function assignLevel(fontSize: number, bodySize: number, isBold: boolean, isCaps: boolean, thresholds?: [number, number]): number {
    const ratio = fontSize / bodySize;
    const [h1Threshold, h2Threshold] = thresholds ?? [1.7, 1.25];

    if (ratio >= h1Threshold) return 1;
    if (ratio >= h2Threshold) return 2;
    if (ratio >= 1.05) return 3;

    // If it's bold or all-caps but not much larger than body, still assign level 3
    if ((isBold || isCaps) && ratio >= 0.9) return 3;

    return 3;
}

/**
 * Extract all text spans from a PDF using pdfjs-dist (inside the worker).
 * Emits progress for each page processed.
 */
async function extractSpans(
    bytes: Uint8Array,
    onPageProgress?: (page: number, total: number) => void,
): Promise<RawSpan[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // Resolve worker URL to suppress "No workerSrc specified" warning.
    // We use disableWorker: true, but pdfjs still logs this at import time.
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        try {
            const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
            if (workerMod.default) {
                pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
            }
        } catch {
            // Non-critical — disableWorker: true means we don't actually use the worker
        }
    }

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        disableWorker: true,
        verbosity: (pdfjs as any).VerbosityLevel?.ERRORS ?? 0,
    } as any);
    const doc = await loadingTask.promise;

    const allSpans: RawSpan[] = [];
    const totalPages = doc.numPages;

    try {
        for (let pn = 1; pn <= totalPages; pn++) {
            const page = await doc.getPage(pn);
            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeightPt = viewport.height;

            try {
                const textContent = await page.getTextContent();

                for (const item of textContent.items as any[]) {
                    if (!item || typeof item.str !== 'string') continue;
                    const text = item.str.trim();
                    if (!text) continue;
                    if (!Array.isArray(item.transform)) continue;

                    const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || Number(item.height) || 8;
                    if (fontHeight < 4) continue;

                    allSpans.push({
                        text,
                        fontSize: fontHeight,
                        fontName: item.fontName ?? '',
                        x: item.transform[4],
                        y: item.transform[5],
                        pageHeight: pageHeightPt,
                        pageIndex: pn - 1,
                    });
                }
            } finally {
                page.cleanup?.();
            }

            onPageProgress?.(pn, totalPages);
        }
    } finally {
        await doc.destroy?.();
    }

    return allSpans;
}

/**
 * Merge consecutive spans on the same line into single heading candidates.
 * Considers horizontal gap — wide gaps mean separate columns, not the same heading.
 */
function mergeAdjacentSpans(spans: RawSpan[], bodySize: number): RawSpan[] {
    if (spans.length === 0) return [];

    const sorted = [...spans].sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > bodySize * 1.5) return yDiff;
        return a.x - b.x;
    });

    const headingCandidates = sorted.filter((s) =>
        s.fontSize >= bodySize * 1.05 || isBoldFont(s.fontName) || isAllCaps(s.text),
    );

    const lines: RawSpan[][] = [];
    for (const span of headingCandidates) {
        const lastLine = lines[lines.length - 1];

        if (lastLine && lastLine[0].pageIndex === span.pageIndex && Math.abs(lastLine[0].y - span.y) < bodySize * 1.5) {
            // Check horizontal gap: if the gap to the last span on this line exceeds ~2 em, it's a new column
            const lastSpan = lastLine[lastLine.length - 1];
            const gap = span.x - (lastSpan.x + lastSpan.text.length * lastSpan.fontSize * 0.4);
            if (gap < bodySize * 3) {
                lastLine.push(span);
            } else {
                lines.push([span]);
            }
        } else {
            lines.push([span]);
        }
    }

    return lines.map((line) => ({
        text: line.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim(),
        fontSize: Math.max(...line.map((s) => s.fontSize)),
        fontName: line[0].fontName,
        x: Math.min(...line.map((s) => s.x)),
        y: line[0].y,
        pageHeight: line[0].pageHeight,
        pageIndex: line[0].pageIndex,
    }));
}

// ── Stage 3: PDF Bookmark injection ──────────────────────────────

interface OutlineItemNode {
    title: string;
    pageIndex: number;
    y: number;
    level: number;
    children: OutlineItemNode[];
}

export function buildOutlineTree(headers: HeaderNode[]): OutlineItemNode[] {
    const root: OutlineItemNode[] = [];
    const stack: { node: OutlineItemNode; level: number }[] = [];
    for (const h of headers) {
        if (!h.enabled) continue;
        const node: OutlineItemNode = { title: h.text, pageIndex: h.pageIndex, y: h.y, level: h.level, children: [] };
        while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
        if (stack.length > 0) {
            stack[stack.length - 1].node.children.push(node);
        } else {
            root.push(node);
        }
        stack.push({ node, level: h.level });
    }
    return root;
}

async function injectBookmarks(pdfBytes: Uint8Array, tree: OutlineItemNode[], pageOffset: number = 0): Promise<Uint8Array> {
    const { PDFDocument, PDFName, PDFHexString } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfBytes);
    const ctx = doc.context;
    const pageCount = doc.getPageCount();

    function createItems(
        nodes: OutlineItemNode[], parentRef: any,
    ): { refs: any[]; firstRef: any; lastRef: any; totalCount: number } {
        const refs: any[] = [];
        let firstRef: any = null, lastRef: any = null, totalCount = 0;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const pi = Math.max(0, Math.min(node.pageIndex + pageOffset, pageCount - 1));
            const page = doc.getPage(pi);
            const pageRef = (page as any).ref;
            const pageHeight = page.getSize().height;
            const pdfY = Math.max(0, Math.min(pageHeight, pageHeight - node.y));
            const dest = ctx.register(ctx.obj([pageRef, PDFName.of('XYZ'), null, pdfY, null]));

            const itemObj = ctx.obj({ Title: PDFHexString.fromText(node.title), Dest: dest });
            const itemRef = ctx.register(itemObj);
            itemObj.set(PDFName.of('Parent'), parentRef);

            if (i > 0) {
                itemObj.set(PDFName.of('Prev'), refs[i - 1]);
                (ctx.lookup(refs[i - 1]) as any).set(PDFName.of('Next'), itemRef);
            }

            if (node.children.length > 0) {
                const childResult = createItems(node.children, itemRef);
                itemObj.set(PDFName.of('First'), childResult.firstRef);
                itemObj.set(PDFName.of('Last'), childResult.lastRef);
                itemObj.set(PDFName.of('Count'), ctx.obj(childResult.totalCount > 0 ? childResult.totalCount : 0));
                totalCount += childResult.totalCount;
            }

            refs.push(itemRef);
            if (firstRef === null) firstRef = itemRef;
            lastRef = itemRef;
            totalCount++;
        }

        return { refs, firstRef, lastRef, totalCount };
    }

    if (tree.length === 0) throw new Error('No headings to create bookmarks');

    // Check for existing /Outlines and warn
    const rootRef = ctx.trailerInfo.Root;
    if (rootRef) {
        const rootObj = ctx.lookup(rootRef) as any;
        const existingOutlines = rootObj.get(PDFName.of('Outlines'));
        if (existingOutlines) {
            console.warn('Existing PDF bookmarks will be replaced by auto-toc');
        }
    }

    const outlinesObj = ctx.obj({ Type: PDFName.of('Outlines') });
    const outlinesRef = ctx.register(outlinesObj);
    const result = createItems(tree, outlinesRef);

    outlinesObj.set(PDFName.of('First'), result.firstRef);
    outlinesObj.set(PDFName.of('Last'), result.lastRef);
    outlinesObj.set(PDFName.of('Count'), ctx.obj(result.totalCount));

    if (rootRef) {
        (ctx.lookup(rootRef) as any).set(PDFName.of('Outlines'), outlinesRef);
    }

    return await doc.save();
}

async function loadFontBytes(url: string): Promise<Uint8Array> {
    let absoluteUrl = url;
    if (typeof self !== 'undefined' && self.location && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        const base = self.location.protocol === 'blob:' ? self.location.origin : self.location.href;
        absoluteUrl = new URL(url, base).href;
    }

    if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://') && !absoluteUrl.startsWith('blob:') && !absoluteUrl.startsWith('data:')) {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const cleanPath = absoluteUrl.startsWith('file://') ? absoluteUrl.slice(7) : absoluteUrl;
        const resolvedPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cleanPath);
        const bytes = fs.readFileSync(resolvedPath);
        return new Uint8Array(bytes);
    }
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
        throw new Error(`Failed to load font: ${absoluteUrl}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

async function resolveNotoFontUrls(): Promise<{
    latinUrl: string;
    latinExtUrl: string;
    cyrillicUrl: string;
    latinBoldUrl: string;
    latinExtBoldUrl: string;
    cyrillicBoldUrl: string;
}> {
    if (globalFontUrls) {
        return globalFontUrls;
    }

    if (typeof process !== 'undefined' && process.versions?.node) {
        const path = await import('node:path');
        const baseDir = path.resolve(process.cwd(), 'node_modules/@fontsource/noto-sans/files');
        return {
            latinUrl: path.join(baseDir, 'noto-sans-latin-400-normal.woff'),
            latinExtUrl: path.join(baseDir, 'noto-sans-latin-ext-400-normal.woff'),
            cyrillicUrl: path.join(baseDir, 'noto-sans-cyrillic-400-normal.woff'),
            latinBoldUrl: path.join(baseDir, 'noto-sans-latin-700-normal.woff'),
            latinExtBoldUrl: path.join(baseDir, 'noto-sans-latin-ext-700-normal.woff'),
            cyrillicBoldUrl: path.join(baseDir, 'noto-sans-cyrillic-700-normal.woff'),
        };
    }

    const [
        latinMod,
        latinExtMod,
        cyrillicMod,
        latinBoldMod,
        latinExtBoldMod,
        cyrillicBoldMod,
    ] = await Promise.all([
        import('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url') as Promise<{ default: string }>,
        import('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url') as Promise<{ default: string }>,
        import('@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff?url') as Promise<{ default: string }>,
        import('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url') as Promise<{ default: string }>,
        import('@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url') as Promise<{ default: string }>,
        import('@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff?url') as Promise<{ default: string }>,
    ]);
    return {
        latinUrl: latinMod.default,
        latinExtUrl: latinExtMod.default,
        cyrillicUrl: cyrillicMod.default,
        latinBoldUrl: latinBoldMod.default,
        latinExtBoldUrl: latinExtBoldMod.default,
        cyrillicBoldUrl: cyrillicBoldMod.default,
    };
}

async function resolveRobotoUrls(): Promise<{
    normalUrl: string;
    boldUrl: string;
}> {
    if (globalFontUrls?.robotoUrl && globalFontUrls?.robotoBoldUrl) {
        return {
            normalUrl: globalFontUrls.robotoUrl,
            boldUrl: globalFontUrls.robotoBoldUrl,
        };
    }

    if (typeof process !== 'undefined' && process.versions?.node) {
        const path = await import('node:path');
        return {
            normalUrl: path.join(process.cwd(), 'public/fonts/Roboto-Regular.ttf'),
            boldUrl: path.join(process.cwd(), 'public/fonts/Roboto-Bold.ttf'),
        };
    }
    return {
        normalUrl: '/fonts/Roboto-Regular.ttf',
        boldUrl: '/fonts/Roboto-Bold.ttf',
    };
}

/**
 * Generate a physical Table of Contents page and insert it at position 0.
 * Each entry has a Link annotation that jumps to the target page.
 * Returns the modified PDF bytes. After inserting the TOC page,
 * all existing page indices shift by +1.
 */
async function generateTocPageInPdf(
    pdfBytes: Uint8Array,
    headers: HeaderNode[],
): Promise<Uint8Array> {
    const { PDFDocument, PDFName, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfBytes);
    const ctx = doc.context;
    const originalPageCount = doc.getPageCount();

    // Insert a blank page at position 0 (A4: 595 x 842 pts)
    const tocPage = doc.insertPage(0, [595, 842]);
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 56;
    const contentWidth = pageWidth - margin * 2;

    // Load standard fallback fonts
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    let robotoNormalFont: any = null;
    let robotoBoldFont: any = null;

    try {
        doc.registerFontkit(fontkit);
        const robotoUrls = await resolveRobotoUrls();
        const [
            robotoBytes,
            robotoBoldBytes,
        ] = await Promise.all([
            loadFontBytes(robotoUrls.normalUrl),
            loadFontBytes(robotoUrls.boldUrl),
        ]);

        robotoNormalFont = await doc.embedFont(robotoBytes, { subset: true });
        robotoBoldFont = await doc.embedFont(robotoBoldBytes, { subset: true });
    } catch (err) {
        console.error('Failed to load Roboto fonts, falling back to Helvetica:', err);
        // Fall back to StandardFonts in environments where custom font loading fails
    }

    const canRender = (f: any, text: string): boolean => {
        try {
            f.widthOfTextAtSize(text.length > 0 ? text : ' ', 12);
        } catch {
            return false;
        }

        const fkFont = f.embedder?.font;
        if (fkFont && typeof fkFont.hasGlyphForCodePoint === 'function') {
            for (let i = 0; i < text.length; i++) {
                const codePoint = text.codePointAt(i);
                if (codePoint !== undefined && !fkFont.hasGlyphForCodePoint(codePoint)) {
                    return false;
                }
            }
        }

        return true;
    };

    const selectFont = (text: string, isBold: boolean): any => {
        const candidates = isBold
            ? [robotoBoldFont, boldFont]
            : [robotoNormalFont, font];
        for (const candidate of candidates) {
            if (candidate && canRender(candidate, text)) {
                return candidate;
            }
        }
        return isBold ? boldFont : font;
    };

    const titleSize = 22;
    const headingSize = 11;
    const pageNumSize = 10;
    const lineHeight = 22;
    let y = pageHeight - margin - 40;

    // Title
    const titleText = 'Table of Contents';
    const titleFont = selectFont(titleText, true);
    tocPage.drawText(titleText, {
        x: margin, y, size: titleSize, font: titleFont, color: rgb(0.1, 0.1, 0.1),
    });
    y -= 40;

    const annotations: any[] = [];

    for (const h of headers) {
        if (!h.enabled) continue;
        if (y < margin + 30) break; // no more room on this page

        const targetPageIndex = h.pageIndex + 1; // +1 because TOC page was inserted at 0
        const targetPage = doc.getPage(Math.max(0, Math.min(targetPageIndex, originalPageCount)));
        const targetRef = (targetPage as any).ref;
        const targetHeight = targetPage.getSize().height;
        const targetY = Math.max(0, Math.min(targetHeight, targetHeight - h.y));

        // Heading text (left side)
        const indent = (h.level - 1) * 16;
        const textX = margin + indent;
        const textMaxWidth = contentWidth - indent - 50; // leave room for page number

        // Truncate text if too long
        let displayText = h.text;
        const currentFont = selectFont(displayText, false);
        const textWidth = currentFont.widthOfTextAtSize(displayText, headingSize);
        if (textWidth > textMaxWidth) {
            // Truncate with ellipsis
            while (currentFont.widthOfTextAtSize(displayText + '…', headingSize) > textMaxWidth && displayText.length > 3) {
                displayText = displayText.slice(0, -1);
            }
            displayText += '…';
        }

        tocPage.drawText(displayText, {
            x: textX, y, size: headingSize, font: currentFont,
            color: h.level === 1 ? rgb(0.15, 0.15, 0.15) : rgb(0.3, 0.3, 0.3),
        });

        // Page number (right side)
        const pageNumText = String(targetPageIndex + 1);
        const pageNumFont = selectFont(pageNumText, false);
        const pageNumWidth = pageNumFont.widthOfTextAtSize(pageNumText, pageNumSize);
        tocPage.drawText(pageNumText, {
            x: pageWidth - margin - pageNumWidth, y, size: pageNumSize, font: pageNumFont,
            color: rgb(0.45, 0.45, 0.45),
        });

        // Dot leaders: draw between text end and page number
        const textEndX = textX + currentFont.widthOfTextAtSize(displayText, headingSize) + 4;
        const dotStartX = textEndX;
        const dotEndX = pageWidth - margin - pageNumWidth - 6;
        if (dotEndX > dotStartX) {
            const dot = '.';
            const dotFont = selectFont(dot, false);
            const dotWidth = dotFont.widthOfTextAtSize(dot, pageNumSize);
            const dotSpacing = 6;
            let dotX = dotStartX;
            let drawCount = 0;
            while (dotX < dotEndX && drawCount < 120) {
                tocPage.drawText(dot, { x: dotX, y, size: pageNumSize, font: dotFont, color: rgb(0.7, 0.7, 0.7) });
                dotX += dotWidth + dotSpacing;
                drawCount++;
            }
        }

        // Link annotation: the entire line is clickable
        const lineWidth = pageWidth - margin - textX;
        // PDF coordinate system: bottom-up
        const linkBottom = y - 4;
        const linkTop = y + headingSize + 4;
        const linkObj = ctx.obj({
            Type: PDFName.of('Annot'),
            Subtype: PDFName.of('Link'),
            Rect: [textX, linkBottom, textX + lineWidth, linkTop],
            Border: [0, 0, 0],
            A: ctx.obj({
                Type: PDFName.of('Action'),
                S: PDFName.of('GoTo'),
                D: [targetRef, PDFName.of('XYZ'), null, targetY, null],
            }),
        });
        const linkRef = ctx.register(linkObj);
        annotations.push(linkRef);

        y -= lineHeight;
    }

    // Attach annotations to the TOC page
    if (annotations.length > 0) {
        tocPage.node.set(PDFName.of('Annots'), ctx.obj(annotations));
    }

    return await doc.save();
}

async function applyBookmarks(
    inputIds: string[], headers: HeaderNode[], fs: any, emitProgress?: (percent: number) => void,
    generateTocPage?: boolean,
): Promise<{ outputIds: string[] }> {
    emitProgress?.(10);
    const entry = await fs.read(inputIds[0]);
    const blob = await entry.getBlob();
    let bytes = new Uint8Array(await blob.arrayBuffer());
    emitProgress?.(30);

    const tree = buildOutlineTree(headers);
    if (tree.length === 0) throw new Error('No enabled headings to generate bookmarks');
    emitProgress?.(50);

    let pageOffset = 0;

    // Generate TOC page if requested (inserts at position 0, shifts all pages by +1)
    if (generateTocPage) {
        const tocBytes = await generateTocPageInPdf(bytes, headers);
        bytes = new Uint8Array(tocBytes);
        pageOffset = 1;
        emitProgress?.(65);
    }

    // Inject bookmarks (with page offset if TOC page was inserted)
    const modifiedBytes = await injectBookmarks(bytes, tree, pageOffset);
    emitProgress?.(80);

    const suffix = generateTocPage ? '-with-toc.pdf' : '-bookmarks.pdf';
    const outEntry = await fs.write(
        new File([modifiedBytes.buffer as ArrayBuffer], entry.getName().replace(/\.pdf$/i, '') + suffix, { type: 'application/pdf' }),
    );
    emitProgress?.(100);
    return { outputIds: [outEntry.id] };
}

export const run: ToolLogicFunction = async ({ inputIds, options: runOptions, fs, emitProgress }) => {
    if (runOptions?.fontUrls) {
        globalFontUrls = runOptions.fontUrls;
    } else {
        globalFontUrls = null;
    }

    if (inputIds.length === 0) {
        throw new Error('Auto-TOC requires at least one input file');
    }

    const options = parseOptions(runOptions as Record<string, unknown> | undefined);

    // ── APPLY mode: write bookmarks to PDF ──
    if (runOptions?.action === 'apply') {
        return applyBookmarks(inputIds, runOptions.headers as HeaderNode[], fs, emitProgress, runOptions.generateTocPage === true);
    }

    // ── PARSE mode: detect headings ──
    const outputIds: string[] = [];

    for (let fileIdx = 0; fileIdx < inputIds.length; fileIdx++) {
        emitProgress?.(5);

        const entry = await fs.read(inputIds[fileIdx]);
        const blob = await entry.getBlob();
        const bytes = new Uint8Array(await blob.arrayBuffer());

        emitProgress?.(10);

        // Extract all text spans with per-page progress (maps 10% → 35%)
        const allSpans = await extractSpans(bytes, (page, total) => {
            const pct = 10 + Math.round(((page / total) * 25));
            emitProgress?.(Math.min(pct, 35));
        });

        if (allSpans.length === 0) {
            const result = {
                headers: [] as HeaderNode[],
                error: 'No text layer found in this PDF. The document may be scanned. Please run OCR first.',
                bodyTextSize: null,
                totalSpansExtracted: 0,
                headingCandidatesFound: 0,
            };
            const out = await fs.write(new Blob([JSON.stringify(result)], { type: 'application/json' }));
            outputIds.push(out.id);
            emitProgress?.(100);
            continue;
        }

        emitProgress?.(40);

        // Compute body text size (length-weighted)
        const bodySize = computeBodyFontSize(allSpans);

        // Group spans by page for header/footer detection
        const spansByPage = new Map<number, RawSpan[]>();
        for (const span of allSpans) {
            const existing = spansByPage.get(span.pageIndex);
            if (existing) {
                existing.push(span);
            } else {
                spansByPage.set(span.pageIndex, [span]);
            }
        }

        // Detect header/footer running elements
        const edgeSpans = isHeaderFooterElements(spansByPage);

        // Filter heading candidates
        const headingSpans = allSpans.filter((s) => {
            if (edgeSpans.has(s)) return false;

            // Must be visually distinct from body
            const isLarger = s.fontSize >= bodySize * 1.05;
            const isBold = isBoldFont(s.fontName) && s.fontSize >= bodySize * 0.9;
            const isCaps = isAllCaps(s.text) && s.fontSize >= bodySize * 0.9;
            if (!isLarger && !isBold && !isCaps) return false;

            return true;
        });

        emitProgress?.(60);

        // Merge adjacent spans on same line
        const merged = mergeAdjacentSpans(headingSpans, bodySize);

        // Apply content-level filtering
        const filtered = merged.filter((s) => isLikelyHeading(s.text));

        emitProgress?.(70);

        // Assign levels and build HeaderNode[]
        const headers: HeaderNode[] = filtered.map((s, idx) => ({
            id: `f${fileIdx}-p${s.pageIndex}-h${idx}`,
            text: s.text,
            pageIndex: s.pageIndex,
            y: s.pageHeight - s.y,
            level: assignLevel(s.fontSize, bodySize, isBoldFont(s.fontName), isAllCaps(s.text)),
            enabled: true,
        }));

        emitProgress?.(80);

        // Write result as JSON
        const uniquePages = new Set(allSpans.map((s) => s.pageIndex)).size;
        const result = {
            headers,
            bodyTextSize: bodySize,
            totalPages: uniquePages,
            totalSpansExtracted: allSpans.length,
            headingCandidatesFound: filtered.length,
        };

        const outFile = await fs.write(
            new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
        );
        outputIds.push(outFile.id);

        emitProgress?.(100);
    }

    return { outputIds };
};
