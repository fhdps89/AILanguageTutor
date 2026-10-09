import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { LibraryItem } from '../types';
import { LibraryList } from './LibraryList';

interface LibrarySheetProps {
  open: boolean;
  onClose: () => void;
  library: LibraryItem[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onOpenSelected: () => void;
  onDeleteLesson: (key: string, title?: string) => void;
  isLoading: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// 휴대폰(768px 미만)에서 아래에서 올라오는 「내 서재」 시트
export const LibrarySheet: React.FC<LibrarySheetProps> = ({
  open,
  onClose,
  library,
  selectedKey,
  onSelectKey,
  onOpenSelected,
  onDeleteLesson,
  isLoading,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // 시트를 연 버튼으로 돌아갈 수 있게 지금 포커스를 기억한다
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="내 서재"
        className="relative flex w-full max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl"
      >
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">내 서재 (학습 기록)</h2>
            <div className="flex items-center gap-1">
              <span className="text-sm font-mono text-slate-600">{library.length}개 교재</span>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-600">이 기기에만 저장돼요</p>
        </div>
        <div className="overflow-y-auto px-4 pb-6 pt-3">
          <LibraryList
            variant="sheet"
            library={library}
            selectedKey={selectedKey}
            onSelectKey={onSelectKey}
            onOpenSelected={onOpenSelected}
            onDeleteLesson={onDeleteLesson}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};
