import React from "react";
import { VIDEO_THEME } from "../styles/theme";

interface CalloutProps {
  readonly label: string;
  readonly style?: React.CSSProperties;
}

export const Callout: React.FC<CalloutProps> = ({ label, style }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: VIDEO_THEME.fontFamily, color: VIDEO_THEME.color.text, ...style }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: VIDEO_THEME.color.accentBright, boxShadow: "0 0 12px rgba(165,180,252,0.28)" }} />
    <span style={{ width: 26, height: 1, background: "rgba(203,213,225,0.7)" }} />
    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
  </div>
);
