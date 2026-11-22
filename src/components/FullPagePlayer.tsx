import React, { useState, useRef, useEffect, useReducer } from 'react';
import {
  Volume2,
  Pause,
  Play,
  Square,
  SkipForward,
  Download,
  Sparkles,
} from 'lucide-react';
import {
  playSentenceAudio,
  stopAllAudio,
  pauseActiveAudio,
  resumeActiveAudio,
} from '../utils/audio';
import { audioCoordinator } from '../utils/audioCoordinator';
import { trackSentence } from '../utils/analytics';
import { buildKaraokeTimeline, getSpanStatus } from '../utils/karaokeSync';
import {
  RepeatTarget,
  SchedulerMode,
  createInitialSchedulerState,
  formatRemainingTenths,
  schedulerReducer,
} from '../utils/shadowingScheduler';
import { LanguageInfo, SentenceItem } from '../types';

interface FullPagePlayerProps {
  title: string;
  fullScript: string;
  language?: LanguageInfo;
  audioUrl?: string | null;
  lessonKey?: string | null;
  pageData: any;
  sentences?: SentenceItem[];
  audioFiles?: Record<string, string>;
}

const RELAY_TTS_OWNER_ID = 'full-page-player-tts';
const RELAY_GAP_OWNER_ID = 'full-page-player-gap';

const SPEED_OPTIONS: number[] = [1.0, 0.75, 0.5];
const REPEAT_OPTIONS: { value: RepeatTarget; label: string }[] = [
  { value: 1, label: '1회' },
  { value: 3, label: '3회' },
  { value: 'infinite', label: '∞' },
];

