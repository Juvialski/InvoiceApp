import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SCENES, type MarketingScene } from "../data/scenes";
import { EASE_OUT } from "../motion/easing";
import { MOTION_FRAMES } from "../motion/tokens";
import { VIDEO_THEME } from "../styles/theme";
import { Caption } from "./Caption";
import { FeatureTitle } from "./FeatureTitle";

export type VideoLayout = "portrait" | "landscape";

interface SceneCanvasProps {
  readonly scene: MarketingScene;
  readonly layout: VideoLayout;
  readonly children: React.ReactNode;
  readonly hideFeatureTitle?: boolean;
  readonly hideFeatureCaption?: boolean;
}

export const SceneCanvas: React.FC<SceneCanvasProps> = ({
  scene,
  layout,
  children,
  hideFeatureTitle = false,
  hideFeatureCaption = false,
}) => {
  const frame = useCurrentFrame();
  const sceneIndex = SCENES.findIndex((item) => item.id === scene.id);
  const previousScene = sceneIndex > 0 ? SCENES[sceneIndex - 1] : undefined;
  const hasIncomingTransition = Boolean(previousScene?.transitionAfter && previousScene.transitionAfter !== "cut");
  const hasOverlappingTransition = Boolean(scene.transitionAfter && scene.transitionAfter !== "cut");
  const transitionStartFrame = scene.durationInFrames - (hasOverlappingTransition ? MOTION_FRAMES.transition : 0);
  const titleRevealStart = hasIncomingTransition ? MOTION_FRAMES.transition : 0;
  const titleRevealEnd = titleRevealStart + MOTION_FRAMES.titleReveal;
  const fadeOutEnd = hasOverlappingTransition ? transitionStartFrame : scene.durationInFrames;
  const fadeOutStart = Math.max(titleRevealEnd + 1, fadeOutEnd - 12);
  const opacity = hasIncomingTransition
    ? interpolate(
        frame,
        [0, titleRevealStart, titleRevealEnd, fadeOutStart, fadeOutEnd],
        [0, 0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
      )
    : interpolate(
        frame,
        [0, titleRevealEnd, fadeOutStart, fadeOutEnd],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
      );
  const translateY = interpolate(frame, [titleRevealStart, titleRevealEnd], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: VIDEO_THEME.color.canvas, color: VIDEO_THEME.color.text, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 70% 47%, rgba(79,70,229,0.15), transparent 53%), linear-gradient(rgba(148,163,184,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.035) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 84px 84px, 84px 84px",
        }}
      />
      <BrandHeader layout={layout} />
      {!hideFeatureTitle && <FeatureTitle scene={scene} layout={layout} opacity={opacity} translateY={translateY} />}
      {children}
      {!hideFeatureCaption && <Caption scene={scene} layout={layout} opacity={opacity} translateY={translateY * 0.6} />}
      <BottomRail layout={layout} />
    </AbsoluteFill>
  );
};

const BrandHeader: React.FC<{ layout: VideoLayout }> = ({ layout }) => {
  const { width, height } = useVideoConfig();
  const inset = layout === "portrait" ? Math.round(width * 0.075) : Math.round(width * 0.045);
  const top = layout === "portrait" ? Math.round(height * 0.042) : Math.round(height * 0.065);
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: inset,
        right: inset,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: layout === "portrait" ? 18 : 14,
        borderBottom: "1px solid rgba(148, 163, 184, 0.22)",
        fontFamily: VIDEO_THEME.fontFamily,
        color: VIDEO_THEME.color.textMuted,
      }}
    >
      <span style={{ fontSize: layout === "portrait" ? 15 : 13, fontWeight: 700, letterSpacing: "0.18em" }}>
        HYDROQUALISENSE
      </span>
      <span style={{ fontSize: layout === "portrait" ? 11 : 10, fontWeight: 600, letterSpacing: "0.13em", color: VIDEO_THEME.color.textQuiet }}>
        ENGINEERING OPERATIONS
      </span>
    </div>
  );
};

const BottomRail: React.FC<{ layout: VideoLayout }> = ({ layout }) => {
  const { width } = useVideoConfig();
  const inset = layout === "portrait" ? Math.round(width * 0.075) : Math.round(width * 0.045);
  return (
    <div
      style={{
        position: "absolute",
        left: inset,
        right: inset,
        bottom: layout === "portrait" ? 50 : 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
        color: VIDEO_THEME.color.textQuiet,
        fontFamily: VIDEO_THEME.fontFamily,
        fontSize: layout === "portrait" ? 11 : 10,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 22, height: 2, background: VIDEO_THEME.color.accent, opacity: 0.8 }} />
      <span style={{ flex: 1, height: 1, background: "rgba(148,163,184,0.16)" }} />
      <span>HYDROQUALISENSE.COM</span>
    </div>
  );
};
