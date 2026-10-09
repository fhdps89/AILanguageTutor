import React from 'react';
import { Camera } from 'lucide-react';
import { DailyQuota } from '../types';

interface LandingHeroProps {
  quota?: DailyQuota | null;
  hasOwnLesson: boolean;
  onUploadClick: () => void;
  onOpenLibrary: () => void;
  children?: React.ReactNode;
}

// 수업이 열려 있지 않을 때 보이는 시작 화면: 주 버튼 하나와 「내 서재에서 이어 하기」
export const LandingHero: React.FC<LandingHeroProps> = ({
  quota,
  hasOwnLesson,
  onUploadClick,
  onOpenLibrary,
  children,
}) => {
  // 사진 한도를 다 쓴 날에는 아래 업로드 카드의 "다 썼어요" 안내가 대신한다
  const isPhotoLimitReached = Boolean(quota && quota.analyze.remaining === 0);
  if (isPhotoLimitReached) return null;

  return (
    <section className="space-y-3 mb-6">
      {children}
      <button
        type="button"
        onClick={onUploadClick}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-indigo-700 cursor-pointer"
      >
        <Camera className="h-5 w-5" />
        내 책 올려 보기
      </button>
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
    </section>
  );
};
