import React, { useRef, useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Loader2, Languages, Camera } from 'lucide-react';

interface UploadSectionProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  demoChecked: boolean;
  onRunDemo: () => void;
  onRunPhoto: () => void;
  isLoading: boolean;
  loadingMessage: string;
}

/**
 * Optimizes image client-side to max 3000px on the longest dimension
 * Preserves ultra-high OCR resolution while preventing 15MB+ network bottlenecks
 */
export async function optimizeImageForOcr(file: File, maxDim = 3000): Promise<File> {
  return new Promise((resolve) => {
    // If small enough (< 2MB) and JPEG, return original
    if (file.size < 2 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/jpg')) {
      return resolve(file);
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Only downscale if exceeds 3000px
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(file);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const optimizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(optimizedFile);
        },
        'image/jpeg',
        0.88 // High quality for crisp text characters and diacritics
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleProcessFile = async (rawFile: File) => {
    const optimized = await optimizeImageForOcr(rawFile, 3000);
    onFileSelect(optimized);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm border border-slate-200 mb-6 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-800">
            교재 또는 원서 사진 등록
          </label>
          <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            <Languages className="h-3 w-3" />
            다국어 자동 언어 감지 & Vision OCR
          </span>
        </div>

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2.5 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50'
              : selectedFile
              ? 'border-indigo-400 bg-indigo-50/30'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50'
          }`}
        >
          {selectedFile ? (
            <div className="flex items-center gap-2 text-indigo-700 font-medium text-sm flex-wrap justify-center">
              <ImageIcon className="h-5 w-5 shrink-0" />
              <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                  if (cameraInputRef.current) cameraInputRef.current.value = '';
                }}
                className="ml-2 text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
              >
                삭제
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-7 w-7 text-slate-400" />
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-indigo-600">사진 파일 선택</span> 또는 드래그하여 업로드
              </div>
              <p className="text-[11px] text-slate-400 max-w-md">
                스마트폰으로 책 페이지를 찍어 올리시면 원어민 쉐도잉 교재로 즉시 변환됩니다 (장변 3,000px 정밀 분석 지원).
              </p>
            </>
          )}
        </div>

        {/* Mobile camera direct trigger button */}
        {!selectedFile && (
          <div className="mt-2.5 flex items-center justify-center sm:hidden">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-lg border border-slate-200 w-full justify-center transition cursor-pointer"
            >
              <Camera className="h-4 w-4 text-indigo-600" />
              <span>카메라로 바로 촬영하기</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        {demoChecked ? (
          <button
            onClick={onRunDemo}
            disabled={isLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            데모 페이지 실행하기
          </button>
        ) : (
          <button
            onClick={onRunPhoto}
            disabled={isLoading || !selectedFile}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
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
