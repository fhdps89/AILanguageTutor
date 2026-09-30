import React, { useState } from 'react';
import { SentenceItem, LanguageInfo } from '../types';
import { Play, Pause, Volume2, Bookmark, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { playSentenceAudio, stopAllAudio } from '../utils/audio';
import { buildKaraokeTimeline, getSpanStatus } from '../utils/karaokeSync';

interface SentenceCardProps {
  sentence: SentenceItem;
  language?: LanguageInfo;
  rawAudioUrl?: string | null;
  practiceAudioUrl?: string | null;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

export const SentenceCard: React.FC<SentenceCardProps> = ({
  sentence,
  language,
  rawAudioUrl,
  isBookmarked = false,
  onToggleBookmark,
}) => {
  // activePlayRate: currently playing rate (1.0 | 0.75 | 0.5), null if idle
  const [activePlayRate, setActivePlayRate] = useState<1.0 | 0.75 | 0.5 | null>(null);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [activeVocab, setActiveVocab] = useState<string | null>(null);
  const [preparingMessage, setPreparingMessage] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState<{ currentTime: number; duration: number }>({
    currentTime: 0,
    duration: 0,
  });

  // U3: Accordion state for deep grammatical details to reduce mobile scroll clutter
  const [showSyntax, setShowSyntax] = useState(false);
  const [showVocab, setShowVocab] = useState(false);

  const textToSpeak = sentence.tts_text || sentence.raw_text;
  const langParam = language?.name_en || language?.code || 'en-US';
  const pronHint = sentence.pronunciation_hint || sentence.liaison_hint;
  const isFrench = (language?.code || '').startsWith('fr');
  const isKoreanMode = (language?.code || '').startsWith('ko');

  const handlePlayRate = (rate: 1.0 | 0.75 | 0.5) => {
    // If currently playing or preparing this exact rate, toggle stop
    if (activePlayRate === rate || (preparingMessage && activePlayRate === rate)) {
      stopAllAudio();
      setActivePlayRate(null);
      setPreparingMessage(null);
      setPlaybackTime({ currentTime: 0, duration: 0 });
      return;
    }

    stopAllAudio();
    setActiveChunk(null);
    setActiveVocab(null);
    setPlaybackTime({ currentTime: 0, duration: 0 });

    playSentenceAudio({
      audioUrl: rate === 1.0 ? rawAudioUrl : null,
      text: textToSpeak,
      lang: langParam,
      rate,
      onPreparing: (msg) => {
        setActivePlayRate(rate);
        setPreparingMessage(msg);
      },
      onStart: () => {
        setPreparingMessage(null);
        setActivePlayRate(rate);
      },
      onTimeUpdate: ({ currentTime, duration }) => setPlaybackTime({ currentTime, duration }),
      onEnd: () => {
        setActivePlayRate(null);
        setPreparingMessage(null);
        setPlaybackTime({ currentTime: 0, duration: 0 });
      },
      onError: () => {
        setActivePlayRate(null);
        setPreparingMessage(null);
        setPlaybackTime({ currentTime: 0, duration: 0 });
      },
    });
  };

  const handlePlayChunk = (chunkText: string) => {
    if (activeChunk === chunkText) {
      stopAllAudio();
      setActiveChunk(null);
      setPlaybackTime({ currentTime: 0, duration: 0 });
      return;
    }

    stopAllAudio();
    setActivePlayRate(null);
    setActiveVocab(null);
    setActiveChunk(chunkText);
    setPlaybackTime({ currentTime: 0, duration: 0 });

    playSentenceAudio({
      text: chunkText,
      lang: langParam,
      rate: 1.0,
      onPreparing: (msg) => setPreparingMessage(msg),
      onStart: () => setPreparingMessage(null),
      onTimeUpdate: ({ currentTime, duration }) => setPlaybackTime({ currentTime, duration }),
      onEnd: () => {
        setActiveChunk(null);
        setPreparingMessage(null);
        setPlaybackTime({ currentTime: 0, duration: 0 });
      },
      onError: () => {
        setActiveChunk(null);
        setPreparingMessage(null);
        setPlaybackTime({ currentTime: 0, duration: 0 });
      },
    });
  };

  const handlePlayVocab = (wordText: string) => {
    if (activeVocab === wordText) {
      stopAllAudio();
      setActiveVocab(null);
      return;
    }

    stopAllAudio();
    setActivePlayRate(null);
    setActiveChunk(null);
    setActiveVocab(wordText);

    playSentenceAudio({
      text: wordText,
      lang: langParam,
      rate: 1.0,
      onPreparing: (msg) => setPreparingMessage(msg),
      onStart: () => setPreparingMessage(null),
      onEnd: () => {
        setActiveVocab(null);
        setPreparingMessage(null);
      },
      onError: () => {
        setActiveVocab(null);
        setPreparingMessage(null);
      },
    });
  };

  const isAudioPlaying = activePlayRate !== null && !preparingMessage;

  const renderKaraokeText = (
    text: string,
    isPlaying: boolean,
    currentTime: number,
    duration: number
  ) => {
    if (!isPlaying || duration <= 0) {
      return <span className="text-slate-900 font-serif leading-relaxed">{text}</span>;
    }

    const timeline = buildKaraokeTimeline(text, duration);
    if (!timeline.spans || timeline.spans.length === 0) {
      return <span className="text-slate-900 font-serif leading-relaxed">{text}</span>;
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
                  ? 'text-blue-700 bg-blue-50/60 font-semibold'
                  : 'text-slate-900'
              }`}
            >
              {span.token}
            </span>
          );
        })}
      </span>
    );
  };

  const hasVocab = sentence.vocabulary && sentence.vocabulary.length > 0;
  const hasSyntax = !!sentence.syntax_diagram && !isKoreanMode;

  return (
    <div
      id={`sentence-${sentence.id}`}
      className={`rounded-xl p-4 sm:p-5 shadow-sm border transition scroll-mt-24 ${
        isBookmarked
          ? 'bg-amber-50/40 border-amber-400 ring-2 ring-amber-300/70 shadow-amber-100/50'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-2">
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
            {sentence.id}
          </span>
          {language && (
            <span className="text-[11px] font-medium text-slate-500">
              {language.flag} {language.name_ko}
            </span>
          )}
          {sentence.formality_badge && (
            <span className="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
              🏷️ {sentence.formality_badge}
            </span>
          )}
          {isBookmarked && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full border border-amber-300">
              📍 내일은 여기서부터 시작
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleBookmark && (
            <button
              onClick={onToggleBookmark}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                isBookmarked
                  ? 'bg-amber-500 text-white font-semibold shadow-xs hover:bg-amber-600'
                  : 'text-slate-600 hover:text-amber-800 hover:bg-amber-50/80 border border-slate-200 bg-white'
              }`}
              title={isBookmarked ? '시작 지점 북마크 해제' : '내일 학습 시작 위치로 북마크'}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-white text-white' : 'text-slate-400'}`} />
              <span className="text-[11px]">{isBookmarked ? '내일의 시작점' : '북마크'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Target Language Text */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {language ? `${language.flag} ${language.name_ko}:` : '원문:'}
          </span>
          {isAudioPlaying && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 animate-pulse">
              🎤 노래방 싱크 진행 중 ({activePlayRate}x)
            </span>
          )}
        </div>
        <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed font-serif">
          {renderKaraokeText(
            sentence.raw_text,
            isAudioPlaying,
            playbackTime.currentTime,
            playbackTime.duration
          )}
        </p>

        {/* Pronunciation / liaison hint */}
        {pronHint && (
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md font-mono border border-amber-200/70">
            <span className="font-bold text-amber-800">{isFrench ? '🗣️ 연음' : '🗣️ 발음'}:</span>
            <span>{pronHint}</span>
          </div>
        )}

        {isKoreanMode && sentence.sound_romanization && (
          <div className="mt-2 text-xs sm:text-sm text-slate-500 font-mono tracking-wide">
            🗣️ <span className="italic text-slate-600">{sentence.sound_romanization}</span>
          </div>
        )}
      </div>

      {/* Audio Controls (1회 낭독 통일) */}
      <div className="mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          {/* Native 1.0x button */}
          <button
            onClick={() => handlePlayRate(1.0)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer ${
              activePlayRate === 1.0 && !preparingMessage
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="원어민 일반 속도(1.0x)로 1회 청취"
          >
            {activePlayRate === 1.0 && !preparingMessage ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            원어민 1.0x
          </button>

          {/* 0.75x button (1회 청취) */}
          <button
            onClick={() => handlePlayRate(0.75)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer ${
              activePlayRate === 0.75 && !preparingMessage
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="여유로운 템포(0.75x)로 1회 청취"
          >
            {activePlayRate === 0.75 && !preparingMessage ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            0.75x 쉐도잉 (여유 템포)
          </button>

          {/* 0.5x button (1회 청취) */}
          <button
            onClick={() => handlePlayRate(0.5)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer ${
              activePlayRate === 0.5 && !preparingMessage
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50/70'
            }`}
            title="초급자를 위한 한 음소씩 또박또박 정밀 조음(0.5x)으로 1회 청취"
          >
            {activePlayRate === 0.5 && !preparingMessage ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            0.5x 조음 훈련 (또박또박)
          </button>
        </div>

        {/* Dynamic voice preparing indicator */}
        {preparingMessage && (
          <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-amber-900 bg-amber-100/80 px-3 py-1.5 rounded-md border border-amber-300 animate-pulse">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700 shrink-0" />
            <span className="font-semibold">{preparingMessage}</span>
          </div>
        )}
      </div>

      {/* Translation */}
      <div className="mb-3 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
          {isKoreanMode ? '영어 번역 (Translation):' : '한국어 번역:'}
        </span>
        <p className="text-sm text-slate-800 leading-normal font-sans">
          {sentence.translation}
        </p>
      </div>

      {/* Korean Morphological Chunks or Standard Breath Marks */}
      {isKoreanMode && sentence.korean_chunks && sentence.korean_chunks.length > 0 ? (
        <div className="mb-3 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[11px] font-bold text-slate-600">
              조사·어미 청크 (터치하여 발음 듣기):
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
            {sentence.korean_chunks.map((chk, idx) => {
              const isPlayingThis = activeChunk === chk.text;
              return (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1 px-2 shadow-2xs hover:border-indigo-300 transition"
                >
                  <button
                    type="button"
                    onClick={() => handlePlayChunk(chk.text)}
                    className={`inline-flex items-center gap-1 text-xs font-serif font-medium transition cursor-pointer ${
                      isPlayingThis ? 'text-indigo-600 font-bold' : 'text-slate-900 hover:text-indigo-600'
                    }`}
                    title={`"${chk.text}" 1.0x 발음 듣기`}
                  >
                    <Volume2 className={`h-3 w-3 shrink-0 ${isPlayingThis ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
                    <span>{chk.text}</span>
                  </button>
                  {chk.grammarRole && (
                    <span className="text-[10px] font-mono font-medium text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100">
                      {chk.grammarRole}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : sentence.breath_marks && sentence.breath_marks !== sentence.raw_text ? (
        <div className="mb-3 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[11px] font-bold text-slate-600">
              호흡 단위 끊어 읽기 (/ 터치하여 부분 청취):
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1 leading-relaxed">
            {sentence.breath_marks.split('/').map((rawChunk, idx, arr) => {
              const chunk = rawChunk.trim();
              if (!chunk) return null;
              const isPlayingThis = activeChunk === chunk;
              return (
                <React.Fragment key={idx}>
                  <button
                    type="button"
                    onClick={() => handlePlayChunk(chunk)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-serif transition cursor-pointer text-left ${
                      isPlayingThis
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs ring-1 ring-indigo-300'
                        : 'bg-white border border-indigo-200/70 text-indigo-950 font-medium hover:bg-indigo-50'
                    }`}
                    title={`"${chunk}" 부분 음성 듣기`}
                  >
                    <Volume2 className={`h-3 w-3 shrink-0 ${isPlayingThis ? 'text-white' : 'text-indigo-500'}`} />
                    <span>{chunk}</span>
                  </button>
                  {idx < arr.length - 1 && (
                    <span className="text-slate-300 font-bold px-0.5 select-none text-sm">/</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Accordion Controls for Syntax diagram and Vocabulary */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
        {hasSyntax && (
          <button
            type="button"
            onClick={() => setShowSyntax(!showSyntax)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/50 px-2.5 py-1 rounded border border-slate-200 transition cursor-pointer"
          >
            <span>📐 구문 분석도</span>
            {showSyntax ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}

        {hasVocab && (
          <button
            type="button"
            onClick={() => setShowVocab(!showVocab)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/50 px-2.5 py-1 rounded border border-slate-200 transition cursor-pointer"
          >
            <span>📚 핵심 어휘 ({sentence.vocabulary.length}개)</span>
            {showVocab ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Collapsible Syntax Diagram */}
      {showSyntax && sentence.syntax_diagram && !isKoreanMode && (
        <div className="mt-3">
          <span className="text-[11px] font-bold text-slate-500 block mb-1">
            구문 분해 (문장 구조도):
          </span>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
            {sentence.syntax_diagram}
          </pre>
        </div>
      )}

      {/* Collapsible Vocabulary */}
      {showVocab && hasVocab && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-[11px] font-bold text-slate-600">
              {isKoreanMode ? '핵심 어휘 (터치하여 발음 청취):' : '핵심 어휘:'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sentence.vocabulary.map((v, idx) => {
              const isPlayingThis = activeVocab === v.word;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePlayVocab(v.word)}
                  className={`flex items-start justify-between rounded-md p-2 text-xs border text-left transition cursor-pointer ${
                    isPlayingThis
                      ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-200'
                      : 'bg-slate-50 border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-300'
                  }`}
                  title={`"${v.word}" 발음 듣기`}
                >
                  <div className="flex items-start gap-1.5">
                    <Volume2 className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isPlayingThis ? 'text-indigo-600 animate-pulse' : 'text-indigo-400'}`} />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900 font-serif">
                          {v.word}
                        </span>
                        {v.baseForm && v.baseForm !== v.word && (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 font-mono">
                            원형: {v.baseForm}
                          </span>
                        )}
                        {v.pos && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            [{v.pos}]
                          </span>
                        )}
                      </div>
                      {v.hint && (
                        <div className="text-[11px] text-amber-700 font-mono mt-0.5">
                          {v.hint}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-slate-600 text-right ml-2 shrink-0">
                    {v.meaning}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
