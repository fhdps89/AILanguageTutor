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
          <span
            className="block text-xs font-semibold tracking-wide text-indigo-700"
            title={`build ${build}`}
          >
            AI 다국어 쉐도잉 튜터
          </span>
          <h1 className="mt-0.5 break-keep text-2xl font-bold tracking-tight text-slate-900">
            책을 사진 찍으면 문장별로 읽어 주는 앱
          </h1>
          <p className="break-keep text-sm text-slate-600 mt-1">
            중국어, 프랑스어, 영어, 일본어 등, 언어는 자동으로 알아봐요.
          </p>
        </div>
      </div>
    </header>
  );
};
