export type StudioConvertLocale = 'en' | 'ru' | 'de' | 'es' | 'fr' | 'it' | 'pt' | 'ja' | 'zh';

export interface StudioConvertMessages {
  emptyTitle: string;
  backToStudio: string;
  selectionScope: string;
  documentScope: string;
  selectedPages: string;
  selectAll: string;
  clearSelection: string;
  runOcr: string;
  runPdfToJpg: string;
  runExtractImages: string;
  running: string;
}

const EN_MESSAGES: StudioConvertMessages = {
  emptyTitle: 'Select a document or pages to start Convert mode',
  backToStudio: 'Back to Studio',
  selectionScope: 'Selection scope',
  documentScope: 'Document scope',
  selectedPages: 'page(s)',
  selectAll: 'Select all',
  clearSelection: 'Clear selection',
  runOcr: 'Run OCR',
  runPdfToJpg: 'Convert to JPG',
  runExtractImages: 'Extract Images',
  running: 'Running...',
};

const TRANSLATIONS: Record<StudioConvertLocale, StudioConvertMessages> = {
  en: EN_MESSAGES,
  ru: EN_MESSAGES,
  de: EN_MESSAGES,
  es: EN_MESSAGES,
  fr: EN_MESSAGES,
  it: EN_MESSAGES,
  pt: EN_MESSAGES,
  ja: EN_MESSAGES,
  zh: EN_MESSAGES,
};

export function detectStudioConvertLocale(): StudioConvertLocale {
  if (typeof navigator === 'undefined') {
    return 'en';
  }
  const raw = (navigator.language || 'en').trim().toLowerCase();
  if (raw.startsWith('ru')) return 'ru';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('it')) return 'it';
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('zh')) return 'zh';
  return 'en';
}

export function getStudioConvertMessages(locale: StudioConvertLocale): StudioConvertMessages {
  return TRANSLATIONS[locale] ?? EN_MESSAGES;
}
