import React from 'react';
import { LibraryItem, SystemStatus } from '../types';
import { Sparkles, FolderOpen, History, Cpu, Zap, Check } from 'lucide-react';

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
            {status.availableProviders.map((prov) => {
              const isSelected = selectedProvider === prov.id;
              return (
                <button
                  key={prov.id}
                  type="button"
                  onClick={() => onSelectProvider(prov.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-medium'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1 font-semibold">
                      <Zap className={`h-3 w-3 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                      {prov.name}
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
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600">
              이전 분석 불러오기
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

            <button
              onClick={onOpenSelected}
              disabled={isLoading || !selectedKey}
              className="w-full flex items-center justify-center gap-1.5 rounded-md bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              선택한 페이지 열기
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
