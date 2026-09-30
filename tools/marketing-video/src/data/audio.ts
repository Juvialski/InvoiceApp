export interface AudioTrackSource {
  readonly src: string;
  readonly volume: number;
  readonly from?: number;
}

export const AUDIO_TRACK_SLOTS: {
  readonly voiceover: AudioTrackSource | null;
  readonly backgroundMusic: AudioTrackSource | null;
  readonly uiSoundEffects: readonly AudioTrackSource[];
} = Object.freeze({
  voiceover: null,
  backgroundMusic: null,
  uiSoundEffects: [],
});
