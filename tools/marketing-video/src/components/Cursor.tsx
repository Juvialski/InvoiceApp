import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT } from "../motion/easing";

export interface CursorPoint {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
}

interface CursorProps {
  readonly points: readonly [CursorPoint, CursorPoint];
  readonly visibleFrames: readonly [number, number, number, number];
}

/** A quiet pointer overlay for explicitly mapped, real targets; no click animation is implied. */
export const Cursor: React.FC<CursorProps> = ({ points, visibleFrames }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [points[0].frame, points[1].frame], [points[0].x, points[1].x], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN_OUT,
  });
  const y = interpolate(frame, [points[0].frame, points[1].frame], [points[0].y, points[1].y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN_OUT,
  });
  const opacity = interpolate(frame, visibleFrames, [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      width={23}
      height={29}
      viewBox="0 0 23 29"
      aria-hidden="true"
      style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(15,23,42,.35))" }}
    >
      <path d="M2 1.5v21l5.3-5.1 4.1 8.4 3.5-1.7-4.1-8.1h7.1L2 1.5Z" fill="#ffffff" stroke="#0f172a" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};
