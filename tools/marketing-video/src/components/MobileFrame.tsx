import React from "react";
import { VIDEO_THEME } from "../styles/theme";
import { AppMedia } from "./AppMedia";

interface MobileFrameProps {
  readonly beat: { readonly assetId: string; readonly durationInFrames: number };
  readonly width: number;
  readonly style?: React.CSSProperties;
}

export const MobileFrame: React.FC<MobileFrameProps> = ({ beat, width, style }) => {
  const inset = Math.max(7, Math.round(width * 0.025));
  const innerWidth = width - inset * 2;
  const innerHeight = innerWidth * (16 / 9);

  return (
    <div
      style={{
        width,
        height: innerHeight + inset * 2,
        padding: inset,
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: VIDEO_THEME.radius.phone,
        background: "#020617",
        border: "2px solid rgba(226, 232, 240, 0.6)",
        boxShadow: "0 28px 80px rgba(2, 6, 23, 0.5), 0 0 0 1px rgba(15, 23, 42, 0.7)",
        ...style,
      }}
    >
      <div style={{ width: innerWidth, height: innerHeight, overflow: "hidden", borderRadius: VIDEO_THEME.radius.phone - inset / 2 }}>
        <AppMedia beat={beat} />
      </div>
    </div>
  );
};
