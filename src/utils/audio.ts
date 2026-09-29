/**
 * Audio playback and speech synthesis utilities for Multilingual shadowing
 * Supports English, French, Japanese, Spanish, German, Chinese, and other foreign languages.
 */

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let practiceTimer: any = null;
let activeRafId: number | null = null;
let currentPlayId = 0;

export function stopAllAudio() {
  currentPlayId++;
  if (activeRafId) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.onplay = null;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.src = '';
    activeAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    activeUtterance = null;
  }
  if (practiceTimer) {
    clearTimeout(practiceTimer);
    practiceTimer = null;
  }
}

/**
 * Resolves a reliable hash-based audio stream URL for Gemini Native TTS.
 * When speed is 0.75 or 0.5, requests the server to prepare native articulated speech.
 */
async function resolveAudioUrl(
  audioUrl: string | null | undefined,
  text: string,
  lang: string,
  speed: string
): Promise<string> {
  // If already a clean hash URL with matching speed 1.0, return directly
  if (audioUrl && /^\/api\/tts\/[a-f0-9]{64}$/.test(audioUrl) && speed === '1.0') {
    return audioUrl;
  }

  // Request server to prepare hash-based audio via POST (solves URL length limit & query logging)
  try {
    const res = await fetch('/api/tts/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        lang,
        speed,
        voice: 'Kore',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.audioUrl) {
        return data.audioUrl;
      }
    }
  } catch (e) {
    console.warn('Failed to prepare hash audio, falling back to query route', e);
  }

  // Fallback to GET endpoint
  return `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&speed=${encodeURIComponent(speed)}`;
}

/**
 * Play native Gemini TTS audio (/api/tts/:hash) or fallback to Web Speech API
 */
export async function playSentenceAudio({
  audioUrl,
  text,
  lang = 'en-US',
  rate = 1.0,
  onStart,
  onTimeUpdate,
  onEnd,
  onError,
}: {
  audioUrl?: string | null;
  text: string;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onTimeUpdate?: (progress: { currentTime: number; duration: number; ratio: number }) => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}) {
  stopAllAudio();
  const thisPlayId = currentPlayId;

  const cleanText = (text || '').trim();
  if (!cleanText) {
    onEnd?.();
    return;
  }

  const speedParam = rate === 1.0 ? '1.0' : String(rate);
  const targetAudioUrl = await resolveAudioUrl(audioUrl, cleanText, lang, speedParam);

  // If user triggered another sound while we were resolving URL, abort
  if (thisPlayId !== currentPlayId) {
    return;
  }

  try {
    const audio = new Audio(targetAudioUrl);
    audio.playbackRate = 1.0;
    activeAudio = audio;

    const startProgressLoop = () => {
      if (activeRafId) {
        cancelAnimationFrame(activeRafId);
        activeRafId = null;
      }
      const tick = () => {
        if (thisPlayId !== currentPlayId || !activeAudio || activeAudio !== audio || audio.paused || audio.ended) {
          return;
        }
        const currentTime = audio.currentTime;
        const duration = audio.duration;
        if (duration && !isNaN(duration) && duration > 0) {
          const ratio = Math.min(1.0, Math.max(0.0, currentTime / duration));
          onTimeUpdate?.({ currentTime, duration, ratio });
        }
        activeRafId = requestAnimationFrame(tick);
      };
      activeRafId = requestAnimationFrame(tick);
    };

    audio.onplay = () => {
      if (thisPlayId === currentPlayId) {
        onStart?.();
        startProgressLoop();
      }
    };

    audio.ontimeupdate = () => {
      if (thisPlayId === currentPlayId && audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        const currentTime = audio.currentTime;
        const duration = audio.duration;
        const ratio = Math.min(1.0, Math.max(0.0, currentTime / duration));
        onTimeUpdate?.({ currentTime, duration, ratio });
      }
    };

    audio.onended = () => {
      if (thisPlayId === currentPlayId) {
        if (activeRafId) {
          cancelAnimationFrame(activeRafId);
          activeRafId = null;
        }
        activeAudio = null;
        onTimeUpdate?.({ currentTime: audio.duration || 0, duration: audio.duration || 1, ratio: 1.0 });
        onEnd?.();
      }
    };

    audio.onerror = (e) => {
      if (thisPlayId === currentPlayId) {
        if (activeRafId) {
          cancelAnimationFrame(activeRafId);
          activeRafId = null;
        }
        console.warn('Gemini audio playback failed, falling back to Web Speech API', e);
        activeAudio = null;
        speakWebSpeech(cleanText, rate, lang, thisPlayId, onStart, onTimeUpdate, onEnd, onError);
      }
    };

    await audio.play();
  } catch (err) {
    if (thisPlayId === currentPlayId) {
      if (activeRafId) {
        cancelAnimationFrame(activeRafId);
        activeRafId = null;
      }
      console.warn('Audio play error, falling back to Web Speech', err);
      speakWebSpeech(cleanText, rate, lang, thisPlayId, onStart, onTimeUpdate, onEnd, onError);
    }
  }
}

