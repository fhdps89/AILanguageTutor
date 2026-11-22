import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShadowingPauseMs,
  createInitialSchedulerState,
  decideLoop,
  formatSeconds,
  getListenGapMs,
  getSupportedRecorderMimeType,
  schedulerReducer,
} from '../src/utils/shadowingScheduler';

describe('shadowingScheduler timing & reducer', () => {
  it('calculates shadowing pause ms accurately at 1.0x, 0.75x, 0.5x without 0.5 floor', () => {
    // 1s => min 2000ms
    assert.equal(calculateShadowingPauseMs(1, 1.0), 2000);
    assert.equal(calculateShadowingPauseMs(0, 1.0), 2000);
    assert.equal(calculateShadowingPauseMs(-5, 1.0), 2000);

    // 10s at 0.75 => (10 / 0.75) * 1000 * 1.2 = 16000
    assert.equal(calculateShadowingPauseMs(10, 0.75), 16000);

    // 10s at 1.0 => 12000
    assert.equal(calculateShadowingPauseMs(10, 1.0), 12000);

    // 10s at 0.5 => 24000
    assert.equal(calculateShadowingPauseMs(10, 0.5), 24000);

    // No 0.5 floor: 3s at 0.25 => (3 / 0.25) * 1000 * 1.2 = 14400
    assert.equal(calculateShadowingPauseMs(3, 0.25), 14400);

    // rate <= 0 or non-finite treated as 1
    assert.equal(calculateShadowingPauseMs(5, 0), 6000);
    assert.equal(calculateShadowingPauseMs(5, -0.5), 6000);
    assert.equal(calculateShadowingPauseMs(5, Number.NaN), 6000);
  });

  it('decides loop transitions for repeatTarget 1, 3, and infinite edges', () => {
    // 0 sentences => immediately done
    assert.deepEqual(
      decideLoop({ currentIndex: 0, totalSentences: 0, currentRepeat: 1, repeatTarget: 1 }),
      { done: true, nextIndex: 0, nextRepeat: 1 }
    );

    // repeatTarget = 1: advances through sentences, then done on last
    assert.deepEqual(
      decideLoop({ currentIndex: 0, totalSentences: 3, currentRepeat: 1, repeatTarget: 1 }),
      { done: false, nextIndex: 1, nextRepeat: 1 }
    );
    assert.deepEqual(
      decideLoop({ currentIndex: 2, totalSentences: 3, currentRepeat: 1, repeatTarget: 1 }),
      { done: true, nextIndex: 0, nextRepeat: 1 }
    );

    // repeatTarget = 3: wraps to next repeat until repeat 3 finishes
    assert.deepEqual(
      decideLoop({ currentIndex: 2, totalSentences: 3, currentRepeat: 1, repeatTarget: 3 }),
      { done: false, nextIndex: 0, nextRepeat: 2 }
    );
    assert.deepEqual(
      decideLoop({ currentIndex: 2, totalSentences: 3, currentRepeat: 2, repeatTarget: 3 }),
      { done: false, nextIndex: 0, nextRepeat: 3 }
    );
    assert.deepEqual(
      decideLoop({ currentIndex: 2, totalSentences: 3, currentRepeat: 3, repeatTarget: 3 }),
      { done: true, nextIndex: 0, nextRepeat: 3 }
    );

    // repeatTarget = 'infinite': never done
    assert.deepEqual(
      decideLoop({ currentIndex: 2, totalSentences: 3, currentRepeat: 99, repeatTarget: 'infinite' }),
      { done: false, nextIndex: 0, nextRepeat: 100 }
    );

    // Single sentence with 3 repeats
    assert.deepEqual(
      decideLoop({ currentIndex: 0, totalSentences: 1, currentRepeat: 1, repeatTarget: 3 }),
      { done: false, nextIndex: 0, nextRepeat: 2 }
    );
    assert.deepEqual(
      decideLoop({ currentIndex: 0, totalSentences: 1, currentRepeat: 3, repeatTarget: 3 }),
      { done: true, nextIndex: 0, nextRepeat: 3 }
    );
  });

  it('picks supported recorder mime type in candidate priority order', () => {
    assert.equal(
      getSupportedRecorderMimeType({
        isTypeSupported: (m) => m === 'audio/webm' || m === 'audio/mp4',
      }),
      'audio/webm'
    );
    assert.equal(
      getSupportedRecorderMimeType({
        isTypeSupported: (m) => m === 'audio/webm;codecs=opus' || m === 'audio/mp4',
      }),
      'audio/webm;codecs=opus'
    );
    assert.equal(
      getSupportedRecorderMimeType({
        isTypeSupported: (m) => m === 'audio/mp4',
      }),
      'audio/mp4'
    );
    assert.equal(
      getSupportedRecorderMimeType({ isTypeSupported: () => false }),
      undefined
    );
    assert.equal(getSupportedRecorderMimeType(null), undefined);
  });

  it('formats seconds as MM:SS and computes listen gaps', () => {
    assert.equal(formatSeconds(0), '00:00');
    assert.equal(formatSeconds(4), '00:04');
    assert.equal(formatSeconds(65), '01:05');
    assert.equal(formatSeconds(-3), '00:00');
    assert.equal(getListenGapMs(1.0), 350);
    assert.equal(getListenGapMs(0.75), 420);
    assert.equal(getListenGapMs(0.5), 500);
  });

  it('schedulerReducer preserves remainingMs across pause/resume and handles skip immediately', () => {
    let state = createInitialSchedulerState({
      mode: 'shadowing',
      playbackRate: 0.75,
      repeatTarget: 3,
      totalSentences: 2,
    });

    state = schedulerReducer(state, { type: 'START', index: 0, totalSentences: 2 });
    assert.equal(state.phase, 'playing_tts');
    assert.equal(state.currentIndex, 0);
    assert.equal(state.currentRepeat, 1);

    // Complete 10s audio at 0.75x => 16000ms shadowing pause
    state = schedulerReducer(state, { type: 'AUDIO_COMPLETE', durationSec: 10, effectiveRate: 0.75 });
    assert.equal(state.phase, 'shadowing_pause');
    assert.equal(state.pauseRemainingMs, 16000);

    // Tick 4500ms -> 11500ms remaining
    state = schedulerReducer(state, { type: 'TICK_PAUSE', elapsedMs: 4500 });
    assert.equal(state.phase, 'shadowing_pause');
    assert.equal(state.pauseRemainingMs, 11500);

    // Pause -> preserves remainingMs
    state = schedulerReducer(state, { type: 'PAUSE' });
    assert.equal(state.phase, 'paused');
    assert.equal(state.pausedFromPhase, 'shadowing_pause');
    assert.equal(state.pauseRemainingMs, 11500);

    // Resume -> restores shadowing_pause with remainingMs intact
    state = schedulerReducer(state, { type: 'RESUME' });
    assert.equal(state.phase, 'shadowing_pause');
    assert.equal(state.pauseRemainingMs, 11500);

    // Skip ends shadowing_pause immediately and advances to next sentence
    state = schedulerReducer(state, { type: 'SKIP_PAUSE' });
    assert.equal(state.phase, 'playing_tts');
    assert.equal(state.currentIndex, 1);
    assert.equal(state.currentRepeat, 1);
    assert.equal(state.pauseRemainingMs, 0);

    // Listen mode uses short_gap 350ms at 1.0x
    let listenState = createInitialSchedulerState({
      mode: 'listen',
      playbackRate: 1.0,
      repeatTarget: 1,
      totalSentences: 2,
    });
    listenState = schedulerReducer(listenState, { type: 'START', index: 0, totalSentences: 2 });
    listenState = schedulerReducer(listenState, {
      type: 'AUDIO_COMPLETE',
      durationSec: 4,
      effectiveRate: 1.0,
    });
    assert.equal(listenState.phase, 'short_gap');
    assert.equal(listenState.gapMs, 350);
  });
});
