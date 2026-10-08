import React from "react";
import { useVideoConfig } from "remotion";
import type { MarketingScene } from "../data/scenes";
import { getDesktopFrameWidth, DesktopFrame } from "../components/DesktopFrame";
import { SceneCanvas, type VideoLayout } from "../components/SceneCanvas";
import { PortraitDetail } from "../components/PortraitDetail";

interface DesktopSceneProps {
  readonly scene: MarketingScene;
  readonly layout: VideoLayout;
}

export const DesktopScene: React.FC<DesktopSceneProps> = ({ scene, layout }) => {
  const { width, height } = useVideoConfig();
  const frameWidth = getDesktopFrameWidth(width, height, layout);
  const left = layout === "portrait" ? Math.round((width - frameWidth) / 2) : Math.round((width - frameWidth) / 2);
  const top = layout === "portrait" ? Math.round(height * 0.285) : Math.round(height * 0.155);
  const beat = scene.beats[0];

  return (
    <SceneCanvas scene={scene} layout={layout}>
      <DesktopFrame
        beat={beat}
        layout={layout}
        style={{ position: "absolute", left, top }}
      />
      {layout === "portrait" && <PortraitDetail beat={beat} />}
    </SceneCanvas>
  );
};
