import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { MarketingScene } from "../data/scenes";
import { DesktopFrame, getDesktopFrameWidth } from "../components/DesktopFrame";
import { SceneCanvas, type VideoLayout } from "../components/SceneCanvas";
import { EASE_OUT } from "../motion/easing";
import { VIDEO_THEME } from "../styles/theme";

interface ClosingSceneProps {
  readonly scene: MarketingScene;
  readonly layout: VideoLayout;
}

export const ClosingScene: React.FC<ClosingSceneProps> = ({ scene, layout }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const frameWidth = getDesktopFrameWidth(width, height, layout);
  const left = layout === "portrait" ? Math.round((width - frameWidth) / 2) : Math.round((width - frameWidth) / 2);
  const top = layout === "portrait" ? Math.round(height * 0.285) : Math.round(height * 0.155);
  const appOpacity = interpolate(frame, [62, 104], [1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const cardOpacity = interpolate(frame, [58, 91], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const cardTranslateY = interpolate(frame, [58, 91], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <SceneCanvas scene={scene} layout={layout} hideFeatureTitle hideFeatureCaption>
      <DesktopFrame
        beat={scene.beats[0]}
        layout={layout}
        style={{ position: "absolute", left, top, opacity: appOpacity }}
      />
      <AbsoluteFill
        style={{
          justifyContent: layout === "portrait" ? "flex-end" : "flex-start",
          alignItems: layout === "portrait" ? "flex-start" : "flex-start",
          padding: layout === "portrait" ? `0 ${Math.round(width * 0.08)}px ${Math.round(height * 0.16)}px` : `${Math.round(height * 0.065)}px ${Math.round(width * 0.045)}px 0`,
          boxSizing: "border-box",
          opacity: cardOpacity,
          transform: `translateY(${cardTranslateY}px)`,
        }}
      >
        <div
          style={{
            width: layout === "portrait" ? "100%" : "91%",
            color: VIDEO_THEME.color.text,
            fontFamily: VIDEO_THEME.fontFamily,
          }}
        >
          <div style={{ width: 54, height: 3, background: VIDEO_THEME.color.accent, marginBottom: layout === "portrait" ? 28 : 8 }} />
          <div style={{ fontSize: layout === "portrait" ? 65 : 34, fontWeight: 750, letterSpacing: "-0.055em", lineHeight: 1.02 }}>
            HydroQualiSense
          </div>
          <div style={{ marginTop: layout === "portrait" ? 24 : 8, color: VIDEO_THEME.color.textMuted, fontSize: layout === "portrait" ? 32 : 20, fontWeight: 500, lineHeight: 1.25 }}>
            Engineering operations, simplified.
          </div>
        </div>
      </AbsoluteFill>
    </SceneCanvas>
  );
};
