import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Pause, Download, Sparkles, ChevronRight } from 'lucide-react';
import { playSentenceAudio, stopAllAudio } from '../utils/audio';
import { buildKaraokeTimeline, getSpanStatus } from '../utils/karaokeSync';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [sentencePlaybackTime, setSentencePlaybackTime] = useState<{
    currentTime: number;
    duration: number;
  }>({
    currentTime: 0,
    duration: 0,
  });

  const relayTimerRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const activePlaySessionRef = useRef(0);

  const langParam = language?.name_en || language?.code || 'en-US';
  const hasSentences = sentences && sentences.length > 0;

  useEffect(() => {
    isMountedRef.current = true;
    const handleRateLimit = () => {
      stopRelay();
    };
    window.addEventListener('ai-tutor-rate-limit', handleRateLimit);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('ai-tutor-rate-limit', handleRateLimit);
      if (relayTimerRef.current) {
        clearTimeout(relayTimerRef.current);
        relayTimerRef.current = null;
      }
    };
  }, []);

  const stopRelay = () => {
    if (relayTimerRef.current) {
      clearTimeout(relayTimerRef.current);
      relayTimerRef.current = null;
    }
    activePlaySessionRef.current += 1;
    stopAllAudio();
    setIsPlaying(false);
    setCurrentSentenceIdx(-1);
    setSentencePlaybackTime({ currentTime: 0, duration: 0 });
  };

  const startSentenceRelay = (startIndex: number = 0, speed: number = playbackSpeed) => {
    stopRelay();

    if (!hasSentences) {
      // Fallback if no individual sentences: play full text
      playSingleScript(speed);
      return;
    }

    if (startIndex >= sentences.length) {
      startIndex = 0;
    }

    setIsPlaying(true);
    const session = activePlaySessionRef.current;
    playNextSentenceInQueue(startIndex, speed, session);
  };

  const playNextSentenceInQueue = (
    index: number,
    speed: number,
    session: number
  ) => {
    if (!isMountedRef.current || session !== activePlaySessionRef.current) return;

    if (index >= sentences.length) {
      // Finished all sentences
      setIsPlaying(false);
      setCurrentSentenceIdx(-1);
      setSentencePlaybackTime({ currentTime: 0, duration: 0 });
      return;
    }

    setCurrentSentenceIdx(index);
    setSentencePlaybackTime({ currentTime: 0, duration: 0 });

    const sentence = sentences[index];
    const rawAudio = audioFiles[`${sentence.id}.mp3`];
    const textToSpeak = sentence.tts_text || sentence.raw_text;

    playSentenceAudio({
      audioUrl: rawAudio || null,
      text: textToSpeak,
      lang: langParam,
      rate: speed,
      onStart: () => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        setIsPlaying(true);
      },
      onTimeUpdate: ({ currentTime, duration }) => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        setSentencePlaybackTime({ currentTime, duration });
      },
      onEnd: () => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        setSentencePlaybackTime({ currentTime: 999, duration: 999 });

        // Natural human breath pause between sentences (350ms)
        const breathPauseMs = speed === 1.0 ? 350 : speed === 0.75 ? 420 : 500;
        relayTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
          playNextSentenceInQueue(index + 1, speed, session);
        }, breathPauseMs);
      },
      onError: () => {
        if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
        // On error, continue to next sentence after short pause
        relayTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current || session !== activePlaySessionRef.current) return;
          playNextSentenceInQueue(index + 1, speed, session);
        }, 300);
      },
    });
  };

  const playSingleScript = (speed: number) => {
    setIsPlaying(true);
    setCurrentSentenceIdx(0);
    setSentencePlaybackTime({ currentTime: 0, duration: 0 });

    playSentenceAudio({
      audioUrl: audioUrl || null,
      text: fullScript || title,
      lang: langParam,
      rate: speed,
      onStart: () => setIsPlaying(true),
      onTimeUpdate: ({ currentTime, duration }) => setSentencePlaybackTime({ currentTime, duration }),
      onEnd: () => {
        setIsPlaying(false);
        setCurrentSentenceIdx(-1);
        setSentencePlaybackTime({ currentTime: 0, duration: 0 });
      },
      onError: () => {
        setIsPlaying(false);
        setCurrentSentenceIdx(-1);
        setSentencePlaybackTime({ currentTime: 0, duration: 0 });
      },
    });
  };

  const handlePlayToggle = () => {
    if (isPlaying) {
      stopRelay();
    } else {
      startSentenceRelay(0, playbackSpeed);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (isPlaying) {
      const resumeIndex = Math.max(0, currentSentenceIdx);
      startSentenceRelay(resumeIndex, speed);
    }
  };

  const handleSentenceClick = (index: number) => {
    startSentenceRelay(index, playbackSpeed);
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

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200 mb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              전문 연속 낭독 ({playbackSpeed}x)
            </span>
            {language && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <span>{language.flag}</span>
                <span>{language.name_ko} ({language.name_en})</span>
              </span>
            )}
            {isPlaying && hasSentences && currentSentenceIdx >= 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 animate-pulse">
                🎤 {currentSentenceIdx + 1} / {sentences.length} 문장 낭독 중
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Speed Pills */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            {[1.0, 0.75, 0.5].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => handleSpeedChange(speed)}
                className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                  playbackSpeed === speed
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <button
            onClick={handlePlayToggle}
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-xs transition cursor-pointer ${
              isPlaying
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" />
                일시정지
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" />
                연속 듣기
              </>
            )}
          </button>
        </div>
      </div>

      {/* Full Script Text Display (Sentence-by-Sentence Continuous Flow) */}
      <div className="rounded-xl bg-slate-50/80 p-5 border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            전체 지문 원문 (문장을 터치하면 해당 위치부터 이어 재생)
          </span>
          {isPlaying && (
            <span className="text-xs text-indigo-600 font-medium hidden sm:inline">
              💡 문장 사이 350ms 쉬면서 이어서 재생 중
            </span>
          )}
        </div>

        {hasSentences ? (
          <div className="space-y-2.5 leading-relaxed text-sm sm:text-base font-serif">
            {sentences.map((sent, idx) => {
              const isActive = isPlaying && currentSentenceIdx === idx;
              const isPast = isPlaying && currentSentenceIdx > idx;

              return (
                <div
                  key={sent.id}
                  onClick={() => handleSentenceClick(idx)}
                  className={`group relative rounded-lg p-2.5 transition-all cursor-pointer select-text ${
                    isActive
                      ? 'bg-blue-50 border border-blue-300 ring-2 ring-blue-200/70 shadow-xs'
                      : isPast
                      ? 'bg-white/70 border border-slate-200/70 hover:bg-blue-50/30'
                      : 'bg-white/90 border border-slate-200/80 hover:bg-indigo-50/40 hover:border-indigo-200'
                  }`}
                  title={`"${sent.raw_text}" 문장부터 재생`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 select-none ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : isPast
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-800'
                      }`}
                    >
                      {sent.id}
                    </span>
                    <div className="flex-1">
                      {renderSentenceKaraoke(
                        sent.raw_text,
                        isActive,
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
          <p className="text-sm font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">
            {fullScript}
          </p>
        ) : null}
      </div>

      {/* Disclaimer & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs text-slate-500">
        <span>{pageData.disclaimer_ko || '음성은 합성 TTS이며 원어민이 아닙니다. 발음 표기는 보조 힌트입니다.'}</span>
        <button
          onClick={handleDownloadJson}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium self-start sm:self-auto cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          JSON 내보내기
        </button>
      </div>
    </div>
  );
};
