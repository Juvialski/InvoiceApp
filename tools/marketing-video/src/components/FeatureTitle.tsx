import React from "react";
import { useVideoConfig } from "remotion";
import type { MarketingScene } from "../data/scenes";
import type { VideoLayout } from "./SceneCanvas";
import { VIDEO_THEME } from "../styles/theme";

interface FeatureTitleProps {
  readonly scene: MarketingScene;
  readonly layout: VideoLayout;
  readonly opacity: number;
  readonly translateY: number;
}

export const FeatureTitle: React.FC<FeatureTitleProps> = ({ scene, layout, opacity, translateY }) => {
  const { width, height } = useVideoConfig();
  const isPortrait = layout === "portrait";

  return (
    <div
      style={{
        position: "absolute",
        top: isPortrait ? Math.round(height * 0.132) : Math.round(height * 0.067),
        left: isPortrait ? Math.round(width * 0.075) : Math.round(width * 0.045),
        width: isPortrait ? Math.round(width * 0.85) : Math.round(width * 0.91),
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          color: VIDEO_THEME.color.accentBright,
          fontFamily: VIDEO_THEME.fontFamily,
          fontSize: isPortrait ? 16 : 14,
          fontWeight: 700,
          letterSpacing: "0.17em",
          lineHeight: 1.3,
          marginBottom: isPortrait ? 16 : 6,
          textTransform: "uppercase",
        }}
      >
        {scene.kicker}
      </div>
      <div
        style={{
          color: VIDEO_THEME.color.text,
          fontFamily: VIDEO_THEME.fontFamily,
          fontSize: isPortrait ? 53 : 34,
          fontWeight: 700,
          letterSpacing: "-0.045em",
          lineHeight: 1.04,
          textWrap: "balance",
        }}
      >
        {scene.title}
      </div>
      {scene.subtitle && isPortrait && (
        <div
          style={{
            color: VIDEO_THEME.color.textMuted,
            fontFamily: VIDEO_THEME.fontFamily,
            fontSize: isPortrait ? 22 : 21,
            fontWeight: 400,
            lineHeight: 1.38,
            marginTop: isPortrait ? 18 : 16,
            maxWidth: "100%",
          }}
        >
          {scene.subtitle}
        </div>
      )}
    </div>
  );
};
