import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TTS_VOICE,
  ttsCacheKey,
  getCachedAudioUrl,
  setCachedAudioUrl,
  clearAudioCacheForTests,
  resolveAudioUrl,
} from '../src/utils/audioCache';

describe('audioCache (Option A: speed-agnostic TTS cache)', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;
  const originalCustomEvent = (globalThis as any).CustomEvent;

  beforeEach(() => {
    clearAudioCacheForTests();
  });

  afterEach(() => {
    clearAudioCacheForTests();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    if (originalCustomEvent === undefined) {
      delete (globalThis as any).CustomEvent;
    } else {
      (globalThis as any).CustomEvent = originalCustomEvent;
    }
  });

  it('builds cache key without speed and defaults voice to Kore', () => {
    assert.equal(DEFAULT_TTS_VOICE, 'Kore');
    const k1 = ttsCacheKey('Bonjour le monde', 'fr-FR');
    const k2 = ttsCacheKey('Bonjour le monde', 'fr-FR', 'Kore');
    const k3 = ttsCacheKey('  Bonjour le monde  ', 'fr-FR', 'Kore');
    assert.equal(k1, k2);
    assert.equal(k1, k3);
    assert.notEqual(k1, ttsCacheKey('Bonjour le monde', 'en-US'));
  });

  it('stores and retrieves cached audio URLs', () => {
    const key = ttsCacheKey('Salut', 'fr-FR');
    assert.equal(getCachedAudioUrl(key), undefined);
    setCachedAudioUrl(key, '/api/tts/' + 'a'.repeat(64));
    assert.equal(getCachedAudioUrl(key), '/api/tts/' + 'a'.repeat(64));
  });

  it('second prepare for same sentence at different playback rate does not call fetch or emit quota twice', async () => {
    let fetchCalls = 0;
    const sentBodies: any[] = [];
    const quotaEvents: any[] = [];

    class FakeCustomEvent {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init?.detail;
      }
    }

    (globalThis as any).CustomEvent = FakeCustomEvent;
    (globalThis as any).window = {
      dispatchEvent: (ev: any) => {
        if (ev?.type === 'ai-tutor-quota') {
          quotaEvents.push(ev.detail);
        }
        return true;
      },
    };

    const expectedUrl = '/api/tts/' + 'b'.repeat(64);
    globalThis.fetch = (async (_url: any, init?: any) => {
      fetchCalls += 1;
      sentBodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          audioUrl: expectedUrl,
          quota: {
            analyze: { used: 0, limit: 30, remaining: 30 },
            tts: { used: 1, limit: 100, remaining: 99, blockedBy: null },
            resetAt: '2026-11-23T00:00:00+09:00',
          },
        }),
      } as any;
    }) as typeof fetch;

    // 1st prepare (e.g. 1.0x playback)
    const url1 = await resolveAudioUrl({
      text: 'L’Arc de triomphe est grand.',
      lang: 'French',
      deviceId: 'dev_test1',
    });

    // 2nd prepare (e.g. user switches to 0.75x or 0.5x; client always resolves 1.0x cache)
    const url2 = await resolveAudioUrl({
      text: 'L’Arc de triomphe est grand.',
      lang: 'French',
      deviceId: 'dev_test1',
    });

    assert.equal(url1, expectedUrl);
    assert.equal(url2, expectedUrl);
    assert.equal(fetchCalls, 1);
    assert.equal(sentBodies[0].speed, '1.0');
    assert.equal(quotaEvents.length, 1);
  });

  it('deduplicates concurrent in-flight requests per cache key', async () => {
    let fetchCalls = 0;
    const expectedUrl = '/api/tts/' + 'c'.repeat(64);

    let resolveFetch!: (val: any) => void;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      return new Promise((res) => {
        resolveFetch = res;
      });
    }) as any;

    const p1 = resolveAudioUrl({ text: 'Double click test', lang: 'en-US' });
    const p2 = resolveAudioUrl({ text: 'Double click test', lang: 'en-US' });

    assert.equal(fetchCalls, 1);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ audioUrl: expectedUrl }),
    });

    const [u1, u2] = await Promise.all([p1, p2]);
    assert.equal(u1, expectedUrl);
    assert.equal(u2, expectedUrl);
    assert.equal(fetchCalls, 1);
  });
});
