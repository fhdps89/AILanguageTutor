import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

const VIDEO_SRC = '/landing/demo-card-fr.mp4';
const POSTER_SRC = '/landing/demo-card-fr-poster.jpg';
const ARIA_LABEL =
  '예시 화면: 프랑스어 문장을 누르면 음성이 준비되고, 읽는 단어가 파랗게 따라가며, 속도를 0.75배로 바꾸고 끊어 읽기로 다시 듣는 모습';

// 시작 화면의 예시 영상: 소리 없는 짧은 반복 영상. 움직임 줄이기 설정이면 대표 이미지만 보여 주고,
// 「예시 영상 보기」를 누르면 한 번만 재생한다. 영상을 못 불러오면 대표 이미지만 보인다.
export const LandingDemoVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // 움직임 줄이기 상태에서 「예시 영상 보기」로 한 번 재생하는 중인지
  const [playingOnce, setPlayingOnce] = useState(false);
  const userPausedRef = useRef(false);

  // 움직임 줄이기 설정을 읽고, 바뀌면 바로 따른다
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReducedMotion(mq.matches);
      if (mq.matches) {
        setPlayingOnce(false);
        setIsPlaying(false);
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const tryPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    const result = v.play();
    if (result && typeof result.catch === 'function') {
      // 자동 재생이 막히면(예: 저전력 모드) 대표 이미지를 그대로 둔다
      result.catch(() => setIsPlaying(false));
    }
  };

  const showVideo = !hasError && (!reducedMotion || playingOnce);

  // 화면 밖으로 나가면 멈추고, 다시 보이면 이어서 재생한다 (직접 멈춘 경우는 그대로 둔다)
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !showVideo || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const v = videoRef.current;
        if (!v) return;
        if (entries[0].isIntersecting) {
          if (!userPausedRef.current) tryPlay();
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(box);
    return () => io.disconnect();
  }, [showVideo, reducedMotion]);

  // 영상이 나타나면 자동 재생 (움직임 줄이기가 아닐 때)
  useEffect(() => {
    if (showVideo && !reducedMotion && !userPausedRef.current) tryPlay();
  }, [showVideo, reducedMotion]);

  const handleToggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      userPausedRef.current = true;
      v.pause();
    } else {
      userPausedRef.current = false;
      tryPlay();
    }
  };

  const handlePlayOnce = () => {
    setPlayingOnce(true);
    // 영상 요소가 그려진 다음 재생
    requestAnimationFrame(() => tryPlay());
  };

  return (
    <div
      ref={boxRef}
      className="relative mx-auto my-6 w-full max-w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm sm:max-w-[360px]"
      style={{ aspectRatio: '4 / 5' }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          loop={!reducedMotion}
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          aria-label={ARIA_LABEL}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            if (reducedMotion) setPlayingOnce(false);
          }}
          onError={() => setHasError(true)}
        />
      ) : (
        <img
          src={POSTER_SRC}
          alt={ARIA_LABEL}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-sm">
        예시 영상
      </span>

      {showVideo && !reducedMotion && (
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isPlaying ? '예시 영상 멈추기' : '예시 영상 재생'}
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-slate-900/85 cursor-pointer"
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </button>
      )}

      {reducedMotion && !playingOnce && !hasError && (
        <button
          type="button"
          onClick={handlePlayOnce}
          className="absolute bottom-3 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900/90 cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          예시 영상 보기
        </button>
      )}
    </div>
  );
};
