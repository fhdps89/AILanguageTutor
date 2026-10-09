import React from 'react';
import { LibraryItem } from '../types';
import { FolderOpen, History, Trash2 } from 'lucide-react';

interface LibraryListProps {
  library: LibraryItem[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onOpenSelected: () => void;
  onDeleteLesson: (key: string, title?: string) => void;
  isLoading: boolean;
  variant: 'sidebar' | 'sheet';
}

export const LibraryList: React.FC<LibraryListProps> = ({
  library,
  selectedKey,
  onSelectKey,
  onOpenSelected,
  onDeleteLesson,
  isLoading,
  variant,
}) => {
  const isSheet = variant === 'sheet';

  return (
    <div className="space-y-3">
      {!isSheet && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <History className="h-3.5 w-3.5 text-indigo-500" />
            <span>내 서재 (학습 기록)</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">{library.length}개 교재</span>
        </div>
      )}

      {library.length === 0 ? (
        <div className={`rounded-lg border border-dashed border-slate-200 p-4 text-center text-slate-400 ${isSheet ? 'text-sm' : 'text-xs'}`}>
          저장된 학습 페이지가 없습니다. 사진을 업로드하거나 데모를 열어보세요.
        </div>
      ) : (
        <div className={isSheet ? 'space-y-2' : 'space-y-2 max-h-80 overflow-y-auto pr-1'}>
          {library.map((item) => {
            const isSelected = selectedKey === item.key;
            const isDemo = item.key === 'demo-arc' || item.key === 'demo-chinese';
            const langFlag = item.language?.flag || '🌐';
            const langName = item.language?.name_ko || '';

            return (
              <div
                key={item.key}
                className={`group relative flex items-center justify-between rounded-lg p-2.5 transition border cursor-pointer ${
                  isSheet ? 'min-h-16 text-sm' : 'text-xs'
                } ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/60 font-medium text-indigo-950 ring-1 ring-indigo-500/20'
                    : 'border-slate-100 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-200 text-slate-700'
                }`}
                onClick={() => onSelectKey(item.key)}
              >
                <button
                  type="button"
                  onClick={() => onSelectKey(item.key)}
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-1 flex-col truncate pr-2 text-left cursor-pointer"
                >
                  <span className="truncate font-semibold flex items-center gap-1">
                    <span>{langFlag}</span>
                    <span className="truncate">{item.book_title || item.title}</span>
                    {isDemo && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                        예시
                      </span>
                    )}
                  </span>
                  <span className={`mt-0.5 ${isSheet ? 'text-sm text-slate-500' : 'text-[11px] text-slate-400'}`}>
                    {langName ? `${langName} · ` : ''}{item.n_sentences}개 문장 · {item.saved_at.slice(0, 10)}
                  </span>
                </button>

                <div className="flex items-center gap-1">
                  {!isDemo && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLesson(item.key, item.book_title || item.title);
                      }}
                      className={`rounded text-slate-400 transition hover:bg-rose-100 hover:text-rose-600 ${
                        isSheet ? 'p-2.5 opacity-100' : 'p-1 opacity-60 group-hover:opacity-100'
                      }`}
                      title="서재에서 이 교재 삭제"
                      aria-label="서재에서 이 교재 삭제"
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
        className={`w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 font-semibold text-slate-700 transition disabled:opacity-50 cursor-pointer shadow-2xs ${
          isSheet ? 'min-h-12 text-sm' : 'py-2 text-xs'
        }`}
      >
        <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
        선택한 교재 열기
      </button>
    </div>
  );
};
