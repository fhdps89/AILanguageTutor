import React, { useState } from 'react';
import { Volume2, Pause, Download, Globe } from 'lucide-react';
import { playSentenceAudio, stopAllAudio } from '../utils/audio';
import { LanguageInfo } from '../types';

interface FullPagePlayerProps {
  title: string;
  fullScript: string;
  language?: LanguageInfo;
  audioUrl?: string | null;
  lessonKey?: string | null;
  pageData: any;
}

export const FullPagePlayer: React.FC<FullPagePlayerProps> = ({
  title,
  fullScript,
  language,
  audioUrl,
  lessonKey,
  pageData,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const langCode = language?.code || 'en-US';

  const handlePlayToggle = () => {
    if (isPlaying) {
      stopAllAudio();
      setIsPlaying(false);
      return;
    }

    playSentenceAudio({
      audioUrl: audioUrl || null,
      text: fullScript || title,
      lang: langCode,
      rate: 1.0,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              전체 지문 연속 듣기 (1.0x)
            </span>
            {language && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <span>{language.flag}</span>
                <span>{language.name_ko} ({language.name_en}) 감지됨</span>
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">{title}</h2>
        </div>

        <button
          onClick={handlePlayToggle}
          className={`flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-xs transition ${
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
              전체 본문 연속 듣기
            </>
          )}
        </button>
      </div>

      {/* Full Script Text */}
      {fullScript && (
        <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
          <p className="text-sm font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">
            {fullScript}
          </p>
        </div>
      )}

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
