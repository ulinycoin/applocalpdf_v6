import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAndValidateStudioEditRequest } from './studio-text-edit-validation';

test('normalizeAndValidateStudioEditRequest defaults advanced text formatting fields', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 't-1',
      type: 'text',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      text: 'Hello',
      color: '#112233',
      fontSize: 16,
      fontFamily: 'sora',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      opacity: 1,
    }],
  });

  const textElement = result.elements[0];
  assert.equal(textElement.type, 'text');
  if (textElement.type === 'text') {
    assert.equal(textElement.lineHeight, 1.2);
    assert.equal(textElement.letterSpacing, 0);
  }
});

test('normalizeAndValidateStudioEditRequest clamps advanced text formatting fields', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 't-2',
      type: 'text',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      text: 'Clamp',
      color: '#112233',
      fontSize: 16,
      fontFamily: 'sora',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 9,
      letterSpacing: -10,
      opacity: 1,
    }],
  });

  const textElement = result.elements[0];
  assert.equal(textElement.type, 'text');
  if (textElement.type === 'text') {
    assert.equal(textElement.lineHeight, 3);
    assert.equal(textElement.letterSpacing, -2);
  }
});

test('normalizeAndValidateStudioEditRequest preserves optional source text style hints', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 't-source',
      type: 'text',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      text: 'Source style',
      color: '#112233',
      fontSize: 16,
      fontFamily: 'sora',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      opacity: 1,
      sourceFontName: 'ABCDEE+Times-Bold',
      sourceFontFamilyHint: 'Times New Roman',
      sourceFontSizeRatio: 0.031,
    }],
  });

  const textElement = result.elements[0];
  assert.equal(textElement.type, 'text');
  if (textElement.type === 'text') {
    assert.equal(textElement.sourceFontName, 'ABCDEE+Times-Bold');
    assert.equal(textElement.sourceFontFamilyHint, 'Times New Roman');
    assert.equal(textElement.sourceFontSizeRatio, 0.031);
  }
});

test('normalizeAndValidateStudioEditRequest accepts extended font families', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 't-fonts',
      type: 'text',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      text: 'Fonts',
      color: '#112233',
      fontSize: 16,
      fontFamily: 'noto-arabic',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      opacity: 1,
    }],
  });

  const textElement = result.elements[0];
  assert.equal(textElement.type, 'text');
  if (textElement.type === 'text') {
    assert.equal(textElement.fontFamily, 'noto-arabic');
  }
});

test('normalizeAndValidateStudioEditRequest accepts form-field elements', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 1,
    elements: [{
      id: 'f-1',
      type: 'form-field',
      formType: 'checkbox',
      name: 'accept_terms',
      x: 0.12,
      y: 0.22,
      w: 0.2,
      h: 0.08,
      defaultValue: 'On',
      required: true,
      fontSize: 12,
      opacity: 0.9,
    }],
  });

  assert.equal(result.pageIndex, 1);
  assert.equal(result.elements.length, 1);
  const field = result.elements[0];
  assert.equal(field.type, 'form-field');
  if (field.type === 'form-field') {
    assert.equal(field.formType, 'checkbox');
    assert.equal(field.name, 'accept_terms');
    assert.equal(field.required, true);
    assert.equal(field.defaultValue, 'On');
    assert.equal(field.opacity, 0.9);
  }
});

test('normalizeAndValidateStudioEditRequest normalizes dropdown options for form fields', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 'f-2',
      type: 'form-field',
      formType: 'dropdown',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.06,
      defaultValue: 'B',
      options: ['A', ' ', 'B', 42 as unknown as string],
      required: false,
      fontSize: 11,
      opacity: 1,
    }],
  });

  const field = result.elements[0];
  assert.equal(field.type, 'form-field');
  if (field.type === 'form-field') {
    assert.equal(field.formType, 'dropdown');
    assert.deepEqual(field.options, ['A', 'B']);
  }
});

