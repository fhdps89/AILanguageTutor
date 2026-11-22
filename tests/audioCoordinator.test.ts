import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioCoordinator } from '../src/utils/audioCoordinator';

describe('AudioCoordinator', () => {
  it('recording preempts tts and updates active claim', () => {
    const coord = createAudioCoordinator();
    let ttsPreempts = 0;

    coord.register('tts', 'card-1', () => {
      ttsPreempts += 1;
    });
    coord.claim('tts', 'card-1');
    assert.deepEqual(coord.active(), { channel: 'tts', ownerId: 'card-1' });

    coord.claim('recording', 'rec-1');
    assert.equal(ttsPreempts, 1);
    assert.deepEqual(coord.active(), { channel: 'recording', ownerId: 'rec-1' });
  });

  it('supports claim, release, and prevents wrong-owner release', () => {
    const coord = createAudioCoordinator();
    assert.equal(coord.active(), null);

    coord.claim('relay', 'player-1');
    assert.deepEqual(coord.active(), { channel: 'relay', ownerId: 'player-1' });

    // Mismatched channel or ownerId does not release active claim
    coord.release('tts', 'player-1');
    coord.release('relay', 'other-owner');
    assert.deepEqual(coord.active(), { channel: 'relay', ownerId: 'player-1' });

    // Matching release clears active claim
    coord.release('relay', 'player-1');
    assert.equal(coord.active(), null);
  });

  it('never double-preempts an already preempted owner or self-preempts', () => {
    const coord = createAudioCoordinator();
    let ttsPreempts = 0;
    let recPreempts = 0;
    let relayPreempts = 0;

    coord.register('tts', 'card-1', () => {
      ttsPreempts += 1;
      // Even if preempt handler calls release, it must not clear the new owner
      coord.release('tts', 'card-1');
    });
    coord.register('recording', 'rec-1', () => {
      recPreempts += 1;
    });
    coord.register('relay', 'relay-1', () => {
      relayPreempts += 1;
    });

    // Re-claiming same (channel, ownerId) does not self-preempt
    coord.claim('tts', 'card-1');
    coord.claim('tts', 'card-1');
    assert.equal(ttsPreempts, 0);

    // recording preempts tts once
    coord.claim('recording', 'rec-1');
    assert.equal(ttsPreempts, 1);
    assert.deepEqual(coord.active(), { channel: 'recording', ownerId: 'rec-1' });

    // self_playback preempts recording once; tts is NOT preempted again
    coord.claim('self_playback', 'self-1');
    assert.equal(ttsPreempts, 1);
    assert.equal(recPreempts, 1);
    assert.deepEqual(coord.active(), { channel: 'self_playback', ownerId: 'self-1' });

    // tts preempts self_playback, then relay preempts tts
    coord.claim('tts', 'card-2');
    coord.claim('relay', 'relay-1');
    assert.equal(ttsPreempts, 1);
    assert.equal(recPreempts, 1);
    assert.equal(relayPreempts, 0);
  });

  it('unregister removes handler and releases if currently active', () => {
    const coord = createAudioCoordinator();
    let preempts = 0;

    const unreg = coord.register('tts', 'card-1', () => {
      preempts += 1;
    });
    coord.claim('tts', 'card-1');
    unreg();

    assert.equal(coord.active(), null);
    coord.claim('recording', 'rec-1');
    assert.equal(preempts, 0);
  });
});
