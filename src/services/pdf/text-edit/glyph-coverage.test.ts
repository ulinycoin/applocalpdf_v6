import assert from 'node:assert/strict';
import test from 'node:test';
import { countMissingGlyphs, pickCoveringFont, type EncodableFont } from './glyph-coverage';

function embeddedFont(hexCodes: string[]): EncodableFont {
  return { encodeText: () => `<${hexCodes.map((code) => code.padStart(4, '0')).join('')}>` };
}

/** A font that renders the given characters and maps everything else to `.notdef`. */
function fontCovering(covered: string[]): EncodableFont {
  return {
    encodeText: (text: string) => {
      const codes = Array.from(text).map((char, index) => (
        covered.includes(char) ? (index + 1).toString(16).padStart(4, '0') : '0000'
      ));
      return `<${codes.join('')}>`;
    },
  };
}

test('countMissingGlyphs counts .notdef codes of an embedded font', () => {
  assert.equal(countMissingGlyphs(embeddedFont(['0001', '0002', '0003']), 'abc'), 0);
  assert.equal(countMissingGlyphs(embeddedFont(['0001', '0000', '0003']), 'abc'), 1);
});

test('countMissingGlyphs treats a throwing standard font as unusable', () => {
  const standard = {
    encodeText: () => {
      throw new Error('WinAnsi cannot encode "П"');
    },
  };
  assert.equal(countMissingGlyphs(standard, 'Привет'), Number.POSITIVE_INFINITY);
});

test('countMissingGlyphs does not confuse single-byte standard font codes', () => {
  const standard = { encodeText: (text: string) => `<${Array.from(text).map(() => '41').join('')}>` };
  assert.equal(countMissingGlyphs(standard, 'AAAA'), 0);
});

test('pickCoveringFont skips a subset that would drop digits', () => {
  // `cyrillic` covers the letters but not "100", `latin-ext` has neither — the full face wins.
  const cyrillicOnly = fontCovering(['И', 'т', 'о', 'г', ' ', 'U', 'S', 'D']);
  const latinExtOnly = fontCovering(['1', '0']);
  const full = fontCovering(Array.from('Итого 100 USD'));

  assert.equal(countMissingGlyphs(cyrillicOnly, 'Итого 100 USD') > 0, true);
  assert.equal(
    pickCoveringFont([cyrillicOnly, latinExtOnly, full], 'Итого 100 USD'),
    full,
  );
});

test('pickCoveringFont returns undefined when nothing covers the text', () => {
  const latinOnly = fontCovering(Array.from('abcdefghijklmnopqrstuvwxyz'));
  assert.equal(pickCoveringFont([latinOnly], 'Привет'), undefined);
});
