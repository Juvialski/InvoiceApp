import React from "react";
import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import { AUDIO_TRACK_SLOTS } from "../data/audio";

export const AudioTracks: React.FC = () => (
  <>
    {AUDIO_TRACK_SLOTS.voiceover ? (
      <Audio src={staticFile(AUDIO_TRACK_SLOTS.voiceover.src)} volume={AUDIO_TRACK_SLOTS.voiceover.volume} />
    ) : null}
    {AUDIO_TRACK_SLOTS.backgroundMusic ? (
      <Audio src={staticFile(AUDIO_TRACK_SLOTS.backgroundMusic.src)} volume={AUDIO_TRACK_SLOTS.backgroundMusic.volume} />
    ) : null}
    {AUDIO_TRACK_SLOTS.uiSoundEffects.map((sound, index) => (
      <Sequence key={`ui-sfx-${index}`} from={sound.from ?? 0}>
        <Audio src={staticFile(sound.src)} volume={sound.volume} />
      </Sequence>
    ))}
  </>
);
