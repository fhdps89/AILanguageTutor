/**
 * Client-side TTS URL cache & in-flight deduplication.
 * Speed/rate is deliberately excluded from the cache key because the client
 * always requests 1.0x audio and adjusts playbackRate locally.
 */

export const DEFAULT_TTS_VOICE = 'Kore';

const resolvedUrlCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

const PREPARING_MESSAGES = [
  '🎙️ 성우 섭외하는 중...',
  '📝 대본 건네고 읽는 방식 조율 중...',
  '🔴 스튜디오에서 열심히 녹음 중...',
  '🎧 녹음된 음성 모니터링 중...',
  '✨ 음성 다듬는 중...',
];

const HASH_AUDIO_RE = /^\/api\/tts\/[a-f0-9]{64}$/;

export function ttsCacheKey(
  text: string,
  lang: string,
  voice: string = DEFAULT_TTS_VOICE
): string {
  const cleanText = String(text || '').trim();
  const cleanLang = String(lang || '').trim() || 'default';
  const cleanVoice = String(voice || '').trim() || DEFAULT_TTS_VOICE;
  return `${cleanVoice}::${cleanLang}::${cleanText}`;
}

export function getCachedAudioUrl(key: string): string | undefined {
  return resolvedUrlCache.get(key);
}

export function setCachedAudioUrl(key: string, url: string): void {
  resolvedUrlCache.set(key, url);
}

export function clearAudioCacheForTests(): void {
  resolvedUrlCache.clear();
  inFlightRequests.clear();
}

function dispatchWindowEvent(name: string, detail: unknown): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    const EventCtor = (window as any).CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
      window.dispatchEvent(new EventCtor(name, { detail }));
    }
  }
}

export interface ResolveAudioUrlOptions {
  audioUrl?: string | null;
  text: string;
  lang: string;
  voice?: string;
  deviceId?: string;
  onPreparing?: (msg: string) => void;
}

/**
 * Resolves a hash-based audio stream URL for 1.0x Gemini Native TTS.
 * Deduplicates concurrent requests per cache key so double-clicks do not double-charge quota.
 */
export async function resolveAudioUrl({
  audioUrl,
  text,
  lang,
  voice = DEFAULT_TTS_VOICE,
  deviceId = 'dev_default',
  onPreparing,
}: ResolveAudioUrlOptions): Promise<string> {
  const cleanText = String(text || '').trim();
  const safeVoice = String(voice || '').trim() || DEFAULT_TTS_VOICE;
  const cacheKey = ttsCacheKey(cleanText, lang, safeVoice);

  const cached = getCachedAudioUrl(cacheKey);
  if (cached) {
    return cached;
  }

  // Reuse pre-resolved hash URLs regardless of playback speed
  if (audioUrl && HASH_AUDIO_RE.test(audioUrl)) {
    setCachedAudioUrl(cacheKey, audioUrl);
    return audioUrl;
  }

  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    onPreparing?.(PREPARING_MESSAGES[0]);
    return existingInFlight;
  }

  const requestPromise = (async (): Promise<string> => {
    let msgIdx = 0;
    onPreparing?.(PREPARING_MESSAGES[0]);
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % PREPARING_MESSAGES.length;
      onPreparing?.(PREPARING_MESSAGES[msgIdx]);
    }, 750);

    try {
      const res = await fetch('/api/tts/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          text: cleanText,
          lang,
          speed: '1.0',
          voice: safeVoice,
        }),
      });
      clearInterval(msgInterval);

      if (res.status === 429) {
        const errData = await res.json().catch(() => ({}));
        if (errData.quota) {
          dispatchWindowEvent('ai-tutor-quota', errData.quota);
        }
        const message =
          errData.error ||
          (errData.code === 'TTS_GLOBAL_LIMIT'
            ? '오늘은 많은 분이 이용해서 음성이 잠시 쉬고 있어요. 내일 다시 와 주세요.'
            : '오늘 들을 수 있는 음성을 모두 사용했어요. 내일 다시 이용해 주세요.');
        const code = errData.code || 'TTS_DEVICE_LIMIT';

        dispatchWindowEvent('ai-tutor-rate-limit', { message, code });
        const rateErr = new Error(message);
        (rateErr as any).isRateLimit = true;
        (rateErr as any).code = code;
        throw rateErr;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.quota) {
          dispatchWindowEvent('ai-tutor-quota', data.quota);
        }
        if (data.audioUrl) {
          setCachedAudioUrl(cacheKey, data.audioUrl);
          return data.audioUrl;
        }
      }
    } catch (e: any) {
      clearInterval(msgInterval);
      if (e?.isRateLimit) {
        throw e;
      }
      console.warn('Failed to prepare hash audio, falling back to query route', e);
    } finally {
      clearInterval(msgInterval);
    }

    return `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(lang)}&speed=1.0&deviceId=${encodeURIComponent(deviceId)}`;
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
