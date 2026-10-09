import React from 'react';
import { Globe, BookOpen } from 'lucide-react';

interface HeaderProps {
  build: string;
  onOpenLibrary: () => void;
}

export const Header: React.FC<HeaderProps> = ({ build, onOpenLibrary }) => {
  return (
    <header className="mb-6 border-b border-slate-200 pb-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md">
            <Globe className="h-4 w-4" />
          </div>
          <span
            className="block text-xs font-semibold tracking-wide text-indigo-700"
            title={`build ${build}`}
          >
            AI 다국어 쉐도잉 튜터
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          aria-label="내 서재 열기"
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <BookOpen className="h-4 w-4 text-slate-500" />
          내 서재
        </button>
      </div>
      <h1 className="mt-3 break-keep text-2xl font-bold tracking-tight text-slate-900">
        책을 사진 찍으면 문장별로 읽어 주는 앱
      </h1>
      <p className="break-keep text-sm text-slate-600 mt-1">
        중국어, 프랑스어, 영어, 일본어 등, 언어는 자동으로 알아봐요.
      </p>
    </header>
  );
};
