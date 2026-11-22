export type SchedulerPhase =
  | 'idle'
  | 'playing_tts'
  | 'short_gap'
  | 'shadowing_pause'
  | 'paused';

export type SchedulerMode = 'listen' | 'shadowing';
export type RepeatTarget = 1 | 3 | 'infinite';

export const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
] as const;

export function calculateShadowingPauseMs(durationSec: number, playbackRate: number): number {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  return Math.max(2000, Math.round((safeDuration / rate) * 1000 * 1.2));
}

export function getListenGapMs(playbackRate: number): number {
  if (playbackRate === 1.0) return 350;
  if (playbackRate === 0.75) return 420;
  return 500;
}

export interface LoopDecision {
  done: boolean;
  nextIndex: number;
  nextRepeat: number;
}

export function decideLoop({
  currentIndex,
  totalSentences,
  currentRepeat,
  repeatTarget,
}: {
  currentIndex: number;
  totalSentences: number;
  currentRepeat: number;
  repeatTarget: RepeatTarget;
}): LoopDecision {
  if (!Number.isFinite(totalSentences) || totalSentences <= 0) {
    return { done: true, nextIndex: 0, nextRepeat: currentRepeat };
  }

  const safeIndex = Math.max(0, Math.floor(currentIndex));
  const safeRepeat = Math.max(1, Math.floor(currentRepeat));

  // Per-sentence repeats: stay on the same sentence until the target is met,
  // then move to the next sentence (work order 5-2 loop_check).
  if (repeatTarget === 'infinite' || safeRepeat < repeatTarget) {
    return {
      done: false,
      nextIndex: safeIndex,
      nextRepeat: safeRepeat + 1,
    };
  }

  if (safeIndex + 1 < totalSentences) {
    return {
      done: false,
      nextIndex: safeIndex + 1,
      nextRepeat: 1,
    };
  }

  return {
    done: true,
    nextIndex: 0,
    nextRepeat: safeRepeat,
  };
}

