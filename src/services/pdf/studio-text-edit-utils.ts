import type { WorkerStudioFontFamilyId, WorkerStudioTextAlign } from '../../core/types/contracts';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\r\n]+/gu, ' ').trim();
}

export function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') {
    return '#000000';
  }
  const raw = value.trim().replace(/^#/u, '');
  if (/^[0-9a-fA-F]{3}$/u.test(raw)) {
    return `#${raw
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/u.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return '#000000';
}

export function normalizeFillColor(value: unknown): string {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'transparent') {
    return 'transparent';
  }
  return normalizeColor(value);
}

export function normalizeTextAlign(value: unknown): WorkerStudioTextAlign {
  if (value === 'center' || value === 'right') {
    return value;
  }
  return 'left';
}

export function normalizeOpacity(value: unknown): number {
  const numeric = toFiniteNumber(value, 1);
  if (numeric > 1) {
    return clamp(numeric / 100, 0, 1);
  }
  return clamp(numeric, 0, 1);
}

export function normalizeFontFamilyFromString(value: unknown): WorkerStudioFontFamilyId {
  if (typeof value !== 'string') {
    return 'sora';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('arabic')) {
    return 'noto-arabic';
  }
  if (normalized.includes('cjk') || normalized.includes('han') || normalized.includes('kana') || normalized.includes('hangul')) {
    return 'noto-cjk';
  }
  if (normalized.includes('devanagari') || normalized.includes('hindi')) {
    return 'noto-devanagari';
  }
  if (normalized.includes('noto')) {
    return 'noto';
  }
  if (normalized.includes('roboto')) {
    return 'roboto';
  }
  if (normalized.includes('times') || normalized.includes('serif')) {
    return 'times';
  }
  if (normalized.includes('mono') || normalized.includes('courier') || normalized.includes('code')) {
    return 'mono';
  }
  return 'sora';
}

export function normalizeFontFamilyFromId(value: unknown): WorkerStudioFontFamilyId {
  return value === 'times'
    || value === 'mono'
    || value === 'roboto'
    || value === 'noto'
    || value === 'noto-arabic'
    || value === 'noto-cjk'
    || value === 'noto-devanagari'
    ? (value as WorkerStudioFontFamilyId)
    : 'sora';
}

export { inferSourceTextStyle } from '../../../shared/studio-text-edit/infer-source-text-style';
