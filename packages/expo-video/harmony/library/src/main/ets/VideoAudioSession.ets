import { audio } from '@kit.AudioKit';

export interface VideoAudioParticipant {
  audioMixingMode: string;
  audioIsAudible(): boolean;
  sessionFocusChanged(hint: audio.AudioSessionStateChangeHint): void;
}

const MIXING_PRIORITY: string[] = ['mixWithOthers', 'duckOthers', 'auto', 'doNotMix'];

export class VideoAudioSession {
  private readonly manager: audio.AudioSessionManager = audio.getAudioManager().getSessionManager();
  private readonly players: Set<VideoAudioParticipant> = new Set<VideoAudioParticipant>();
  private readonly active: Set<VideoAudioParticipant> = new Set<VideoAudioParticipant>();
  private tail: Promise<void> = Promise.resolve();
  private applied?: audio.AudioConcurrencyMode;
  private listening: boolean = false;
  private deactivating: boolean = false;
  private readonly onState = (event: audio.AudioSessionStateChangedEvent): void => {
    if (this.deactivating) return;

    const hint = event.stateChangeHint;

    // The system applies session duck/unduck itself. Applying volume again would double-duck.
    if (
      hint === audio.AudioSessionStateChangeHint.AUDIO_SESSION_STATE_CHANGE_HINT_DUCK ||
      hint === audio.AudioSessionStateChangeHint.AUDIO_SESSION_STATE_CHANGE_HINT_UNDUCK
    )
      return;

    if (
      hint === audio.AudioSessionStateChangeHint.AUDIO_SESSION_STATE_CHANGE_HINT_PAUSE ||
      hint === audio.AudioSessionStateChangeHint.AUDIO_SESSION_STATE_CHANGE_HINT_STOP ||
      hint === audio.AudioSessionStateChangeHint.AUDIO_SESSION_STATE_CHANGE_HINT_TIME_OUT_STOP
    )
      this.applied = undefined;

    const affected = hint === audio.AudioSessionStateChangeHint.AUDIO_SESSION_STATE_CHANGE_HINT_RESUME ? this.players : this.active;
    Array.from(affected).forEach((player: VideoAudioParticipant): void => player.sessionFocusChanged(hint));
  };

  add(player: VideoAudioParticipant): void {
    if (!this.listening) {
      this.manager.on('audioSessionStateChanged', this.onState);
      this.listening = true;
    }
    this.players.add(player);
  }

  remove(player: VideoAudioParticipant): void {
    this.players.delete(player);
    this.update(player, false).catch((error: Error): void => console.warn(`ExpoVideo: audio session cleanup failed: ${error.message}`));

    if (this.players.size === 0 && this.listening) {
      this.manager.off('audioSessionStateChanged', this.onState);
      this.listening = false;
    }
  }

  update(player: VideoAudioParticipant, playing: boolean): Promise<void> {
    if (playing && this.players.has(player)) this.active.add(player);
    else this.active.delete(player);

    const next = this.tail.then(async (): Promise<void> => {
      if (this.active.size === 0) {
        if (this.applied !== undefined && this.manager.isAudioSessionActivated()) {
          this.deactivating = true;
          try {
            await this.manager.deactivateAudioSession();
          } finally {
            this.deactivating = false;
          }
        }
        this.applied = undefined;
        return;
      }

      let priority = 0;
      let audible = false;
      this.active.forEach((candidate: VideoAudioParticipant): void => {
        priority = Math.max(priority, MIXING_PRIORITY.indexOf(candidate.audioMixingMode));
        audible = audible || candidate.audioIsAudible();
      });

      const mode = MIXING_PRIORITY[priority];
      let concurrency = audio.AudioConcurrencyMode.CONCURRENCY_MIX_WITH_OTHERS;
      if (mode === 'doNotMix' || (mode === 'auto' && audible)) concurrency = audio.AudioConcurrencyMode.CONCURRENCY_PAUSE_OTHERS;
      else if (mode === 'duckOthers' && audible) concurrency = audio.AudioConcurrencyMode.CONCURRENCY_DUCK_OTHERS;
      if (this.applied === concurrency && this.manager.isAudioSessionActivated()) return;

      this.manager.setAudioSessionScene(audio.AudioSessionScene.AUDIO_SESSION_SCENE_MEDIA);
      await this.manager.activateAudioSession({ concurrencyMode: concurrency });
      this.applied = concurrency;
    });

    this.tail = next.catch((): void => {});

    return next;
  }
}