function speakWebSpeech(
  text: string,
  rate: number,
  lang: string = 'en-US',
  playId: number,
  onStart?: () => void,
  onTimeUpdate?: (progress: { currentTime: number; duration: number; ratio: number }) => void,
  onEnd?: () => void,
  onError?: (err: any) => void
) {
  if (playId !== currentPlayId) return;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError?.(new Error('Speech synthesis not supported in this browser'));
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;

  const voices = window.speechSynthesis.getVoices();
  const langPrefix = lang.split(/[-_]/)[0].toLowerCase();

  const matchedVoice =
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
    voices.find((v) => v.lang.toLowerCase().includes(langPrefix));

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => {
    if (playId === currentPlayId) {
      activeUtterance = utterance;
      onStart?.();
      onTimeUpdate?.({ currentTime: 0, duration: 1, ratio: 0 });
    }
  };

  utterance.onboundary = (e) => {
    if (playId === currentPlayId && text.length > 0) {
      const charIndex = e.charIndex || 0;
      const ratio = Math.min(1.0, Math.max(0.0, charIndex / text.length));
      onTimeUpdate?.({ currentTime: charIndex, duration: text.length, ratio });
    }
  };

  utterance.onend = () => {
    if (playId === currentPlayId) {
      activeUtterance = null;
      onTimeUpdate?.({ currentTime: text.length, duration: text.length, ratio: 1.0 });
      onEnd?.();
    }
  };

  utterance.onerror = (err) => {
    if (playId === currentPlayId) {
      activeUtterance = null;
      onError?.(err);
      onEnd?.();
    }
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Play practice track (slow -> pause to repeat -> slow) with configurable rate (0.5x, 0.75x)
 * Uses native Gemini TTS slow speech generation to eliminate mechanical distortion
 */
export async function playPracticeTrack({
  rawAudioUrl,
  text,
  lang = 'en-US',
  rate = 0.75,
  onPhaseChange,
  onTimeUpdate,
  onEnd,
}: {
  practiceAudioUrl?: string | null;
  rawAudioUrl?: string | null;
  text: string;
  lang?: string;
  rate?: number;
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void;
  onTimeUpdate?: (progress: { currentTime: number; duration: number; ratio: number }) => void;
  onEnd?: () => void;
}) {
  stopAllAudio();
  const thisPlayId = currentPlayId;
  runClientPracticeLoop(rawAudioUrl, text, lang, rate, thisPlayId, onPhaseChange, onTimeUpdate, onEnd);
}

function runClientPracticeLoop(
  rawAudioUrl: string | null | undefined,
  text: string,
  lang: string = 'en-US',
  rate: number = 0.75,
  playId: number,
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void,
  onTimeUpdate?: (progress: { currentTime: number; duration: number; ratio: number }) => void,
  onEnd?: () => void
) {
  if (playId !== currentPlayId) return;

  // Step 1: play at specified practice rate (0.5x or 0.75x)
  onPhaseChange?.('playing1');
  const startTime = Date.now();

  playSentenceAudio({
    audioUrl: rawAudioUrl,
    text,
    lang,
    rate,
    onTimeUpdate,
    onEnd: () => {
      if (playId !== currentPlayId) return;

      const duration = (Date.now() - startTime) / 1000;
      const pauseDuration = Math.max(2500, duration * 1250);

      // Step 2: pause for student shadowing
      onPhaseChange?.('pause');

      practiceTimer = setTimeout(() => {
        if (playId !== currentPlayId) return;

        // Step 3: repeat at practice rate
        onPhaseChange?.('playing2');
        playSentenceAudio({
          audioUrl: rawAudioUrl,
          text,
          lang,
          rate,
          onTimeUpdate,
          onEnd: () => {
            if (playId === currentPlayId) {
              onPhaseChange?.('idle');
              onEnd?.();
            }
          },
        });
      }, pauseDuration);
    },
    onError: () => {
      if (playId === currentPlayId) {
        onPhaseChange?.('idle');
        onEnd?.();
      }
    },
  });
}
