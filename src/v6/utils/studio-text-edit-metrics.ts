/**
 * Aggregated metrics for one in-place text edit session.
 *
 * Telemetry must never carry the text itself: the product is local-first and a string from a user
 * document is exactly the kind of data that must not leave the browser. Only shape is reported —
 * whether something changed, by how much, and how many lines the box ended up with.
 */
export interface TextEditCommitMetrics {
  changed: boolean;
  charsBefore: number;
  charsAfter: number;
  charsDelta: number;
  lines: number;
  multiline: boolean;
}

export function buildTextEditCommitMetrics(params: {
  initialValue: string;
  value: string;
}): TextEditCommitMetrics {
  const { initialValue, value } = params;
  const charsBefore = initialValue.length;
  const charsAfter = value.length;
  const lineCount = value.length === 0 ? 0 : value.split(/\r\n|\r|\n/u).length;
  return {
    changed: initialValue !== value,
    charsBefore,
    charsAfter,
    charsDelta: charsAfter - charsBefore,
    lines: lineCount,
    multiline: lineCount > 1,
  };
}

/** Kind of text box a session started from, used to tell "editing the PDF" from "adding content". */
export function resolveTextEditMode(element?: { originalRect?: unknown; sourceFontName?: string }): 'existing-line' | 'new-box' {
  return element?.originalRect || element?.sourceFontName ? 'existing-line' : 'new-box';
}
