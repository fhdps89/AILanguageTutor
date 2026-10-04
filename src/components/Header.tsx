import React from 'react';
import { Globe, BookOpen } from 'lucide-react';

interface HeaderProps {
  build: string;
}

export const Header: React.FC<HeaderProps> = ({ build }) => {
  return (
    <header className="mb-6 border-b border-slate-200 pb-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md">
          <Globe className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI 다국어 쉐도잉 튜터
            </h1>
            <span className="text-xs font-mono text-slate-500">build {build}</span>
          </div>
          <p className="text-sm text-slate-600 mt-0.5">
            어떤 외국어든 책·교재 사진 한 장 → 언어 자동 판독 & 원어 음성 쉐도잉 학습 (중국어·프랑스어·영어·일본어·스페인어·독일어 등)
          </p>
        </div>
      </div>
    </header>
  );
};
