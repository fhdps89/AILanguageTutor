import React, { useRef } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Loader2, Languages } from 'lucide-react';

interface UploadSectionProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  demoChecked: boolean;
  onRunDemo: () => void;
  onRunPhoto: () => void;
  isLoading: boolean;
  loadingMessage: string;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  selectedFile,
  onFileSelect,
  demoChecked,
  onRunDemo,
  onRunPhoto,
  isLoading,
  loadingMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200 mb-6 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-800">
            외국어 페이지 사진 업로드
          </label>
          <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            <Languages className="h-3 w-3" />
            영어, 프랑스어, 일본어, 스페인어, 독일어 등 자동 판독
          </span>
        </div>
        
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
            selectedFile
              ? 'border-indigo-400 bg-indigo-50/30'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            className="hidden"
            onChange={handleFileChange}
          />
          {selectedFile ? (
            <div className="flex items-center gap-2 text-indigo-700 font-medium text-sm">
              <ImageIcon className="h-5 w-5" />
              <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="ml-2 text-xs text-rose-500 hover:underline"
              >
                삭제
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-slate-400" />
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-indigo-600">클릭하여 사진 선택</span> 또는 파일을 여기로 드래그하세요
              </div>
              <p className="text-[11px] text-slate-400">
                영어 원서, 프랑스어 신문, 일본어 교재 등 어떤 언어든 자동으로 언어를 감지하여 쉐도잉 콘텐츠를 생성합니다.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        {demoChecked ? (
          <button
            onClick={onRunDemo}
            disabled={isLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            데모 페이지 실행하기
          </button>
        ) : (
          <button
            onClick={onRunPhoto}
            disabled={isLoading || !selectedFile}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            사진 언어 판독 & 쉐도잉 생성
          </button>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
            <span>{loadingMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
