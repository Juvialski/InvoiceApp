import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import type { PreparedCaptureAsset, PreparedCaptureManifest } from "../data/assets";

const AssetManifestContext = createContext<PreparedCaptureManifest | null>(null);

export const AssetManifestProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [manifest, setManifest] = useState<PreparedCaptureManifest | null>(null);
  const handle = useRef<number | null>(null);

  if (handle.current === null) {
    handle.current = delayRender("Loading prepared HydroQualiSense capture assets");
  }

  useEffect(() => {
    let active = true;
    fetch(staticFile("captures/asset-manifest.json"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Capture assets are not prepared. Run npm run assets:prepare first.");
        return (await response.json()) as PreparedCaptureManifest;
      })
      .then((loadedManifest) => {
        if (!active) return;
        setManifest(loadedManifest);
        if (handle.current !== null) continueRender(handle.current);
      })
      .catch((error: unknown) => cancelRender(error instanceof Error ? error : new Error(String(error))));

    return () => {
      active = false;
    };
  }, []);

  return <AssetManifestContext.Provider value={manifest}>{children}</AssetManifestContext.Provider>;
};

export function usePreparedCaptureAsset(assetId: string): PreparedCaptureAsset | null {
  const manifest = useContext(AssetManifestContext);
  if (!manifest) return null;
  return manifest.assets[assetId] ?? null;
}