test('normalizeAndValidateStudioEditRequest accepts watermark elements', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 'wm-1',
      type: 'watermark',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.07,
      text: 'CONFIDENTIAL',
      color: '#778899',
      fontSize: 28,
      fontFamily: 'sora',
      fontWeight: 'bold',
      fontStyle: 'normal',
      opacity: 0.2,
      rotation: -32,
      repeatEnabled: true,
      repeatCols: 4,
      repeatRows: 3,
      repeatGapX: 0.12,
      repeatGapY: 0.1,
    }],
  });

  const element = result.elements[0];
  assert.equal(element.type, 'watermark');
  if (element.type === 'watermark') {
    assert.equal(element.text, 'CONFIDENTIAL');
    assert.equal(element.repeatEnabled, true);
    assert.equal(element.repeatCols, 4);
    assert.equal(element.repeatRows, 3);
    assert.equal(element.rotation, -32);
  }
});

test('normalizeAndValidateStudioEditRequest accepts stroke elements', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 's-1',
      type: 'stroke',
      points: [0.1, 0.2, 0.5, 0.6],
      color: '#ff0000',
      width: 2,
      opacity: 0.8,
    }],
  });

  assert.equal(result.elements.length, 1);
  const element = result.elements[0];
  assert.equal(element.type, 'stroke');
  if (element.type === 'stroke') {
    assert.equal(element.color, '#ff0000');
    assert.equal(element.width, 2);
    assert.equal(element.opacity, 0.8);
    assert.deepEqual(element.points, [0.1, 0.2, 0.5, 0.6]);
  }
});

test('normalizeAndValidateStudioEditRequest accepts stroke elements with paths', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 's-2',
      type: 'stroke',
      points: [0.1, 0.2, 0.5, 0.6],
      paths: [[0.2, 0.3, 0.6, 0.7]],
      color: '#00ff00',
      width: 3,
      opacity: 1,
    }],
  });

  const element = result.elements[0];
  assert.equal(element.type, 'stroke');
  if (element.type === 'stroke') {
    assert.ok(element.paths);
    assert.equal(element.paths!.length, 1);
    assert.deepEqual(element.paths![0], [0.2, 0.3, 0.6, 0.7]);
  }
});

test('normalizeAndValidateStudioEditRequest rejects malformed stroke points', () => {
  assert.throws(() => normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{ id: 's-3', type: 'stroke', points: [0.1, 0.2], color: '#000', width: 1, opacity: 1 }],
  }), /Invalid stroke/);
});

test('normalizeAndValidateStudioEditRequest accepts rect elements', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 'r-1',
      type: 'rect',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 1,
      opacity: 1,
    }],
  });

  const element = result.elements[0];
  assert.equal(element.type, 'rect');
  if (element.type === 'rect') {
    assert.equal(element.x, 0.1);
    assert.equal(element.y, 0.2);
    assert.equal(element.w, 0.3);
    assert.equal(element.fill, '#ffffff');
    assert.equal(element.stroke, '#000000');
  }
});

test('normalizeAndValidateStudioEditRequest accepts rect with transparent fill', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 'r-2',
      type: 'rect',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      fill: 'transparent',
      stroke: '#ff0000',
      strokeWidth: 2,
      opacity: 0.5,
    }],
  });

  const element = result.elements[0];
  assert.equal(element.type, 'rect');
  if (element.type === 'rect') {
    assert.equal(element.fill, 'transparent');
    assert.equal(element.stroke, '#ff0000');
    assert.equal(element.strokeWidth, 2);
    assert.equal(element.opacity, 0.5);
  }
});

test('normalizeAndValidateStudioEditRequest accepts image elements', () => {
  const result = normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{
      id: 'img-1',
      type: 'image',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.1,
      opacity: 1,
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }],
  });

  const element = result.elements[0];
  assert.equal(element.type, 'image');
  if (element.type === 'image') {
    assert.equal(element.x, 0.1);
    assert.equal(element.y, 0.2);
    assert.equal(element.w, 0.3);
    assert.ok(element.dataUrl.startsWith('data:image/png'));
  }
});

test('normalizeAndValidateStudioEditRequest rejects invalid image dataUrl', () => {
  assert.throws(() => normalizeAndValidateStudioEditRequest({
    pageIndex: 0,
    elements: [{ id: 'img-2', type: 'image', x: 0.1, y: 0.2, w: 0.3, h: 0.1, opacity: 1, dataUrl: 'not-a-data-url' }],
  }), /Unsupported image/);
});
