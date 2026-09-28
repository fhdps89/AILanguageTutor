import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UploadSection } from './components/UploadSection';
import { FullPagePlayer } from './components/FullPagePlayer';
import { SentenceCard } from './components/SentenceCard';
import { LessonPage, LibraryItem, SystemStatus, StudyBookmark } from './types';
import { Info, AlertCircle, CheckCircle2, Bookmark, ArrowRight, X } from 'lucide-react';

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

  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
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

  // Local storage helpers to preserve history across re-deployments
  const STORAGE_LIB_KEY = 'ai_tutor_saved_library_v1';
  const STORAGE_PAGES_KEY = 'ai_tutor_saved_pages_v1';
  const STORAGE_BOOKMARK_KEY = 'ai_tutor_saved_bookmark_v1';

  const [bookmark, setBookmark] = useState<StudyBookmark | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_BOOKMARK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const getStoredLibrary = (): LibraryItem[] => {
    try {
      const raw = localStorage.getItem(STORAGE_LIB_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveStoredLibrary = (list: LibraryItem[]) => {
    try {
      localStorage.setItem(STORAGE_LIB_KEY, JSON.stringify(list));
    } catch {}
  };

  const getStoredPage = (key: string): { page: LessonPage; photoUrl?: string | null; audioFiles?: Record<string, string> } | null => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PAGES_KEY}_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const saveStoredPage = (key: string, data: { page: LessonPage; photoUrl?: string | null; audioFiles?: Record<string, string> }) => {
    try {
      localStorage.setItem(`${STORAGE_PAGES_KEY}_${key}`, JSON.stringify(data));
    } catch {}
  };

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
        if (data.availableProviders?.some(p => p.id === 'gemini')) {
          setSelectedProvider('gemini');
        } else if (data.currentProvider) {
          setSelectedProvider(data.currentProvider);
        } else if (data.availableProviders && data.availableProviders.length > 0) {
          setSelectedProvider(data.availableProviders[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  };

  const fetchLibraryAndLoadLatest = async () => {
    try {
      let serverList: LibraryItem[] = [];
      try {
        const res = await fetch('/api/library');
        if (res.ok) {
          serverList = await res.json();
        }
      } catch (err) {
        console.warn('Server library fetch failed, using local storage backup', err);
      }

      // Merge server library with browser localStorage backup
      const localList = getStoredLibrary();
      const mergedMap = new Map<string, LibraryItem>();
      localList.forEach(item => mergedMap.set(item.key, item));
      serverList.forEach(item => mergedMap.set(item.key, item));

      const mergedList = Array.from(mergedMap.values());
      saveStoredLibrary(mergedList);
      setLibrary(mergedList);

      if (mergedList.length > 0 && !currentKey) {
        setSelectedKey(mergedList[0].key);
        loadLesson(mergedList[0].key);
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
      let loadedData: { page: LessonPage; key: string; photoUrl?: string | null; audioFiles?: Record<string, string> } | null = null;

      try {
        const res = await fetch(`/api/lesson/${key}`);
        if (res.ok) {
          loadedData = await res.json();
        }
      } catch {}

      // If server does not have the file (e.g. fresh container deploy), restore from localStorage
      if (!loadedData) {
        const localData = getStoredPage(key);
        if (localData) {
          loadedData = { key, ...localData };
          setInfoMessage('브라우저에 보존된 과거 학습 기록을 불러왔습니다.');
        } else {
          throw new Error('페이지를 불러오지 못했습니다.');
        }
      }

      // Ensure demo-arc uses pure Gemini TTS endpoints and removes any legacy /api/audio references
      if (loadedData && (key === 'demo-arc' || (loadedData.audioFiles && Object.values(loadedData.audioFiles).some(url => url.includes('/api/audio/demo-arc'))))) {
        const langParam = loadedData.page.language?.name_en || 'French';
        const fullText = (loadedData.page.sentences || []).map((s: any) => s.tts_text || s.raw_text).join(' ');
        loadedData.audioFiles = {
          'lecture_complete.mp3': `/api/tts?text=${encodeURIComponent(fullText)}&lang=${encodeURIComponent(langParam)}`,
          ...Object.fromEntries(
            (loadedData.page.sentences || []).map((s: any) => [
              `${s.id}.mp3`,
              `/api/tts?text=${encodeURIComponent(s.tts_text || s.raw_text)}&lang=${encodeURIComponent(langParam)}`,
            ])
          ),
        };
      }

      if (loadedData) {
        // Cache cleaned data to local storage
        saveStoredPage(key, {
          page: loadedData.page,
          photoUrl: loadedData.photoUrl,
          audioFiles: loadedData.audioFiles,
        });
      }

      setCurrentPage(loadedData.page);
      setCurrentKey(loadedData.key);
      setPhotoUrl(loadedData.photoUrl || null);
      setAudioFiles(loadedData.audioFiles || {});
      setSelectedKey(loadedData.key);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLesson = async (key: string, title?: string) => {
    const displayName = title || key;
    if (!window.confirm(`"${displayName}" 분석 기록을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`)) {
      return;
    }

    try {
      // 1. Call server to delete folder & library record
      try {
        await fetch(`/api/lesson/${key}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Server delete call failed, continuing local cleanup', err);
      }

      // 2. Clean from localStorage
      try {
        localStorage.removeItem(`${STORAGE_PAGES_KEY}_${key}`);
        const currentStored = getStoredLibrary();
        const updatedStored = currentStored.filter((item) => item.key !== key);
        saveStoredLibrary(updatedStored);
      } catch (err) {
        console.warn('LocalStorage cleanup failed', err);
      }

      // 3. Update React state
      const updatedList = library.filter((item) => item.key !== key);
      setLibrary(updatedList);

      // If deleted lesson was currently open
      if (currentKey === key) {
        if (updatedList.length > 0) {
          setSelectedKey(updatedList[0].key);
          loadLesson(updatedList[0].key);
        } else {
          setCurrentPage(null);
          setCurrentKey(null);
          setSelectedKey(null);
          setPhotoUrl(null);
          setAudioFiles({});
        }
      } else if (selectedKey === key) {
        setSelectedKey(updatedList.length > 0 ? updatedList[0].key : null);
      }

      setInfoMessage(`"${displayName}" 분석 기록이 삭제되었습니다.`);
    } catch (err: any) {
      setErrorMessage(`삭제 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  const handleToggleBookmark = (sentenceId: string, sentenceText: string) => {
    if (!currentPage || !currentKey) return;

    if (bookmark && bookmark.lessonKey === currentKey && bookmark.sentenceId === sentenceId) {
      setBookmark(null);
      localStorage.removeItem(STORAGE_BOOKMARK_KEY);
      setInfoMessage(`[${sentenceId}] 시작 위치 북마크가 해제되었습니다.`);
      return;
    }

    const lessonTitle = currentPage.library_name || currentPage.library_title || currentPage.title || '학습 교재';
    const cleanSnippet = sentenceText.trim().replace(/\s+/g, ' ');
    const newBookmark: StudyBookmark = {
      lessonKey: currentKey,
      lessonTitle,
      sentenceId,
      sentenceText: cleanSnippet.length > 50 ? cleanSnippet.slice(0, 50) + '...' : cleanSnippet,
      updatedAt: new Date().toISOString(),
    };

    setBookmark(newBookmark);
    localStorage.setItem(STORAGE_BOOKMARK_KEY, JSON.stringify(newBookmark));
    setInfoMessage(`📌 [${sentenceId}] 문장이 '내일은 여기서부터 시작' 지점으로 지정되었습니다.`);
  };

  const handleResumeBookmark = async () => {
    if (!bookmark) return;

    if (currentKey !== bookmark.lessonKey) {
      await loadLesson(bookmark.lessonKey);
    }

    setTimeout(() => {
      const el = document.getElementById(`sentence-${bookmark.sentenceId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-amber-400');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-amber-400');
        }, 2200);
      }
    }, 350);
  };

  const handleClearBookmark = () => {
    setBookmark(null);
    localStorage.removeItem(STORAGE_BOOKMARK_KEY);
    setInfoMessage('시작 지점 북마크가 해제되었습니다.');
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
      const langParam = data.page.language?.name_en || 'French';
      const demoAudios = data.audioFiles || {
        'lecture_complete.mp3': `/api/tts?text=${encodeURIComponent(data.page.sentences.map((s: any) => s.tts_text || s.raw_text).join(' '))}&lang=${encodeURIComponent(langParam)}`,
        ...Object.fromEntries(
          data.page.sentences.map((s: any) => [
            `${s.id}.mp3`,
            `/api/tts?text=${encodeURIComponent(s.tts_text || s.raw_text)}&lang=${encodeURIComponent(langParam)}`,
          ])
        ),
      };
      setAudioFiles(demoAudios);
      setInfoMessage('개선문 데모 페이지를 불러왔습니다. Gemini 고품질 원어민 음성으로 바로 학습해보세요.');
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
      const activePhotoUrl = data.photoUrl || URL.createObjectURL(selectedFile);
      setPhotoUrl(activePhotoUrl);
      const returnedAudioFiles = data.audioFiles || {};
      setAudioFiles(returnedAudioFiles);

      // Save to localStorage so it is never lost on redeploy
      saveStoredPage(data.key, {
        page: data.page,
        photoUrl: activePhotoUrl,
        audioFiles: returnedAudioFiles,
      });

      const newItem: LibraryItem = {
        key: data.key,
        title: data.page.title,
        book_title: data.page.library_title || '교재 학습',
        page_no: data.page.library_page || 1,
        created_at: new Date().toISOString(),
        source: 'upload',
        n_sentences: data.page.sentences.length,
        saved_at: new Date().toISOString(),
        language: data.page.language,
      };
      const curList = getStoredLibrary();
      const updatedList = [newItem, ...curList.filter(item => item.key !== data.key)];
      saveStoredLibrary(updatedList);

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
          onDeleteLesson={handleDeleteLesson}
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

          {/* "내일은 여기서부터 시작" 이어 학습하기 북마크 배너 */}
          {bookmark && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50 border border-amber-300/80 p-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                  <Bookmark className="h-5 w-5 fill-current" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded">
                      📍 내일은 여기서부터 시작
                    </span>
                    <span className="text-[11px] text-amber-700/80">
                      {new Date(bookmark.updatedAt).toLocaleDateString()} 저장
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">
                    <span className="font-semibold text-slate-900">{bookmark.lessonTitle}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="font-mono text-indigo-700 font-bold mr-1.5">{bookmark.sentenceId}</span>
                    <span className="text-slate-600 line-clamp-1 italic">"{bookmark.sentenceText}"</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={handleResumeBookmark}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition cursor-pointer"
                >
                  <span>바로 이어하기</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleClearBookmark}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-amber-100/60 transition cursor-pointer"
                  title="북마크 해제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
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
                    원문 청취(1.0x) 및 반복 쉐도잉(0.75x / 0.5x)
                  </span>
                </div>

                {currentPage.sentences?.map((sentence) => {
                  const rawAudio = audioFiles[`${sentence.id}.mp3`];
                  const practiceAudio = audioFiles[`${sentence.id}_practice.mp3`];
                  const isBookmarked = bookmark?.lessonKey === currentKey && bookmark?.sentenceId === sentence.id;

                  return (
                    <SentenceCard
                      key={sentence.id}
                      sentence={sentence}
                      language={currentPage.language}
                      rawAudioUrl={rawAudio}
                      practiceAudioUrl={practiceAudio}
                      isBookmarked={isBookmarked}
                      onToggleBookmark={() => handleToggleBookmark(sentence.id, sentence.raw_text)}
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
