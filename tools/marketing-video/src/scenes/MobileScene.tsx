import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { MarketingScene } from "../data/scenes";
import { DesktopFrame } from "../components/DesktopFrame";
import { MobileFrame } from "../components/MobileFrame";
import { SceneCanvas, type VideoLayout } from "../components/SceneCanvas";

interface MobileSceneProps {
  readonly scene: MarketingScene;
  readonly layout: VideoLayout;
}

export const MobileScene: React.FC<MobileSceneProps> = ({ scene, layout }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const desktopBeat = scene.beats[0];
  const mobileBeat = scene.beats[1];
  const desktopWidth = layout === "portrait" ? Math.round(width * 0.5) : Math.round(width * 0.31);
  const phoneWidth = layout === "portrait" ? Math.round(width * 0.44) : Math.round(width * 0.22);
  const gap = layout === "portrait" ? 18 : 42;
  const groupWidth = desktopWidth + phoneWidth + gap;
  const groupLeft = layout === "portrait" ? Math.round((width - groupWidth) / 2) : Math.round(width * 0.045);
  const desktopTop = layout === "portrait" ? Math.round(height * 0.35) : Math.round(height * 0.24);
  const phoneTop = layout === "portrait" ? Math.round(height * 0.275) : Math.round(height * 0.17);
  const desktopOpacity = interpolate(frame, [0, 22, 50], [1, 0.72, 0.46], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const desktopShift = interpolate(frame, [0, 52], [0, -34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phoneOpacity = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phoneShift = interpolate(frame, [0, 42], [72, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneCanvas scene={scene} layout={layout} hideFeatureCaption={layout === "portrait"}>
      <DesktopFrame
        beat={desktopBeat}
        layout={layout}
        width={desktopWidth}
        style={{
          position: "absolute",
          left: groupLeft + desktopShift,
          top: desktopTop,
          opacity: desktopOpacity,
        }}
      />
      <MobileFrame
        beat={mobileBeat}
        width={phoneWidth}
        style={{
          position: "absolute",
          left: groupLeft + desktopWidth + gap + phoneShift,
          top: phoneTop,
          opacity: phoneOpacity,
        }}
      />
    </SceneCanvas>
  );
};
