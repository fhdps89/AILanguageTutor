import React from 'react';
import { LibraryItem, SystemStatus } from '../types';
import { Sparkles } from 'lucide-react';
import { LibraryList } from './LibraryList';

interface SidebarProps {
  status: SystemStatus;
  demoChecked: boolean;
  onDemoChange: (val: boolean) => void;
  demoLang?: 'zh' | 'fr';
  onSelectDemoLang?: (lang: 'zh' | 'fr') => void;
  library: LibraryItem[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onOpenSelected: () => void;
  onDeleteLesson: (key: string, title?: string) => void;
  isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  demoChecked,
  onDemoChange,
  demoLang = 'zh',
  onSelectDemoLang,
  library,
  selectedKey,
  onSelectKey,
  onOpenSelected,
  onDeleteLesson,
  isLoading,
}) => {
  return (
    <aside className="w-full md:w-80 shrink-0 space-y-5 rounded-xl bg-white p-4 sm:p-5 shadow-sm border border-slate-200">
      {/* Demo Option */}
      <div className="rounded-lg bg-indigo-50/50 p-3.5 border border-indigo-100">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={demoChecked}
            onChange={(e) => onDemoChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="text-sm">
            <span className="font-semibold text-indigo-950 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-600" />
              데모 무료 체험 모드
            </span>
            <p className="text-sm text-slate-600 mt-1">
              사진 업로드 없이도 실제 쉐도잉과 네이티브 발음 및 구문 분석을 즉시 체험할 수 있습니다.
            </p>
          </div>
        </label>

        {demoChecked && onSelectDemoLang && (
          <div className="mt-3 pt-2.5 border-t border-indigo-100/80 space-y-1.5">
            <span className="text-sm font-bold text-slate-600 block">체험할 데모 교재 선택:</span>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => onSelectDemoLang('zh')}
                className={`flex items-center justify-between p-2 rounded-md text-sm border text-left transition cursor-pointer ${
                  demoLang === 'zh'
                    ? 'bg-amber-600 text-white font-semibold border-amber-700 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>🇨🇳</span>
                  <span>중국어: 베이징 고궁 자금성</span>
                </span>
                <span
                  className={`text-xs px-1.5 py-0.2 rounded font-bold ${
                    demoLang === 'zh' ? 'bg-amber-800 text-amber-100' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  신규
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectDemoLang('fr')}
                className={`flex items-center justify-between p-2 rounded-md text-sm border text-left transition cursor-pointer ${
                  demoLang === 'fr'
                    ? 'bg-indigo-600 text-white font-semibold border-indigo-700 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>🇫🇷</span>
                  <span>프랑스어: 파리 개선문</span>
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Library History */}
      <div id="library-section" tabIndex={-1} className="outline-none hidden md:block">
        <LibraryList
          variant="sidebar"
          library={library}
          selectedKey={selectedKey}
          onSelectKey={onSelectKey}
          onOpenSelected={onOpenSelected}
          onDeleteLesson={onDeleteLesson}
          isLoading={isLoading}
        />
      </div>
    </aside>
  );
};
