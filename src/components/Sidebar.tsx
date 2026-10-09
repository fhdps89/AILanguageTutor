import React from 'react';
import { LibraryItem, SystemStatus } from '../types';
import { Sparkles, FolderOpen, History, Trash2 } from 'lucide-react';

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
          <div className="text-xs">
            <span className="font-semibold text-indigo-950 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-600" />
              데모 무료 체험 모드
            </span>
            <p className="text-[11px] text-slate-600 mt-1">
              사진 업로드 없이도 실제 쉐도잉과 네이티브 발음 및 구문 분석을 즉시 체험할 수 있습니다.
            </p>
          </div>
        </label>

        {demoChecked && onSelectDemoLang && (
          <div className="mt-3 pt-2.5 border-t border-indigo-100/80 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-600 block">체험할 데모 교재 선택:</span>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => onSelectDemoLang('zh')}
                className={`flex items-center justify-between p-2 rounded-md text-xs border text-left transition cursor-pointer ${
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
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    demoLang === 'zh' ? 'bg-amber-800 text-amber-100' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  신규
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectDemoLang('fr')}
                className={`flex items-center justify-between p-2 rounded-md text-xs border text-left transition cursor-pointer ${
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <History className="h-3.5 w-3.5 text-indigo-500" />
            <span>내 서재 (학습 기록)</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">{library.length}개 교재</span>
        </div>

        {library.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            저장된 학습 페이지가 없습니다. 사진을 업로드하거나 데모를 열어보세요.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {library.map((item) => {
              const isSelected = selectedKey === item.key;
              const isDemo = item.key === 'demo-arc' || item.key === 'demo-chinese';
              const langFlag = item.language?.flag || '🌐';
              const langName = item.language?.name_ko || '';

              return (
                <div
                  key={item.key}
                  className={`group relative flex items-center justify-between rounded-lg p-2.5 text-xs transition border cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 font-medium text-indigo-950 ring-1 ring-indigo-500/20'
                      : 'border-slate-100 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-200 text-slate-700'
                  }`}
                  onClick={() => onSelectKey(item.key)}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate font-semibold flex items-center gap-1">
                      <span>{langFlag}</span>
                      <span>{item.book_title || item.title}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      {langName ? `${langName} · ` : ''}{item.n_sentences}개 문장 · {item.saved_at.slice(0, 10)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isDemo && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLesson(item.key, item.book_title || item.title);
                        }}
                        className="opacity-60 group-hover:opacity-100 p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition"
                        title="서재에서 이 교재 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={onOpenSelected}
          disabled={!selectedKey || isLoading}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition disabled:opacity-50 cursor-pointer shadow-2xs"
        >
          <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
          선택한 교재 열기
        </button>
      </div>
    </aside>
  );
};
