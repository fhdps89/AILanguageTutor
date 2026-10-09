export interface VocabularyItem {
  word: string;
  meaning: string;
  hint?: string;
  baseForm?: string;
  pos?: string;
  pinyin?: string;
}

export interface KoreanChunkItem {
  text: string;
  grammarRole?: string;
}

export interface SentenceItem {
  id: string;
  raw_text: string;
  tts_text?: string;
  translation: string;
  breath_marks?: string;
  syntax_diagram?: string;
  pronunciation_hint?: string;
  liaison_hint?: string;
  vocabulary: VocabularyItem[];
  // Korean learning mode fields
  sound_romanization?: string;
  korean_chunks?: KoreanChunkItem[];
  formality_badge?: string | null;
  // Chinese learning mode fields
  pinyin?: string;
}

export interface LanguageInfo {
  code: string;
  name_ko: string;
  name_en: string;
  flag: string;
}

export interface LessonPage {
  language?: LanguageInfo;
  title: string;
  full_tts_script?: string;
  disclaimer_ko?: string;
  library_name?: string;
  library_title?: string;
  library_page?: number;
  sentences: SentenceItem[];
}

export interface LibraryItem {
  key: string;
  title: string;
  book_title: string;
  page_no: number;
  created_at: string;
  content_fp?: string;
  source: string;
  n_sentences: number;
  saved_at: string;
  language?: LanguageInfo;
  ownerId?: string;
}

export interface SystemStatus {
  activeEngine: string;
  currentProvider: string;
  currentModel: string;
  build: string;
  hasGemini: boolean;
}

export interface StudyBookmark {
  lessonKey: string;
  lessonTitle: string;
  sentenceId: string;
  sentenceText: string;
  updatedAt: string;
}

export interface DailyQuota {
  analyze: {
    used: number;
    limit: number;
    remaining: number;
  };
  tts: {
    used: number;
    limit: number;
    remaining: number;
    blockedBy: 'global' | 'device' | null;
  };
  resetAt: string;
}
