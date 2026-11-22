import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_V2,
  STORAGE_V3,
  loadBookmarks,
  migrateBookmarks,
  saveBookmark,
  removeBookmark,
  getBookmarkForBook,
  getLatestBookmark,
} from '../src/utils/bookmarks';
import { StudyBookmark } from '../src/types';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('bookmarks (v3 per-book isolation & v2 migration)', () => {
  const originalLocalStorage = (globalThis as any).localStorage;
  let memoryStorage: Storage;

  beforeEach(() => {
    memoryStorage = createMemoryStorage();
    (globalThis as any).localStorage = memoryStorage;
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as any).localStorage;
    } else {
      (globalThis as any).localStorage = originalLocalStorage;
    }
  });

  it('migrates old single v2 bookmark to v3 map when v3 is missing', () => {
    const v2: StudyBookmark = {
      lessonKey: 'book-fr-1',
      lessonTitle: 'L’Arc de Triomphe',
      sentenceId: 's03',
      sentenceText: 'Comme ceux érigés...',
      updatedAt: '2026-11-20T10:00:00.000Z',
    };
    memoryStorage.setItem(STORAGE_V2, JSON.stringify(v2));

    const loaded = loadBookmarks();
    assert.deepEqual(Object.keys(loaded), ['book-fr-1']);
    assert.equal(loaded['book-fr-1'].sentenceId, 's03');

    // v3 is written while v2 stays intact for rollback safety
    const storedV3 = JSON.parse(memoryStorage.getItem(STORAGE_V3)!);
    assert.equal(storedV3['book-fr-1'].sentenceId, 's03');
    assert.ok(memoryStorage.getItem(STORAGE_V2));
  });

  it('prefers v3 over v2 when v3 already exists', () => {
    const v2: StudyBookmark = {
      lessonKey: 'old-book',
      lessonTitle: 'Old',
      sentenceId: 's01',
      sentenceText: 'Old',
      updatedAt: '2026-11-10T00:00:00.000Z',
    };
    const v3Map = {
      'new-book': {
        lessonKey: 'new-book',
        lessonTitle: 'New',
        sentenceId: 's05',
        sentenceText: 'New',
        updatedAt: '2026-11-22T00:00:00.000Z',
      },
    };
    const res = migrateBookmarks(JSON.stringify(v3Map), JSON.stringify(v2));
    assert.equal(res.migrated, false);
    assert.deepEqual(Object.keys(res.map), ['new-book']);
  });

  it('isolates bookmarks across books and removes only the targeted book', () => {
    const bmA: StudyBookmark = {
      lessonKey: 'book-a',
      lessonTitle: 'Book A',
      sentenceId: 's02',
      sentenceText: 'Sentence A2',
      updatedAt: '2026-11-21T09:00:00.000Z',
    };
    const bmB: StudyBookmark = {
      lessonKey: 'book-b',
      lessonTitle: 'Book B',
      sentenceId: 's04',
      sentenceText: 'Sentence B4',
      updatedAt: '2026-11-22T09:00:00.000Z',
    };

    saveBookmark('book-a', bmA);
    saveBookmark('book-b', bmB);

    assert.equal(getBookmarkForBook('book-a')?.sentenceId, 's02');
    assert.equal(getBookmarkForBook('book-b')?.sentenceId, 's04');
    assert.equal(getBookmarkForBook('book-c'), null);

    const latest = getLatestBookmark(loadBookmarks());
    assert.equal(latest?.lessonKey, 'book-b');

    removeBookmark('book-a');
    assert.equal(getBookmarkForBook('book-a'), null);
    assert.equal(getBookmarkForBook('book-b')?.sentenceId, 's04');
  });

  it('falls back safely on corrupt JSON in v2 or v3', () => {
    memoryStorage.setItem(STORAGE_V3, '{corrupt json');
    assert.deepEqual(loadBookmarks(), {});

    memoryStorage.removeItem(STORAGE_V3);
    memoryStorage.setItem(STORAGE_V2, 'not-valid-json[');
    assert.deepEqual(loadBookmarks(), {});

    const nonObject = migrateBookmarks('["unexpected-array"]', null);
    assert.deepEqual(nonObject.map, {});
    assert.equal(nonObject.migrated, false);
  });
});
