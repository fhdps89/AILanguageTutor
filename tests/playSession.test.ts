import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPlaySessionTracker } from '../src/utils/playSession';

describe('playSession tracker (HTML5 pause/resume wiring)', () => {
  it('keeps onComplete current after pause then successful resume', () => {
    const tracker = createPlaySessionTracker();
    const session = tracker.beginStep();
    let completed = false;
    const onComplete = () => {
      if (tracker.isCurrent(session)) completed = true;
    };

    // handlePause / document.hidden: invalidate so mid-pause events are ignored
    tracker.invalidate();
    onComplete();
    assert.equal(completed, false);

    // Successful resumeActiveAudio() restores the step token (must not bump)
    tracker.restoreStep();
    onComplete();
    assert.equal(completed, true);
  });

  it('regresses if resume bumps a new session instead of restoring', () => {
    const tracker = createPlaySessionTracker();
    const session = tracker.beginStep();
    let completed = false;
    const onComplete = () => {
      if (tracker.isCurrent(session)) completed = true;
    };
    tracker.invalidate(); // pause
    tracker.invalidate(); // old buggy resume
    onComplete();
    assert.equal(completed, false);
  });

  it('a new beginStep after restart leaves the previous session stale', () => {
    const tracker = createPlaySessionTracker();
    const first = tracker.beginStep();
    const second = tracker.beginStep();
    assert.equal(tracker.isCurrent(first), false);
    assert.equal(tracker.isCurrent(second), true);
    tracker.invalidate();
    tracker.restoreStep();
    assert.equal(tracker.isCurrent(second), true);
    assert.equal(tracker.isCurrent(first), false);
  });
});
