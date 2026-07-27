import type { EditElement, TextElement } from './editor-types';

export function getTextBackgroundId(textId: string): string {
  return `${textId}_bg`;
}

export function isLinkedTextBackground(element: EditElement, elements: EditElement[]): boolean {
  if (element.type !== 'rect' || !element.id.endsWith('_bg')) {
    return false;
  }
  const textId = element.id.slice(0, -'_bg'.length);
  return elements.some((item) => item.id === textId && item.type === 'text');
}

function readBackgroundPadding(
  text: TextElement,
  background: EditElement | undefined,
): { padX: number; padY: number; padW: number; padH: number } {
  if (!background || background.type !== 'rect' || !('x' in background)) {
    return { padX: -0.002, padY: -0.0005, padW: 0.004, padH: 0.001 };
  }
  return {
    padX: background.x - text.x,
    padY: background.y - text.y,
    padW: background.w - text.w,
    padH: background.h - text.h,
  };
}

export function moveTextWithBackground(
  elements: EditElement[],
  textId: string,
  nextX: number,
  nextY: number,
): EditElement[] {
  const text = elements.find((item): item is TextElement => item.id === textId && item.type === 'text');
  if (!text) {
    return elements;
  }

  const bgId = getTextBackgroundId(textId);
  const background = elements.find((item) => item.id === bgId);
  const { padX, padY } = readBackgroundPadding(text, background);

  return elements.map((item) => {
    if (item.id === textId && item.type === 'text') {
      return { ...item, x: nextX, y: nextY };
    }
    if (item.id === bgId && item.type === 'rect' && 'x' in item) {
      return { ...item, x: nextX + padX, y: nextY + padY };
    }
    return item;
  });
}

export function resizeTextWithBackground(
  elements: EditElement[],
  textId: string,
  patch: Partial<Pick<TextElement, 'x' | 'y' | 'w' | 'h' | 'fontSize'>>,
): EditElement[] {
  const text = elements.find((item): item is TextElement => item.id === textId && item.type === 'text');
  if (!text) {
    return elements;
  }

  const nextText: TextElement = {
    ...text,
    ...patch,
    x: patch.x ?? text.x,
    y: patch.y ?? text.y,
    w: patch.w ?? text.w,
    h: patch.h ?? text.h,
    fontSize: patch.fontSize ?? text.fontSize,
  };

  const bgId = getTextBackgroundId(textId);
  const background = elements.find((item) => item.id === bgId);
  const { padX, padY, padW, padH } = readBackgroundPadding(text, background);

  return elements.map((item) => {
    if (item.id === textId && item.type === 'text') {
      return nextText;
    }
    if (item.id === bgId && item.type === 'rect' && 'x' in item) {
      return {
        ...item,
        x: nextText.x + padX,
        y: nextText.y + padY,
        w: nextText.w + padW,
        h: nextText.h + padH,
      };
    }
    return item;
  });
}
