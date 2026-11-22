export type RecorderStatus =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'permission_denied'
  | 'ready'
  | 'cleanup';

export type RecorderPlayingTarget =
  | 'none'
  | 'original'
  | 'self'
  | 'compare_original'
  | 'compare_gap'
  | 'compare_self';

export interface RecorderState {
  status: RecorderStatus;
  elapsedSec: number;
  objectUrl: string | null;
  mimeType: string | null;
  playingTarget: RecorderPlayingTarget;
  errorReason: string | null;
}

export type RecorderAction =
  | { type: 'REQUEST_PERMISSION' }
  | { type: 'PERMISSION_DENIED'; reason: string }
  | { type: 'RECORDING_STARTED'; mimeType?: string | null }
  | { type: 'TICK_RECORDING' }
  | { type: 'RECORDING_READY'; objectUrl: string; mimeType?: string | null }
  | { type: 'RECORDING_FAILED'; reason: string }
  | { type: 'SET_PLAYING'; target: RecorderPlayingTarget }
  | { type: 'START_CLEANUP' }
  | { type: 'RESET_IDLE' };

export const MAX_RECORDING_SECONDS = 30;

export function createInitialRecorderState(): RecorderState {
  return {
    status: 'idle',
    elapsedSec: 0,
    objectUrl: null,
    mimeType: null,
    playingTarget: 'none',
    errorReason: null,
  };
}

export function recorderReducer(
  state: RecorderState,
  action: RecorderAction
): RecorderState {
  switch (action.type) {
    case 'REQUEST_PERMISSION': {
      return {
        ...state,
        status: 'requesting_permission',
        elapsedSec: 0,
        playingTarget: 'none',
        errorReason: null,
      };
    }

    case 'PERMISSION_DENIED': {
      return {
        ...state,
        status: 'permission_denied',
        elapsedSec: 0,
        playingTarget: 'none',
        errorReason: action.reason,
      };
    }

    case 'RECORDING_STARTED': {
      return {
        ...state,
        status: 'recording',
        elapsedSec: 0,
        objectUrl: null,
        mimeType: action.mimeType ?? null,
        playingTarget: 'none',
        errorReason: null,
      };
    }

    case 'TICK_RECORDING': {
      if (state.status !== 'recording') return state;
      return {
        ...state,
        elapsedSec: Math.min(MAX_RECORDING_SECONDS, state.elapsedSec + 1),
      };
    }

    case 'RECORDING_READY': {
      return {
        ...state,
        status: 'ready',
        objectUrl: action.objectUrl,
        mimeType: action.mimeType ?? state.mimeType,
        playingTarget: 'none',
        errorReason: null,
      };
    }

    case 'RECORDING_FAILED': {
      return {
        ...state,
        status: 'idle',
        elapsedSec: 0,
        objectUrl: null,
        playingTarget: 'none',
        errorReason: action.reason,
      };
    }

    case 'SET_PLAYING': {
      if (state.status !== 'ready') return state;
      return {
        ...state,
        playingTarget: action.target,
      };
    }

    case 'START_CLEANUP': {
      return {
        ...state,
        status: 'cleanup',
        playingTarget: 'none',
      };
    }

    case 'RESET_IDLE': {
      return {
        status: 'idle',
        elapsedSec: 0,
        objectUrl: null,
        mimeType: null,
        playingTarget: 'none',
        errorReason: null,
      };
    }

    default:
      return state;
  }
}
