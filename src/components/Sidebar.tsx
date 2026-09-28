import React from 'react';
import { LibraryItem, SystemStatus } from '../types';
import { Sparkles, FolderOpen, History, Cpu, Zap, Check, Trash2 } from 'lucide-react';

interface SidebarProps {
  status: SystemStatus;
  selectedProvider: string;
  onSelectProvider: (providerId: string) => void;
  demoChecked: boolean;
  onDemoChange: (val: boolean) => void;
  library: LibraryItem[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onOpenSelected: () => void;
  onDeleteLesson: (key: string, title?: string) => void;
  isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  status,
  selectedProvider,
  onSelectProvider,
  demoChecked,
  onDemoChange,
  library,
  selectedKey,
  onSelectKey,
  onOpenSelected,
  onDeleteLesson,
  isLoading,
}) => {
  return (
    <aside className="w-full md:w-80 shrink-0 space-y-6 rounded-xl bg-white p-5 shadow-sm border border-slate-200">
      {/* Vision Engine Selector */}
      <div className="space-y-3 pb-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Cpu className="h-3.5 w-3.5 text-indigo-500" />
            <span>Vision 엔진 선택</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">build {status.build}</span>
        </div>

        {status.availableProviders && status.availableProviders.length > 0 ? (
          <div className="space-y-1.5">
            {[...status.availableProviders]
              .sort((a, b) => (a.id === 'gemini' ? -1 : b.id === 'gemini' ? 1 : 0))
              .map((prov) => {
                const isSelected = selectedProvider === prov.id;
                const isDefault = prov.id === 'gemini';
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => onSelectProvider(prov.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-medium ring-1 ring-indigo-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Zap className={`h-3 w-3 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {prov.name}
                        {isDefault && (
                          <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-medium bg-emerald-100 text-emerald-800 rounded">
                            기본
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                        모델: {prov.model}
                      </span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            현재 엔진: <span className="font-semibold text-slate-900">{status.activeEngine}</span>
          </div>
        )}
      </div>

      {/* Demo Option */}
      <div className="rounded-lg bg-indigo-50/70 p-3.5 border border-indigo-100">
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
              데모: 개선문 페이지 (무료 체험)
            </span>
            <p className="mt-0.5 text-indigo-700/80 leading-relaxed">
              API 호출 없이 파리 개선문 프랑스어 지문과 녹음 음성을 즉시 테스트합니다.
            </p>
          </div>
        </label>
      </div>

      {/* Saved Library */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <History className="h-3.5 w-3.5 text-slate-500" />
          <span>저장된 페이지</span>
        </div>

        {library.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">
            아직 저장된 분석이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                이전 분석 선택
              </label>
              <select
                value={selectedKey || ''}
                onChange={(e) => onSelectKey(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {library.map((item) => {
                  const flag = item.language?.flag || '📄';
                  return (
                    <option key={item.key} value={item.key}>
                      {flag} {item.title || item.book_title || item.key}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Quick Actions: Open & Delete */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onOpenSelected}
                disabled={isLoading || !selectedKey}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                선택 페이지 열기
              </button>
              <button
                type="button"
                onClick={() => {
                  const item = library.find(l => l.key === selectedKey);
                  if (selectedKey) onDeleteLesson(selectedKey, item?.title || item?.book_title);
                }}
                disabled={isLoading || !selectedKey}
                className="flex items-center justify-center gap-1 rounded-md bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition disabled:opacity-50 cursor-pointer"
                title="선택한 페이지 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </button>
            </div>

            {/* Scrollable list with direct open & delete icons for easily cleaning duplicates */}
            <div className="space-y-1 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                목록에서 중복/불필요 항목 삭제:
              </span>
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                {library.map((item) => {
                  const isCurrent = item.key === selectedKey;
                  const flag = item.language?.flag || '📄';
                  const title = item.title || item.book_title || item.key;
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs transition ${
                        isCurrent
                          ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-medium ring-1 ring-indigo-500/20'
                          : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectKey(item.key);
                          onOpenSelected();
                        }}
                        className="flex items-center gap-1.5 text-left truncate flex-1 cursor-pointer mr-2"
                        title={`클릭하여 "${title}" 열기`}
                      >
                        <span className="text-sm shrink-0">{flag}</span>
                        <div className="truncate">
                          <p className="truncate font-medium">{title}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {item.n_sentences ? `${item.n_sentences}문장` : ''} • {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLesson(item.key, title);
                        }}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition cursor-pointer shrink-0"
                        title={`"${title}" 삭제`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
