import React, { useEffect, useId, useReducer, useRef, useState } from 'react';
import { Mic, Square, Volume2, Play, RotateCcw, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { audioCoordinator } from '../utils/audioCoordinator';
import { playSentenceAudio, stopAllAudio } from '../utils/audio';
import { formatSeconds, getSupportedRecorderMimeType } from '../utils/shadowingScheduler';
import {
  MAX_RECORDING_SECONDS,
  createInitialRecorderState,
  recorderReducer,
} from '../utils/shadowingRecorderMachine';

interface ShadowingRecorderProps {
  sentenceId: string;
  textToSpeak: string;
  langParam: string;
  rawAudioUrl?: string | null;
  preferredRate: 1.0 | 0.75 | 0.5;
}

const DEFAULT_LEVELS = [0.22, 0.35, 0.5, 0.4, 0.3, 0.22];

function getCapabilityError(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.isSecureContext === false) {
    return 'HTTPS 보안 연결에서만 녹음 기능을 사용할 수 있어요.';
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return '이 브라우저에서는 마이크 녹음을 지원하지 않아요.';
  }
  if (typeof MediaRecorder === 'undefined') {
    return '이 브라우저에서는 오디오 녹음기(MediaRecorder)를 사용할 수 없어요.';
  }
  return null;
}

