import type { EntityMediaEntityType } from "./storage/keys.ts";

export type { EntityMediaEntityType } from "./storage/keys.ts";

export type EntityMediaPurpose = "COVER" | "PRIMARY";

/** Client-visible current media metadata plus a short-lived authenticated URL. */
export interface EntityMedia {
  readonly id: string;
  readonly entityType: EntityMediaEntityType;
  readonly entityId: string;
  readonly purpose: EntityMediaPurpose;
  readonly url: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly altText?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EntityMediaBatch {
  readonly byEntityId: Readonly<Record<string, EntityMedia>>;
}

export interface EntityMediaMutationResult {
  readonly media: EntityMedia | null;
  readonly cleanupPending: boolean;
}
