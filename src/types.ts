export interface VocabularyItem {
  word: string;
  meaning: string;
  hint?: string;
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
}

export interface ProviderOption {
  id: string;
  name: string;
  model: string;
  available: boolean;
}

export interface SystemStatus {
  activeEngine: string;
  currentProvider: string;
  currentModel: string;
  build: string;
  hasGemini: boolean;
  hasOpenRouter: boolean;
  hasXAI: boolean;
  availableProviders: ProviderOption[];
}