export const ShadowingRecorder: React.FC<ShadowingRecorderProps> = ({
  sentenceId,
  textToSpeak,
  langParam,
  rawAudioUrl,
  preferredRate,
}) => {
  const instanceId = useId();
  const recOwnerId = `recorder-rec-${sentenceId}-${instanceId}`;
  const selfOwnerId = `recorder-self-${sentenceId}-${instanceId}`;
  const origOwnerId = `recorder-orig-${sentenceId}-${instanceId}`;

  const [state, dispatch] = useReducer(recorderReducer, undefined, createInitialRecorderState);
  const [levels, setLevels] = useState<number[]>(DEFAULT_LEVELS);
  const capabilityError = getCapabilityError();

  const isMountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const selfAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const compareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const compareRunIdRef = useRef(0);
  const discardOnStopRef = useRef(false);

  const revokeCurrentUrl = () => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {}
      objectUrlRef.current = null;
    }
  };

  const stopStreamTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
  };

  const stopLevelMeter = () => {
    if (levelRafRef.current !== null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    setLevels(DEFAULT_LEVELS);
  };

  const clearRecordInterval = () => {
    if (recordIntervalRef.current !== null) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  };

  const clearCompareTimer = () => {
    if (compareTimerRef.current !== null) {
      clearTimeout(compareTimerRef.current);
      compareTimerRef.current = null;
    }
  };

  const stopSelfAudioOnly = () => {
    if (selfAudioRef.current) {
      try {
        selfAudioRef.current.pause();
        selfAudioRef.current.currentTime = 0;
      } catch {}
      selfAudioRef.current.onended = null;
      selfAudioRef.current.onerror = null;
      selfAudioRef.current = null;
    }
  };

  const stopPlaybackSession = (releaseSelfClaim = true) => {
    compareRunIdRef.current += 1;
    clearCompareTimer();
    stopSelfAudioOnly();
    if (releaseSelfClaim) {
      audioCoordinator.release('self_playback', selfOwnerId);
    }
    if (isMountedRef.current) {
      dispatch({ type: 'SET_PLAYING', target: 'none' });
    }
  };

  const stopActiveRecording = (discard = false) => {
    clearRecordInterval();
    stopLevelMeter();
    discardOnStopRef.current = discard;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        stopStreamTracks();
        audioCoordinator.release('recording', recOwnerId);
      }
    } else {
      stopStreamTracks();
      audioCoordinator.release('recording', recOwnerId);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    dispatch({ type: 'RESET_IDLE' });

    const unregRec = audioCoordinator.register('recording', recOwnerId, () => {
      stopActiveRecording(false);
    });

    const unregSelf = audioCoordinator.register('self_playback', selfOwnerId, () => {
      stopPlaybackSession(false);
    });

    return () => {
      isMountedRef.current = false;
      dispatch({ type: 'START_CLEANUP' });
      unregRec();
      unregSelf();
      stopPlaybackSession(true);
      stopActiveRecording(true);
      revokeCurrentUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recOwnerId, selfOwnerId]);

  const startLevelMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const update = () => {
        if (!isMountedRef.current || !audioCtxRef.current) return;
        analyser.getByteFrequencyData(buffer);
        const barCount = 6;
        const step = Math.max(1, Math.floor(buffer.length / barCount));
        const nextLevels: number[] = [];
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += buffer[i * step + j] || 0;
          }
          const avg = sum / step / 255;
          nextLevels.push(Math.min(1, Math.max(0.18, avg * 1.6 + 0.18)));
        }
        setLevels(nextLevels);
        levelRafRef.current = requestAnimationFrame(update);
      };
      levelRafRef.current = requestAnimationFrame(update);
    } catch {
      // Fallback: keep subtle static levels if Web Audio analyser isn't available
    }
  };

  const handleStartRecord = async () => {
    if (capabilityError) return;

    // Immediately preempt TTS, relay, or any active self-playback before requesting mic
    stopPlaybackSession(true);
    audioCoordinator.claim('recording', recOwnerId);

    // Revoke previous recording URL before creating a new one
    revokeCurrentUrl();
    dispatch({ type: 'REQUEST_PERMISSION' });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      audioCoordinator.release('recording', recOwnerId);
      if (!isMountedRef.current) return;
      const deniedMsg =
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? '마이크 권한이 거부되었어요. 브라우저 설정에서 마이크를 허용한 뒤 다시 시도해 주세요.'
          : '마이크를 시작할 수 없어요. 기기 연결 상태를 확인해 주세요.';
      dispatch({ type: 'PERMISSION_DENIED', reason: deniedMsg });
      return;
    }

    // If unmounted or preempted while waiting for permission prompt, tear down stream immediately
    const activeClaim = audioCoordinator.active();
    if (!isMountedRef.current || activeClaim?.channel !== 'recording' || activeClaim?.ownerId !== recOwnerId) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      if (isMountedRef.current) {
        dispatch({ type: 'RESET_IDLE' });
      }
      return;
    }

    mediaStreamRef.current = stream;
    chunksRef.current = [];
    discardOnStopRef.current = false;

    const mimeType = getSupportedRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stopStreamTracks();
      audioCoordinator.release('recording', recOwnerId);
      dispatch({
        type: 'RECORDING_FAILED',
        reason: '녹음기를 초기화할 수 없어요.',
      });
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data);
      }
    };

    recorder.onstop = () => {
      clearRecordInterval();
      stopLevelMeter();
      stopStreamTracks();
      audioCoordinator.release('recording', recOwnerId);
      mediaRecorderRef.current = null;

      const recordedChunks = chunksRef.current;
      chunksRef.current = [];

      if (discardOnStopRef.current || !isMountedRef.current) {
        return;
      }

      if (recordedChunks.length === 0) {
        dispatch({ type: 'RESET_IDLE' });
        return;
      }

      const blobMime = mimeType || recorder.mimeType || 'audio/webm';
      const blob = new Blob(recordedChunks, { type: blobMime });
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      dispatch({ type: 'RECORDING_READY', objectUrl: url, mimeType: blobMime });
    };

    recorder.start();
    dispatch({ type: 'RECORDING_STARTED', mimeType: mimeType || recorder.mimeType });
    startLevelMeter(stream);

    let seconds = 0;
    recordIntervalRef.current = setInterval(() => {
      seconds += 1;
      if (!isMountedRef.current) return;
      dispatch({ type: 'TICK_RECORDING' });
      if (seconds >= MAX_RECORDING_SECONDS) {
        stopActiveRecording(false);
      }
    }, 1000);
  };

  const playSelfBlob = (target: 'self' | 'compare_self', runId: number): Promise<void> => {
    return new Promise((resolve) => {
      const url = objectUrlRef.current;
      if (!url || !isMountedRef.current || runId !== compareRunIdRef.current) {
        resolve();
        return;
      }

      audioCoordinator.claim('self_playback', selfOwnerId);
      dispatch({ type: 'SET_PLAYING', target });

      const audio = new Audio(url);
      selfAudioRef.current = audio;

      const finish = () => {
        if (selfAudioRef.current === audio) {
          selfAudioRef.current = null;
        }
        audioCoordinator.release('self_playback', selfOwnerId);
        if (isMountedRef.current && runId === compareRunIdRef.current) {
          dispatch({ type: 'SET_PLAYING', target: 'none' });
        }
        resolve();
      };

      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    });
  };

  const playOriginalCached = (target: 'original' | 'compare_original', runId: number): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current || runId !== compareRunIdRef.current) {
        resolve(false);
        return;
      }
      dispatch({ type: 'SET_PLAYING', target });
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (isMountedRef.current && runId === compareRunIdRef.current && target === 'original') {
          dispatch({ type: 'SET_PLAYING', target: 'none' });
        }
        resolve(ok);
      };

      playSentenceAudio({
        audioUrl: rawAudioUrl || null,
        text: textToSpeak,
        lang: langParam,
        rate: preferredRate,
        channel: 'tts',
        ownerId: origOwnerId,
        onComplete: () => done(true),
        onError: () => done(false),
        onPreempt: () => done(false),
      });
    });
  };

  const handlePlayOriginal = () => {
    if (state.playingTarget === 'original') {
      stopAllAudio();
      stopPlaybackSession(true);
      return;
    }
    stopPlaybackSession(true);
    const runId = ++compareRunIdRef.current;
    void playOriginalCached('original', runId);
  };

  const handlePlaySelf = () => {
    if (state.playingTarget === 'self') {
      stopPlaybackSession(true);
      return;
    }
    stopAllAudio();
    stopPlaybackSession(true);
    const runId = ++compareRunIdRef.current;
    void playSelfBlob('self', runId);
  };

  const handleCompareAB = async () => {
    if (
      state.playingTarget === 'compare_original' ||
      state.playingTarget === 'compare_gap' ||
      state.playingTarget === 'compare_self'
    ) {
      stopAllAudio();
      stopPlaybackSession(true);
      return;
    }

    stopAllAudio();
    stopPlaybackSession(true);
    const runId = ++compareRunIdRef.current;

    const ok = await playOriginalCached('compare_original', runId);
    if (!ok || !isMountedRef.current || runId !== compareRunIdRef.current) {
      if (isMountedRef.current && runId === compareRunIdRef.current) {
        dispatch({ type: 'SET_PLAYING', target: 'none' });
      }
      return;
    }

    dispatch({ type: 'SET_PLAYING', target: 'compare_gap' });
    await new Promise<void>((resolve) => {
      compareTimerRef.current = setTimeout(() => {
        compareTimerRef.current = null;
        resolve();
      }, 500);
    });

    if (!isMountedRef.current || runId !== compareRunIdRef.current) {
      return;
    }

    await playSelfBlob('compare_self', runId);
  };

  const isOriginalActive =
    state.playingTarget === 'original' || state.playingTarget === 'compare_original';
  const isSelfActive =
    state.playingTarget === 'self' || state.playingTarget === 'compare_self';
  const isComparing =
    state.playingTarget === 'compare_original' ||
    state.playingTarget === 'compare_gap' ||
    state.playingTarget === 'compare_self';

  return (
    <div className="mb-3 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2">
      {capabilityError ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed"
          >
            <Mic className="h-3.5 w-3.5 shrink-0" />
            <span>따라 말하기 녹음</span>
          </button>
          <span className="text-xs text-slate-500 wrap-anywhere">{capabilityError}</span>
        </div>
      ) : state.status === 'recording' ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => stopActiveRecording(false)}
            className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition cursor-pointer"
          >
            <Square className="h-3.5 w-3.5 fill-current shrink-0" />
            <span>녹음 중지 ({formatSeconds(state.elapsedSec)})</span>
          </button>

          <div className="flex h-6 items-end gap-1" aria-hidden="true">
            {levels.map((lvl, idx) => (
              <span
                key={idx}
                className="w-1 rounded-full bg-red-500 transition-all duration-75"
                style={{ height: `${Math.round(lvl * 100)}%` }}
              />
            ))}
          </div>

          <span className="text-xs text-slate-500 whitespace-nowrap">
            최대 {MAX_RECORDING_SECONDS}초
          </span>
        </div>
      ) : state.status === 'ready' ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePlayOriginal}
            className={`inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              isOriginalActive
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-indigo-50/60 hover:border-indigo-300'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5 shrink-0" />
            <span>원어 듣기</span>
          </button>

          <button
            type="button"
            onClick={handlePlaySelf}
            className={`inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              isSelfActive
                ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-200'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50/60 hover:border-blue-300'
            }`}
          >
            <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
            <span>내 발음 듣기</span>
          </button>

          <button
            type="button"
            onClick={handleCompareAB}
            className={`inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              isComparing
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-emerald-50/60 hover:border-emerald-300'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
            <span>A→B 연속 비교</span>
          </button>

          <button
            type="button"
            onClick={handleStartRecord}
            className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span>다시 녹음</span>
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={state.status === 'requesting_permission'}
              onClick={handleStartRecord}
              className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 transition cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5 shrink-0" />
              <span>
                {state.status === 'requesting_permission'
                  ? '마이크 권한 확인 중...'
                  : '따라 말하기 녹음'}
              </span>
            </button>
            <span className="text-xs text-slate-500">내 기기에만 임시 저장</span>
          </div>

          {state.status === 'permission_denied' && state.errorReason && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
              <span className="wrap-anywhere">{state.errorReason}</span>
            </div>
          )}

          {state.status === 'idle' && state.errorReason && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
              <span className="wrap-anywhere">{state.errorReason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
