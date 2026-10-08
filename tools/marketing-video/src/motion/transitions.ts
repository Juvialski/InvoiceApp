import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { MOTION_FRAMES } from "./tokens";

export type SceneTransitionKind = "fade" | "slide" | "wipe" | "cut";

export function transitionTiming() {
  return linearTiming({ durationInFrames: MOTION_FRAMES.transition });
}

export function transitionElement(kind: Exclude<SceneTransitionKind, "cut">, key: string): React.ReactElement {
  const timing = transitionTiming();
  switch (kind) {
    case "fade":
      return React.createElement(TransitionSeries.Transition, { key, presentation: fade(), timing });
    case "slide":
      return React.createElement(TransitionSeries.Transition, { key, presentation: slide(), timing });
    case "wipe":
      return React.createElement(TransitionSeries.Transition, { key, presentation: wipe(), timing });
  }
}
