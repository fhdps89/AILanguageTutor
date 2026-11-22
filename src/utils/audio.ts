/**
 * Audio playback and speech synthesis utilities for Multilingual shadowing
 * Supports English, French, Japanese, Spanish, German, Chinese, and other foreign languages.
 */

import { DEFAULT_TTS_VOICE, resolveAudioUrl } from './audioCache';
import { AudioChannel, audioCoordinator } from './audioCoordinator';

// Global reusable audio element to satisfy iOS Safari autoplay / sequential playback restrictions
let sharedAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let practiceTimer: any = null;
let activeRafId: number | null = null;
let currentPlayId = 0;

let activeEngine: 'html5' | 'webspeech' | null = null;
let pausedPlayId: number | null = null;
let activeClaim: { channel: AudioChannel; ownerId: string } | null = null;
let unregisterActiveClaim: (() => void) | null = null;
let activeOnPreempt: (() => void) | null = null;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('ai_tutor_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('ai_tutor_device_id', id);
    }
    return id;
  } catch {
    return 'dev_default';
  }
}

// 서버가 쿠키에 보관한 기기 번호로 맞춘다. 사파리가 오래 안 온 사이트의 저장소를 지워도 같은 기기로 남는다.
// 2초 안에 응답이 없거나 실패하면 아무것도 바꾸지 않고 넘어간다.
export async function syncDeviceId(): Promise<void> {
  try {
    const current = getDeviceId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch('/api/device/sync', {
        method: 'POST',
        headers: { 'x-device-id': current },
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      const synced = data?.deviceId;
      if (typeof synced === 'string' && /^dev_[a-z0-9]{1,36}$/.test(synced) && synced !== current) {
        localStorage.setItem('ai_tutor_device_id', synced);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // 서버가 없거나 저장소를 못 쓰는 환경이면 지금 번호를 그대로 쓴다
  }
}

function getSharedAudio(): HTMLAudioElement {
  if (typeof window === 'undefined') {
    return {} as HTMLAudioElement;
  }
  if (!sharedAudio) {
    sharedAudio = new Audio();
    // iOS Safari audio properties
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

function stopMediaOnly() {
  currentPlayId++;
  activeEngine = null;
  pausedPlayId = null;
  if (activeRafId) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    } catch {}
    sharedAudio.onplay = null;
    sharedAudio.ontimeupdate = null;
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
  }
  if (activeUtterance) {
    activeUtterance.onstart = null;
    activeUtterance.onboundary = null;
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (practiceTimer) {
    clearTimeout(practiceTimer);
    practiceTimer = null;
  }
}

function releaseActiveRegistration() {
  const claim = activeClaim;
  const unreg = unregisterActiveClaim;
  activeClaim = null;
  unregisterActiveClaim = null;
  activeOnPreempt = null;
  if (unreg) {
    unreg();
  } else if (claim) {
    audioCoordinator.release(claim.channel, claim.ownerId);
  }
}

export function stopAllAudio() {
  const prevPreempt = activeOnPreempt;
  stopMediaOnly();
  releaseActiveRegistration();
  if (prevPreempt) {
    try {
      prevPreempt();
    } catch {}
  }
}

/**
 * Pause currently playing shared audio while keeping playId intact.
 * Returns true if active playback (HTML5 or Web Speech) was paused.
 */
export function pauseActiveAudio(): boolean {
  if (activeRafId) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }

  if (activeEngine === 'html5' && sharedAudio && !sharedAudio.paused && !sharedAudio.ended) {
    try {
      sharedAudio.pause();
      pausedPlayId = currentPlayId;
      return true;
    } catch {
      return false;
    }
  }

  if (activeEngine === 'webspeech') {
    if (activeUtterance) {
      activeUtterance.onstart = null;
      activeUtterance.onboundary = null;
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    pausedPlayId = currentPlayId;
    return true;
  }

  return false;
}

/**
 * Resume paused shared audio. Returns false if Web Speech was active (caller restarts sentence)
 * or if the paused playback is no longer valid.
 */
export async function resumeActiveAudio(): Promise<boolean> {
  if (activeEngine === 'webspeech') {
    activeEngine = null;
    pausedPlayId = null;
    return false;
  }

  if (
    activeEngine === 'html5' &&
    pausedPlayId === currentPlayId &&
    sharedAudio &&
    sharedAudio.src &&
    !sharedAudio.ended
  ) {
    pausedPlayId = null;
    try {
      await sharedAudio.play();
      return true;
    } catch {
      return false;
    }
  }

  pausedPlayId = null;
  return false;
}

/**
 * Play native Gemini TTS audio (/api/tts/:hash at 1.0x) with client playbackRate
 * or fallback to Web Speech API
 */
export async function playSentenceAudio({
  audioUrl,
  text,
  lang = 'en-US',
  rate = 1.0,
  channel = 'tts',
  ownerId,
  onPreparing,
  onStart,
  onTimeUpdate,
  onEnd,
  onComplete,
  onError,
  onPreempt,
}: {
  audioUrl?: string | null;
  text: string;
  lang?: string;
  rate?: number;
  channel?: AudioChannel;
  ownerId?: string;
  onPreparing?: (message: string) => void;
  onStart?: () => void;
  onTimeUpdate?: (progress: { currentTime: number; duration: number; ratio: number }) => void;
  onEnd?: () => void;
  /** Called only when playback reached its natural end (never on stop, error, or rate limit). */
  onComplete?: (info: { voice: 'ai' | 'browser'; durationSec?: number }) => void;
  onError?: (err: any) => void;
  onPreempt?: () => void;
}) {
  // Clean up any prior playback without firing a stale preempt handler into the new one unless needed
  const prevPreempt = activeOnPreempt;
  const prevClaim = activeClaim;
  stopMediaOnly();
  releaseActiveRegistration();

  const resolvedOwnerId = ownerId || `${channel}-player`;
  if (prevPreempt && (!prevClaim || prevClaim.ownerId !== resolvedOwnerId || prevClaim.channel !== channel)) {
    try {
      prevPreempt();
    } catch {}
  }

  const cleanText = (text || '').trim();
  if (!cleanText) {
    onEnd?.();
    return;
  }

  activeOnPreempt = onPreempt ?? null;
  activeClaim = { channel, ownerId: resolvedOwnerId };
  unregisterActiveClaim = audioCoordinator.register(channel, resolvedOwnerId, () => {
    const cb = activeOnPreempt;
    stopMediaOnly();
    activeClaim = null;
    unregisterActiveClaim = null;
    activeOnPreempt = null;
    if (cb) {
      try {
        cb();
      } catch {}
    }
  });
  audioCoordinator.claim(channel, resolvedOwnerId);

  const thisPlayId = currentPlayId;
  let targetAudioUrl: string;

  try {
    targetAudioUrl = await resolveAudioUrl({
      audioUrl,
      text: cleanText,
      lang,
      voice: DEFAULT_TTS_VOICE,
      deviceId: getDeviceId(),
      onPreparing,
    });
  } catch (err: any) {
    if (thisPlayId === currentPlayId) {
      if (activeRafId) {
        cancelAnimationFrame(activeRafId);
        activeRafId = null;
      }
      releaseActiveRegistration();
      onError?.(err);
      onEnd?.();
    }
    return;
  }

  // If user triggered another sound or preempted while we were resolving URL, abort
  if (thisPlayId !== currentPlayId) {
    return;
  }

  try {
    const audio = getSharedAudio();
    const applyPlaybackRate = () => {
      const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
      audio.defaultPlaybackRate = safeRate;
      audio.playbackRate = safeRate;
      (audio as any).preservesPitch = true;
      (audio as any).mozPreservesPitch = true;
      (audio as any).webkitPreservesPitch = true;
    };

    audio.src = targetAudioUrl;
    applyPlaybackRate();

    const startProgressLoop = () => {
      if (activeRafId) {
        cancelAnimationFrame(activeRafId);
        activeRafId = null;
      }
      const tick = () => {
        if (thisPlayId !== currentPlayId || audio.paused || audio.ended) {
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
        activeEngine = 'html5';
        pausedPlayId = null;
        applyPlaybackRate();
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
        activeEngine = null;
        pausedPlayId = null;
        const rawDuration = audio.duration;
        const durationSec = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined;
        releaseActiveRegistration();
        onTimeUpdate?.({ currentTime: audio.duration || 0, duration: audio.duration || 1, ratio: 1.0 });
        onEnd?.();
        onComplete?.({ voice: 'ai', durationSec });
      }
    };

    audio.onerror = async (e) => {
      if (thisPlayId === currentPlayId) {
        if (activeRafId) {
          cancelAnimationFrame(activeRafId);
          activeRafId = null;
        }
        activeEngine = null;
        pausedPlayId = null;

        // If fallback query returned 429, don't secretly fall back to Web Speech
        if (targetAudioUrl.includes('/api/tts?')) {
          try {
            const probeRes = await fetch(targetAudioUrl);
            if (probeRes.status === 429) {
              const probeData = await probeRes.json().catch(() => ({}));
              const msg =
                probeData.error ||
                (probeData.code === 'TTS_GLOBAL_LIMIT'
                  ? '오늘은 많은 분이 이용해서 음성이 잠시 쉬고 있어요. 내일 다시 와 주세요.'
                  : '오늘 들을 수 있는 음성을 모두 사용했어요. 내일 다시 이용해 주세요.');
              window.dispatchEvent(
                new CustomEvent('ai-tutor-rate-limit', {
                  detail: { message: msg, code: probeData.code || 'TTS_DEVICE_LIMIT' },
                })
              );
              releaseActiveRegistration();
              onError?.(new Error(msg));
              onEnd?.();
              return;
            }
          } catch {}
        }

        console.warn('Gemini audio playback failed, falling back to Web Speech API', e);
        speakWebSpeech(cleanText, rate, lang, thisPlayId, onStart, onTimeUpdate, onEnd, onError, onComplete);
      }
    };

    audio.load();
    applyPlaybackRate();
    await audio.play();
  } catch (err: any) {
    if (thisPlayId === currentPlayId) {
      if (activeRafId) {
        cancelAnimationFrame(activeRafId);
        activeRafId = null;
      }
      activeEngine = null;
      pausedPlayId = null;
      if (err?.isRateLimit) {
        releaseActiveRegistration();
        onError?.(err);
        onEnd?.();
        return;
      }
      console.warn('Audio play error, falling back to Web Speech', err);
      speakWebSpeech(cleanText, rate, lang, thisPlayId, onStart, onTimeUpdate, onEnd, onError, onComplete);
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
  onError?: (err: any) => void,
  onComplete?: (info: { voice: 'ai' | 'browser'; durationSec?: number }) => void
) {
  if (playId !== currentPlayId) return;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    releaseActiveRegistration();
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

  let wallStartMs = Date.now();

  utterance.onstart = () => {
    if (playId === currentPlayId) {
      activeUtterance = utterance;
      activeEngine = 'webspeech';
      pausedPlayId = null;
      wallStartMs = Date.now();
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
      activeEngine = null;
      pausedPlayId = null;
      const durationSec = Math.max(0, (Date.now() - wallStartMs) / 1000);
      releaseActiveRegistration();
      onTimeUpdate?.({ currentTime: text.length, duration: text.length, ratio: 1.0 });
      onEnd?.();
      onComplete?.({ voice: 'browser', durationSec });
    }
  };

  utterance.onerror = (err) => {
    if (playId === currentPlayId) {
      activeUtterance = null;
      activeEngine = null;
      pausedPlayId = null;
      releaseActiveRegistration();
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
  onPreparing,
  onPhaseChange,
  onTimeUpdate,
  onEnd,
}: {
  practiceAudioUrl?: string | null;
  rawAudioUrl?: string | null;
  text: string;
  lang?: string;
  rate?: number;
  onPreparing?: (message: string) => void;
  onPhaseChange?: (phase: 'playing1' | 'pause' | 'playing2' | 'idle') => void;
  onTimeUpdate?: (progress: { currentTime: number; duration: number; ratio: number }) => void;
  onEnd?: () => void;
}) {
  stopAllAudio();
  const thisPlayId = currentPlayId;
  runClientPracticeLoop(rawAudioUrl, text, lang, rate, thisPlayId, onPreparing, onPhaseChange, onTimeUpdate, onEnd);
}

function runClientPracticeLoop(
  rawAudioUrl: string | null | undefined,
  text: string,
  lang: string = 'en-US',
  rate: number = 0.75,
  playId: number,
  onPreparing?: (message: string) => void,
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
    onPreparing,
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
          onPreparing,
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
