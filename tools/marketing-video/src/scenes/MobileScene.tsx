import React from "react";
import { useVideoConfig } from "remotion";
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
  const desktopBeat = scene.beats[0];
  const mobileBeat = scene.beats[1];
  const desktopWidth = layout === "portrait" ? Math.round(width * 0.98) : Math.round(width * 0.68);
  const phoneWidth = layout === "portrait" ? Math.round(width * 0.28) : Math.round(width * 0.22);
  const gap = layout === "portrait" ? 18 : 42;
  const groupWidth = desktopWidth + phoneWidth + gap;
  const groupLeft = Math.round((width - (layout === "portrait" ? desktopWidth : groupWidth)) / 2);
  const desktopTop = Math.round(height * (layout === "portrait" ? 0.285 : 0.20));
  const phoneTop = Math.round(height * (layout === "portrait" ? 0.635 : 0.20));

  return (
    <SceneCanvas scene={scene} layout={layout} hideFeatureCaption={layout === "portrait"}>
      <DesktopFrame
        beat={desktopBeat}
        layout={layout}
        width={desktopWidth}
        style={{
          position: "absolute",
          left: groupLeft,
          top: desktopTop,
        }}
      />
      <MobileFrame
        beat={mobileBeat}
        width={phoneWidth}
        style={{
          position: "absolute",
          left: layout === "portrait" ? Math.round((width - phoneWidth) / 2) : groupLeft + desktopWidth + gap,
          top: phoneTop,
        }}
      />
    </SceneCanvas>
  );
};
