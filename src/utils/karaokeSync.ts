/**
 * Precision Forced-Alignment Simulation Engine for Karaoke Audio Sync
 * Models phonetic density, vowel duration, numbers/abbreviations, and clause pauses.
 */

export interface KaraokeWordSpan {
  word: string;
  token: string;
  isWord: boolean;
  startIndex: number;
  endIndex: number;
  timeStart: number;
  timeEnd: number;
  timePauseEnd: number;
}

export interface KaraokeTimeline {
  text: string;
  spans: KaraokeWordSpan[];
  totalDuration: number;
}

const timelineCache = new Map<string, KaraokeTimeline>();

/**
 * Builds an acoustically-weighted timeline for exact speech sync.
 */
export function buildKaraokeTimeline(text: string, duration: number): KaraokeTimeline {
  if (!text || duration <= 0) {
    return { text: text || '', spans: [], totalDuration: duration || 0 };
  }

  const roundedDuration = Math.round(duration * 100) / 100;
  const cacheKey = `${text}_${roundedDuration}`;
  if (timelineCache.has(cacheKey)) {
    return timelineCache.get(cacheKey)!;
  }

  // Tokenize preserving spaces and punctuation
  const rawTokens = text.split(/(\s+|[.,!?:;«»"“”()]+)/);
  const validTokens = rawTokens.filter((t) => t.length > 0);

  // Neural TTS speech has ~140ms onset lead-in and ~220ms release tail
  const leadIn = Math.min(0.16, duration * 0.05);
  const leadOut = Math.min(0.24, duration * 0.06);
  const speechDuration = Math.max(0.2, duration - leadIn - leadOut);

  interface TokenWeight {
    token: string;
    isWord: boolean;
    startIndex: number;
    endIndex: number;
    weight: number;
    pauseWeight: number;
  }

  const tokenWeights: TokenWeight[] = [];
  let charPos = 0;

  for (let i = 0; i < validTokens.length; i++) {
    const token = validTokens[i];
    const startIndex = charPos;
    const endIndex = charPos + token.length;
    charPos = endIndex;

    const trimmed = token.trim();
    const isWord = /[\p{L}\p{N}]/u.test(trimmed);

    let weight = 0;
    let pauseWeight = 0;

    if (isWord) {
      // 1. Numbers / Years expanded acoustic duration (e.g. 1805 -> 'mil huit cent cinq')
      const digitCount = (trimmed.match(/\d/g) || []).length;
      if (digitCount > 0) {
        weight += digitCount * 3.6;
      }

      // 2. Roman numerals & abbreviations (e.g. Ier, XIX)
      if (/^[IVXLCDM]+(er|e|ème)?$/i.test(trimmed)) {
        weight += 6.2;
      }

      // 3. Phonetic character density with vowel duration weighting
      for (const char of trimmed) {
        if (/[aeiouyéèêëàâäôöûüùîïœæáíóúñ]/i.test(char)) {
          weight += 1.35; // Vowel nucleus carries acoustic length
        } else if (/[\p{L}]/u.test(char)) {
          weight += 0.92; // Consonants
        }
      }

      // Minimum duration for monosyllabic particles (e.g. 'de', 'un', 'in')
      weight = Math.max(1.8, weight);

      // Check following token for breathing/clause pauses
      const nextToken = validTokens[i + 1] || '';
      if (/[,—\-]/.test(nextToken)) {
        pauseWeight = 3.0; // Comma pause ~200ms
      } else if (/[:;]/.test(nextToken)) {
        pauseWeight = 3.8; // Colon/semicolon pause ~250ms
      } else if (/[.!?]/.test(nextToken)) {
        pauseWeight = 5.5; // Sentence end pause ~360ms
      } else {
        pauseWeight = 0.5; // Standard word transition
      }
    }

    tokenWeights.push({
      token,
      isWord,
      startIndex,
      endIndex,
      weight,
      pauseWeight,
    });
  }

  const totalWeight = tokenWeights.reduce((sum, tw) => sum + tw.weight + tw.pauseWeight, 0);
  if (totalWeight <= 0) {
    const fallback: KaraokeTimeline = { text, spans: [], totalDuration: duration };
    return fallback;
  }

  // Allocate timeline timestamps
  let currentAccumWeight = 0;
  const spans: KaraokeWordSpan[] = [];

  for (const tw of tokenWeights) {
    if (!tw.isWord) {
      spans.push({
        word: tw.token,
        token: tw.token,
        isWord: false,
        startIndex: tw.startIndex,
        endIndex: tw.endIndex,
        timeStart: 0,
        timeEnd: 0,
        timePauseEnd: 0,
      });
      continue;
    }

    const tStart = leadIn + (currentAccumWeight / totalWeight) * speechDuration;
    currentAccumWeight += tw.weight;
    const tEnd = leadIn + (currentAccumWeight / totalWeight) * speechDuration;
    currentAccumWeight += tw.pauseWeight;
    const tPauseEnd = leadIn + (currentAccumWeight / totalWeight) * speechDuration;

    spans.push({
      word: tw.token,
      token: tw.token,
      isWord: true,
      startIndex: tw.startIndex,
      endIndex: tw.endIndex,
      timeStart: tStart,
      timeEnd: tEnd,
      timePauseEnd: tPauseEnd,
    });
  }

  const timeline: KaraokeTimeline = { text, spans, totalDuration: duration };
  if (timelineCache.size > 200) {
    timelineCache.clear();
  }
  timelineCache.set(cacheKey, timeline);
  return timeline;
}

/**
 * High-precision status lookup for each token against audio currentTime.
 */
export function getSpanStatus(
  span: KaraokeWordSpan,
  currentTime: number,
  _duration: number
): 'current' | 'past' | 'upcoming' {
  if (!span.isWord || currentTime <= 0) return 'upcoming';

  if (currentTime < span.timeStart) {
    return 'upcoming';
  }

  if (currentTime >= span.timeStart && currentTime <= span.timePauseEnd) {
    return 'current';
  }

  return 'past';
}
