/**
 * Tracks the active HTML audio play session so pause/resume can
 * keep the same onComplete / onTimeUpdate callbacks current.
 *
 * Pause must invalidate the token (to ignore mid-pause events),
 * and a successful resume must restore the step token — bumping a
 * new session on resume would drop AUDIO_COMPLETE and stall shadowing.
 */
export function createPlaySessionTracker() {
  let current = 0;
  let step = 0;

  return {
    beginStep(): number {
      step = ++current;
      return step;
    },
    invalidate(): void {
      current += 1;
    },
    restoreStep(): void {
      current = step;
    },
    isCurrent(session: number): boolean {
      return session === current;
    },
  };
}

export type PlaySessionTracker = ReturnType<typeof createPlaySessionTracker>;
