import React from "react";
import { TransitionSeries } from "@remotion/transitions";
import { useVideoConfig } from "remotion";
import type { MarketingScene } from "../data/scenes";
import { SCENES } from "../data/scenes";
import { transitionElement } from "../motion/transitions";
import { AssetManifestProvider } from "../components/AssetManifestProvider";
import { AudioTracks } from "../components/AudioTracks";
import { ClosingScene } from "./ClosingScene";
import { DesktopScene } from "./DesktopScene";
import { MobileScene } from "./MobileScene";
import { MontageScene } from "./MontageScene";
import type { VideoLayout } from "../components/SceneCanvas";

const SceneContent: React.FC<{ scene: MarketingScene; layout: VideoLayout }> = ({ scene, layout }) => {
  switch (scene.style) {
    case "desktop":
      return <DesktopScene scene={scene} layout={layout} />;
    case "montage":
      return <MontageScene scene={scene} layout={layout} />;
    case "mobile":
      return <MobileScene scene={scene} layout={layout} />;
    case "closing":
      return <ClosingScene scene={scene} layout={layout} />;
  }
};

export const HydroQualiSenseCommercial: React.FC<Record<string, unknown>> = (props) => {
  const { width, height } = useVideoConfig();
  const requestedLayout: VideoLayout = props.layout === "landscape" ? "landscape" : "portrait";
  const resolvedLayout: VideoLayout = height > width ? "portrait" : requestedLayout;
  const timelineChildren = SCENES.flatMap((scene, index) => {
    const elements: React.ReactNode[] = [
      <TransitionSeries.Sequence key={`scene-${scene.id}`} durationInFrames={scene.durationInFrames}>
        <SceneContent scene={scene} layout={resolvedLayout} />
      </TransitionSeries.Sequence>,
    ];
    if (index < SCENES.length - 1 && scene.transitionAfter && scene.transitionAfter !== "cut") {
      elements.push(transitionElement(scene.transitionAfter, `transition-${scene.id}`));
    }
    return elements;
  });

  return (
    <AssetManifestProvider>
      <TransitionSeries>{timelineChildren}</TransitionSeries>
      <AudioTracks />
    </AssetManifestProvider>
  );
};
