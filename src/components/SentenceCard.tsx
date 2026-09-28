import React, { useState } from 'react';
import { SentenceItem, LanguageInfo } from '../types';
import { Play, Pause, Repeat, Mic, Volume2 } from 'lucide-react';
import { playSentenceAudio, playPracticeTrack, stopAllAudio } from '../utils/audio';

interface SentenceCardProps {
  sentence: SentenceItem;
  language?: LanguageInfo;
  rawAudioUrl?: string | null;
  practiceAudioUrl?: string | null;
}

export const SentenceCard: React.FC<SentenceCardProps> = ({
  sentence,
  language,
  rawAudioUrl,
  practiceAudioUrl,
}) => {
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [practicePhase, setPracticePhase] = useState<'idle' | 'playing1' | 'pause' | 'playing2'>('idle');

  const textToSpeak = sentence.tts_text || sentence.raw_text;
  const langCode = language?.code || 'en-US';
  const pronHint = sentence.pronunciation_hint || sentence.liaison_hint;
  const isFrench = langCode.startsWith('fr');

  const handlePlayNative = () => {
    if (isPlayingNative) {
      stopAllAudio();
      setIsPlayingNative(false);
      return;
    }

    setPracticePhase('idle');
    playSentenceAudio({
      audioUrl: rawAudioUrl,
      text: textToSpeak,
      lang: langCode,
      rate: 1.0,
      onStart: () => setIsPlayingNative(true),
      onEnd: () => setIsPlayingNative(false),
      onError: () => setIsPlayingNative(false),
    });
  };

  const handlePlayPractice = () => {
    if (practicePhase !== 'idle') {
      stopAllAudio();
      setPracticePhase('idle');
      return;
    }

    setIsPlayingNative(false);
    playPracticeTrack({
      practiceAudioUrl,
      rawAudioUrl,
      text: textToSpeak,
      lang: langCode,
      onPhaseChange: (phase) => setPracticePhase(phase),
      onEnd: () => setPracticePhase('idle'),
    });
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200 transition hover:border-slate-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
            {sentence.id}
          </span>
          {language && (
            <span className="text-[11px] font-medium text-slate-500">
              {language.flag} {language.name_ko}
            </span>
          )}
        </div>
        {pronHint && (
          <span className="text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-mono border border-amber-200/50">
            {isFrench ? '연음' : '발음·강세'}: {pronHint}
          </span>
        )}
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
      <div className="mb-4 flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
        {/* Native 1.0x button */}
        <button
          onClick={handlePlayNative}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition ${
            isPlayingNative
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {isPlayingNative ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          원어민 1.0x
        </button>

        {/* Practice 0.75x button with 3-phase visual */}
        <button
          onClick={handlePlayPractice}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition ${
            practicePhase !== 'idle'
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {practicePhase !== 'idle' ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Repeat className="h-3.5 w-3.5" />
          )}
          0.75x 연습 (따라읽기 루프)
        </button>

        {/* Practice phase indicator badge */}
        {practicePhase !== 'idle' && (
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {practicePhase === 'playing1' && (
              <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full animate-pulse">
                <Volume2 className="h-3 w-3" />
                1회차 듣기 중 (0.75x)...
              </span>
            )}
            {practicePhase === 'pause' && (
              <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-bounce">
                <Mic className="h-3.5 w-3.5 text-emerald-600" />
                지금 따라 말해보세요! (마이크 턴)
              </span>
            )}
            {practicePhase === 'playing2' && (
              <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full animate-pulse">
                <Volume2 className="h-3 w-3" />
                2회차 확인 듣기 중 (0.75x)...
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
        <div className="mb-4 bg-slate-50/70 p-2.5 rounded-md border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 block mb-1">
            끊어 읽기 (호흡 단위 / ):
          </span>
          <p className="text-sm font-mono text-indigo-950 font-medium tracking-wide">
            {sentence.breath_marks}
          </p>
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
          <span className="text-[11px] font-bold text-slate-500 block mb-2">
            핵심 어휘:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sentence.vocabulary.map((v, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-xs border border-slate-100"
              >
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
                <span className="text-slate-600 text-right ml-2">
                  {v.meaning}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
