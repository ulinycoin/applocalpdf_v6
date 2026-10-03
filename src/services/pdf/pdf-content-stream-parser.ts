export interface PdfParsedTextOperator {
  operator: 'Tj' | 'TJ';
  start: number;
  end: number;
  textSegments: string[];
  textMatrixX?: number;
  textMatrixY?: number;
  fontSize?: number;
  /** Font resource name in effect for this run, e.g. `/F4`. */
  fontResourceName?: string;
  /** Non-stroking fill colour in effect, as `#rrggbb`. */
  fillColor?: string;
}

interface Token {
  type: 'literal' | 'hex' | 'number' | 'array' | 'word';
  value: string | number | Token[];
  start: number;
  end: number;
}

function decodePdfHexString(hex: string): string {
  const normalized = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    const value = Number.parseInt(normalized.slice(i, i + 2), 16);
    bytes[i / 2] = Number.isFinite(value) ? value : 0x20;
  }
  return new TextDecoder('latin1').decode(bytes);
}

function decodePdfLiteralString(input: string): string {
  return input
    .replace(/\\n/gu, '\n')
    .replace(/\\r/gu, '\r')
    .replace(/\\t/gu, '\t')
    .replace(/\\b/gu, '\b')
    .replace(/\\f/gu, '\f')
    .replace(/\\\(/gu, '(')
    .replace(/\\\)/gu, ')')
    .replace(/\\\\/gu, '\\');
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f' || char === '\0';
}

function skipWhitespaceAndComments(content: string, cursor: number): number {
  let index = cursor;
  while (index < content.length) {
    const char = content[index];
    if (isWhitespace(char)) {
      index += 1;
      continue;
    }
    if (char === '%') {
      while (index < content.length && content[index] !== '\n' && content[index] !== '\r') {
        index += 1;
      }
      continue;
    }
    break;
  }
  return index;
}

function readLiteralToken(content: string, start: number): Token | null {
  let index = start + 1;
  let depth = 1;
  while (index < content.length) {
    const char = content[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '(') {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        const raw = content.slice(start + 1, index - 1);
        return {
          type: 'literal',
          value: decodePdfLiteralString(raw),
          start,
          end: index,
        };
      }
      continue;
    }
    index += 1;
  }
  return null;
}

function readHexToken(content: string, start: number): Token | null {
  if (content[start + 1] === '<') {
    return null;
  }
  let index = start + 1;
  while (index < content.length && content[index] !== '>') {
    index += 1;
  }
  if (index >= content.length) {
    return null;
  }
  const raw = content.slice(start + 1, index);
  return {
    type: 'hex',
    value: decodePdfHexString(raw),
    start,
    end: index + 1,
  };
}

function readWordToken(content: string, start: number): Token {
  let index = start;
  while (index < content.length) {
    const char = content[index];
    if (isWhitespace(char) || char === '[' || char === ']' || char === '(' || char === ')' || char === '<' || char === '>') {
      break;
    }
    index += 1;
  }
  const raw = content.slice(start, index);
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(raw)) {
    return {
      type: 'number',
      value: Number.parseFloat(raw),
      start,
      end: index,
    };
  }
  return {
    type: 'word',
    value: raw,
    start,
    end: index,
  };
}

function readDictionaryToken(content: string, start: number): Token {
  let index = start;
  let depth = 0;
  while (index < content.length) {
    const char = content[index];
    if (char === '<' && content[index + 1] === '<') {
      depth += 1;
      index += 2;
      continue;
    }
    if (char === '>' && content[index + 1] === '>') {
      depth -= 1;
      index += 2;
      if (depth <= 0) {
        return { type: 'word', value: content.slice(start, index), start, end: index };
      }
      continue;
    }
    if (char === '(') {
      const literal = readLiteralToken(content, index);
      index = literal ? literal.end : index + 1;
      continue;
    }
    index += 1;
  }
  // Unbalanced dictionary: consume the rest so the caller cannot loop forever.
  return { type: 'word', value: content.slice(start), start, end: content.length };
}

