import React from "react";
import { useVideoConfig } from "remotion";
import type { MarketingScene } from "../data/scenes";
import type { VideoLayout } from "./SceneCanvas";
import { VIDEO_THEME } from "../styles/theme";

interface CaptionProps {
  readonly scene: MarketingScene;
  readonly layout: VideoLayout;
  readonly opacity: number;
  readonly translateY: number;
}

export const Caption: React.FC<CaptionProps> = ({ scene, layout, opacity, translateY }) => {
  const { width, height } = useVideoConfig();
  if (!scene.caption) return null;
  const isPortrait = layout === "portrait";

  return (
    <div
      style={{
        position: "absolute",
        top: isPortrait ? Math.round(height * 0.615) : Math.round(height * 0.61),
        left: isPortrait ? Math.round(width * 0.077) : Math.round(width * 0.69),
        width: isPortrait ? Math.round(width * 0.78) : Math.round(width * 0.25),
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <span style={{ width: 3, height: isPortrait ? 46 : 42, flex: "0 0 3px", background: VIDEO_THEME.color.accent }} />
      <span
        style={{
          color: VIDEO_THEME.color.text,
          fontFamily: VIDEO_THEME.fontFamily,
          fontSize: isPortrait ? 31 : 25,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.22,
          textWrap: "balance",
        }}
      >
        {scene.caption}
      </span>
    </div>
  );
};
