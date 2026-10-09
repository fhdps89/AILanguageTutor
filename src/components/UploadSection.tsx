import React, { useRef, useState, useEffect } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Loader2, Languages, Camera } from 'lucide-react';
import { DailyQuota } from '../types';

interface UploadSectionProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  demoChecked: boolean;
  demoLang?: 'zh' | 'fr';
  onRunDemo: () => void;
  onRunPhoto: () => void;
  isLoading: boolean;
  loadingMessage: string;
  quota?: DailyQuota | null;
  onContinueFromLibrary?: () => void;
  burstLimitMessage?: string | null;
}

/**
 * Optimizes image client-side to max 2500px on the longest dimension
 * Handles EXIF orientation, mobile camera captures, and memory safety
 */
export async function optimizeImageForOcr(file: File, maxDim = 2500): Promise<File> {
  return new Promise((resolve) => {
    // If small enough (< 2MB) and JPEG, return original
    if (file.size < 2 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/jpg')) {
      return resolve(file);
    }

    // Try modern createImageBitmap (hardware-accelerated, auto EXIF orient, off-thread)
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then((bitmap) => {
          let { width, height } = bitmap;
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
            bitmap.close();
            return resolve(file);
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, 0, 0, width, height);
          bitmap.close();

          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              const safeName = (file.name || 'camera_photo').replace(/\.[^/.]+$/, '') + '.jpg';
              resolve(new File([blob], safeName, { type: 'image/jpeg', lastModified: Date.now() }));
            },
            'image/jpeg',
            0.88
          );
        })
        .catch(() => {
          fallbackImageLoad(file, maxDim, resolve);
        });
      return;
    }

    fallbackImageLoad(file, maxDim, resolve);
  });
}

function fallbackImageLoad(file: File, maxDim: number, resolve: (f: File) => void) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    URL.revokeObjectURL(url);
    let { width, height } = img;

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
        const safeName = (file.name || 'camera_photo').replace(/\.[^/.]+$/, '') + '.jpg';
        const optimizedFile = new File([blob], safeName, {
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
    // If client cannot decode (e.g. raw HEIC on iOS), pass raw file to server where sharp handles it
    resolve(file);
  };

  img.src = url;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  selectedFile,
  onFileSelect,
  demoChecked,
  demoLang = 'zh',
  onRunDemo,
  onRunPhoto,
  isLoading,
  loadingMessage,
  quota,
  onContinueFromLibrary,
  burstLimitMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const continueBtnRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isPhotoLimitReached = Boolean(quota && quota.analyze.remaining === 0);

  useEffect(() => {
    if (isPhotoLimitReached && onContinueFromLibrary) {
      continueBtnRef.current?.focus();
    }
  }, [isPhotoLimitReached, Boolean(onContinueFromLibrary)]);

  const handleProcessFile = async (rawFile: File) => {
    const optimized = await optimizeImageForOcr(rawFile, 2500);
    onFileSelect(optimized);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleProcessFile(file);
      e.target.value = '';
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
      {isPhotoLimitReached ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 sm:p-6 space-y-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-800">
            오늘 올릴 수 있는 사진 {quota?.analyze.limit}장을 다 썼어요
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            밤 12시(한국 시간)에 다시 {quota?.analyze.limit}장이 채워져요. 이미 만든 수업은 서재에서 계속 듣고 따라 읽을 수 있어요.
          </p>
          {onContinueFromLibrary && (
            <div className="pt-1">
              <button
                ref={continueBtnRef}
                type="button"
                onClick={onContinueFromLibrary}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold transition cursor-pointer shadow-xs focus:outline-hidden focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                서재에서 이어 하기
              </button>
            </div>
          )}
        </div>
      ) : (
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

          {/* Hidden inputs - explicit image/jpeg signals iOS to convert camera capture to JPEG */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
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
                  스마트폰으로 책 페이지를 찍어 올리시면 중국어, 프랑스어, 영어, 한국어 등 원어민 쉐도잉 교재로 즉시 변환됩니다 (장변 3,000px 정밀 분석 지원).
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

          {/* 15-minute burst limit message */}
          {burstLimitMessage && (
            <p className="text-sm text-slate-600 mt-2 font-medium">
              {burstLimitMessage}
            </p>
          )}
        </div>
      )}

      {/* Quota indicator line: right below upload area, right-aligned */}
      {quota && (
        <div
          aria-live="polite"
          className="mt-2 text-sm text-slate-600 text-right"
        >
          <div className="flex items-center justify-end flex-wrap gap-x-1">
            <span>오늘</span>
            <span className={quota.analyze.remaining <= 5 ? 'text-amber-700 font-medium' : ''}>
              사진 {quota.analyze.remaining}장 남음
              {quota.analyze.remaining <= 5 && (
                <span className="text-xs ml-1 font-normal">(자정에 다시 {quota.analyze.limit}장)</span>
              )}
            </span>
            {quota.tts.remaining > 0 && (
              <>
                <span className="text-slate-400 mx-0.5">·</span>
                <span className={quota.tts.remaining <= 10 ? 'text-amber-700 font-medium' : ''}>
                  음성 {quota.tts.remaining}회 남음
                  {quota.tts.remaining <= 10 && (
                    <span className="text-xs ml-1 font-normal">(처음 듣는 문장만 줄어요)</span>
                  )}
                </span>
              </>
            )}
          </div>
          {quota.tts.remaining === 0 && (
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              {quota.tts.blockedBy === 'global'
                ? '오늘은 많은 분이 이용해서 새 음성이 잠시 쉬고 있어요. 이미 들은 문장은 계속 들을 수 있어요.'
                : `오늘 새로 만들 수 있는 음성을 다 썼어요. 이미 들은 문장은 계속 들을 수 있고, 밤 12시(한국 시간)에 다시 ${quota.tts.limit}회가 채워져요.`}
            </p>
          )}
        </div>
      )}

      {(demoChecked || (!isPhotoLimitReached) || isLoading) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {demoChecked ? (
            <button
              onClick={onRunDemo}
              disabled={isLoading}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 cursor-pointer ${
                demoLang === 'zh'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {demoLang === 'zh' ? '🇨🇳 중국어 데모 실행하기' : '🇫🇷 프랑스어 데모 실행하기'}
            </button>
          ) : (
            !isPhotoLimitReached && (
              <button
                onClick={onRunPhoto}
                disabled={isLoading || !selectedFile}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                사진 언어 판독 & 쉐도잉 생성
              </button>
            )
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              <span>{loadingMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
