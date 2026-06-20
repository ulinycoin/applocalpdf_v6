export function inferSourceTextStyle(
  fontName?: string,
  fontFamilyHint?: string,
  transform?: number[],
): { fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic' } {
  const raw = [fontName, fontFamilyHint].filter(Boolean).join(' ').toLowerCase();
  const fontWeight = /bold|black|heavy|semibold|demibold/u.test(raw) ? 'bold' : 'normal';
  let fontStyle: 'normal' | 'italic' = /italic|oblique/u.test(raw) ? 'italic' : 'normal';

  if (fontStyle === 'normal' && transform && transform.length >= 4) {
    const [a, b, c, d] = transform;
    const size = Math.max(Math.hypot(c, d), Math.hypot(a, b), 1);
    if (Math.abs(c) > size * 0.08 || Math.abs(b) > size * 0.08) {
      fontStyle = 'italic';
    }
  }

  return { fontWeight, fontStyle };
}
