import { SyntaxTokenItem } from '../types';

export type SyntaxRole =
  | 'subject'
  | 'predicate'
  | 'object'
  | 'modifier'
  | 'connector'
  | 'other';

export interface SyntaxToken {
  text: string;
  role: SyntaxRole;
  labelKo: string;
}

export interface SyntaxParseResult {
  tokens: SyntaxToken[];
  isFallback: boolean;
  rawText: string;
}

export interface SyntaxRoleStyle {
  containerClass: string;
  badgeClass: string;
  defaultLabelKo: string;
}

const ROLE_STYLES: Record<SyntaxRole, SyntaxRoleStyle> = {
  subject: {
    containerClass: 'bg-blue-50 border-blue-200 text-blue-950',
    badgeClass: 'bg-blue-100 text-blue-800',
    defaultLabelKo: '주어',
  },
  predicate: {
    containerClass: 'bg-emerald-50 border-emerald-200 text-emerald-950',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    defaultLabelKo: '술어',
  },
  object: {
    containerClass: 'bg-purple-50 border-purple-200 text-purple-950',
    badgeClass: 'bg-purple-100 text-purple-800',
    defaultLabelKo: '목적어',
  },
  modifier: {
    containerClass: 'bg-orange-50 border-orange-200 text-orange-950',
    badgeClass: 'bg-orange-100 text-orange-800',
    defaultLabelKo: '수식어',
  },
  connector: {
    containerClass: 'bg-slate-100 border-slate-300 text-slate-800',
    badgeClass: 'bg-slate-200 text-slate-700',
    defaultLabelKo: '연결',
  },
  other: {
    containerClass: 'bg-slate-100 border-slate-300 text-slate-800',
    badgeClass: 'bg-slate-200 text-slate-700',
    defaultLabelKo: '구문',
  },
};

export function getSyntaxRoleStyle(role: SyntaxRole): SyntaxRoleStyle {
  return ROLE_STYLES[role] || ROLE_STYLES.other;
}

export function mapRoleLabel(label: string): SyntaxRole {
  const lower = String(label || '').trim().toLowerCase();
  if (!lower) return 'other';

  // Check modifier-specific cues before object/predicate so "목적어 수식" maps to modifier
  if (
    /수식|관형|부사|장소|시간|상황|부가|modifier|adj|adv/.test(lower)
  ) {
    return 'modifier';
  }
  if (/접속|연결|상관|connector|conj/.test(lower)) {
    return 'connector';
  }
  if (/주어|주부|subject|subj/.test(lower)) {
    return 'subject';
  }
  if (/목적어|object|obj/.test(lower)) {
    return 'object';
  }
  if (/술어|동사|서술어|조동사|보어|predicate|pred|verb/.test(lower)) {
    return 'predicate';
  }
  return 'other';
}

function splitOutsideBrackets(input: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '[') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }

    if (depth === 0) {
      if (ch === '\n' || ch === '→') {
        const trimmed = current.trim();
        if (trimmed) segments.push(trimmed);
        current = '';
        continue;
      }
      if (ch === '+' && (i === 0 || /\s/.test(input[i - 1])) && (i === input.length - 1 || /\s/.test(input[i + 1]))) {
        const trimmed = current.trim();
        if (trimmed) segments.push(trimmed);
        current = '';
        continue;
      }
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) segments.push(tail);
  return segments;
}

interface ParsedSegmentResult {
  tokens: SyntaxToken[];
  labeledCount: number;
}

function parseSegment(segment: string): ParsedSegmentResult {
  const match = segment.match(/\[([^\]]+)\]/);
  if (!match || match.index === undefined) {
    return {
      tokens: [{ text: segment.trim(), role: 'other', labelKo: '' }],
      labeledCount: 0,
    };
  }

  const rawBracket = match[1].trim();
  const before = segment.slice(0, match.index).trim();
  const after = segment.slice(match.index + match[0].length).trim();

  // Case 1: `[목적어 수식: 世界上现存规模最大…]` (inline colon inside brackets)
  const colonIdx = rawBracket.search(/[:：]/);
  if (colonIdx > 0 && !before && !after) {
    const labelPart = rawBracket.slice(0, colonIdx).trim();
    const contentPart = rawBracket.slice(colonIdx + 1).trim();
    const role = mapRoleLabel(labelPart);
    const labeled = role !== 'other' ? 1 : 0;
    return {
      tokens: [
        {
          text: contentPart || labelPart,
          role,
          labelKo: labelPart,
        },
      ],
      labeledCount: labeled,
    };
  }

  const labelOnly = colonIdx > 0 ? rawBracket.slice(0, colonIdx).trim() : rawBracket;
  const bracketDetail = colonIdx > 0 ? rawBracket.slice(colonIdx + 1).trim() : '';
  const role = mapRoleLabel(labelOnly);
  const hasSemanticLabel = role !== 'other';

  // Case 2: `text1 [label] text2` (both before and after present)
  if (before && after) {
    const tokens: SyntaxToken[] = [
      { text: before, role: 'other', labelKo: '' },
      {
        text: bracketDetail ? `${after} (${bracketDetail})` : after,
        role,
        labelKo: labelOnly,
      },
    ];
    return { tokens, labeledCount: hasSemanticLabel ? 1 : 0 };
  }

  // Case 3: `text [label]` or `[label] text`
  const text = before || after || bracketDetail || labelOnly;
  const displayText =
    (before || after) && bracketDetail
      ? `${before || after} (${bracketDetail})`
      : text;

  return {
    tokens: [
      {
        text: displayText,
        role,
        labelKo: labelOnly,
      },
    ],
    labeledCount: hasSemanticLabel ? 1 : 0,
  };
}

function normalizePrecomputedTokens(items: SyntaxTokenItem[]): SyntaxToken[] {
  return items
    .map((item) => {
      const text = String(item?.text || '').trim();
      if (!text) return null;
      const rawRole = String(item?.role || '').trim();
      const role = mapRoleLabel(rawRole);
      const style = getSyntaxRoleStyle(role);
      return {
        text,
        role,
        labelKo: rawRole || style.defaultLabelKo,
      };
    })
    .filter((t): t is SyntaxToken => Boolean(t));
}

export function parseSyntaxTokens(diagram?: string | null): SyntaxToken[] {
  const result = parseSyntaxDiagram(diagram);
  return result.isFallback ? [] : result.tokens;
}

export function parseSyntaxDiagram(
  diagram?: string | null,
  precomputed?: SyntaxTokenItem[]
): SyntaxParseResult {
  const rawText = String(diagram || '').trim();

  if (Array.isArray(precomputed) && precomputed.length >= 2) {
    const normalized = normalizePrecomputedTokens(precomputed);
    const labeled = normalized.filter((t) => t.role !== 'other').length;
    if (labeled >= 2) {
      return { tokens: normalized, isFallback: false, rawText };
    }
  }

  if (!rawText) {
    return { tokens: [], isFallback: true, rawText: '' };
  }

  const segments = splitOutsideBrackets(rawText);
  const tokens: SyntaxToken[] = [];
  let labeledCount = 0;

  for (const seg of segments) {
    const parsed = parseSegment(seg);
    tokens.push(...parsed.tokens);
    labeledCount += parsed.labeledCount;
  }

  if (labeledCount < 2) {
    return {
      tokens: [],
      isFallback: true,
      rawText,
    };
  }

  return {
    tokens,
    isFallback: false,
    rawText,
  };
}
