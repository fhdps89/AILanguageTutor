export type AudioChannel = 'tts' | 'relay' | 'recording' | 'self_playback';

export interface ActiveAudioClaim {
  channel: AudioChannel;
  ownerId: string;
}

const PREEMPTS: Record<AudioChannel, ReadonlyArray<AudioChannel>> = {
  recording: ['tts', 'relay', 'self_playback'],
  tts: ['relay', 'recording', 'self_playback'],
  relay: ['tts', 'recording', 'self_playback'],
  self_playback: ['tts', 'relay', 'recording'],
};

export interface AudioCoordinator {
  register: (channel: AudioChannel, ownerId: string, onPreempt: () => void) => () => void;
  claim: (channel: AudioChannel, ownerId: string) => void;
  release: (channel: AudioChannel, ownerId?: string) => void;
  active: () => ActiveAudioClaim | null;
}

function registrationKey(channel: AudioChannel, ownerId: string): string {
  return `${channel}::${ownerId}`;
}

export function createAudioCoordinator(): AudioCoordinator {
  const handlers = new Map<string, () => void>();
  let currentActive: ActiveAudioClaim | null = null;

  const release = (channel: AudioChannel, ownerId?: string) => {
    if (!currentActive) return;
    if (currentActive.channel !== channel) return;
    if (ownerId !== undefined && currentActive.ownerId !== ownerId) return;
    currentActive = null;
  };

  const register = (channel: AudioChannel, ownerId: string, onPreempt: () => void) => {
    const key = registrationKey(channel, ownerId);
    handlers.set(key, onPreempt);
    return () => {
      if (handlers.get(key) === onPreempt) {
        handlers.delete(key);
      }
      release(channel, ownerId);
    };
  };

  const claim = (channel: AudioChannel, ownerId: string) => {
    const prev = currentActive;
    if (prev && prev.channel === channel && prev.ownerId === ownerId) {
      return;
    }

    const shouldPreempt =
      prev !== null &&
      (PREEMPTS[channel].includes(prev.channel) ||
        (prev.channel === channel && prev.ownerId !== ownerId));

    // Update active claim before invoking prev's onPreempt so re-entrant
    // release/claim calls from the evicted owner cannot double-preempt or
    // accidentally clear the new claim.
    currentActive = { channel, ownerId };

    if (shouldPreempt && prev) {
      const prevHandler = handlers.get(registrationKey(prev.channel, prev.ownerId));
      if (prevHandler) {
        try {
          prevHandler();
        } catch (err) {
          console.warn('AudioCoordinator onPreempt error:', err);
        }
      }
    }
  };

  const active = (): ActiveAudioClaim | null => {
    return currentActive ? { ...currentActive } : null;
  };

  return {
    register,
    claim,
    release,
    active,
  };
}

export const audioCoordinator = createAudioCoordinator();
