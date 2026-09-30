import assetJson from "./assets.json";

export interface MarketingAssetDefinition {
  readonly id: string;
  readonly routeId: string;
  readonly profile: "pc-1080p" | "vertical-stills";
  readonly layout: "desktop" | "mobile";
  readonly width: number;
  readonly height: number;
  readonly dataset: string;
  readonly claimBoundary: string;
}

export const MARKETING_ASSETS = assetJson as readonly MarketingAssetDefinition[];
export type AssetId = (typeof MARKETING_ASSETS)[number]["id"];

export const MARKETING_ASSET_BY_ID = new Map<string, MarketingAssetDefinition>(
  MARKETING_ASSETS.map((asset) => [asset.id, asset]),
);

export interface PreparedCaptureAsset {
  readonly id: string;
  readonly file: string;
  readonly kind: "video" | "still";
  readonly width: number;
  readonly height: number;
  readonly trimBeforeFrames: number;
  readonly routeId: string;
  readonly dataset: string;
  readonly claimBoundary: string;
}

export interface PreparedCaptureManifest {
  readonly campaignDataset: "MKT-V3A";
  readonly sourceCaptureSha: string;
  readonly sourceWorkingTreeClean: boolean;
  readonly sourceCapturedAt: string;
  readonly generatedAt: string;
  readonly assets: Readonly<Record<string, PreparedCaptureAsset>>;
}