function readNextToken(content: string, cursor: number): Token | null {
  const start = skipWhitespaceAndComments(content, cursor);
  if (start >= content.length) {
    return null;
  }
  const char = content[start];
  if (char === '(') {
    return readLiteralToken(content, start);
  }
  if (char === '<') {
    // Marked-content property lists (`/P <</MCID 0 >> BDC`) are dictionaries, not hex strings.
    if (content[start + 1] === '<') {
      return readDictionaryToken(content, start);
    }
    return readHexToken(content, start);
  }
  if (char === '>') {
    // A lone dictionary terminator is never an operator; consume it so the scan advances.
    const width = content[start + 1] === '>' ? 2 : 1;
    return { type: 'word', value: content.slice(start, start + width), start, end: start + width };
  }
  if (char === '[') {
    let index = start + 1;
    const children: Token[] = [];
    while (index < content.length) {
      index = skipWhitespaceAndComments(content, index);
      if (index >= content.length) {
        return null;
      }
      if (content[index] === ']') {
        return {
          type: 'array',
          value: children,
          start,
          end: index + 1,
        };
      }
      const child = readNextToken(content, index);
      if (!child) {
        return null;
      }
      children.push(child);
      index = child.end;
    }
    return null;
  }
  if (char === ']') {
    return {
      type: 'word',
      value: ']',
      start,
      end: start + 1,
    };
  }
  return readWordToken(content, start);
}

function extractSegmentsFromArray(items: Token[]): string[] {
  const chunks: string[] = [];
  for (const token of items) {
    if (token.type === 'literal' || token.type === 'hex') {
      chunks.push(String(token.value));
    }
  }
  return chunks;
}

function getTrailingNumbers(operands: Token[], count: number): number[] | null {
  if (operands.length < count) {
    return null;
  }
  const tail = operands.slice(operands.length - count);
  if (tail.some((token) => token.type !== 'number')) {
    return null;
  }
  return tail.map((token) => Number(token.value));
}

function toHexChannel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value * 255)));
  return clamped.toString(16).padStart(2, '0');
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

/** Same convention as pdf.js `Util.transform`: `m1` then `m2`. */
function concatMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function readMatrix(values: number[] | null): Matrix | null {
  if (!values || values.length < 6) {
    return null;
  }
  return [values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, values[5]!];
}

function readFillColor(operands: Token[], operator: 'rg' | 'g'): string | undefined {
  const count = operator === 'rg' ? 3 : 1;
  const values = getTrailingNumbers(operands, count);
  if (!values) {
    return undefined;
  }
  if (operator === 'g') {
    const hex = toHexChannel(values[0]!);
    return `#${hex}${hex}${hex}`;
  }
  return `#${toHexChannel(values[0]!)}${toHexChannel(values[1]!)}${toHexChannel(values[2]!)}`;
}

function readFontResourceName(operands: Token[]): string | undefined {
  const nameToken = operands[operands.length - 2];
  if (!nameToken || nameToken.type !== 'word') {
    return undefined;
  }
  const value = String(nameToken.value);
  return value.startsWith('/') ? value : undefined;
}

