import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECORDING_SECONDS,
  createInitialRecorderState,
  recorderReducer,
} from '../src/utils/shadowingRecorderMachine';

describe('shadowingRecorderMachine', () => {
  it('transitions through permission, recording, 30s cap, ready, and cleanup', () => {
    let state = createInitialRecorderState();
    assert.equal(state.status, 'idle');

    state = recorderReducer(state, { type: 'REQUEST_PERMISSION' });
    assert.equal(state.status, 'requesting_permission');

    state = recorderReducer(state, { type: 'PERMISSION_DENIED', reason: '권한 거부' });
    assert.equal(state.status, 'permission_denied');
    assert.equal(state.errorReason, '권한 거부');

    state = recorderReducer(state, { type: 'REQUEST_PERMISSION' });
    state = recorderReducer(state, { type: 'RECORDING_STARTED', mimeType: 'audio/webm' });
    assert.equal(state.status, 'recording');
    assert.equal(state.elapsedSec, 0);

    for (let i = 0; i < MAX_RECORDING_SECONDS + 5; i++) {
      state = recorderReducer(state, { type: 'TICK_RECORDING' });
    }
    assert.equal(state.elapsedSec, MAX_RECORDING_SECONDS);

    state = recorderReducer(state, {
      type: 'RECORDING_READY',
      objectUrl: 'blob:local-1',
      mimeType: 'audio/webm',
    });
    assert.equal(state.status, 'ready');
    assert.equal(state.objectUrl, 'blob:local-1');

    state = recorderReducer(state, { type: 'SET_PLAYING', target: 'self' });
    assert.equal(state.playingTarget, 'self');

    state = recorderReducer(state, { type: 'START_CLEANUP' });
    assert.equal(state.status, 'cleanup');
    assert.equal(state.playingTarget, 'none');
  });
});
