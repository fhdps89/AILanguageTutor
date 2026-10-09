import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UploadSection, UploadSectionHandle } from './components/UploadSection';
import { LandingHero } from './components/LandingHero';
import { FullPagePlayer } from './components/FullPagePlayer';
import { SentenceCard } from './components/SentenceCard';
import { LibrarySheet } from './components/LibrarySheet';
import { LessonPage, LibraryItem, SystemStatus, StudyBookmark, DailyQuota } from './types';
import { Info, AlertCircle, CheckCircle2, Bookmark, ArrowRight, X, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { getDeviceId } from './utils/audio';

// 예시 수업(demo-arc, demo-chinese)은 내 수업이 아니다. Sidebar의 isDemo 판단과 같은 기준.
const isOwnLesson = (item: LibraryItem) => item.key !== 'demo-arc' && item.key !== 'demo-chinese';

// 내 수업 중 가장 최근에 저장한 것. 내 수업이 없으면 null.
const pickLatestOwn = (list: LibraryItem[]): LibraryItem | null => {
  const own = list.filter(isOwnLesson);
  if (own.length === 0) return null;
  const stamp = (item: LibraryItem) => item.saved_at || item.created_at || '';
  return own.reduce((latest, item) => (stamp(item) > stamp(latest) ? item : latest));
};

export function App() {
  const [status, setStatus] = useState<SystemStatus>({
    activeEngine: 'Google Gemini Vision (gemini-3.8-flash)',
    currentProvider: 'gemini',
    currentModel: 'gemini-3.8-flash',
    build: '20261005',
    hasGemini: true,
  });

  const [quota, setQuota] = useState<DailyQuota | null>(null);

  const [demoChecked, setDemoChecked] = useState(false);
  const [demoLang, setDemoLang] = useState<'zh' | 'fr'>('zh');
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const uploadRef = useRef<UploadSectionHandle>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState<LessonPage | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  // 펼쳐진 문장 카드 id (수업을 열면 하나도 펼치지 않음) / 고른 듣기 속도 (R8에서 바뀐다)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preferredRate] = useState<1.0 | 0.75 | 0.5>(1.0);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [burstLimitMessage, setBurstLimitMessage] = useState<string | null>(null);

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

  const fetchQuota = async () => {
    try {
      const res = await fetch('/api/quota', {
        headers: { 'x-device-id': getDeviceId() },
      });
      if (res.ok) {
        const data: DailyQuota = await res.json();
        setQuota(data);
      }
    } catch (err) {
      console.warn('Failed to fetch quota', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchQuota();
    fetchLibraryAndLoadLatest();

    const handleQuota = (e: any) => {
      if (e.detail) {
        setQuota(e.detail);
      }
    };

    const handleRateLimit = (e: any) => {
      const msg = e.detail?.message || '오늘 들을 수 있는 음성을 모두 사용했어요. 내일 다시 이용해 주세요.';
      const code = e.detail?.code;
      const blockedBy: 'global' | 'device' = code === 'TTS_GLOBAL_LIMIT' ? 'global' : 'device';

      setQuota((prev) =>
        prev
          ? {
              ...prev,
              tts: {
                ...prev.tts,
                remaining: 0,
                blockedBy,
              },
            }
          : null
      );

      setErrorMessage(msg);
      setErrorCode(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('ai-tutor-quota', handleQuota);
    window.addEventListener('ai-tutor-rate-limit', handleRateLimit);
    return () => {
      window.removeEventListener('ai-tutor-quota', handleQuota);
      window.removeEventListener('ai-tutor-rate-limit', handleRateLimit);
    };
  }, []);

  // 다른 수업이 열리면 펼친 문장을 모두 접는다
  useEffect(() => {
    setExpandedId(null);
  }, [currentKey]);

  // Refresh quota when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchQuota();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Automatically refresh quota when resetAt time passes
  useEffect(() => {
    if (!quota?.resetAt) return;
    const resetMs = new Date(quota.resetAt).getTime();
    const nowMs = Date.now();
    const diffMs = resetMs - nowMs;

    if (diffMs <= 0) {
      fetchQuota();
      return;
    }

    const timer = setTimeout(() => {
      fetchQuota();
    }, diffMs + 500);

    return () => clearTimeout(timer);
  }, [quota?.resetAt]);

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

      // 열린 수업이 없고 내 수업이 있을 때만, 내 수업 중 가장 최근 것을 연다 (예시 수업은 자동으로 열지 않는다)
      const latestOwn = pickLatestOwn(mergedList);
      if (latestOwn && !currentKey) {
        setSelectedKey(latestOwn.key);
        loadLesson(latestOwn.key);
      }
    } catch (err) {
      console.error('Failed to load library', err);
    }
  };

  const loadLesson = async (key: string) => {
    setIsLoading(true);
    setLoadingMessage('페이지를 불러오는 중입니다...');
    setErrorMessage(null);
    setErrorCode(null);
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
      setErrorCode(null);
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
        const nextOwn = pickLatestOwn(updatedList);
        if (nextOwn) {
          setSelectedKey(nextOwn.key);
          loadLesson(nextOwn.key);
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
      setErrorCode(null);
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

  const handleResumeBookmark = async () => {
    if (!bookmark) return;

    if (currentKey !== bookmark.lessonKey) {
      await loadLesson(bookmark.lessonKey);
    }

    // 해당 문장을 펼치기만 한다 (자동 재생은 하지 않는다)
    setTimeout(() => {
      setExpandedId(bookmark.sentenceId);
      setTimeout(() => {
        const el = document.getElementById(`sentence-${bookmark.sentenceId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }, 300);
  };

  const handleClearBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmark(null);
    localStorage.removeItem(STORAGE_BOOKMARK_KEY);
    setInfoMessage('시작 위치 북마크가 삭제되었습니다.');
  };

  const canContinueFromLibrary = Boolean(bookmark || pickLatestOwn(library));

  const handleContinueFromLibrary = () => {
    if (bookmark) {
      handleResumeBookmark();
      return;
    }
    const latestOwn = pickLatestOwn(library);
    if (latestOwn) {
      loadLesson(latestOwn.key);
    }
  };

  // 머리글의 「내 서재」: 휴대폰(768px 미만)은 아래에서 올라오는 시트, 넓은 화면은 사이드바의 서재 칸으로 이동
  const handleOpenLibrary = () => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setIsLibraryOpen(true);
      return;
    }
    const section = document.getElementById('library-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (section.querySelector<HTMLElement>('button:not([disabled])') || section).focus({ preventScroll: true });
    }
  };

  const handleRunDemo = async () => {
    setIsLoading(true);
    setLoadingMessage('데모 페이지를 로드하는 중입니다...');
    setErrorMessage(null);
    setErrorCode(null);
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
      setInfoMessage(`${langName} 데모 페이지("${data.page.title}")를 불러왔습니다. AI 합성 음성으로 바로 들어 보세요.`);
    } catch (err: any) {
      setErrorMessage(err.message);
      setErrorCode(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunPhoto = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setLoadingMessage('Google Gemini 3.8 Flash Vision으로 언어 판독 & 분석 중...');
    setErrorMessage(null);
    setErrorCode(null);
    setInfoMessage(null);
    setBurstLimitMessage(null);

    try {
      const formData = new FormData();
      formData.append('photo', selectedFile);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'x-device-id': getDeviceId() },
        body: formData,
      });

      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {}

        if (errData.code === 'ANALYZE_DEVICE_LIMIT') {
          if (errData.quota) {
            setQuota(errData.quota);
          } else {
            setQuota((prev) =>
              prev
                ? {
                    ...prev,
                    analyze: {
                      ...prev.analyze,
                      remaining: 0,
                    },
                  }
                : null
            );
          }
          setErrorMessage(null);
          setErrorCode(null);
          return;
        }

        if (errData.code === 'ANALYZE_BURST_LIMIT') {
          setBurstLimitMessage('잠깐 쉬어 갈게요. 15분 뒤에 다시 올려 주세요.');
          setErrorMessage(null);
          setErrorCode(null);
          return;
        }

        if (errData.quota) {
          setQuota(errData.quota);
        }
        const errorObj: any = new Error(errData.error || '사진 분석에 실패했습니다.');
        errorObj.code = errData.code;
        errorObj.status = res.status;
        throw errorObj;
      }

      const data = await res.json();
      if (data.quota) {
        setQuota(data.quota);
        setTimeout(() => {
          fetchQuota();
        }, 5000);
      }
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
      if (err.code === 'ANALYZE_DEVICE_LIMIT' || err.code === 'ANALYZE_BURST_LIMIT') {
        return;
      }
      setErrorMessage(err.message || '사진 분석에 실패했습니다.');
      if (err.status === 429 || err.code === 'ANALYZE_GLOBAL_LIMIT' || err.code === 'RECITATION' || err.code === 'UNSUPPORTED_LANGUAGE') {
        setErrorCode(null);
      } else {
        setErrorCode(err.code || null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-8">
      <Header build={status.build} onOpenLibrary={handleOpenLibrary} />

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <LibrarySheet
          open={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          library={library}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onOpenSelected={() => {
            if (selectedKey) {
              loadLesson(selectedKey);
              setIsLibraryOpen(false);
            }
          }}
          onDeleteLesson={handleDeleteLesson}
          isLoading={isLoading}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full space-y-6">
          {!currentPage && !isLoading && (
            <LandingHero
              quota={quota}
              hasOwnLesson={library.some(isOwnLesson)}
              onUploadClick={() => uploadRef.current?.openFilePicker()}
              onCameraClick={() => uploadRef.current?.openCamera()}
              onOpenLibrary={handleOpenLibrary}
            />
          )}
          <UploadSection
            ref={uploadRef}
            hidden={!currentPage && !isLoading && !selectedFile && !(quota && quota.analyze.remaining === 0)}
            selectedFile={selectedFile}
            onFileSelect={(file) => {
              setSelectedFile(file);
              setBurstLimitMessage(null);
            }}
            onRunPhoto={handleRunPhoto}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            quota={quota}
            onContinueFromLibrary={canContinueFromLibrary ? handleContinueFromLibrary : undefined}
            burstLimitMessage={burstLimitMessage}
          />

          {/* Feedback messages */}
          {errorMessage && (
            <div className="sticky top-4 z-50 flex items-start justify-between gap-3 rounded-xl bg-red-50/95 backdrop-blur-xs border-2 border-red-300 p-4 text-sm text-red-900 shadow-md">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <span className="font-bold text-red-950">안내: </span>
                  <span className="font-medium leading-relaxed">
                    {errorMessage}
                    {errorCode && (
                      <span className="text-xs text-red-800 font-normal ml-1.5">
                        (오류 코드: {errorCode})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setErrorCode(null);
                }}
                className="shrink-0 rounded-md p-1 text-red-500 hover:text-red-700 hover:bg-red-100 transition cursor-pointer"
                title="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {infoMessage && (
            <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
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
                    <span className="text-xs text-amber-800">
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
                  className="rounded-lg p-1.5 text-slate-600 hover:text-slate-800 hover:bg-amber-100/60 transition cursor-pointer"
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
              <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 border border-amber-200/70 px-4 py-2.5 text-sm text-amber-800">
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                      문장별 쉐도잉 훈련 ({currentPage.sentences?.length || 0}문장)
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">🔊 문장을 누르면 바로 들려요</p>
                  </div>
                  {quota && (
                    <span
                      aria-live="polite"
                      className={`text-sm font-medium ${
                        quota.tts.remaining <= 10 ? 'text-amber-700' : 'text-slate-600'
                      }`}
                    >
                      음성 {quota.tts.remaining}회 남음
                    </span>
                  )}
                </div>

                {currentPage.sentences?.map((sentence, index) => {
                  const isBookmarked = bookmark?.lessonKey === currentKey && bookmark?.sentenceId === sentence.id;

                  return (
                    <SentenceCard
                      key={sentence.id}
                      sentence={sentence}
                      language={currentPage.language}
                      isBookmarked={isBookmarked}
                      onToggleBookmark={() => handleToggleBookmark(sentence.id, sentence.raw_text)}
                      index={index}
                      isExpanded={expandedId === sentence.id}
                      onSelect={setExpandedId}
                      preferredRate={preferredRate}
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
          ) : null}
        </main>

        {/* Sidebar: 화면 순서와 Tab 순서가 같도록 main 뒤에 두고, 넓은 화면에서만 왼쪽에 보인다 */}
        <div className="w-full md:w-80 shrink-0 md:order-first">
        <Sidebar
          status={status}
          demoChecked={demoChecked}
          onDemoChange={setDemoChecked}
          demoLang={demoLang}
          onSelectDemoLang={setDemoLang}
          onRunDemo={handleRunDemo}
          library={library}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onOpenSelected={() => selectedKey && loadLesson(selectedKey)}
          onDeleteLesson={handleDeleteLesson}
          isLoading={isLoading}
        />
        </div>
      </div>
    </div>
  );
}
