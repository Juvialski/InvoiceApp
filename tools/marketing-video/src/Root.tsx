import React from "react";
import { Composition, Folder } from "remotion";
import { COMMERCIAL_DURATION_IN_FRAMES } from "./data/scenes";
import { HydroQualiSenseCommercial } from "./scenes/HydroQualiSenseCommercial";

export const Root: React.FC = () => (
  <Folder name="HydroQualiSense">
    <Composition
      id="HydroQualiSenseCommercial9x16"
      component={HydroQualiSenseCommercial}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={COMMERCIAL_DURATION_IN_FRAMES}
      defaultProps={{ layout: "portrait" }}
    />
    <Composition
      id="HydroQualiSenseCommercial16x9"
      component={HydroQualiSenseCommercial}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={COMMERCIAL_DURATION_IN_FRAMES}
      defaultProps={{ layout: "landscape" }}
    />
  </Folder>
);
