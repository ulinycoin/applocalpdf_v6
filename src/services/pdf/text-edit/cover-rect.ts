import type { WorkerStudioEditElement } from '../../../core/types/contracts';

/**
 * A solid, stroke-less rectangle is a cover: the whiteout tool paints one in whatever colour the
 * user picked, and anything under it must stop being extractable. Outlined shapes (transparent fill
 * with a stroke) are decorations and are never treated as redaction.
 */
export function isCoverRect(element: WorkerStudioEditElement): boolean {
  if (element.type !== 'rect') {
    return false;
  }
  const fill = String(element.fill || '').trim().toLowerCase();
  const stroke = String(element.stroke || '').trim().toLowerCase();
  const hasStroke = (element.strokeWidth ?? 0) > 0.001 && stroke !== 'transparent' && stroke !== 'none';
  const hasFill = fill !== '' && fill !== 'transparent' && fill !== 'none' && fill !== 'rgba(0,0,0,0)';
  return hasFill && !hasStroke && (element.opacity ?? 1) >= 0.99;
}

/**
 * The editor pairs every text box with a `${id}_bg` cover rectangle. The link is explicit, so a
 * companion cover can be told apart from a whiteout the user drew — the geometry heuristic that
 * ignored the link silently dropped user whiteouts and disabled redaction verification.
 */
export function collectLinkedBackgroundOwners(
  elements: readonly WorkerStudioEditElement[],
): Map<string, string> {
  const owners = new Map<string, string>();
  for (const element of elements) {
    if (element.type === 'text') {
      owners.set(`${element.id}_bg`, element.id);
    }
  }
  return owners;
}

export function isUserCoverRect(
  element: WorkerStudioEditElement,
  linkedBackgroundOwners: ReadonlyMap<string, string>,
): boolean {
  return isCoverRect(element) && !linkedBackgroundOwners.has(element.id);
}
