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
 * Play an MP3 url or fallback to Web Speech API in the target language
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

  // Try playing pre-rendered MP3 if provided
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      activeAudio = audio;

      audio.onplay = () => onStart?.();
      audio.onended = () => {
        activeAudio = null;
        onEnd?.();
      };
      audio.onerror = (e) => {
        console.warn('MP3 playback failed, falling back to Web Speech API', e);
        activeAudio = null;
        speakWebSpeech(text, rate, lang, onStart, onEnd, onError);
      };

      await audio.play();
      return;
    } catch (err) {
      console.warn('Audio play error, falling back to Web Speech', err);
    }
  }

  // Fallback to Web Speech API
  speakWebSpeech(text, rate, lang, onStart, onEnd, onError);
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
 * Play 0.75x practice track (slow -> pause to repeat -> slow)
 */
export async function playPracticeTrack({
  practiceAudioUrl,
  rawAudioUrl,
  text,
  lang = 'en-US',
  onPhaseChange,
  onEnd,
}: {
  practiceAudioUrl?: string | null;
  rawAudioUrl?: string | null;
  text: string;
  lang?: string;
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void;
  onEnd?: () => void;
}) {
  stopAllAudio();

  // If a pre-generated practice MP3 exists on server
  if (practiceAudioUrl) {
    try {
      const audio = new Audio(practiceAudioUrl);
      activeAudio = audio;
      onPhaseChange?.('playing1');

      audio.onended = () => {
        activeAudio = null;
        onPhaseChange?.('idle');
        onEnd?.();
      };
      audio.onerror = () => {
        // Fallback to client-side practice loop
        activeAudio = null;
        runClientPracticeLoop(rawAudioUrl, text, lang, onPhaseChange, onEnd);
      };

      await audio.play();
      return;
    } catch {
      // Fallback
    }
  }

  runClientPracticeLoop(rawAudioUrl, text, lang, onPhaseChange, onEnd);
}

function runClientPracticeLoop(
  rawAudioUrl: string | null | undefined,
  text: string,
  lang: string = 'en-US',
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void,
  onEnd?: () => void
) {
  // Step 1: play 0.75x
  onPhaseChange?.('playing1');
  const startTime = Date.now();

  playSentenceAudio({
    audioUrl: rawAudioUrl,
    text,
    lang,
    rate: 0.75,
    onEnd: () => {
      const duration = (Date.now() - startTime) / 1000;
      const pauseDuration = Math.max(2000, duration * 1200);

      // Step 2: pause for student shadowing
      onPhaseChange?.('pause');

      practiceTimer = setTimeout(() => {
        // Step 3: repeat 0.75x
        onPhaseChange?.('playing2');
        playSentenceAudio({
          audioUrl: rawAudioUrl,
          text,
          lang,
          rate: 0.75,
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
