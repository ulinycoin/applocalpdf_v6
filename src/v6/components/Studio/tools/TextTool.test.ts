import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolContext } from './IEditorTool';
import { TextTool } from './TextTool';

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  let elements = overrides.elements ?? [];
  let textAddMode = overrides.textAddMode ?? false;
  const ctx: ToolContext = {
    applyElements: (next) => {
      elements = next;
      ctx.elements = next;
    },
    textLayerSpans: [],
    isSelectMode: false,
    textSelectionMode: 'line',
    textInteractionMode: 'edit',
    textAddMode,
    setTextAddMode: (active) => {
      textAddMode = active;
      ctx.textAddMode = active;
    },
    textEditor: null,
    commitTextEditor: () => undefined,
    startEditingText: () => undefined,
    setSelectedElementId: () => undefined,
    setInlineUiState: () => undefined,
    uiMessages: { text: 'Add text', addTextPlaceholder: 'Type here' },
    draftRect: null,
    setDraftRect: () => undefined,
    draftStroke: null,
    setDraftStroke: () => undefined,
    isPointerDown: false,
    setIsPointerDown: () => undefined,
    annotateColor: '#fff176',
    annotateMode: 'highlight',
    annotateStrokeWidth: 5,
    shapePreset: 'rectangle',
    shapeColor: '#2563eb',
    shapeStrokeWidth: 2,
    whiteoutColor: '#ffffff',
    textStyle: {
      fontFamily: 'sora',
      fontSize: 18,
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#0f172a',
      backgroundColor: '#ffffff',
    },
    watermarkOptions: {
      text: 'CONFIDENTIAL',
      color: '#1e293b',
      fontSize: 30,
      fontFamily: 'sora',
      fontWeight: 'bold',
      fontStyle: 'normal',
      opacity: 0.32,
      rotation: -30,
      repeatEnabled: true,
      repeatCols: 3,
      repeatRows: 4,
      repeatGapX: 0.2,
      repeatGapY: 0.16,
    },
    signMode: 'type',
    signColor: '#111827',
    signStrokeWidth: 3,
    ...overrides,
    elements,
  };
  return ctx;
}

test('TextTool starts editing after inserting text in add mode', () => {
  const started: string[] = [];
  const ctx = createContext({
    textAddMode: true,
    textInteractionMode: 'edit',
    startEditingText: (element) => started.push(element.id),
  });

  TextTool.onPointerDown(ctx, {} as any, { x: 0.2, y: 0.3 });

  assert.equal(started.length, 1);
  assert.equal(ctx.elements.length, 2);
  assert.equal(ctx.elements[0]?.type, 'rect');
  assert.equal(ctx.elements[1]?.type, 'text');
  assert.equal(ctx.elements[1]?.text, '');
  assert.equal(ctx.textAddMode, false);
});

test('TextTool empty click without add mode does not insert text', () => {
  const started: string[] = [];
  const selected: Array<string | null> = [];
  const ctx = createContext({
    textAddMode: false,
    startEditingText: (element) => started.push(element.id),
    setSelectedElementId: (id) => selected.push(id),
  });

  TextTool.onPointerDown(ctx, {} as any, { x: 0.2, y: 0.3 });

  assert.equal(started.length, 0);
  assert.equal(ctx.elements.length, 0);
  assert.equal(selected.at(-1), null);
});

test('TextTool stores originalRect when selecting existing text span', () => {
  const ctx = createContext({
    textLayerSpans: [{
      id: 'span-1',
      text: 'Hello',
      xRatio: 0.1,
      yRatio: 0.2,
      widthRatio: 0.12,
      heightRatio: 0.03,
      fontSizeRatio: 0.02,
      fontName: 'Helvetica',
    }],
  });

  TextTool.onPointerDown(ctx, {} as any, { x: 0.11, y: 0.21 });

  const textElement = ctx.elements.find((element) => element.type === 'text');
  assert.ok(textElement);
  assert.deepEqual((textElement as { originalRect?: { x: number; y: number; w: number; h: number } }).originalRect, {
    x: 0.1,
    y: 0.2,
    w: 0.12,
    h: 0.03,
  });
});

test('TextTool keeps new text selected without auto-edit in move mode', () => {
  const started: string[] = [];
  const states: string[] = [];
  const selected: string[] = [];
  const ctx = createContext({
    textAddMode: true,
    textInteractionMode: 'move',
    startEditingText: (element) => started.push(element.id),
    setInlineUiState: (state) => states.push(state),
    setSelectedElementId: (id) => {
      if (id) selected.push(id);
    },
  });

  TextTool.onPointerDown(ctx, {} as any, { x: 0.2, y: 0.3 });

  assert.equal(started.length, 0);
  assert.equal(states.at(-1), 'selected');
  assert.equal(selected.length, 1);
  assert.equal(ctx.elements.length, 2);
  assert.equal(ctx.elements[1]?.type, 'text');
});
