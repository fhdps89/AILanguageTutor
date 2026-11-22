import { KoreanChunkItem, LanguageInfo, LessonPage, SentenceChunkItem, SentenceItem, VocabularyItem } from '../types';
import { stripPromptLeakage } from './translationSanitize';

const CJK_CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff]/;

function splitCjkTitle(text: string): string[] {
  const chars = Array.from(text);
  if (chars.length < 4) return [text];
  const mid = Math.floor(chars.length / 2);
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}

function splitByPunctuationOrWords(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Try splitting at natural clause punctuation (keeping punctuation with preceding chunk)
  const punctParts = trimmed
    .split(/(?<=[,;:\u3001\uff0c\uff1b\uff1a])\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (punctParts.length >= 2) {
    return punctParts;
  }

  // 2. Try splitting whitespace-delimited words into balanced chunks
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const mid = words.length === 2 ? 1 : Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')].filter(Boolean);
  }

  // 3. CJK without spaces (e.g. 4+ char titles like "北京故宫" -> ["北京", "故宫"])
  if (CJK_CHAR_RE.test(trimmed)) {
    return splitCjkTitle(trimmed);
  }

  return [trimmed];
}

/**
 * Derives meaningful breath/phrasing chunks from breath_marks (split on "/")
 * or falls back to splitting rawText into >=2 parts when possible.
 */
export function chunksFromBreathMarks(
  breath: string,
  rawText: string
): { text: string; meaning?: string }[] {
  const cleanBreath = String(breath || '').trim();
  const cleanRaw = String(rawText || '').trim();

  if (cleanBreath.includes('/')) {
    const parts = cleanBreath
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return parts.map((text) => ({ text }));
    }
  }

  const target = cleanRaw || cleanBreath.replace(/\//g, ' ').trim();
  if (!target) return [];

  return splitByPunctuationOrWords(target).map((text) => ({ text }));
}

function buildFallbackPronunciationGuide(
  rawText: string,
  vocab: VocabularyItem[],
  lang?: LanguageInfo | string
): string {
  if (!rawText) return '';

  const vocabHints = vocab
    .map((v) => v.pinyin || v.hint)
    .filter((h): h is string => Boolean(h && h.trim()));
  if (vocabHints.length > 0) {
    return vocabHints.slice(0, 3).join(' · ');
  }

  const langCode = (typeof lang === 'string' ? lang : lang?.code || '').toLowerCase();
  if (langCode.startsWith('zh')) {
    return '성조 높낮이와 권설음/치음 구분에 유의해 천천히 읽어 보세요.';
  }
  if (langCode.startsWith('fr')) {
    return '단어 끝 자음과 다음 모음의 연음(liaison)에 유의해 읽어 보세요.';
  }
  if (langCode.startsWith('ja')) {
    return '장음·촉음 박자와 높낮이 억양에 유의해 읽어 보세요.';
  }
  if (langCode.startsWith('ko')) {
    return '연음과 받침 발음에 유의해 자연스럽게 읽어 보세요.';
  }
  return '강세와 호흡 단위에 맞춰 자연스럽게 읽어 보세요.';
}

function normalizeChunksInput(rawChunks: unknown): SentenceChunkItem[] {
  if (!Array.isArray(rawChunks)) return [];
  return rawChunks
    .map((chk: any) => {
      if (typeof chk === 'string') {
        return { text: chk.trim() };
      }
      if (!chk || typeof chk !== 'object') return null;
      const text = String(chk.text || '').trim();
      if (!text) return null;
      const item: SentenceChunkItem = { text };
      if (chk.meaning) item.meaning = String(chk.meaning).trim();
      if (chk.grammarRole) item.grammarRole = String(chk.grammarRole).trim();
      return item;
    })
    .filter((c): c is SentenceChunkItem => Boolean(c));
}

