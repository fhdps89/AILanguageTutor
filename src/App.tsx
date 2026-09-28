import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UploadSection } from './components/UploadSection';
import { FullPagePlayer } from './components/FullPagePlayer';
import { SentenceCard } from './components/SentenceCard';
import { LessonPage, LibraryItem, SystemStatus } from './types';
import { Info, AlertCircle, CheckCircle2 } from 'lucide-react';

export function App() {
  const [status, setStatus] = useState<SystemStatus>({
    activeEngine: '확인 중...',
    currentProvider: 'gemini',
    currentModel: '',
    build: '20260927-libname',
    hasGemini: false,
    hasOpenRouter: false,
    hasXAI: false,
    availableProviders: [],
  });

  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter');
  const [demoChecked, setDemoChecked] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState<LessonPage | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [audioFiles, setAudioFiles] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // 1. Initial status and library load
  useEffect(() => {
    fetchStatus();
    fetchLibraryAndLoadLatest();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data: SystemStatus = await res.json();
        setStatus(data);
        if (data.currentProvider) {
          setSelectedProvider(data.currentProvider);
        }
      }
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  };

  const fetchLibraryAndLoadLatest = async () => {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        const list: LibraryItem[] = await res.json();
        setLibrary(list);
        if (list.length > 0 && !currentKey) {
          setSelectedKey(list[0].key);
          loadLesson(list[0].key);
        }
      }
    } catch (err) {
      console.error('Failed to load library', err);
    }
  };

  const loadLesson = async (key: string) => {
    setIsLoading(true);
    setLoadingMessage('페이지를 불러오는 중입니다...');
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`/api/lesson/${key}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '불러오기에 실패했습니다.');
      }
      const data = await res.json();
      setCurrentPage(data.page);
      setCurrentKey(data.key);
      setPhotoUrl(data.photoUrl || null);
      setAudioFiles(data.audioFiles || {});
      setSelectedKey(data.key);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunDemo = async () => {
    setIsLoading(true);
    setLoadingMessage('데모 페이지 음성 및 데이터를 불러오는 중...');
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch('/api/demo');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '데모를 불러오지 못했습니다.');
      }
      const data = await res.json();
      setCurrentPage(data.page);
      setCurrentKey('demo-arc');
      setPhotoUrl(null);
      setAudioFiles({
        'lecture_complete.mp3': '/api/audio/demo-arc/lecture_complete.mp3',
        ...Object.fromEntries(
          data.page.sentences.flatMap((s: any) => [
            [`${s.id}.mp3`, `/api/audio/demo-arc/${s.id}.mp3`],
            [`${s.id}_practice.mp3`, `/api/audio/demo-arc/${s.id}_practice.mp3`],
          ])
        ),
      });
      setInfoMessage('개선문 데모 페이지를 불러왔습니다. 각 문장의 1.0x 및 0.75x 쉐도잉을 바로 학습해보세요.');
      fetchLibraryAndLoadLatest();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunPhoto = async () => {
    if (!selectedFile) return;

    const currentProviderObj = status.availableProviders.find(p => p.id === selectedProvider);
    const engineLabel = currentProviderObj ? currentProviderObj.name : status.activeEngine;

    setIsLoading(true);
    setLoadingMessage(`Vision OCR 분석 중 (${engineLabel})...`);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const formData = new FormData();
      formData.append('photo', selectedFile);
      formData.append('provider', selectedProvider);
      if (currentProviderObj?.model) {
        formData.append('model', currentProviderObj.model);
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '사진 분석에 실패했습니다.');
      }

      const data = await res.json();
      setCurrentPage(data.page);
      setCurrentKey(data.key);
      setPhotoUrl(data.photoUrl || URL.createObjectURL(selectedFile));
      setAudioFiles({});

      if (data.reused) {
        setInfoMessage('이미 분석한 사진입니다. 캐시된 데이터를 재사용합니다.');
      } else {
        const langLabel = data.page?.language ? `${data.page.language.flag} ${data.page.language.name_ko}` : '외국어';
        setInfoMessage(`[${engineLabel}] ${langLabel} 언어 판독 및 구문 분해가 완료되었습니다!`);
      }

      fetchLibraryAndLoadLatest();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Header build={status.build} />

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar */}
        <Sidebar
          status={status}
          selectedProvider={selectedProvider}
          onSelectProvider={setSelectedProvider}
          demoChecked={demoChecked}
          onDemoChange={setDemoChecked}
          library={library}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onOpenSelected={() => selectedKey && loadLesson(selectedKey)}
          isLoading={isLoading}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full space-y-6">
          <UploadSection
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
            demoChecked={demoChecked}
            onRunDemo={handleRunDemo}
            onRunPhoto={handleRunPhoto}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
          />

          {/* Feedback messages */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-4 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <span className="font-semibold">오류: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {infoMessage && (
            <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Page Display (render_page equivalent) */}
          {currentPage ? (
            <div className="space-y-6">
              {/* Disclaimer */}
              <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 border border-amber-200/70 px-4 py-2.5 text-xs text-amber-800">
                <Info className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {currentPage.disclaimer_ko || '음성은 합성 TTS이며 원어민이 아닙니다. 한글 표기는 힌트([~])일 뿐입니다.'}
                </span>
              </div>

              {/* Uploaded photo if exists */}
              {photoUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-white p-3 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 mb-2">분석된 원본 사진</div>
                  <img
                    src={photoUrl}
                    alt="Uploaded page"
                    className="max-h-96 w-full object-contain rounded-lg bg-slate-50"
                  />
                </div>
              )}

              {/* Full Page 1.0x Player */}
              <FullPagePlayer
                title={currentPage.library_name || currentPage.title || '학습 본문'}
                fullScript={currentPage.full_tts_script || ''}
                language={currentPage.language}
                audioUrl={audioFiles['lecture_complete.mp3']}
                lessonKey={currentKey}
                pageData={currentPage}
              />

              {/* Sentence Breakdown List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                    문장별 쉐도잉 훈련 ({currentPage.sentences?.length || 0}문장)
                  </h3>
                  <span className="text-xs text-slate-500">
                    원문 청취(1.0x) 및 반복 쉐도잉(0.75x)
                  </span>
                </div>

                {currentPage.sentences?.map((sentence) => {
                  const rawAudio = audioFiles[`${sentence.id}.mp3`];
                  const practiceAudio = audioFiles[`${sentence.id}_practice.mp3`];

                  return (
                    <SentenceCard
                      key={sentence.id}
                      sentence={sentence}
                      language={currentPage.language}
                      rawAudioUrl={rawAudio}
                      practiceAudioUrl={practiceAudio}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 space-y-2">
              <Info className="mx-auto h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">
                데모를 켜고 데모 페이지 만들기, 또는 사진 분석을 누르세요.
              </p>
              <p className="text-xs text-slate-500">
                사이드바의 [데모: 개선문 페이지] 체크박스를 선택하면 즉시 무료로 쉐도잉 트랙을 체험할 수 있습니다.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
