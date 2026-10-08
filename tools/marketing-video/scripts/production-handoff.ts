import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, COMMERCIAL_DURATION_IN_FRAMES } from '../src/data/scenes';
import { TAGLISH_NARRATION } from '../src/data/script';
import { MOTION_FRAMES } from '../src/motion/tokens';

const outputRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../artifacts/marketing-video/mkt-v3a');
await mkdir(outputRoot, { recursive: true });
const frames: { frame: number; label: string; kind: string }[] = [{ frame: 0, label: 'Opening / frame zero', kind: 'opening' }];
const timing = [];
let start = 0;
for (const scene of SCENES) {
  const incoming = start > 0 ? MOTION_FRAMES.transition : 0;
  const overlap = scene.transitionAfter && scene.transitionAfter !== 'cut' ? MOTION_FRAMES.transition : 0;
  const line = TAGLISH_NARRATION.find((beat) => beat.sceneId === scene.id)?.line ?? '';
  timing.push({ sceneId: scene.id, startSeconds: start / 30, endSeconds: (start + scene.durationInFrames) / 30,
    voiceStartSeconds: (start + incoming + 3) / 30, voiceEndSeconds: (start + scene.durationInFrames - overlap - 6) / 30, line });
  if (scene.style === 'montage') {
    let beatStart = start;
    for (const beat of scene.beats) {
      frames.push({ frame: beatStart + Math.floor(beat.durationInFrames / 2), label: beat.assetId, kind: 'scene' });
      if (beatStart > start) frames.push({ frame: beatStart, label: `Cut into ${beat.assetId}`, kind: 'transition' });
      beatStart += beat.durationInFrames;
    }
  } else {
    frames.push({ frame: start + Math.floor(scene.durationInFrames / 2), label: scene.id, kind: 'scene' });
  }
  if (overlap) frames.push({ frame: start + scene.durationInFrames - Math.floor(overlap / 2), label: `${scene.id} transition`, kind: 'transition' });
  start += scene.durationInFrames - overlap;
}
frames.push({ frame: COMMERCIAL_DURATION_IN_FRAMES - 1, label: 'Closing / final frame', kind: 'closing' });
frames.sort((a,b) => a.frame - b.frame);
await writeFile(path.join(outputRoot, 'inspection-plan.json'), JSON.stringify({ fps: 30, durationFrames: COMMERCIAL_DURATION_IN_FRAMES, frames }, null, 2)+'\n');
await writeFile(path.join(outputRoot, 'narration-timing.json'), JSON.stringify(timing, null, 2)+'\n');
const rows = timing.map(t => `| ${t.sceneId} | ${t.startSeconds.toFixed(2)}–${t.endSeconds.toFixed(2)} | ${t.voiceStartSeconds.toFixed(2)}–${t.voiceEndSeconds.toFixed(2)} | ${t.line} |`).join('\n');
await writeFile(path.join(outputRoot, 'narration-and-canva-handoff.md'), `# MKT-V3A final recording handoff\n\nThe two 67.2-second visual masters are silent. No narration or music is represented as completed.\n\nUse a natural Filipino/Taglish voice, conversational and professional. Read HydroQualiSense as “Hydro Quali Sense”, RFIs as “R F I”, and purchase order naturally. Record one take per row within its voice window, with brief pauses. These are recording targets, not measured speech durations.\n\n| Scene | Visual window (s) | Voice window (s) | Final line |\n| --- | --- | --- | --- |\n${rows}\n\n## Audio options evaluated\n\nLocal Windows voices are English-only David and Zira; no Filipino voice is installed. They were inventoried without playback. Canva's public documentation lists Filipino speech, but the connected Canva tools expose no speech-generation operation. Higgsfield has a speech API, but requires a user-selected voice pair; no voice was selected and no free audio entitlement was available. No generation, trial, subscription, purchase, or desktop access was performed.\n\nCanva reference: https://www.canva.com/features/text-to-speech/\n\n## Canva Premium finishing\n\n1. When convenient, create separate 1080×1920 and 1920×1080 video designs. Upload the matching final MP4 without resizing or cropping it.\n2. Record these lines, or evaluate a Filipino voice in Canva's Text to Speech app. Confirm that it is included in your plan before generating; do not purchase another subscription. Listen for natural Taglish and product pronunciation.\n3. Place each take at the voice-start time above and finish before the voice-end time. Leave the video timing intact; rerecord a long take instead of rushing it. Both masters share the same timeline.\n4. Optional music must have a license permitting commercial advertising for the intended platform. Retain the track name, license URL, and license date. No licensed music has been supplied in this run. Keep music well below speech; check the mix for intelligibility.\n5. Export both MP4s at their native dimensions. Confirm opening/closing, full duration, speech alignment, subtitle safety, and license before publishing. Do not treat these synthetic examples as real customer outcomes.\n\n## Remotion audio import\n\nPlace a reviewed, pre-aligned 67.2-second WAV or MP3 in ignored tools/marketing-video/public/audio/. Set AUDIO_TRACK_SLOTS.voiceover in src/data/audio.ts to { src: 'audio/voiceover.wav', volume: 1 }. Its start is frame zero; silence in the recording fills the timing gaps. Set the optional music slot only after license review. Run render:portrait and render:landscape again, then regenerate inspection evidence. Do not commit audio or video.\n`, 'utf8');
process.stdout.write(`Prepared ${frames.length} inspection samples and ${timing.length} narration windows.\n`);
