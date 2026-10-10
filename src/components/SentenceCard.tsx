import React, { useEffect, useRef, useState } from 'react';
import { SentenceItem, LanguageInfo } from '../types';
import { Play, Square, Volume2, Bookmark, Loader2 } from 'lucide-react';
import { playSentenceAudio, stopAllAudio, getDeviceId } from '../utils/audio';
import { trackSentence } from '../utils/analytics';
import { buildKaraokeTimeline, getSpanStatus } from '../utils/karaokeSync';

type Rate = 1.0 | 0.75 | 0.5;

interface SentenceCardProps {
  sentence: SentenceItem;
  language?: LanguageInfo;
  rawAudioUrl?: string | null;
  practiceAudioUrl?: string | null;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  index: number;
  isExpanded: boolean;
  onSelect: (id: string) => void;
  preferredRate: Rate;
  onRateChange: (rate: Rate) => void;
  lessonKey?: string | null;
}

// 오류 신고 항목 (서버 /api/report의 reason 값과 같다)
const REPORT_OPTIONS: { reason: string; label: string }[] = [
  { reason: 'raw_text', label: '원문 글자가 틀려요' },
  { reason: 'translation', label: '번역이 틀려요' },
  { reason: 'pronunciation', label: '발음·음성이 이상해요' },
  { reason: 'vocabulary', label: '단어 뜻이 틀려요' },
  { reason: 'other', label: '기타' },
];

// 이번 화면 세션 동안 이미 신고한 카드 (새로고침하면 비워진다)
const reportedCards = new Set<string>();

const RATE_OPTIONS: { rate: Rate; big: string; small: string }[] = [
  { rate: 1.0, big: '1.0x', small: '보통' },
  { rate: 0.75, big: '0.75x', small: '쉐도잉 (여유 템포)' },
  { rate: 0.5, big: '0.5x', small: '조음 훈련 (또박또박)' },
];

const rateLabel = (r: number) => (r === 1 ? '1.0' : String(r));

interface ChunkRange {
  text: string;
  start: number;
  end: number;
}

// breath_marks를 '/'로 나눈 덩어리가 raw_text의 어느 글자 범위인지 구한다.
// 덩어리를 이어 붙인 글자(공백·'/' 제거)가 raw_text에서 공백을 뺀 글자와 정확히 같을 때만 값을 돌려주고, 아니면 null.
function computeChunkRanges(rawText: string, breathMarks: string): ChunkRange[] | null {
  const chunks = breathMarks
    .split('/')
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) return null;

  const indexMap: number[] = [];
  let compact = '';
  for (let i = 0; i < rawText.length; i++) {
    if (!/\s/.test(rawText[i])) {
      compact += rawText[i];
      indexMap.push(i);
    }
  }
  const joined = chunks.map((c) => c.replace(/\s+/g, '')).join('');
  if (joined !== compact) return null;

  const ranges: ChunkRange[] = [];
  let pos = 0;
  for (const chunk of chunks) {
    const len = chunk.replace(/\s+/g, '').length;
    if (len === 0) continue;
    ranges.push({ text: chunk, start: indexMap[pos], end: indexMap[pos + len - 1] + 1 });
    pos += len;
  }
  return ranges;
}

