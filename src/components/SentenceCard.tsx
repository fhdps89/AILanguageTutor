import React, { useState } from 'react';
import { SentenceItem, LanguageInfo } from '../types';
import { Play, Pause, Repeat, Mic, Volume2, Bookmark } from 'lucide-react';
import { playSentenceAudio, playPracticeTrack, stopAllAudio } from '../utils/audio';

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
  practiceAudioUrl,
  isBookmarked = false,
  onToggleBookmark,
}) => {
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [practicePhase, setPracticePhase] = useState<'idle' | 'playing1' | 'pause' | 'playing2'>('idle');
  const [practiceRate, setPracticeRate] = useState<0.5 | 0.75>(0.75);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [activeVocab, setActiveVocab] = useState<string | null>(null);

  const textToSpeak = sentence.tts_text || sentence.raw_text;
  const langParam = language?.name_en || language?.code || 'en-US';
  const pronHint = sentence.pronunciation_hint || sentence.liaison_hint;
  const isFrench = (language?.code || '').startsWith('fr');

  const handlePlayNative = () => {
    if (isPlayingNative) {
      stopAllAudio();
      setIsPlayingNative(false);
      return;
    }

    stopAllAudio();
    setPracticePhase('idle');
    setActiveChunk(null);
    setActiveVocab(null);

    playSentenceAudio({
      audioUrl: rawAudioUrl,
      text: textToSpeak,
      lang: langParam,
      rate: 1.0,
      onStart: () => setIsPlayingNative(true),
      onEnd: () => setIsPlayingNative(false),
      onError: () => setIsPlayingNative(false),
    });
  };

  const handlePlayPractice = (rate: 0.5 | 0.75) => {
    if (practicePhase !== 'idle' && practiceRate === rate) {
      stopAllAudio();
      setPracticePhase('idle');
      return;
    }

    stopAllAudio();
    setIsPlayingNative(false);
    setActiveChunk(null);
    setActiveVocab(null);
    setPracticeRate(rate);

    playPracticeTrack({
      practiceAudioUrl,
      rawAudioUrl,
      text: textToSpeak,
      lang: langParam,
      rate,
      onPhaseChange: (phase) => setPracticePhase(phase),
      onEnd: () => setPracticePhase('idle'),
    });
  };

  const handlePlayChunk = (chunkText: string) => {
    if (activeChunk === chunkText) {
      stopAllAudio();
      setActiveChunk(null);
      return;
    }

    stopAllAudio();
    setIsPlayingNative(false);
    setPracticePhase('idle');
    setActiveVocab(null);
    setActiveChunk(chunkText);

    playSentenceAudio({
      text: chunkText,
      lang: langParam,
      rate: 1.0,
      onEnd: () => setActiveChunk(null),
      onError: () => setActiveChunk(null),
    });
  };

  const handlePlayVocab = (wordText: string) => {
    if (activeVocab === wordText) {
      stopAllAudio();
      setActiveVocab(null);
      return;
    }

    stopAllAudio();
    setIsPlayingNative(false);
    setPracticePhase('idle');
    setActiveChunk(null);
    setActiveVocab(wordText);

    playSentenceAudio({
      text: wordText,
      lang: langParam,
      rate: 1.0,
      onEnd: () => setActiveVocab(null),
      onError: () => setActiveVocab(null),
    });
  };

  return (
    <div
      id={`sentence-${sentence.id}`}
      className={`rounded-xl p-5 shadow-sm border transition scroll-mt-24 ${
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
          {isBookmarked && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full border border-amber-300">
              📍 내일은 여기서부터 시작
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pronHint && (
            <span className="hidden sm:inline-block text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-mono border border-amber-200/50">
              {isFrench ? '연음' : '발음·강세'}: {pronHint}
            </span>
          )}
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
              <span>{isBookmarked ? '내일의 시작점' : '여기서부터 시작'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Target Language Text */}
      <div className="mb-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
          {language ? `${language.flag} ${language.name_ko} (${language.name_en}):` : '원문:'}
        </span>
        <p className="text-lg font-medium text-slate-900 leading-relaxed font-serif">
          {sentence.raw_text}
        </p>
      </div>

      {/* Audio Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
        {/* Native 1.0x button */}
        <button
          onClick={handlePlayNative}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer ${
            isPlayingNative
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          title="원어민 일반 속도(1.0x)로 문장 전체 청취"
        >
          {isPlayingNative ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          원어민 1.0x
        </button>

        {/* Practice 0.75x button */}
        <button
          onClick={() => handlePlayPractice(0.75)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer ${
            practicePhase !== 'idle' && practiceRate === 0.75
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          title="0.75배속으로 듣고 따라하기 자동 반복"
        >
          {practicePhase !== 'idle' && practiceRate === 0.75 ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Repeat className="h-3.5 w-3.5" />
          )}
          0.75x 연습 (루프)
        </button>

        {/* Practice 0.5x button (초보자용 느린 연습) */}
        <button
          onClick={() => handlePlayPractice(0.5)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition cursor-pointer ${
            practicePhase !== 'idle' && practiceRate === 0.5
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50/70'
          }`}
          title="초보자를 위한 0.5배속 천천히 듣고 따라하기 자동 반복"
        >
          {practicePhase !== 'idle' && practiceRate === 0.5 ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Repeat className="h-3.5 w-3.5" />
          )}
          0.5x 느린 연습 (초보자)
        </button>

        {/* Practice phase indicator badge */}
        {practicePhase !== 'idle' && (
          <div className="flex items-center gap-1.5 text-xs font-medium w-full sm:w-auto mt-1 sm:mt-0">
            {practicePhase === 'playing1' && (
              <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full animate-pulse border border-indigo-200/60">
                <Volume2 className="h-3 w-3" />
                1회차 듣기 ({practiceRate}x)...
              </span>
            )}
            {practicePhase === 'pause' && (
              <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-bounce">
                <Mic className="h-3.5 w-3.5 text-emerald-600" />
                지금 따라 말해보세요! (마이크 턴)
              </span>
            )}
            {practicePhase === 'playing2' && (
              <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full animate-pulse border border-indigo-200/60">
                <Volume2 className="h-3 w-3" />
                2회차 확인 듣기 ({practiceRate}x)...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Korean Translation */}
      <div className="mb-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
          한국어 번역:
        </span>
        <p className="text-sm text-slate-700 leading-normal">
          {sentence.translation}
        </p>
      </div>

      {/* Breath marks (끊어 읽기) */}
      {sentence.breath_marks && sentence.breath_marks !== sentence.raw_text && (
        <div className="mb-4 bg-slate-50/80 p-3 rounded-lg border border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
            <span className="text-[11px] font-bold text-slate-600">
              끊어 읽기 (호흡 단위 / ):
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">
              💡 구문을 터치하면 1.0x 원어민 음성이 재생됩니다
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
            {sentence.breath_marks.split('/').map((rawChunk, idx, arr) => {
              const chunk = rawChunk.trim();
              if (!chunk) return null;
              const isPlayingThis = activeChunk === chunk;
              return (
                <React.Fragment key={idx}>
                  <button
                    type="button"
                    onClick={() => handlePlayChunk(chunk)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-serif transition cursor-pointer text-left ${
                      isPlayingThis
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs ring-2 ring-indigo-300 animate-pulse'
                        : 'bg-white border border-indigo-200/80 text-indigo-950 font-medium hover:bg-indigo-50 hover:border-indigo-400 shadow-2xs'
                    }`}
                    title={`"${chunk}" 1.0x 원어민 음성 듣기`}
                  >
                    <Volume2 className={`h-3.5 w-3.5 shrink-0 ${isPlayingThis ? 'text-white' : 'text-indigo-500'}`} />
                    <span>{chunk}</span>
                  </button>
                  {idx < arr.length - 1 && (
                    <span className="text-slate-300 font-bold px-1 select-none text-base">/</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Syntax diagram */}
      {sentence.syntax_diagram && (
        <div className="mb-4">
          <span className="text-[11px] font-bold text-slate-500 block mb-1">
            구문 분해 (문장 구조도):
          </span>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
            {sentence.syntax_diagram}
          </pre>
        </div>
      )}

      {/* Vocabulary */}
      {sentence.vocabulary && sentence.vocabulary.length > 0 && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
            <span className="text-[11px] font-bold text-slate-600">
              핵심 어휘:
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">
              💡 단어를 터치하면 1.0x 발음을 들을 수 있습니다
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
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                      : 'bg-slate-50 border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-300'
                  }`}
                  title={`"${v.word}" 1.0x 발음 듣기`}
                >
                  <div className="flex items-start gap-1.5">
                    <Volume2 className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isPlayingThis ? 'text-indigo-600 animate-pulse' : 'text-indigo-400'}`} />
                    <div>
                      <span className="font-semibold text-slate-900 font-serif">
                        {v.word}
                      </span>
                      {v.hint && (
                        <span className="ml-1.5 text-[11px] text-amber-700 font-mono">
                          {v.hint}
                        </span>
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
