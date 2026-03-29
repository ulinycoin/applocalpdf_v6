import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolContext } from './IEditorTool';
import { TextTool } from './TextTool';

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  let elements = overrides.elements ?? [];
  const ctx: ToolContext = {
    applyElements: (next) => {
      elements = next;
      ctx.elements = next;
    },
    textLayerSpans: [],
    isSelectMode: false,
    textSelectionMode: 'line',
    textInteractionMode: 'edit',
    textEditor: null,
    commitTextEditor: () => undefined,
    startEditingText: () => undefined,
    setSelectedElementId: () => undefined,
    setInlineUiState: () => undefined,
    uiMessages: { text: 'Add text' },
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

test('TextTool starts editing after inserting text in edit mode', () => {
  const started: string[] = [];
  const ctx = createContext({
    textInteractionMode: 'edit',
    startEditingText: (element) => started.push(element.id),
  });

  TextTool.onPointerDown(ctx, {} as any, { x: 0.2, y: 0.3 });

  assert.equal(started.length, 1);
  assert.equal(ctx.elements.length, 1);
  assert.equal(ctx.elements[0]?.type, 'text');
  assert.equal(ctx.elements[0]?.text, 'Add text');
});

test('TextTool keeps new text selected without auto-edit in move mode', () => {
  const started: string[] = [];
  const states: string[] = [];
  const selected: string[] = [];
  const ctx = createContext({
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
  assert.equal(ctx.elements.length, 1);
  assert.equal(ctx.elements[0]?.type, 'text');
});
