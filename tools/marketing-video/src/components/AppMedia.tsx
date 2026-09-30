import React from "react";
import { Video } from "@remotion/media";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { SceneBeat } from "../data/scenes";
import { CAMERA } from "../motion/tokens";
import { usePreparedCaptureAsset } from "./AssetManifestProvider";

export const AppMedia: React.FC<{ readonly beat: SceneBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const asset = usePreparedCaptureAsset(beat.assetId);
  if (!asset) return null;

  const targetScale = beat.camera === "hero-push" ? CAMERA.heroPush : CAMERA.restrainedPush;
  const scale = beat.camera
    ? interpolate(frame, [24, Math.max(90, beat.durationInFrames - 24)], [1, targetScale], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const mediaStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    transform: scale === 1 ? undefined : `scale(${scale})`,
    transformOrigin: "50% 56%",
  };

  if (asset.kind === "video") {
    return (
      <Video
        src={staticFile(asset.file)}
        muted
        loop
        trimBefore={asset.trimBeforeFrames}
        objectFit="contain"
        style={mediaStyle}
      />
    );
  }

  return <Img src={staticFile(asset.file)} style={{ ...mediaStyle, objectFit: "contain" }} />;
};