export const FullPagePlayer: React.FC<FullPagePlayerProps> = ({
  title,
  fullScript,
  language,
  audioUrl,
  lessonKey,
  pageData,
  sentences = [],
  audioFiles = {},
}) => {
  const [state, dispatch] = useReducer(
    schedulerReducer,
    sentences.length,
    (total) => createInitialSchedulerState({ totalSentences: total })
  );
  const [playNonce, setPlayNonce] = useState(0);
  const [sentencePlaybackTime, setSentencePlaybackTime] = useState<{
    currentTime: number;
    duration: number;
  }>({
    currentTime: 0,
    duration: 0,
  });
  const [singlePlaying, setSinglePlaying] = useState(false);

  const isMountedRef = useRef(true);
  const activePlaySessionRef = useRef(0);
  const playingStepKeyRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const langParam = language?.name_en || language?.code || 'en-US';
  const hasSentences = sentences && sentences.length > 0;

  useEffect(() => {
    dispatch({ type: 'SET_TOTAL_SENTENCES', totalSentences: sentences.length });
  }, [sentences.length]);

  const stopEverything = () => {
    activePlaySessionRef.current += 1;
    playingStepKeyRef.current = null;
    audioCoordinator.release('relay', RELAY_GAP_OWNER_ID);
    stopAllAudio();
    setSinglePlaying(false);
    setSentencePlaybackTime({ currentTime: 0, duration: 0 });
    dispatch({ type: 'STOP' });
  };

  const pauseFromPreemptOrHide = () => {
    const cur = stateRef.current;
    if (
      cur.phase === 'playing_tts' ||
      cur.phase === 'short_gap' ||
      cur.phase === 'shadowing_pause'
    ) {
      activePlaySessionRef.current += 1;
      if (cur.phase === 'playing_tts') {
        pauseActiveAudio();
      }
      audioCoordinator.release('relay', RELAY_GAP_OWNER_ID);
      dispatch({ type: 'PAUSE' });
    } else if (singlePlaying) {
      setSinglePlaying(false);
      stopAllAudio();
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    const unregGap = audioCoordinator.register('relay', RELAY_GAP_OWNER_ID, () => {
      if (!isMountedRef.current) return;
      pauseFromPreemptOrHide();
    });

    const handleRateLimit = () => {
      if (!isMountedRef.current) return;
      stopEverything();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseFromPreemptOrHide();
      }
    };

    window.addEventListener('ai-tutor-rate-limit', handleRateLimit);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      unregGap();
      window.removeEventListener('ai-tutor-rate-limit', handleRateLimit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activePlaySessionRef.current += 1;
      stopAllAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive playing_tts audio whenever scheduler enters a new sentence step
  useEffect(() => {
    if (state.phase !== 'playing_tts' || !hasSentences) return;

    const stepKey = `${state.currentRepeat}:${state.currentIndex}:${playNonce}`;
    if (playingStepKeyRef.current === stepKey) return;
    playingStepKeyRef.current = stepKey;

    const sentence = sentences[state.currentIndex];
    if (!sentence) {
      stopEverything();
      return;
    }

    audioCoordinator.release('relay', RELAY_GAP_OWNER_ID);
    const session = ++activePlaySessionRef.current;
    setSentencePlaybackTime({ currentTime: 0, duration: 0 });

    const rawAudio = audioFiles[`${sentence.id}.mp3`];
    const textToSpeak = sentence.tts_text || sentence.raw_text;
    const speed = state.playbackRate;

    let wallStartMs = Date.now();
    let startTracked = false;

    playSentenceAudio({
      audioUrl: rawAudio || null,
      text: textToSpeak,
      lang: langParam,
      rate: speed,
      channel: 'relay',
      ownerId: RELAY_TTS_OWNER_ID,
      onStart: () => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        wallStartMs = Date.now();
        if (!startTracked) {
          startTracked = true;
          trackSentence('sentence_play_start', {
            rate: speed,
            mode: 'relay',
            lang: language?.code,
            lessonKey,
            sentenceId: sentence.id,
          });
        }
      },
      onTimeUpdate: ({ currentTime, duration }) => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        setSentencePlaybackTime({ currentTime, duration });
      },
      onComplete: ({ voice, durationSec }) => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        trackSentence('sentence_complete', {
          rate: speed,
          mode: 'relay',
          voice,
          lang: language?.code,
          lessonKey,
          sentenceId: sentence.id,
        });

        const measuredSec =
          voice === 'ai'
            ? durationSec && durationSec > 0
              ? durationSec
              : Math.max(0.5, ((Date.now() - wallStartMs) / 1000) * speed)
            : Math.max(0.5, (Date.now() - wallStartMs) / 1000);
        const effectiveRate = voice === 'ai' ? speed : 1;

        playingStepKeyRef.current = null;
        audioCoordinator.claim('relay', RELAY_GAP_OWNER_ID);
        dispatch({
          type: 'AUDIO_COMPLETE',
          durationSec: measuredSec,
          effectiveRate,
        });
      },
      onError: () => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        playingStepKeyRef.current = null;
        audioCoordinator.claim('relay', RELAY_GAP_OWNER_ID);
        dispatch({ type: 'AUDIO_ERROR' });
      },
      onPreempt: () => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        activePlaySessionRef.current += 1;
        playingStepKeyRef.current = null;
        dispatch({ type: 'PAUSE' });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentIndex, state.currentRepeat, playNonce, hasSentences]);

  // Drive short_gap and shadowing_pause countdown ticks
  useEffect(() => {
    if (state.phase !== 'shadowing_pause' && state.phase !== 'short_gap') {
      return;
    }

    audioCoordinator.claim('relay', RELAY_GAP_OWNER_ID);
    let lastTick = Date.now();

    const interval = setInterval(() => {
      if (!isMountedRef.current) return;
      const now = Date.now();
      const elapsedMs = now - lastTick;
      lastTick = now;
      dispatch({ type: 'TICK_PAUSE', elapsedMs });
    }, 50);

    return () => {
      clearInterval(interval);
    };
  }, [state.phase, state.currentIndex, state.currentRepeat]);

  // Release gap relay claim when transitioning to idle
  useEffect(() => {
    if (state.phase === 'idle') {
      audioCoordinator.release('relay', RELAY_GAP_OWNER_ID);
      setSentencePlaybackTime({ currentTime: 0, duration: 0 });
    }
  }, [state.phase]);

  const playSingleScript = (speed: number) => {
    stopEverything();
    setSinglePlaying(true);
    setSentencePlaybackTime({ currentTime: 0, duration: 0 });

    playSentenceAudio({
      audioUrl: audioUrl || null,
      text: fullScript || title,
      lang: langParam,
      rate: speed,
      channel: 'relay',
      ownerId: RELAY_TTS_OWNER_ID,
      onStart: () => setSinglePlaying(true),
      onTimeUpdate: ({ currentTime, duration }) =>
        setSentencePlaybackTime({ currentTime, duration }),
      onComplete: () => {
        setSinglePlaying(false);
        setSentencePlaybackTime({ currentTime: 0, duration: 0 });
      },
      onError: () => {
        setSinglePlaying(false);
        setSentencePlaybackTime({ currentTime: 0, duration: 0 });
      },
      onPreempt: () => {
        setSinglePlaying(false);
      },
    });
  };

  const handleStartFrom = (startIndex = 0) => {
    if (!hasSentences) {
      playSingleScript(state.playbackRate);
      return;
    }
    playingStepKeyRef.current = null;
    setPlayNonce((n) => n + 1);
    dispatch({ type: 'START', index: startIndex, totalSentences: sentences.length });
  };

  const handlePause = () => {
    if (!hasSentences) {
      stopEverything();
      return;
    }
    activePlaySessionRef.current += 1;
    if (state.phase === 'playing_tts') {
      const paused = pauseActiveAudio();
      if (!paused) {
        playingStepKeyRef.current = null;
      }
    }
    audioCoordinator.release('relay', RELAY_GAP_OWNER_ID);
    dispatch({ type: 'PAUSE' });
  };

  const handleResume = async () => {
    if (state.phase !== 'paused') return;

    if (state.pausedFromPhase === 'playing_tts') {
      // Re-claim relay before resuming
      audioCoordinator.claim('relay', RELAY_TTS_OWNER_ID);
      const resumed = await resumeActiveAudio();
      if (!resumed) {
        // Web Speech or preempted while paused: restart the current sentence
        playingStepKeyRef.current = null;
        setPlayNonce((n) => n + 1);
      } else {
        // Restore active session tracking for remaining callbacks
        activePlaySessionRef.current += 1;
      }
      dispatch({ type: 'RESUME' });
      return;
    }

    audioCoordinator.claim('relay', RELAY_GAP_OWNER_ID);
    dispatch({ type: 'RESUME' });
  };

  const handleSkipPause = () => {
    if (state.phase !== 'shadowing_pause') return;
    audioCoordinator.release('relay', RELAY_GAP_OWNER_ID);
    playingStepKeyRef.current = null;
    setPlayNonce((n) => n + 1);
    dispatch({ type: 'SKIP_PAUSE' });
  };

  const handleModeChange = (mode: SchedulerMode) => {
    dispatch({ type: 'SET_MODE', mode });
  };

  const handleSpeedChange = (speed: number) => {
    dispatch({ type: 'SET_RATE', playbackRate: speed });
    if (state.phase !== 'idle') {
      playingStepKeyRef.current = null;
      setPlayNonce((n) => n + 1);
      dispatch({
        type: 'START',
        index: state.currentIndex,
        totalSentences: sentences.length,
      });
    } else if (singlePlaying) {
      playSingleScript(speed);
    }
  };

  const handleRepeatChange = (repeatTarget: RepeatTarget) => {
    dispatch({ type: 'SET_REPEAT_TARGET', repeatTarget });
  };

  const handleSentenceClick = (index: number) => {
    handleStartFrom(index);
  };

  const renderSentenceKaraoke = (
    sentenceText: string,
    isActive: boolean,
    currentTime: number,
    duration: number
  ) => {
    if (!isActive || duration <= 0) {
      return <span className="font-serif leading-relaxed text-slate-800">{sentenceText}</span>;
    }

    const timeline = buildKaraokeTimeline(sentenceText, duration);
    if (!timeline.spans || timeline.spans.length === 0) {
      return <span className="font-serif leading-relaxed text-slate-800">{sentenceText}</span>;
    }

    return (
      <span className="font-serif leading-relaxed">
        {timeline.spans.map((span, idx) => {
          if (!span.isWord) {
            return <span key={idx}>{span.token}</span>;
          }

          const status = getSpanStatus(span, currentTime, duration);

          return (
            <span
              key={idx}
              className={`transition-colors duration-100 rounded-xs px-0.5 ${
                status === 'current'
                  ? 'text-blue-600 bg-blue-100 font-bold'
                  : status === 'past'
                  ? 'text-blue-800 bg-blue-50/70 font-semibold'
                  : 'text-slate-800'
              }`}
            >
              {span.token}
            </span>
          );
        })}
      </span>
    );
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(pageData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lessonKey || 'lesson'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSessionActive = state.phase !== 'idle' || singlePlaying;
  const repeatLabel = state.repeatTarget === 'infinite' ? '∞' : String(state.repeatTarget);
  const ttsProgressPct =
    sentencePlaybackTime.duration > 0
      ? Math.min(100, Math.max(0, (sentencePlaybackTime.currentTime / sentencePlaybackTime.duration) * 100))
      : 0;
  const shadowingProgressPct =
    state.pauseTotalMs > 0
      ? Math.min(100, Math.max(0, ((state.pauseTotalMs - state.pauseRemainingMs) / state.pauseTotalMs) * 100))
      : 0;

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden rounded-xl bg-white p-5 shadow-sm border border-slate-200 mb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                전문 연속 낭독 ({state.playbackRate === 1 ? '1.0' : state.playbackRate}x)
              </span>
              {language && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  <span>{language.flag}</span>
                  <span>
                    {language.name_ko} ({language.name_en})
                  </span>
                </span>
              )}
            </div>
            <h2 className="wrap-anywhere text-lg font-bold text-slate-900 mt-0.5">{title}</h2>
          </div>

          {!isSessionActive && (
            <button
              type="button"
              onClick={() => handleStartFrom(0)}
              className="flex min-w-[112px] shrink-0 whitespace-nowrap items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 cursor-pointer self-start sm:self-auto"
            >
              <Volume2 className="h-4 w-4 shrink-0" />
              {state.mode === 'shadowing' ? '쉐도잉 시작' : '연속 듣기'}
            </button>
          )}
        </div>

        {/* In-flow Row 1: Mode Segment | Speed Pills | Repeat Target Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Segment */}
          <div
            role="group"
            aria-label="재생 모드"
            className="flex flex-wrap items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs"
          >
            <button
              type="button"
              onClick={() => handleModeChange('listen')}
              aria-pressed={state.mode === 'listen'}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                state.mode === 'listen'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              연속 듣기 (350ms)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('shadowing')}
              aria-pressed={state.mode === 'shadowing'}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                state.mode === 'shadowing'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              쉐도잉 (따라 말하기)
            </button>
          </div>

          {/* Existing 1.0x / 0.75x / 0.5x Pills */}
          <div
            role="group"
            aria-label="재생 속도"
            className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0"
          >
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => handleSpeedChange(speed)}
                aria-pressed={state.playbackRate === speed}
                className={`px-2 py-1.5 rounded-md font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  state.playbackRate === speed
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {speed === 1 ? '1.0x' : `${speed}x`}
              </button>
            ))}
          </div>

          {/* Repeat Targets */}
          <div
            role="group"
            aria-label="반복 횟수"
            className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0"
          >
            {REPEAT_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => handleRepeatChange(opt.value)}
                aria-pressed={state.repeatTarget === opt.value}
                className={`px-2 py-1.5 rounded-md font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  state.repeatTarget === opt.value
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* In-flow Row 2: Active Status Bar */}
        {(state.phase === 'playing_tts' || state.phase === 'short_gap' || singlePlaying) && (
          <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50/70 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-semibold text-blue-900">
                {hasSentences
                  ? `듣는 중 (${state.currentIndex + 1}/${sentences.length} 문장 · ${state.currentRepeat}/${repeatLabel}회)`
                  : '전체 듣는 중'}
              </span>
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition cursor-pointer"
              >
                <Pause className="h-3.5 w-3.5 shrink-0" />
                <span>일시정지</span>
              </button>
            </div>
            <div
              role="progressbar"
              aria-label="연속 재생 진행"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ttsProgressPct)}
              className="h-2 w-full overflow-hidden rounded-full bg-blue-100"
            >
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-100"
                style={{ width: `${state.phase === 'short_gap' ? 100 : ttsProgressPct}%` }}
              />
            </div>
          </div>
        )}

        {state.phase === 'shadowing_pause' && (
          <div className="min-w-0 rounded-lg border border-emerald-300 bg-emerald-50/90 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-semibold text-emerald-900">
                지금 따라 말해 보세요 · {formatRemainingTenths(state.pauseRemainingMs)}초 남음
              </span>
              <button
                type="button"
                onClick={handleSkipPause}
                className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
              >
                <SkipForward className="h-3.5 w-3.5 shrink-0" />
                <span>바로 넘기기</span>
              </button>
            </div>
            <div
              role="progressbar"
              aria-label="따라 말하기 남은 시간"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shadowingProgressPct)}
              className="h-2 w-full overflow-hidden rounded-full bg-emerald-200/80"
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-75"
                style={{ width: `${shadowingProgressPct}%` }}
              />
            </div>
          </div>
        )}

        {state.phase === 'paused' && (
          <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-medium text-slate-700">
              일시정지됨 ({state.currentIndex + 1}/{sentences.length} 문장 · {state.currentRepeat}/{repeatLabel}회)
            </span>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResume}
                className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
                <span>이어 듣기</span>
              </button>
              <button
                type="button"
                onClick={stopEverything}
                className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 shrink-0 fill-current" />
                <span>정지</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Script Text Display (Sentence-by-Sentence Continuous Flow) */}
      <div className="min-w-0 max-w-full rounded-xl bg-slate-50/80 p-5 border border-slate-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            전체 지문 원문 (문장을 터치하면 해당 위치부터 이어 재생)
          </span>
          {state.phase !== 'idle' && (
            <span className="text-xs text-indigo-600 font-medium hidden sm:inline">
              {state.mode === 'shadowing'
                ? '🎤 문장마다 따라 말하기 쉬는 시간 제공 중'
                : '💡 문장 사이 350ms 쉬면서 이어서 재생 중'}
            </span>
          )}
        </div>

        {hasSentences ? (
          <div className="space-y-2.5 leading-relaxed text-sm sm:text-base font-serif">
            {sentences.map((sent, idx) => {
              const isCurrent = state.phase !== 'idle' && state.currentIndex === idx;
              const isPlayingNow = state.phase === 'playing_tts' && state.currentIndex === idx;
              const isPast = state.phase !== 'idle' && state.currentIndex > idx;

              return (
                <div
                  key={sent.id}
                  onClick={() => handleSentenceClick(idx)}
                  className={`group relative min-w-0 max-w-full rounded-lg p-2.5 transition-all cursor-pointer select-text ${
                    isCurrent
                      ? 'bg-blue-50 border border-blue-300 ring-2 ring-blue-200/70 shadow-xs'
                      : isPast
                      ? 'bg-white/70 border border-slate-200/70 hover:bg-blue-50/30'
                      : 'bg-white/90 border border-slate-200/80 hover:bg-indigo-50/40 hover:border-indigo-200'
                  }`}
                  title={`"${sent.raw_text}" 문장부터 재생`}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 select-none ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isPast
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-800'
                      }`}
                    >
                      {sent.id}
                    </span>
                    <div className="min-w-0 flex-1 wrap-anywhere">
                      {renderSentenceKaraoke(
                        sent.raw_text,
                        isPlayingNow,
                        sentencePlaybackTime.currentTime,
                        sentencePlaybackTime.duration
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : fullScript ? (
          <p className="wrap-anywhere text-sm font-serif text-slate-800 leading-relaxed">
            {fullScript}
          </p>
        ) : null}
      </div>

      {/* Disclaimer & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-sm text-slate-600">
        <span className="min-w-0 wrap-anywhere">
          {pageData.disclaimer_ko || '음성은 합성 TTS이며 원어민이 아닙니다. 발음 표기는 보조 힌트입니다.'}
        </span>
        <button
          onClick={handleDownloadJson}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium self-start sm:self-auto cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          JSON 내보내기
        </button>
      </div>
    </div>
  );
};
