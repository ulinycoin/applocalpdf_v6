/**
 * Page grid geometry on the Studio canvas.
 *
 * The same numbers used to be copy-pasted into the workspace layout, the drop hit-test and the fit
 * estimation. A marquee that disagrees with the layout by a pixel selects the wrong pages, so the
 * grid lives here and every consumer asks this module.
 */
export const PAGE_CARD_WIDTH = 200;
export const PAGE_CARD_HEIGHT = 280;
export const PAGE_GAP_X = 20;
export const PAGE_GAP_Y = 30;
/** Inset of the first page card from the workspace frame. */
export const PAGE_INSET = 10;
export const PAGE_STEP_X = PAGE_CARD_WIDTH + PAGE_GAP_X;
export const PAGE_STEP_Y = PAGE_CARD_HEIGHT + PAGE_GAP_Y;

export interface StudioRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Effective column count: a workspace never reserves columns it has no pages for. */
export function pageGridColumns(pageCount: number, gridColumns: number): number {
    return Math.max(1, Math.min(pageCount || 1, gridColumns));
}

/** Slot of a page inside its workspace, relative to the workspace origin. */
export function pageRectInDocument(index: number, columns: number): StudioRect {
    const safeColumns = Math.max(1, columns);
    return {
        x: PAGE_INSET + (index % safeColumns) * PAGE_STEP_X,
        y: PAGE_INSET + Math.floor(index / safeColumns) * PAGE_STEP_Y,
        width: PAGE_CARD_WIDTH,
        height: PAGE_CARD_HEIGHT,
    };
}

/** Half-open intersection: touching edges do not count, so a marquee that grazes a card ignores it. */
export function rectanglesIntersect(a: StudioRect, b: StudioRect): boolean {
    return a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;
}

/** Normalised rectangle from two corner points. */
export function rectFromPoints(
    start: { x: number; y: number },
    end: { x: number; y: number },
): StudioRect {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}
