import { StudyBookmark } from '../types';

export const STORAGE_V2 = 'ai_tutor_saved_bookmark_v2';
export const STORAGE_V3 = 'ai_tutor_bookmarks_by_book_v3';

function isValidBookmark(value: unknown): value is StudyBookmark {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.lessonKey === 'string' &&
    b.lessonKey.trim().length > 0 &&
    typeof b.sentenceId === 'string' &&
    b.sentenceId.trim().length > 0
  );
}

function sanitizeBookmarkMap(rawObj: unknown): Record<string, StudyBookmark> {
  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) return {};
  const map: Record<string, StudyBookmark> = {};
  for (const [bookId, value] of Object.entries(rawObj as Record<string, unknown>)) {
    if (bookId && isValidBookmark(value)) {
      map[bookId] = {
        lessonKey: value.lessonKey,
        lessonTitle: typeof value.lessonTitle === 'string' ? value.lessonTitle : '학습 교재',
        sentenceId: value.sentenceId,
        sentenceText: typeof value.sentenceText === 'string' ? value.sentenceText : '',
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
      };
    }
  }
  return map;
}

export function migrateBookmarks(
  rawV3: string | null | undefined,
  rawV2: string | null | undefined
): { map: Record<string, StudyBookmark>; migrated: boolean } {
  if (typeof rawV3 === 'string' && rawV3.trim().length > 0) {
    try {
      const parsedV3 = JSON.parse(rawV3);
      return { map: sanitizeBookmarkMap(parsedV3), migrated: false };
    } catch {
      return { map: {}, migrated: false };
    }
  }

  if (typeof rawV2 === 'string' && rawV2.trim().length > 0) {
    try {
      const parsedV2 = JSON.parse(rawV2);
      if (isValidBookmark(parsedV2)) {
        const bookmark: StudyBookmark = {
          lessonKey: parsedV2.lessonKey,
          lessonTitle:
            typeof parsedV2.lessonTitle === 'string' ? parsedV2.lessonTitle : '학습 교재',
          sentenceId: parsedV2.sentenceId,
          sentenceText: typeof parsedV2.sentenceText === 'string' ? parsedV2.sentenceText : '',
          updatedAt:
            typeof parsedV2.updatedAt === 'string'
              ? parsedV2.updatedAt
              : new Date().toISOString(),
        };
        return { map: { [bookmark.lessonKey]: bookmark }, migrated: true };
      }
    } catch {
      return { map: {}, migrated: false };
    }
  }

  return { map: {}, migrated: false };
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {}
  return null;
}

function writeBookmarksMap(map: Record<string, StudyBookmark>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_V3, JSON.stringify(map));
  } catch {}
}

export function loadBookmarks(): Record<string, StudyBookmark> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const rawV3 = storage.getItem(STORAGE_V3);
    const rawV2 = storage.getItem(STORAGE_V2);
    const { map, migrated } = migrateBookmarks(rawV3, rawV2);
    if (migrated) {
      writeBookmarksMap(map);
    }
    return map;
  } catch {
    return {};
  }
}

export function saveBookmark(bookId: string, bookmark: StudyBookmark): void {
  if (!bookId) return;
  const map = loadBookmarks();
  map[bookId] = bookmark;
  writeBookmarksMap(map);
}

export function removeBookmark(bookId: string): void {
  if (!bookId) return;
  const map = loadBookmarks();
  if (!(bookId in map)) return;
  delete map[bookId];
  writeBookmarksMap(map);
}

export function getBookmarkForBook(bookId: string | null | undefined): StudyBookmark | null {
  if (!bookId) return null;
  const map = loadBookmarks();
  return map[bookId] ?? null;
}

export function getLatestBookmark(
  map: Record<string, StudyBookmark>
): StudyBookmark | null {
  let latest: StudyBookmark | null = null;
  let latestMs = -Infinity;

  for (const bm of Object.values(map)) {
    if (!isValidBookmark(bm)) continue;
    const ms = bm.updatedAt ? Date.parse(bm.updatedAt) : 0;
    const score = Number.isNaN(ms) ? 0 : ms;
    if (!latest || score >= latestMs) {
      latest = bm;
      latestMs = score;
    }
  }

  return latest;
}
