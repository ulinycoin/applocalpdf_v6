export type SupportedOcrLanguage =
  | 'eng'
  | 'rus'
  | 'ukr'
  | 'deu'
  | 'fra'
  | 'spa'
  | 'ita'
  | 'por'
  | 'jpn'
  | 'chi_sim'
  | 'hin'
  | 'ara';

type ScriptKind = 'latin' | 'cyrillic' | 'japanese' | 'han' | 'devanagari' | 'arabic';

interface LanguageModel {
  script: ScriptKind;
  stopwords: readonly string[];
}

const LANGUAGE_MODELS: Record<SupportedOcrLanguage, LanguageModel> = {
  eng: { script: 'latin', stopwords: ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'will', 'your', 'is'] },
  rus: { script: 'cyrillic', stopwords: ['и', 'в', 'на', 'с', 'по', 'для', 'от', 'это', 'что', 'как'] },
  ukr: { script: 'cyrillic', stopwords: ['і', 'в', 'на', 'з', 'для', 'що', 'це', 'як', 'до', 'та'] },
  deu: { script: 'latin', stopwords: ['und', 'der', 'die', 'das', 'mit', 'für', 'auf', 'ist', 'von', 'den'] },
  fra: { script: 'latin', stopwords: ['le', 'la', 'les', 'de', 'des', 'et', 'pour', 'avec', 'est', 'dans'] },
  spa: { script: 'latin', stopwords: ['el', 'la', 'los', 'las', 'de', 'del', 'para', 'con', 'que', 'en'] },
  ita: { script: 'latin', stopwords: ['il', 'la', 'gli', 'le', 'di', 'per', 'con', 'che', 'nel', 'una'] },
  por: { script: 'latin', stopwords: ['o', 'a', 'os', 'as', 'de', 'do', 'para', 'com', 'que', 'em'] },
  jpn: { script: 'japanese', stopwords: ['の', 'に', 'は', 'を', 'が', 'です', 'ます', 'で', 'て', 'と'] },
  chi_sim: { script: 'han', stopwords: ['的', '是', '了', '在', '和', '有', '为', '与', '及', '本'] },
  hin: { script: 'devanagari', stopwords: ['के', 'में', 'और', 'का', 'है', 'से', 'यह', 'को', 'पर', 'की'] },
  ara: { script: 'arabic', stopwords: ['في', 'من', 'على', 'إلى', 'لا', 'أن', 'ما', 'هو', 'مع', 'عن'] },
};

export interface LanguageCandidate {
  language: SupportedOcrLanguage;
  score: number;
}

export interface LanguageDetectionResult {
  primaryLanguage: SupportedOcrLanguage;
  confidence: number;
  dominantScript: ScriptKind | 'mixed' | 'unknown';
  candidates: LanguageCandidate[];
}

function tokenize(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/\p{L}+/gu), (match) => match[0] ?? '').filter(Boolean);
}

function detectDominantScript(text: string): LanguageDetectionResult['dominantScript'] {
  let latinCount = 0;
  let cyrillicCount = 0;
  let devanagariCount = 0;
  let hanCount = 0;
  let kanaCount = 0;
  let arabicCount = 0;

  for (const char of text) {
    if (/\p{Script=Latin}/u.test(char)) {
      latinCount += 1;
    } else if (/\p{Script=Cyrillic}/u.test(char)) {
      cyrillicCount += 1;
    } else if (/\p{Script=Devanagari}/u.test(char)) {
      devanagariCount += 1;
    } else if (/\p{Script=Arabic}/u.test(char)) {
      arabicCount += 1;
    } else if (/\p{Script=Han}/u.test(char)) {
      hanCount += 1;
    } else if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(char)) {
      kanaCount += 1;
    }
  }

  const total = latinCount + cyrillicCount + devanagariCount + hanCount + kanaCount + arabicCount;
  if (total === 0) {
    return 'unknown';
  }

  const latinShare = latinCount / total;
  const cyrillicShare = cyrillicCount / total;
  const devanagariShare = devanagariCount / total;
  const hanShare = hanCount / total;
  const arabicShare = arabicCount / total;
  const japaneseShare = (hanCount + kanaCount) / total;
  const kanaShare = kanaCount / total;

  if (latinShare > 0.8) {
    return 'latin';
  }
  if (cyrillicShare > 0.8) {
    return 'cyrillic';
  }
  if (devanagariShare > 0.6) {
    return 'devanagari';
  }
  if (arabicShare > 0.6) {
    return 'arabic';
  }
  if (japaneseShare > 0.7 && kanaShare > 0.04) {
    return 'japanese';
  }
  if (hanShare > 0.7) {
    return 'han';
  }
  return 'mixed';
}

export function detectDocumentLanguage(text: string): LanguageDetectionResult {
  const tokens = tokenize(text);
  const dominantScript = detectDominantScript(text);

  const scores = (Object.entries(LANGUAGE_MODELS) as Array<[SupportedOcrLanguage, LanguageModel]>).map(
    ([language, model]): LanguageCandidate => {
      let score = 0;

      for (const token of tokens) {
        if (model.stopwords.includes(token)) {
          score += 1;
          continue;
        }

        // For languages without reliable whitespace tokenization, allow stopword substring matching.
        if ((language === 'jpn' || language === 'chi_sim') && model.stopwords.some((word) => token.includes(word))) {
          score += 0.45;
        }
      }

      if (dominantScript === model.script) {
        score += 1.5;
      }

      // Distinguish Ukrainian from Russian on unique letters.
      if (language === 'ukr' && /[іїєґ]/u.test(text.toLowerCase())) {
        score += 2;
      }
      if (language === 'rus' && /[ыэъ]/u.test(text.toLowerCase())) {
        score += 1.5;
      }

      return { language, score };
    },
  );

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0] ?? { language: 'eng' as const, score: 0 };
  const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
  const confidence = totalScore > 0 ? top.score / totalScore : 0;

  return {
    primaryLanguage: top.language,
    confidence: Number(confidence.toFixed(3)),
    dominantScript,
    candidates: scores.slice(0, 3).map((item) => ({ language: item.language, score: Number(item.score.toFixed(3)) })),
  };
}