export const SentenceCard: React.FC<SentenceCardProps> = ({
  sentence,
  language,
  rawAudioUrl,
  isBookmarked = false,
  onToggleBookmark,
  index,
  isExpanded,
  onSelect,
  preferredRate,
  onRateChange,
  lessonKey,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  // 재생이 한 번 끝까지 간 뒤에만 true (펼친 줄 위쪽 상태 표시용)
  const [hasFinished, setHasFinished] = useState(false);
  // activePlayRate: currently playing rate (1.0 | 0.75 | 0.5), null if idle
  const [activePlayRate, setActivePlayRate] = useState<Rate | null>(null);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [activeVocab, setActiveVocab] = useState<string | null>(null);
  const [preparingMessage, setPreparingMessage] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState<{ currentTime: number; duration: number }>({
    currentTime: 0,
    duration: 0,
  });

  // 아래쪽 접이식 항목 (구문 분석도, 핵심 어휘)
  const [showSyntax, setShowSyntax] = useState(false);
  const [showVocab, setShowVocab] = useState(false);

  // 오류 신고: idle(버튼) → choosing(항목 고르기) → sending → done(고마워요) / error(다시 눌러 주세요)
  const reportId = lessonKey ? `${lessonKey}/${sentence.id}` : null;
  const [reportStep, setReportStep] = useState<'idle' | 'choosing' | 'sending' | 'done' | 'error'>(
    reportId && reportedCards.has(reportId) ? 'done' : 'idle'
  );
  const [reportError, setReportError] = useState<string | null>(null);

  // 다른 수업으로 바뀌어 같은 문장 번호가 재사용될 때 신고 상태를 새로 맞춘다
  useEffect(() => {
    setReportStep(reportId && reportedCards.has(reportId) ? 'done' : 'idle');
    setReportError(null);
  }, [reportId]);

  const sendReport = async (reason: string) => {
    if (!lessonKey || !reportId) return;
    setReportStep('sending');
    setReportError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
        body: JSON.stringify({ lessonKey, sentenceId: sentence.id, reason }),
      });
      if (!res.ok) {
        let msg = '지금은 전송이 안 돼요. 나중에 다시 눌러 주세요.';
        if (res.status === 429) {
          const data = await res.json().catch(() => null);
          if (data?.error) msg = data.error;
        }
        setReportError(msg);
        setReportStep('error');
        return;
      }
      reportedCards.add(reportId);
      setReportStep('done');
    } catch {
      setReportError('지금은 전송이 안 돼요. 나중에 다시 눌러 주세요.');
      setReportStep('error');
    }
  };

  const textToSpeak = sentence.tts_text || sentence.raw_text;
  const langParam = language?.name_en || language?.code || 'en-US';
  const pronHint = sentence.pronunciation_hint || sentence.liaison_hint;
  const isFrench = (language?.code || '').startsWith('fr');
  const isKoreanMode = (language?.code || '').startsWith('ko');
  const isChineseMode = (language?.code || '').startsWith('zh');

  const resetPlayback = () => {
    setActivePlayRate(null);
    setActiveChunk(null);
    setActiveVocab(null);
    setPreparingMessage(null);
    setPlaybackTime({ currentTime: 0, duration: 0 });
  };

  // 이 문장을 고른 속도로 처음부터 다시 재생한다 (재생 중이든, 끝났든, 준비 중이든 같다)
  const handlePlayRate = (rate: Rate) => {
    stopAllAudio();
    setActiveChunk(null);
    setActiveVocab(null);
    setHasFinished(false);
    setPlaybackTime({ currentTime: 0, duration: 0 });

    // 소리가 중간에 브라우저 음성으로 바뀌어 onStart가 두 번 불려도 시작 기록은 한 번만 보낸다
    let startTracked = false;
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
        if (!startTracked) {
          startTracked = true;
          trackSentence('sentence_play_start', {
            rate,
            mode: 'card',
            lang: language?.code,
            lessonKey,
            sentenceId: sentence.id,
          });
        }
      },
      onTimeUpdate: ({ currentTime, duration }) => setPlaybackTime({ currentTime, duration }),
      onEnd: () => {
        setActivePlayRate(null);
        setPreparingMessage(null);
        setHasFinished(true);
        setPlaybackTime({ currentTime: 0, duration: 0 });
      },
      onComplete: ({ voice }) => {
        trackSentence('sentence_complete', {
          rate,
          mode: 'card',
          voice,
          lang: language?.code,
          lessonKey,
          sentenceId: sentence.id,
        });
      },
      onError: () => {
        setActivePlayRate(null);
        setPreparingMessage(null);
        setPlaybackTime({ currentTime: 0, duration: 0 });
      },
    });
  };

  const handleStop = () => {
    stopAllAudio();
    resetPlayback();
  };

  // 접힌 줄을 누르면: 이 줄을 펼치고(이전 줄은 접힘) 고른 속도로 바로 재생
  const handleRowTap = () => {
    onSelect(sentence.id);
    handlePlayRate(preferredRate);
    // 위쪽 줄이 접히며 위치가 밀려도 펼친 카드가 화면 안에 보이게 한다
    setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  // 속도 칸: 고른 속도를 올려 보내고 같은 문장을 그 속도로 처음부터 재생
  const handleRateCell = (rate: Rate) => {
    onRateChange(rate);
    handlePlayRate(rate);
  };

  // 접히는 순간 이 카드의 재생 상태를 비운다 (소리는 다른 줄이 시작되면 playSentenceAudio가 끊는다)
  const wasExpandedRef = useRef(isExpanded);
  useEffect(() => {
    if (wasExpandedRef.current && !isExpanded) {
      resetPlayback();
      setHasFinished(false);
    }
    wasExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const handlePlayChunk = (chunkText: string) => {
    if (activeChunk === chunkText) {
      stopAllAudio();
      setActiveChunk(null);
      setPreparingMessage(null);
      setPlaybackTime({ currentTime: 0, duration: 0 });
      return;
    }

    stopAllAudio();
    setActivePlayRate(null);
    setActiveVocab(null);
    setHasFinished(false);
    setActiveChunk(chunkText);
    setPreparingMessage(null);
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
      setPreparingMessage(null);
      return;
    }

    stopAllAudio();
    setActivePlayRate(null);
    setActiveChunk(null);
    setActiveVocab(wordText);
    setPreparingMessage(null);

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

  const isSentencePreparing = activePlayRate !== null && Boolean(preparingMessage);
  const isAudioPlaying = activePlayRate !== null && !preparingMessage;
  const isBusy = activePlayRate !== null || activeChunk !== null;

  const hasBreathChips =
    !isKoreanMode &&
    Boolean(sentence.breath_marks) &&
    sentence.breath_marks !== sentence.raw_text &&
    sentence.breath_marks!.split('/').some((c) => c.trim());
  const chunkRanges = hasBreathChips ? computeChunkRanges(sentence.raw_text, sentence.breath_marks!) : null;

  // 문장 전체를 재생하는 중일 때, 지금 읽는 글자가 든 덩어리 번호 (덩어리 글자가 원문과 정확히 맞을 때만)
  let playingChunkIdx = -1;
  if (chunkRanges && isAudioPlaying && playbackTime.duration > 0) {
    const timeline = buildKaraokeTimeline(sentence.raw_text, playbackTime.duration);
    let found: { startIndex: number } | null = null;
    for (const span of timeline.spans) {
      if (!span.isWord) continue;
      const status = getSpanStatus(span, playbackTime.currentTime, playbackTime.duration);
      if (status === 'current') {
        found = span;
        break;
      }
      if (status === 'past') found = span;
    }
    if (found) {
      playingChunkIdx = chunkRanges.findIndex((r) => found!.startIndex >= r.start && found!.startIndex < r.end);
    }
  }

  const renderKaraokeText = (
    text: string,
    isPlaying: boolean,
    currentTime: number,
    duration: number
  ) => {
    // 끊어 읽기 부분 청취 중: 그 덩어리 밖의 글자를 흐리게
    if (activeChunk) {
      const range = chunkRanges?.find((r) => r.text === activeChunk);
      let start = range ? range.start : -1;
      let end = range ? range.end : -1;
      if (!range) {
        const at = text.indexOf(activeChunk);
        if (at >= 0) {
          start = at;
          end = at + activeChunk.length;
        }
      }
      if (start >= 0) {
        return (
          <span className="font-serif leading-relaxed">
            <span className="text-slate-400">{text.slice(0, start)}</span>
            <span className="text-slate-900 font-bold">{text.slice(start, end)}</span>
            <span className="text-slate-400">{text.slice(end)}</span>
          </span>
        );
      }
    }

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
  const hasVocabPanel = hasVocab || Boolean(pronHint);

  if (!isExpanded) {
    return (
      <div id={`sentence-${sentence.id}`} ref={rootRef} className="scroll-mt-24">
        <button
          type="button"
          onClick={handleRowTap}
          aria-expanded={false}
          aria-label={`${index + 1}번 문장 듣기: ${sentence.raw_text}`}
          className={`flex w-full min-h-[60px] items-center gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition cursor-pointer ${
            isBookmarked
              ? 'bg-amber-50/40 border-amber-400 hover:bg-amber-50'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            <Play className="h-5 w-5 fill-current" />
          </span>
          <span className="w-6 shrink-0 text-xs font-bold text-slate-600 tabular-nums">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate font-serif text-base text-slate-900">{sentence.raw_text}</span>
          {isBookmarked && (
            <span className="shrink-0 text-sm" aria-label="내일 시작할 문장">
              📍
            </span>
          )}
        </button>
      </div>
    );
  }

  const statusText = activeChunk
    ? '부분 청취 중'
    : isSentencePreparing
    ? '음성 준비 중'
    : activePlayRate !== null
    ? `재생 중 ${rateLabel(activePlayRate)}x`
    : hasFinished
    ? '재생 끝'
    : '';

  const progressPct =
    isAudioPlaying && playbackTime.duration > 0
      ? Math.min(100, Math.max(0, (playbackTime.currentTime / playbackTime.duration) * 100))
      : 0;

  return (
    <div
      id={`sentence-${sentence.id}`}
      ref={rootRef}
      aria-expanded={true}
      className="rounded-xl p-4 sm:p-5 shadow-sm border transition scroll-mt-24 bg-blue-50/40 border-blue-600 ring-1 ring-blue-200"
    >
      {/* 재생·정지 버튼과 상태 표시 한 줄 */}
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (isBusy ? handleStop() : handlePlayRate(preferredRate))}
          aria-label={isBusy ? '정지' : `${rateLabel(preferredRate)}x로 처음부터 재생`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 cursor-pointer"
        >
          {isBusy ? <Square className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </button>
        <span className="text-sm font-semibold text-blue-700" aria-live="polite">
          {statusText}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-2">
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
            {sentence.id}
          </span>
          {language && (
            <span className="text-xs font-medium text-slate-600">
              {language.flag} {language.name_ko}
            </span>
          )}
          {sentence.formality_badge && (
            <span className="inline-flex items-center text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
              🏷️ {sentence.formality_badge}
            </span>
          )}
          {isBookmarked && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full border border-amber-300">
              📍 내일은 여기서부터 시작
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleBookmark && (
            <button
              onClick={onToggleBookmark}
              className={`flex min-h-11 items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition cursor-pointer ${
                isBookmarked
                  ? 'bg-amber-500 text-white font-semibold shadow-xs hover:bg-amber-600'
                  : 'text-slate-600 hover:text-amber-800 hover:bg-amber-50/80 border border-slate-200 bg-white'
              }`}
              title={isBookmarked ? '시작 지점 북마크 해제' : '내일 학습 시작 위치로 북마크'}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-white text-white' : 'text-slate-400'}`} />
              <span>{isBookmarked ? '내일의 시작점' : '북마크'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Target Language Text */}
      <div className="mb-2">
        <span className="mb-1 block text-xs font-bold tracking-wider text-slate-600">
          {language ? `${language.flag} ${language.name_ko}:` : '원문:'}
        </span>
        <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed font-serif">
          {renderKaraokeText(
            sentence.raw_text,
            isAudioPlaying,
            playbackTime.currentTime,
            playbackTime.duration
          )}
        </p>

        {/* Chinese Pinyin with Tones */}
        {isChineseMode && sentence.pinyin && (
          <div className="mt-2 flex items-start gap-2 text-sm font-sans text-amber-950 bg-amber-50/90 px-3 py-1.5 rounded-lg border border-amber-200/80">
            <span className="font-bold text-amber-800 text-xs shrink-0 mt-0.5">🇨🇳 한어병음:</span>
            <span className="tracking-wide leading-relaxed text-slate-800 font-medium">{sentence.pinyin}</span>
          </div>
        )}

        {isKoreanMode && sentence.sound_romanization && (
          <div className="mt-2 text-sm text-slate-600 font-mono tracking-wide">
            🗣️ <span className="italic text-slate-600">{sentence.sound_romanization}</span>
          </div>
        )}
      </div>

      {/* 진행 슬롯: 높이를 고정해 두고, 음성 준비 중에는 로딩 상자, 재생 중에는 진행 막대 */}
      <div className="mb-3 flex h-11 items-center">
        {isSentencePreparing ? (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden rounded-md border border-amber-300 bg-amber-100/80 px-3 text-sm font-medium text-amber-900 animate-pulse">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-700" />
            <span className="font-semibold">{preparingMessage}</span>
          </div>
        ) : (
          <div
            role="progressbar"
            aria-label="재생 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
            className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      {/* 듣기 속도 */}
      <div className="mb-3">
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">듣기 속도</span>
        <div className="grid grid-cols-3 gap-2">
          {RATE_OPTIONS.map((opt) => {
            const selected = preferredRate === opt.rate;
            return (
              <button
                key={opt.rate}
                type="button"
                onClick={() => handleRateCell(opt.rate)}
                aria-pressed={selected}
                title={
                  opt.rate === 0.5 && isChineseMode
                    ? '초급자를 위한 한 음소 및 성조(1~4성) 정밀 발화(0.5x)로 처음부터 듣기'
                    : `${opt.big}로 이 문장을 처음부터 듣기`
                }
                className={`flex min-h-14 flex-col items-center justify-center rounded-lg border px-1 py-1 text-center transition cursor-pointer ${
                  selected
                    ? 'border-blue-700 bg-blue-600 text-white shadow-xs'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg font-bold leading-tight">{opt.big}</span>
                <span className={`text-xs leading-tight ${selected ? 'text-blue-50' : 'text-slate-600'}`}>
                  {opt.small}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Translation */}
      <div className="mb-3 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
        <span className="text-xs font-bold tracking-wider text-slate-600 block mb-0.5">
          {isKoreanMode ? '영어 번역 (Translation):' : '한국어 번역:'}
        </span>
        <p className="text-sm text-slate-800 leading-normal font-sans">
          {sentence.translation}
        </p>
      </div>

      {/* Korean Morphological Chunks or 끊어 읽기 chips */}
      {isKoreanMode && sentence.korean_chunks && sentence.korean_chunks.length > 0 ? (
        <div className="mb-3 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="text-sm font-bold text-slate-700">
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
                    className={`inline-flex min-h-9 items-center gap-1 text-sm font-serif font-medium transition cursor-pointer ${
                      isPlayingThis ? 'text-indigo-600 font-bold' : 'text-slate-900 hover:text-indigo-600'
                    }`}
                    title={`"${chk.text}" 1.0x 발음 듣기`}
                  >
                    <Volume2 className={`h-3.5 w-3.5 shrink-0 ${isPlayingThis ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
                    <span>{chk.text}</span>
                  </button>
                  {chk.grammarRole && (
                    <span className="text-xs font-mono font-medium text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100">
                      {chk.grammarRole}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : hasBreathChips ? (
        <div className="mb-3 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
          <div className="mb-2">
            <span className="block text-sm font-bold text-slate-700">끊어 읽기</span>
            <span className="block text-sm text-slate-600">덩어리를 누르면 그 부분만 들려요</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
            {sentence.breath_marks!.split('/').map((rawChunk, idx, arr) => {
              const chunk = rawChunk.trim();
              if (!chunk) return null;
              const isPlayingThis = activeChunk === chunk;
              const isFollowing = idx === playingChunkIdx;
              const filled = isPlayingThis || isFollowing;
              const isChipPreparing = isPlayingThis && Boolean(preparingMessage);
              return (
                <React.Fragment key={idx}>
                  <button
                    type="button"
                    onClick={() => handlePlayChunk(chunk)}
                    aria-pressed={isPlayingThis}
                    className={`inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-serif transition cursor-pointer text-left ${
                      filled
                        ? 'bg-blue-600 text-white font-semibold shadow-xs ring-1 ring-blue-300'
                        : 'bg-white border border-indigo-200/70 text-indigo-950 font-medium hover:bg-indigo-50'
                    }`}
                    title={`"${chunk}" 부분 음성 듣기`}
                  >
                    {isChipPreparing ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Volume2 className={`h-3.5 w-3.5 shrink-0 ${filled ? 'text-white' : 'text-indigo-500'}`} />
                    )}
                    <span>{chunk}</span>
                  </button>
                  {idx < arr.length - 1 && (
                    <span className="text-slate-600 font-bold px-0.5 select-none text-base" aria-hidden="true">
                      /
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 맨 아래: 구문 분석도, 핵심 어휘 (기본은 접힘) */}
      {(hasSyntax || hasVocabPanel) && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          {hasSyntax && (
            <button
              type="button"
              onClick={() => setShowSyntax(!showSyntax)}
              aria-expanded={showSyntax}
              className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50/50 px-3.5 py-2 rounded-lg border border-slate-200 transition cursor-pointer"
            >
              <span>📐 구문 분석도</span>
            </button>
          )}

          {hasVocabPanel && (
            <button
              type="button"
              onClick={() => setShowVocab(!showVocab)}
              aria-expanded={showVocab}
              className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50/50 px-3.5 py-2 rounded-lg border border-slate-200 transition cursor-pointer"
            >
              <span>📚 핵심 어휘{hasVocab ? ` (${sentence.vocabulary.length}개)` : ''}</span>
            </button>
          )}
        </div>
      )}

      {/* Collapsible Syntax Diagram */}
      {showSyntax && sentence.syntax_diagram && !isKoreanMode && (
        <div className="mt-3">
          <span className="text-sm font-bold text-slate-700 block mb-1">
            구문 분해 (문장 구조도):
          </span>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-sm font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
            {sentence.syntax_diagram}
          </pre>
        </div>
      )}

      {/* Collapsible Vocabulary (+ 연음/성조 발음 팁) */}
      {showVocab && hasVocabPanel && (
        <div className="mt-3">
          {hasVocab && (
            <>
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-sm font-bold text-slate-700">
                  {isKoreanMode ? '핵심 어휘 (터치하여 발음 청취):' : '핵심 어휘:'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sentence.vocabulary.map((v, idx) => {
                  const isPlayingThis = activeVocab === v.word;
                  const isVocabPreparing = isPlayingThis && Boolean(preparingMessage);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handlePlayVocab(v.word)}
                      className={`flex min-h-11 items-start justify-between rounded-md p-2 text-sm border text-left transition cursor-pointer ${
                        isPlayingThis
                          ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-200'
                          : 'bg-slate-50 border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-300'
                      }`}
                      title={`"${v.word}" 발음 듣기`}
                    >
                      <div className="flex items-start gap-1.5">
                        {isVocabPreparing ? (
                          <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin text-indigo-600" />
                        ) : (
                          <Volume2 className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isPlayingThis ? 'text-indigo-600 animate-pulse' : 'text-indigo-400'}`} />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 font-serif">
                              {v.word}
                            </span>
                            {v.pinyin && (
                              <span className="text-xs text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded font-mono font-medium border border-amber-200/80">
                                {v.pinyin}
                              </span>
                            )}
                            {v.baseForm && v.baseForm !== v.word && (
                              <span className="text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 font-mono">
                                원형: {v.baseForm}
                              </span>
                            )}
                            {v.pos && (
                              <span className="text-xs text-slate-600 font-mono">
                                [{v.pos}]
                              </span>
                            )}
                          </div>
                          {v.hint && (
                            <div className="text-xs text-amber-700 font-mono mt-0.5">
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
            </>
          )}

          {pronHint && (
            <div className="mt-2 inline-flex items-center gap-1 text-sm text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md font-mono border border-amber-200/70">
              <span className="font-bold text-amber-800">
                {isFrench ? '🗣️ 연음' : isChineseMode ? '🗣️ 성조/발음 팁' : '🗣️ 발음'}:
              </span>
              <span>{pronHint}</span>
            </div>
          )}
        </div>
      )}

      {/* 오류 신고: 눈에 띄지 않게 맨 아래에 작게 둔다 */}
      {lessonKey && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          {reportStep === 'done' ? (
            <p className="py-2 text-xs text-slate-600">알려 주셔서 고마워요</p>
          ) : reportStep === 'idle' || reportStep === 'error' ? (
            <div className="flex flex-wrap items-center gap-x-3">
              <button
                type="button"
                onClick={() => setReportStep('choosing')}
                className="min-h-11 px-1 text-xs text-slate-600 underline underline-offset-2 hover:text-indigo-700 cursor-pointer"
              >
                이 설명이 틀렸어요
              </button>
              {reportStep === 'error' && reportError && (
                <span role="status" className="text-xs text-red-700">{reportError}</span>
              )}
            </div>
          ) : (
            <div role="group" aria-label="어떤 부분이 틀렸나요?">
              <p className="pb-1 text-xs text-slate-600">어떤 부분이 틀렸나요?</p>
              <div className="flex flex-wrap gap-2">
                {REPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.reason}
                    type="button"
                    disabled={reportStep === 'sending'}
                    onClick={() => sendReport(opt.reason)}
                    className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50 cursor-pointer"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={reportStep === 'sending'}
                  onClick={() => setReportStep('idle')}
                  className="min-h-11 px-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