export function getSupportedRecorderMimeType(
  mediaRecorderCtor?: { isTypeSupported?: (mime: string) => boolean } | null
): string | undefined {
  const ctor =
    mediaRecorderCtor !== undefined
      ? mediaRecorderCtor
      : typeof MediaRecorder !== 'undefined'
      ? MediaRecorder
      : null;

  if (!ctor || typeof ctor.isTypeSupported !== 'function') {
    return undefined;
  }

  for (const mime of RECORDER_MIME_CANDIDATES) {
    try {
      if (ctor.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // Ignore probe errors and try next candidate
    }
  }

  return undefined;
}

export function formatSeconds(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatRemainingTenths(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return (safeMs / 1000).toFixed(1);
}

export interface SchedulerState {
  phase: SchedulerPhase;
  pausedFromPhase: 'playing_tts' | 'short_gap' | 'shadowing_pause' | null;
  mode: SchedulerMode;
  playbackRate: number;
  repeatTarget: RepeatTarget;
  currentIndex: number;
  currentRepeat: number;
  totalSentences: number;
  pauseTotalMs: number;
  pauseRemainingMs: number;
  gapMs: number;
}

export type SchedulerAction =
  | { type: 'START'; index?: number; totalSentences?: number }
  | { type: 'AUDIO_COMPLETE'; durationSec: number; effectiveRate: number }
  | { type: 'AUDIO_ERROR' }
  | { type: 'TICK_PAUSE'; elapsedMs: number }
  | { type: 'PAUSE_COMPLETE' }
  | { type: 'SKIP_PAUSE' }
  | { type: 'GAP_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SET_MODE'; mode: SchedulerMode }
  | { type: 'SET_RATE'; playbackRate: number }
  | { type: 'SET_REPEAT_TARGET'; repeatTarget: RepeatTarget }
  | { type: 'SET_TOTAL_SENTENCES'; totalSentences: number }
  | { type: 'NEXT' };

export function createInitialSchedulerState(
  overrides: Partial<SchedulerState> = {}
): SchedulerState {
  return {
    phase: 'idle',
    pausedFromPhase: null,
    mode: 'listen',
    playbackRate: 1.0,
    repeatTarget: 1,
    currentIndex: 0,
    currentRepeat: 1,
    totalSentences: 0,
    pauseTotalMs: 0,
    pauseRemainingMs: 0,
    gapMs: 350,
    ...overrides,
  };
}

function advanceAfterStep(state: SchedulerState): SchedulerState {
  const decision = decideLoop({
    currentIndex: state.currentIndex,
    totalSentences: state.totalSentences,
    currentRepeat: state.currentRepeat,
    repeatTarget: state.repeatTarget,
  });

  if (decision.done) {
    return {
      ...state,
      phase: 'idle',
      pausedFromPhase: null,
      currentIndex: 0,
      currentRepeat: 1,
      pauseTotalMs: 0,
      pauseRemainingMs: 0,
    };
  }

  return {
    ...state,
    phase: 'playing_tts',
    pausedFromPhase: null,
    currentIndex: decision.nextIndex,
    currentRepeat: decision.nextRepeat,
    pauseTotalMs: 0,
    pauseRemainingMs: 0,
  };
}

export function schedulerReducer(
  state: SchedulerState,
  action: SchedulerAction
): SchedulerState {
  switch (action.type) {
    case 'START': {
      const total = action.totalSentences ?? state.totalSentences;
      if (total <= 0) {
        return {
          ...state,
          phase: 'idle',
          pausedFromPhase: null,
          totalSentences: total,
          currentIndex: 0,
          currentRepeat: 1,
          pauseTotalMs: 0,
          pauseRemainingMs: 0,
        };
      }
      const rawIdx = action.index ?? 0;
      const startIndex = rawIdx >= 0 && rawIdx < total ? rawIdx : 0;
      return {
        ...state,
        phase: 'playing_tts',
        pausedFromPhase: null,
        totalSentences: total,
        currentIndex: startIndex,
        currentRepeat: 1,
        pauseTotalMs: 0,
        pauseRemainingMs: 0,
      };
    }

    case 'AUDIO_COMPLETE': {
      if (state.phase !== 'playing_tts') return state;
      if (state.mode === 'shadowing') {
        const pauseMs = calculateShadowingPauseMs(action.durationSec, action.effectiveRate);
        return {
          ...state,
          phase: 'shadowing_pause',
          pausedFromPhase: null,
          pauseTotalMs: pauseMs,
          pauseRemainingMs: pauseMs,
        };
      }
      const gapMs = getListenGapMs(state.playbackRate);
      return {
        ...state,
        phase: 'short_gap',
        pausedFromPhase: null,
        gapMs,
        pauseTotalMs: gapMs,
        pauseRemainingMs: gapMs,
      };
    }

    case 'AUDIO_ERROR': {
      if (state.phase !== 'playing_tts') return state;
      if (state.mode === 'shadowing') {
        const pauseMs = calculateShadowingPauseMs(0, state.playbackRate);
        return {
          ...state,
          phase: 'shadowing_pause',
          pausedFromPhase: null,
          pauseTotalMs: pauseMs,
          pauseRemainingMs: pauseMs,
        };
      }
      return {
        ...state,
        phase: 'short_gap',
        pausedFromPhase: null,
        gapMs: 300,
        pauseTotalMs: 300,
        pauseRemainingMs: 300,
      };
    }

    case 'TICK_PAUSE': {
      if (state.phase !== 'shadowing_pause' && state.phase !== 'short_gap') {
        return state;
      }
      const delta = Number.isFinite(action.elapsedMs) && action.elapsedMs > 0 ? action.elapsedMs : 0;
      const nextRemaining = Math.max(0, state.pauseRemainingMs - delta);
      if (nextRemaining === 0) {
        return advanceAfterStep(state);
      }
      return {
        ...state,
        pauseRemainingMs: nextRemaining,
      };
    }

    case 'PAUSE_COMPLETE':
    case 'SKIP_PAUSE': {
      if (state.phase !== 'shadowing_pause') return state;
      return advanceAfterStep(state);
    }

    case 'GAP_COMPLETE': {
      if (state.phase !== 'short_gap') return state;
      return advanceAfterStep(state);
    }

    case 'PAUSE': {
      if (
        state.phase !== 'playing_tts' &&
        state.phase !== 'short_gap' &&
        state.phase !== 'shadowing_pause'
      ) {
        return state;
      }
      return {
        ...state,
        phase: 'paused',
        pausedFromPhase: state.phase,
      };
    }

    case 'RESUME': {
      if (state.phase !== 'paused' || !state.pausedFromPhase) return state;
      return {
        ...state,
        phase: state.pausedFromPhase,
        pausedFromPhase: null,
      };
    }

    case 'STOP': {
      return {
        ...state,
        phase: 'idle',
        pausedFromPhase: null,
        currentIndex: 0,
        currentRepeat: 1,
        pauseTotalMs: 0,
        pauseRemainingMs: 0,
      };
    }

    case 'SET_MODE': {
      return {
        ...state,
        mode: action.mode,
      };
    }

    case 'SET_RATE': {
      return {
        ...state,
        playbackRate: action.playbackRate,
      };
    }

    case 'SET_REPEAT_TARGET': {
      return {
        ...state,
        repeatTarget: action.repeatTarget,
      };
    }

    case 'SET_TOTAL_SENTENCES': {
      return {
        ...state,
        totalSentences: action.totalSentences,
      };
    }

    case 'NEXT': {
      if (state.phase === 'idle') return state;
      if (state.currentIndex + 1 < state.totalSentences) {
        return {
          ...state,
          phase: 'playing_tts',
          pausedFromPhase: null,
          currentIndex: state.currentIndex + 1,
          currentRepeat: 1,
          pauseTotalMs: 0,
          pauseRemainingMs: 0,
        };
      }
      return {
        ...state,
        phase: 'idle',
        pausedFromPhase: null,
        currentIndex: 0,
        currentRepeat: 1,
        pauseTotalMs: 0,
        pauseRemainingMs: 0,
      };
    }

    default:
      return state;
  }
}