export function parsePdfTextOperators(content: string): PdfParsedTextOperator[] {
  const operators: PdfParsedTextOperator[] = [];
  const operands: Token[] = [];
  let inTextObject = false;
  let textMatrix: Matrix = IDENTITY_MATRIX;
  let ctm: Matrix = IDENTITY_MATRIX;
  const ctmStack: Matrix[] = [];
  let textLeading = 0;
  let textFontSize: number | undefined;
  let textFontResource: string | undefined;
  let fillColor: string | undefined;
  let cursor = 0;

  while (cursor < content.length) {
    const token = readNextToken(content, cursor);
    if (!token) {
      break;
    }
    if (token.end <= cursor) {
      // Defensive: never let a zero-width token stall the scan.
      break;
    }

    cursor = token.end;
    if (token.type !== 'word') {
      operands.push(token);
      continue;
    }

    const op = String(token.value);
    // PDF names (font resources, colour spaces, marked-content tags) are operands, not operators.
    if (op.startsWith('/')) {
      operands.push(token);
      continue;
    }
    if (op === 'q') {
      ctmStack.push(ctm);
      operands.length = 0;
      continue;
    }
    if (op === 'Q') {
      ctm = ctmStack.pop() ?? IDENTITY_MATRIX;
      operands.length = 0;
      continue;
    }
    if (op === 'cm') {
      const matrix = readMatrix(getTrailingNumbers(operands, 6));
      if (matrix) {
        // Text positions have to be reported in device space: print-generated PDFs routinely
        // draw through a scaled/offset CTM, so raw Tm values are not comparable to page ratios.
        ctm = concatMatrix(ctm, matrix);
      }
      operands.length = 0;
      continue;
    }
    if (op === 'BT') {
      inTextObject = true;
      textMatrix = IDENTITY_MATRIX;
      textLeading = 0;
      textFontSize = undefined;
      textFontResource = undefined;
      operands.length = 0;
      continue;
    }
    if (op === 'ET') {
      inTextObject = false;
      operands.length = 0;
      continue;
    }
    if (!inTextObject) {
      if (op === 'rg' || op === 'g') {
        fillColor = readFillColor(operands, op) ?? fillColor;
      }
      operands.length = 0;
      continue;
    }

    if (op === 'rg' || op === 'g') {
      fillColor = readFillColor(operands, op) ?? fillColor;
      operands.length = 0;
      continue;
    }

    if (op === 'Tm') {
      const matrix = readMatrix(getTrailingNumbers(operands, 6));
      if (matrix) {
        textMatrix = matrix;
      }
      operands.length = 0;
      continue;
    }

    if (op === 'Td' || op === 'TD') {
      const values = getTrailingNumbers(operands, 2);
      if (values) {
        const [tx, ty] = values;
        textMatrix = concatMatrix([1, 0, 0, 1, tx, ty], textMatrix);
        if (op === 'TD') {
          textLeading = -ty;
        }
      }
      operands.length = 0;
      continue;
    }

    if (op === 'TL') {
      const values = getTrailingNumbers(operands, 1);
      if (values) {
        textLeading = values[0];
      }
      operands.length = 0;
      continue;
    }

    if (op === 'T*') {
      textMatrix = concatMatrix([1, 0, 0, 1, 0, -textLeading], textMatrix);
      operands.length = 0;
      continue;
    }

    if (op === 'Tf') {
      const values = getTrailingNumbers(operands, 1);
      if (values) {
        textFontSize = values[0];
        textFontResource = readFontResourceName(operands) ?? textFontResource;
      }
      operands.length = 0;
      continue;
    }

    if (op === 'Tj') {
      const last = operands[operands.length - 1];
      if (last && (last.type === 'literal' || last.type === 'hex')) {
        const device = concatMatrix(ctm, textMatrix);
        operators.push({
          operator: 'Tj',
          start: last.start,
          end: token.end,
          textSegments: [String(last.value)],
          textMatrixX: device[4],
          textMatrixY: device[5],
          fontSize: textFontSize,
          fontResourceName: textFontResource,
          fillColor,
        });
      }
      operands.length = 0;
      continue;
    }

    if (op === 'TJ') {
      const last = operands[operands.length - 1];
      if (last && last.type === 'array') {
        const device = concatMatrix(ctm, textMatrix);
        operators.push({
          operator: 'TJ',
          start: last.start,
          end: token.end,
          textSegments: extractSegmentsFromArray(last.value as Token[]),
          textMatrixX: device[4],
          textMatrixY: device[5],
          fontSize: textFontSize,
          fontResourceName: textFontResource,
          fillColor,
        });
      }
      operands.length = 0;
      continue;
    }

    operands.length = 0;
  }

  return operators;
}

export function extractPdfTextSegments(content: string): string[] {
  return parsePdfTextOperators(content)
    .flatMap((entry) => entry.textSegments)
    .map((part) => part.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}