export function ensureSentenceSchema(
  sentence: Partial<SentenceItem> & Record<string, any>,
  lang?: LanguageInfo | string
): SentenceItem {
  const raw = String(
    sentence.raw_text ||
      sentence.text ||
      sentence.sentence ||
      sentence.french ||
      sentence.korean ||
      sentence.content ||
      ''
  ).trim();
  const tts = String(sentence.tts_text || sentence.spoken || raw).trim();
  const translation = stripPromptLeakage(
    String(
      sentence.translation ||
        sentence.meaning ||
        sentence.korean_translation ||
        sentence.english_translation ||
        ''
    ).trim()
  );

  const syntax = String(sentence.syntax_diagram || sentence.structure || '').trim();
  const pinyin = sentence.pinyin ? String(sentence.pinyin).trim() : undefined;
  const pronHintRaw = String(
    sentence.pronunciation_hint || sentence.phonetics || sentence.sound_tips || ''
  ).trim();
  const liaisonRaw = String(sentence.liaison_hint || sentence.liaison || '').trim();
  const soundRomanization = sentence.sound_romanization
    ? String(sentence.sound_romanization).trim()
    : undefined;
  const formality = sentence.formality_badge ? String(sentence.formality_badge).trim() : null;

  let vocab: VocabularyItem[] = [];
  if (Array.isArray(sentence.vocabulary)) {
    vocab = sentence.vocabulary
      .map((v: any) => ({
        word: String(v?.word || '').trim(),
        meaning: String(v?.meaning || v?.translation || '').trim(),
        baseForm: v?.baseForm ? String(v.baseForm).trim() : undefined,
        pos: v?.pos ? String(v.pos).trim() : undefined,
        hint: v?.hint ? String(v.hint).trim() : undefined,
        pinyin: v?.pinyin ? String(v.pinyin).trim() : undefined,
      }))
      .filter((v: VocabularyItem) => v.word.length > 0);
  }

  let koreanChunks: KoreanChunkItem[] = [];
  if (Array.isArray(sentence.korean_chunks)) {
    koreanChunks = sentence.korean_chunks
      .map((chk: any) => ({
        text: String(chk?.text || '').trim(),
        grammarRole: chk?.grammarRole ? String(chk.grammarRole).trim() : '',
      }))
      .filter((c: KoreanChunkItem) => c.text.length > 0);
  }

  const rawBreath =
    typeof sentence.breath_marks === 'string'
      ? sentence.breath_marks.trim()
      : typeof sentence.phrasing === 'string'
      ? sentence.phrasing.trim()
      : '';

  // Map chunks <-> korean_chunks <-> breath_marks
  let chunks = normalizeChunksInput(sentence.chunks);
  if (chunks.length < 2 && koreanChunks.length >= 2) {
    chunks = koreanChunks.map((c) => ({
      text: c.text,
      meaning: c.grammarRole || undefined,
      grammarRole: c.grammarRole || undefined,
    }));
  }
  if (chunks.length < 2) {
    const derived = chunksFromBreathMarks(rawBreath, raw);
    if (derived.length >= 2 || chunks.length === 0) {
      chunks = derived;
    }
  }

  const breathMarks =
    chunks.length >= 2
      ? chunks.map((c) => c.text).join(' / ')
      : rawBreath || raw;

  // Map pronunciationGuide <-> pinyin / pronunciation_hint / liaison_hint / sound_romanization
  const explicitGuide = String(
    sentence.pronunciationGuide || sentence.pronunciation_guide || ''
  ).trim();
  const pronunciationGuide =
    explicitGuide ||
    pinyin ||
    pronHintRaw ||
    liaisonRaw ||
    soundRomanization ||
    buildFallbackPronunciationGuide(raw, vocab, lang);

  const pronunciationHint =
    pronHintRaw || (!liaisonRaw && pronunciationGuide ? pronunciationGuide : '');

  const normalized: SentenceItem = {
    id: String(sentence.id || 's01'),
    raw_text: raw,
    tts_text: tts,
    translation,
    sound_romanization: soundRomanization,
    pinyin,
    korean_chunks: koreanChunks.length > 0 ? koreanChunks : undefined,
    chunks: chunks.length > 0 ? chunks : undefined,
    formality_badge: formality,
    breath_marks: breathMarks,
    syntax_diagram: syntax,
    pronunciation_hint: pronunciationHint || undefined,
    liaison_hint: liaisonRaw || undefined,
    pronunciationGuide: pronunciationGuide || undefined,
    vocabulary: vocab,
  };

  if (Array.isArray(sentence.syntaxTokens)) {
    normalized.syntaxTokens = sentence.syntaxTokens;
  }

  return normalized;
}

export function normalizeLessonPage(data: any): LessonPage {
  if (!data || typeof data !== 'object') {
    throw new Error('Lesson page is not an object');
  }

  let rawSentences: any[] = [];
  if (Array.isArray(data.sentences)) rawSentences = data.sentences;
  else if (Array.isArray(data.items)) rawSentences = data.items;
  else if (Array.isArray(data.lines)) rawSentences = data.lines;
  else if (Array.isArray(data.paragraphs)) rawSentences = data.paragraphs;
  else if (Array.isArray(data.page?.sentences)) rawSentences = data.page.sentences;

  let lang: LanguageInfo = data.language || {
    code: 'en-US',
    name_ko: '영어',
    name_en: 'English',
    flag: '🇺🇸',
  };
  if (
    lang &&
    (lang.code === 'zh' ||
      lang.code?.startsWith('zh-') ||
      lang.name_ko?.includes('중국어') ||
      lang.name_en?.toLowerCase().includes('chinese'))
  ) {
    lang = { code: 'zh-CN', name_ko: '중국어', name_en: 'Chinese', flag: '🇨🇳' };
  }

  const cleaned = rawSentences
    .map((s: any, idx: number) =>
      ensureSentenceSchema(
        { ...s, id: s?.id || `s${String(idx + 1).padStart(2, '0')}` },
        lang
      )
    )
    .filter((s: SentenceItem) => s.raw_text.length > 0);

  return {
    ...data,
    language: lang,
    title: data.title || '학습 교재',
    full_tts_script:
      data.full_tts_script || cleaned.map((s) => s.tts_text || s.raw_text).join(' '),
    disclaimer_ko:
      data.disclaimer_ko ||
      '음성은 합성 TTS이며 원어민이 아닙니다. 발음 표기는 학습용 보조 힌트입니다.',
    sentences: cleaned,
  };
}
