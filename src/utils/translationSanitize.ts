/**
 * Removes prompt-leakage / meta-commentary phrases accidentally emitted in translations.
 */

const PARENTHETICAL_LEAKAGE_PATTERNS: RegExp[] = [
  /\(\s*(?:글의\s*수사|독립\s*사실로\s*단정하지\s*말\s*것|사실로\s*단정하지\s*말\s*것|단정하지\s*말\s*것|과장\s*표현|번역\s*지침|작성\s*지침|출력\s*지침|메타\s*설명|프롬프트)[^)]*\)/gi,
  /\(\s*[^)]*(?:단정하지\s*말\s*것|출력하지\s*말\s*것|번역하지\s*말\s*것|글의\s*수사|프롬프트)[^)]*\)/gi,
  /\[\s*[^[\]]*(?:글의\s*수사|단정하지\s*말\s*것|번역\s*지침|프롬프트)[^[\]]*\]/gi,
  /\(\s*(?:rhetorical\s+claim|do\s+not\s+state\s+as\s+(?:an\s+)?(?:independent\s+)?fact|prompt\s+instruction|meta\s*note)[^)]*\)/gi,
];

// Matches indirect-quote attribution tails like "크다고 이 글은 말한다." -> "크다."
const KO_QUOTATION_META_RE =
  /([다라])고\s*(?:이\s*)?(?:글|본문|기사|책|문장|저자|필자)(?:은|는|이|가)\s*(?:말한다|전한다|설명한다|주장한다|서술한다|밝힌다|기술한다|언급한다|전하고\s*있다|말하고\s*있다)(?:\s*\.)?/g;

const KO_STANDALONE_META_RE =
  /(?:\s*[-–—]\s*)?(?:이\s*)?(?:글|본문)(?:은|이)\s*(?:말한다|전한다|설명한다|주장한다|서술한다)\.?/g;

export function stripPromptLeakage(translation: string): string {
  if (!translation || typeof translation !== 'string') return '';

  let cleaned = translation;

  for (const pattern of PARENTHETICAL_LEAKAGE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // "크다고 이 글은 말한다." -> "크다.", "말했다고 글은 전한다." -> "말했다."
  cleaned = cleaned.replace(KO_QUOTATION_META_RE, (_match, endingChar: string, offset: number, full: string) => {
    const tail = full.slice(offset + _match.length).trimStart();
    const hadPeriod = _match.trimEnd().endsWith('.');
    const period = hadPeriod || tail.length === 0 ? '.' : '';
    if (endingChar === '라') {
      // "이라고 글은 말한다" → "이다."
      const charBefore = offset > 0 ? full[offset - 1] : '';
      if (charBefore === '이') {
        return `다${period}`;
      }
      // "아니라고 글은 전한다" → "아니다."
      if (offset >= 2 && full.slice(offset - 2, offset) === '아니') {
        return `다${period}`;
      }
      // 명령형(가라)·추측형(가리라)·서술격(의사라)을 형태만으로 구별할 수 없으므로
      // 비문이 되지 않게 "라고 한다."로 남긴다.
      return `라고 한다${period || '.'}`;
    }
    return hadPeriod ? '다.' : '다';
  });

  cleaned = cleaned.replace(KO_STANDALONE_META_RE, '');

  // Normalize punctuation and whitespace artifacts left after stripping
  cleaned = cleaned
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/(?<!\.)\.{2}(?!\.)/g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}
