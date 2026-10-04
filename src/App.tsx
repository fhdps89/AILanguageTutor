import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UploadSection } from './components/UploadSection';
import { FullPagePlayer } from './components/FullPagePlayer';
import { SentenceCard } from './components/SentenceCard';
import { LessonPage, LibraryItem, SystemStatus, StudyBookmark } from './types';
import { Info, AlertCircle, CheckCircle2, Bookmark, ArrowRight, X, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { getDeviceId } from './utils/audio';

export function App() {
  const [status, setStatus] = useState<SystemStatus>({
    activeEngine: 'Google Gemini Vision (gemini-3.8-flash)',
    currentProvider: 'gemini',
    currentModel: 'gemini-3.8-flash',
    build: '20260930-gemini-single',
    hasGemini: true,
  });

  const [demoChecked, setDemoChecked] = useState(false);
  const [demoLang, setDemoLang] = useState<'zh' | 'fr'>('zh');
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState<LessonPage | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Local storage helpers
  const STORAGE_LIB_KEY = 'ai_tutor_saved_library_v2';
  const STORAGE_PAGES_KEY = 'ai_tutor_saved_pages_v2';
  const STORAGE_BOOKMARK_KEY = 'ai_tutor_saved_bookmark_v2';

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

  const getStoredPage = (key: string): { page: LessonPage; photoUrl?: string | null } | null => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PAGES_KEY}_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const saveStoredPage = (key: string, data: { page: LessonPage; photoUrl?: string | null }) => {
    try {
      localStorage.setItem(`${STORAGE_PAGES_KEY}_${key}`, JSON.stringify(data));
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    fetchLibraryAndLoadLatest();

    const handleRateLimit = (e: any) => {
      const msg = e.detail?.message || '오늘 들을 수 있는 음성을 모두 사용했어요. 내일 다시 이용해 주세요.';
      setErrorMessage(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('ai-tutor-rate-limit', handleRateLimit);
    return () => {
      window.removeEventListener('ai-tutor-rate-limit', handleRateLimit);
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status', {
        headers: { 'x-device-id': getDeviceId() },
      });
      if (res.ok) {
        const data: SystemStatus = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  };

  const fetchLibraryAndLoadLatest = async () => {
    try {
      let serverList: LibraryItem[] = [];
      try {
        const res = await fetch('/api/library', {
          headers: { 'x-device-id': getDeviceId() },
        });
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

      // If user has lessons and none currently open, open their own latest lesson
      if (mergedList.length > 0 && !currentKey) {
        const firstKey = mergedList[0].key;
        setSelectedKey(firstKey);
        loadLesson(firstKey);
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
      let loadedData: { page: LessonPage; key: string; photoUrl?: string | null } | null = null;

      try {
        const res = await fetch(`/api/lesson/${key}`, {
          headers: { 'x-device-id': getDeviceId() },
        });
        if (res.ok) {
          loadedData = await res.json();
        }
      } catch {}

      // If server does not have the file, restore from localStorage
      if (!loadedData) {
        const localData = getStoredPage(key);
        if (localData) {
          loadedData = { key, ...localData };
          setInfoMessage('기기에 보존된 학습 기록을 불러왔습니다.');
        } else {
          throw new Error('페이지를 불러오지 못했습니다.');
        }
      }

      if (loadedData) {
        saveStoredPage(key, {
          page: loadedData.page,
          photoUrl: loadedData.photoUrl || null,
        });
      }

      setCurrentPage(loadedData.page);
      setCurrentKey(loadedData.key);
      setPhotoUrl(loadedData.photoUrl || null);
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
      try {
        await fetch(`/api/lesson/${key}`, {
          method: 'DELETE',
          headers: { 'x-device-id': getDeviceId() },
        });
      } catch (err) {
        console.warn('Server delete call failed, continuing local cleanup', err);
      }

      try {
        localStorage.removeItem(`${STORAGE_PAGES_KEY}_${key}`);
        const currentStored = getStoredLibrary();
        const updatedStored = currentStored.filter((item) => item.key !== key);
        saveStoredLibrary(updatedStored);
      } catch (err) {
        console.warn('LocalStorage cleanup failed', err);
      }

      const updatedList = library.filter((item) => item.key !== key);
      setLibrary(updatedList);

      if (currentKey === key) {
        if (updatedList.length > 0) {
          setSelectedKey(updatedList[0].key);
          loadLesson(updatedList[0].key);
        } else {
          setCurrentPage(null);
          setCurrentKey(null);
          setSelectedKey(null);
          setPhotoUrl(null);
        }
      } else if (selectedKey === key) {
        setSelectedKey(updatedList.length > 0 ? updatedList[0].key : null);
      }

      setInfoMessage(`"${displayName}" 기록이 삭제되었습니다.`);
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
      sentenceText: cleanSnippet.length > 50 ? `${cleanSnippet.slice(0, 50)}...` : cleanSnippet,
      updatedAt: new Date().toISOString(),
    };

    setBookmark(newBookmark);
    try {
      localStorage.setItem(STORAGE_BOOKMARK_KEY, JSON.stringify(newBookmark));
      setInfoMessage(`[${sentenceId}] 문장이 내일 학습 시작 지점으로 저장되었습니다.`);
    } catch {}
  };

  const handleResumeBookmark = () => {
    if (!bookmark) return;

    if (currentKey !== bookmark.lessonKey) {
      loadLesson(bookmark.lessonKey);
    }

    setTimeout(() => {
      const el = document.getElementById(`sentence-${bookmark.sentenceId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  };

  const handleClearBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmark(null);
    localStorage.removeItem(STORAGE_BOOKMARK_KEY);
    setInfoMessage('시작 위치 북마크가 삭제되었습니다.');
  };

  const handleRunDemo = async () => {
    setIsLoading(true);
    setLoadingMessage('데모 페이지를 로드하는 중입니다...');
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`/api/demo?lang=${demoLang}`, {
        headers: { 'x-device-id': getDeviceId() },
      });
      if (!res.ok) {
        throw new Error('데모 데이터를 불러오지 못했습니다.');
      }
      const data = await res.json();
      const lessonKey = data.key || (demoLang === 'zh' ? 'demo-chinese' : 'demo-arc');
      setCurrentPage(data.page);
      setCurrentKey(lessonKey);
      setSelectedKey(lessonKey);
      setPhotoUrl(null);

      saveStoredPage(lessonKey, {
        page: data.page,
        photoUrl: null,
      });
      const langName = data.page.language?.name_ko || '외국어';
      setInfoMessage(`${langName} 데모 페이지("${data.page.title}")를 불러왔습니다. Gemini 원어민 음성으로 바로 학습해보세요.`);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunPhoto = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setLoadingMessage('Google Gemini 3.8 Flash Vision으로 언어 판독 & 분석 중...');
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const formData = new FormData();
      formData.append('photo', selectedFile);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'x-device-id': getDeviceId() },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '사진 분석에 실패했습니다.');
      }

      const data = await res.json();
      setCurrentPage(data.page);
      setCurrentKey(data.key);
      setSelectedKey(data.key);
      const activePhotoUrl = data.photoUrl || URL.createObjectURL(selectedFile);
      setPhotoUrl(activePhotoUrl);

      saveStoredPage(data.key, {
        page: data.page,
        photoUrl: data.photoUrl || null,
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
        ownerId: getDeviceId(),
      };
      const curList = getStoredLibrary();
      const updatedList = [newItem, ...curList.filter(item => item.key !== data.key)];
      saveStoredLibrary(updatedList);

      if (data.reused) {
        setInfoMessage('이미 분석한 사진입니다. 캐시된 데이터를 재사용합니다.');
      } else {
        const langLabel = data.page?.language ? `${data.page.language.flag} ${data.page.language.name_ko}` : '외국어';
        setInfoMessage(`[Gemini Vision] ${langLabel} 언어 감지 및 구문 분해가 완료되었습니다!`);
      }

      fetchLibraryAndLoadLatest();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-8">
      <Header build={status.build} />

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar */}
        <Sidebar
          status={status}
          demoChecked={demoChecked}
          onDemoChange={setDemoChecked}
          demoLang={demoLang}
          onSelectDemoLang={setDemoLang}
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
            demoLang={demoLang}
            onRunDemo={handleRunDemo}
            onRunPhoto={handleRunPhoto}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
          />

          {/* Feedback messages */}
          {errorMessage && (
            <div className="sticky top-4 z-50 flex items-start justify-between gap-3 rounded-xl bg-red-50/95 backdrop-blur-xs border-2 border-red-300 p-4 text-xs sm:text-sm text-red-900 shadow-md">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <span className="font-bold text-red-950">안내: </span>
                  <span className="font-medium leading-relaxed">{errorMessage}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="shrink-0 rounded-md p-1 text-red-500 hover:text-red-700 hover:bg-red-100 transition cursor-pointer"
                title="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {infoMessage && (
            <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Bookmark banner */}
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

          {/* Page Display */}
          {currentPage ? (
            <div className="space-y-6">
              {/* Disclaimer */}
              <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 border border-amber-200/70 px-4 py-2.5 text-xs text-amber-800">
                <Info className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {currentPage.disclaimer_ko || '음성은 합성 TTS이며 원어민이 아닙니다. 한글 표기는 힌트([~])일 뿐입니다.'}
                </span>
              </div>

              {/* Uploaded photo with collapsible view for mobile space saving */}
              {photoUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-white p-3 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={() => setShowPhoto(!showPhoto)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition cursor-pointer"
                    >
                      <ImageIcon className="h-4 w-4 text-indigo-500" />
                      <span>분석된 원본 사진 {showPhoto ? '접기' : '보기'}</span>
                      {showPhoto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {showPhoto && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <img
                        src={photoUrl}
                        alt="Uploaded page"
                        className="max-h-96 w-full object-contain rounded-lg bg-slate-50"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Sentence Breakdown List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                    문장별 쉐도잉 훈련 ({currentPage.sentences?.length || 0}문장)
                  </h3>
                  <span className="text-xs text-slate-500">
                    원문 청취(1.0x) 및 배속 조절(0.75x / 0.5x)
                  </span>
                </div>

                {currentPage.sentences?.map((sentence) => {
                  const isBookmarked = bookmark?.lessonKey === currentKey && bookmark?.sentenceId === sentence.id;

                  return (
                    <SentenceCard
                      key={sentence.id}
                      sentence={sentence}
                      language={currentPage.language}
                      isBookmarked={isBookmarked}
                      onToggleBookmark={() => handleToggleBookmark(sentence.id, sentence.raw_text)}
                    />
                  );
                })}
              </div>

              {/* Full Page 1.0x Player (Moved to bottom so audio is pre-cached from sentence practice) */}
              <div className="pt-2">
                <FullPagePlayer
                  title={currentPage.library_name || currentPage.title || '학습 본문'}
                  fullScript={currentPage.full_tts_script || ''}
                  language={currentPage.language}
                  lessonKey={currentKey}
                  pageData={currentPage}
                  sentences={currentPage.sentences || []}
                />
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
