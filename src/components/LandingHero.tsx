import React from 'react';
import { Camera } from 'lucide-react';
import { DailyQuota } from '../types';
import { LandingDemoVideo } from './LandingDemoVideo';

interface LandingHeroProps {
  quota?: DailyQuota | null;
  hasOwnLesson: boolean;
  onUploadClick: () => void;
  onCameraClick: () => void;
  onOpenLibrary: () => void;
  children?: React.ReactNode;
}

// 수업이 열려 있지 않을 때 보이는 시작 화면: 주 버튼 하나와 「내 서재에서 이어 하기」
export const LandingHero: React.FC<LandingHeroProps> = ({
  quota,
  hasOwnLesson,
  onUploadClick,
  onCameraClick,
  onOpenLibrary,
  children,
}) => {
  // 사진 한도를 다 쓴 날에는 아래 업로드 카드의 "다 썼어요" 안내가 대신한다
  const isPhotoLimitReached = Boolean(quota && quota.analyze.remaining === 0);
  if (isPhotoLimitReached) return null;

  return (
    <section className="space-y-3 mb-6">
      {children}
      <LandingDemoVideo />
      <button
        type="button"
        onClick={onUploadClick}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-indigo-700 cursor-pointer"
      >
        <Camera className="h-5 w-5" />
        내 책 올려 보기
      </button>
      <div className="text-center">
        <button
          type="button"
          onClick={onCameraClick}
          className="min-h-11 px-3 text-sm font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          카메라로 바로 촬영하기
        </button>
      </div>
      {quota && (
        <p className="text-center text-sm text-slate-600">
          오늘 사진 {quota.analyze.remaining}장 남음
        </p>
      )}
      {hasOwnLesson && (
        <div className="text-center">
          <button
            type="button"
            onClick={onOpenLibrary}
            className="min-h-11 px-3 text-sm font-semibold text-indigo-700 underline underline-offset-4 hover:text-indigo-900 cursor-pointer"
          >
            내 서재에서 이어 하기 →
          </button>
        </div>
      )}
      <p className="text-center text-xs leading-relaxed text-slate-600">
        서비스 개선을 위해 사용 기록(기기 번호, 재생 횟수)만 저장해요. 이름·이메일·사진은 기록하지 않아요.
      </p>
    </section>
  );
};
