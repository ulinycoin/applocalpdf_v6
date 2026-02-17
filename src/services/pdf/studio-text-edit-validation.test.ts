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

