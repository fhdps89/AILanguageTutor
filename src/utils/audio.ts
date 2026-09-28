/**
 * Audio playback and speech synthesis utilities for Multilingual shadowing
 * Supports English, French, Japanese, Spanish, German, Chinese, and other foreign languages.
 */

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let practiceTimer: any = null;

export function stopAllAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
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
 * Play native Gemini TTS audio (/api/tts) or fallback to Web Speech API
 */
export async function playSentenceAudio({
  audioUrl,
  text,
  lang = 'en-US',
  rate = 1.0,
  onStart,
  onEnd,
  onError,
}: {
  audioUrl?: string | null;
  text: string;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}) {
  stopAllAudio();

  const cleanText = (text || '').trim();
  if (!cleanText) {
    onEnd?.();
    return;
  }

  // Construct target audio URL:
  // When rate is 0.75 or 0.5, request Gemini TTS to speak at that exact pace natively
  // without browser DSP time-stretching (eliminates crackling / "지지직" robotic noise).
  const speedParam = rate === 1.0 ? '1.0' : String(rate);
  let targetAudioUrl: string;

  if (audioUrl && audioUrl.includes('/api/tts')) {
    const base = audioUrl.replace(/([?&])(speed|rate)=[^&]*/g, '$1').replace(/[?&]$/, '');
    const cleanSep = base.includes('?') ? '&' : '?';
    targetAudioUrl = `${base}${cleanSep}speed=${speedParam}`;
  } else if (!audioUrl || rate !== 1.0) {
    targetAudioUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(lang)}&speed=${speedParam}`;
  } else {
    targetAudioUrl = audioUrl;
  }

  try {
    const audio = new Audio(targetAudioUrl);
    // Since Gemini TTS itself articulates naturally at the target speed,
    // playbackRate stays 1.0 to preserve pristine acoustic quality without distortion.
    audio.playbackRate = 1.0;
    activeAudio = audio;

    audio.onplay = () => onStart?.();
    audio.onended = () => {
      activeAudio = null;
      onEnd?.();
    };
    audio.onerror = (e) => {
      console.warn('Gemini audio playback failed, falling back to Web Speech API', e);
      activeAudio = null;
      speakWebSpeech(cleanText, rate, lang, onStart, onEnd, onError);
    };

    await audio.play();
    return;
  } catch (err) {
    console.warn('Audio play error, falling back to Web Speech', err);
    speakWebSpeech(cleanText, rate, lang, onStart, onEnd, onError);
  }
}

function speakWebSpeech(
  text: string,
  rate: number,
  lang: string = 'en-US',
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void
) {
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

  // Find most matching voice: exact match -> prefix match -> fuzzy match
  const matchedVoice =
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
    voices.find((v) => v.lang.toLowerCase().includes(langPrefix));

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => {
    activeUtterance = utterance;
    onStart?.();
  };
  utterance.onend = () => {
    activeUtterance = null;
    onEnd?.();
  };
  utterance.onerror = (err) => {
    activeUtterance = null;
    onError?.(err);
    onEnd?.();
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
  onEnd,
}: {
  practiceAudioUrl?: string | null;
  rawAudioUrl?: string | null;
  text: string;
  lang?: string;
  rate?: number;
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void;
  onEnd?: () => void;
}) {
  stopAllAudio();
  runClientPracticeLoop(rawAudioUrl, text, lang, rate, onPhaseChange, onEnd);
}

function runClientPracticeLoop(
  rawAudioUrl: string | null | undefined,
  text: string,
  lang: string = 'en-US',
  rate: number = 0.75,
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void,
  onEnd?: () => void
) {
  // Step 1: play at specified practice rate (0.5x or 0.75x)
  onPhaseChange?.('playing1');
  const startTime = Date.now();

  playSentenceAudio({
    audioUrl: rawAudioUrl,
    text,
    lang,
    rate,
    onEnd: () => {
      const duration = (Date.now() - startTime) / 1000;
      // Generous pause duration for shadowing: minimum 2.5s or 1.25x the spoken duration
      const pauseDuration = Math.max(2500, duration * 1250);

      // Step 2: pause for student shadowing
      onPhaseChange?.('pause');

      practiceTimer = setTimeout(() => {
        // Step 3: repeat at practice rate
        onPhaseChange?.('playing2');
        playSentenceAudio({
          audioUrl: rawAudioUrl,
          text,
          lang,
          rate,
          onEnd: () => {
            onPhaseChange?.('idle');
            onEnd?.();
          },
        });
      }, pauseDuration);
    },
    onError: () => {
      onPhaseChange?.('idle');
      onEnd?.();
    },
  });
}