/** Scripts worth a dedicated probe when the English pass produces nothing readable. */
export const SCRIPT_PROBE_LANGUAGES = ['jpn', 'chi_sim', 'ara', 'rus'] as const;
export type ScriptProbeLanguage = typeof SCRIPT_PROBE_LANGUAGES[number];

const SCRIPT_CHAR = {
  jpn: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu,
  chi_sim: /\p{Script=Han}/gu,
  ara: /\p{Script=Arabic}/gu,
  rus: /\p{Script=Cyrillic}/gu,
} as const;

const KANA_CHAR = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * A clean Latin reading needs no extra models. Cyrillic scans are the trap: the English model reads
 * them as Latin look-alikes with a confidence in the 60s-70s ("СЧЕТ" -> "CHET"), so they look readable
 * instead of blind. Below this confidence a Russian probe is worth its model load; above it the page is
 * genuinely Latin (the same check rejects Cyrillic junk read off an English page).
 */
const AMBIGUOUS_LATIN_CONFIDENCE = 85;

/** Share of the text that belongs to the script this language is written in (0..1). */
export function scriptShare(text: string, language: ScriptProbeLanguage): number {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) {
    return 0;
  }
  const own = text.match(SCRIPT_CHAR[language])?.length ?? 0;
  return Math.min(1, own / letters);
}

/**
 * Does the cheap English probe actually see text? A Japanese/Chinese/Arabic page read with `eng`
 * comes back as a few Latin fragments at low confidence — that is the signal to try script models.
 */
export function isWeakAutoProbe(result: { text: string; confidence?: number | null }): boolean {
  const text = result.text.trim();
  if (text.length < 12) {
    return true;
  }
  if ((text.match(/\p{L}/gu)?.length ?? 0) < 8) {
    return true;
  }
  return typeof result.confidence === 'number' && result.confidence < 45;
}

/**
 * Which script models are worth one page each for this reading. A blind English pass gets the full
 * script set; a readable but not confident Latin pass gets only the Cyrillic check, because that is
 * the one script the English model can mistake for Latin with a plausible confidence.
 */
export function scriptProbesForProbe(result: { text: string; confidence?: number | null }): ScriptProbeLanguage[] {
  if (isWeakAutoProbe(result)) {
    return [...SCRIPT_PROBE_LANGUAGES];
  }
  if (typeof result.confidence === 'number' && result.confidence < AMBIGUOUS_LATIN_CONFIDENCE) {
    return ['rus'];
  }
  return [];
}

/**
 * A script probe may only replace the English reading when it is clearly more confident. Comparing
 * confidence absolute values is not enough: on an English page the Russian model happily produces
 * Cyrillic look-alikes (confidence ~68) while the English model is at ~95.
 */
export function isClearlyBetterScriptReading(
  candidate: { confidence?: number | null },
  probe: { text: string; confidence?: number | null },
): boolean {
  const candidateConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0;
  const baseline = typeof probe.confidence === 'number' ? probe.confidence : 0;
  if (isWeakAutoProbe(probe)) {
    return candidateConfidence >= Math.max(60, baseline + 20);
  }
  return candidateConfidence >= baseline + 15;
}

/**
 * Picks the script model whose own characters dominate its output. Confidence alone cannot decide:
 * a garbage English reading of a Japanese page can be more "confident" than a correct Japanese one.
 * Kana is decisive for Japanese — a Han-only Chinese reading must not override a kana reading.
 */
export function pickScriptProbeWinner(
  candidates: ReadonlyArray<{ language: ScriptProbeLanguage; text: string; confidence?: number | null }>,
): ScriptProbeLanguage | null {
  const kanaCandidates = candidates.filter((candidate) => KANA_CHAR.test(candidate.text));
  const pool = kanaCandidates.length > 0 ? kanaCandidates : candidates;
  let best: ScriptProbeLanguage | null = null;
  let bestScore = 0;
  for (const candidate of pool) {
    const share = scriptShare(candidate.text, candidate.language);
    if (share < 0.35) {
      continue;
    }
    const score = share * 0.7 + (candidate.confidence ?? 0) / 100 * 0.3;
    if (score > bestScore) {
      best = candidate.language;
      bestScore = score;
    }
  }
  return bestScore >= 0.3 ? best : null;
}

export function selectAutoOcrLanguagePack(detection: LanguageDetectionResult): string {
  const top = detection.candidates[0];
  if (!top) {
    return detection.primaryLanguage;
  }

  const minScore = top.score > 0 ? top.score * 0.45 : 0;
  const selected = [top.language];

  for (const candidate of detection.candidates.slice(1)) {
    if (candidate.score < minScore) {
      continue;
    }
    if (!selected.includes(candidate.language)) {
      selected.push(candidate.language);
    }
  }

  return selected.join('+');
}
