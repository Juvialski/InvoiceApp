import React from "react";
import { useVideoConfig } from "remotion";
import type { SceneBeat } from "../data/scenes";
import { VIDEO_THEME } from "../styles/theme";
import { AppMedia } from "./AppMedia";

interface DesktopFrameProps {
  readonly beat: SceneBeat;
  readonly layout: "portrait" | "landscape";
  readonly width?: number;
  readonly style?: React.CSSProperties;
}

export function getDesktopFrameWidth(width: number, height: number, layout: "portrait" | "landscape"): number {
  const maxWidth = layout === "portrait" ? width * 0.98 : width * 0.76;
  const maxFrameHeight = layout === "portrait" ? height * 0.36 : height * 0.80;
  const maxScreenWidthByHeight = Math.max(1, maxFrameHeight - 50) * (16 / 9);
  return Math.floor(Math.min(maxWidth, maxScreenWidthByHeight));
}

export const DesktopFrame: React.FC<DesktopFrameProps> = ({ beat, layout, width: explicitWidth, style }) => {
  const composition = useVideoConfig();
  const frameWidth = explicitWidth ?? getDesktopFrameWidth(composition.width, composition.height, layout);
  const screenHeight = frameWidth * (9 / 16);
  const barHeight = Math.max(28, Math.round(frameWidth * 0.032));

  return (
    <div
      style={{
        width: frameWidth,
        maxWidth: "calc(100vw - 48px)",
        height: screenHeight + barHeight,
        overflow: "hidden",
        borderRadius: VIDEO_THEME.radius.frame,
        border: "1px solid rgba(203, 213, 225, 0.26)",
        background: "#e2e8f0",
        boxShadow: "0 34px 90px rgba(2, 6, 23, 0.48), 0 6px 24px rgba(2, 6, 23, 0.24)",
        ...style,
      }}
    >
      <div
        style={{
          height: barHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 15px",
          color: "#334155",
          fontFamily: VIDEO_THEME.fontFamily,
          background: "linear-gradient(180deg, #f8fafc, #e2e8f0)",
          borderBottom: "1px solid #cbd5e1",
          fontSize: Math.max(10, Math.round(frameWidth * 0.012)),
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ display: "flex", gap: 6, alignItems: "center" }} aria-hidden="true">
          {["#94a3b8", "#94a3b8", "#94a3b8"].map((color, index) => (
            <span key={index} style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          ))}
          <span style={{ marginLeft: 7, color: "#475569" }}>Application capture</span>
        </span>
        <span style={{ color: "#475569" }}>Synthetic sample data</span>
      </div>
      <div
        style={{
          width: "100%",
          height: screenHeight,
          overflow: "hidden",
          background: "#f8fafc",
          borderRadius: `0 0 ${VIDEO_THEME.radius.window}px ${VIDEO_THEME.radius.window}px`,
        }}
      >
        <AppMedia beat={beat} />
      </div>
    </div>
  );
};
