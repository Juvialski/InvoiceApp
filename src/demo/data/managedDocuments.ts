import type { ManagedDocumentDetail, ManagedDocumentSummary } from "../../lib/managedDocuments.ts";

const warrantyId = "demo-managed-warranty-001";
const artifactId = "demo-managed-artifact-001";

export const DEMO_MANAGED_DOCUMENTS: readonly ManagedDocumentSummary[] = [
  {
    id: warrantyId,
    title: "Warranty Certificate · Quezon City Warehouse",
    description: "Turnover warranty certificate retained for the project file.",
    category: "WARRANTY_CERTIFICATE",
    origin: "MANUAL_UPLOAD",
    status: "ACTIVE",
    projectId: "demo-project-warehouse",
    currentVersionId: "demo-managed-warranty-001-v2",
    currentVersionNumber: 2,
    currentFileName: "NGL-WHX-warranty-revised.pdf",
    currentMimeType: "application/pdf",
    currentSizeBytes: 284_112,
    currentSha256: "1111111111111111111111111111111111111111111111111111111111111111",
    createdByUserId: "demo-user-finance",
    createdAt: "2026-08-12T09:30:00+08:00",
    updatedAt: "2026-09-18T14:10:00+08:00",
  },
  {
    id: artifactId,
    title: "Purchase Order PO-2026-017 (PDF)",
    description: "Retained generated output linked back to the authoritative Purchase Order.",
    category: "GENERATED_ARTIFACT",
    origin: "GENERATED_ARTIFACT",
    status: "ACTIVE",
    projectId: "demo-project-warehouse",
    currentVersionId: "demo-managed-artifact-001-v1",
    currentVersionNumber: 1,
    currentFileName: "PO-2026-017.pdf",
    currentMimeType: "application/pdf",
    currentSizeBytes: 194_400,
    currentSha256: "2222222222222222222222222222222222222222222222222222222222222222",
    createdAt: "2026-09-17T10:20:00+08:00",
    updatedAt: "2026-09-17T10:20:00+08:00",
    artifact: {
      id: "demo-artifact-registration-001",
      managedDocumentId: artifactId,
      managedVersionId: "demo-managed-artifact-001-v1",
      sourceDomain: "PURCHASE_ORDER",
      sourceType: "PURCHASE_ORDER",
      sourceRecordId: "demo-po-2026-017",
      sourceRecordReference: "PO-2026-017",
      artifactType: "PDF",
      displayName: "Purchase Order PO-2026-017 (PDF)",
      templateVersionId: "demo-template-version-po-001",
      templateContentSha256: "3333333333333333333333333333333333333333333333333333333333333333",
      createdAt: "2026-09-17T10:20:00+08:00",
    },
  },
];

export const DEMO_MANAGED_DOCUMENT_DETAILS: readonly ManagedDocumentDetail[] = [
  {
    ...DEMO_MANAGED_DOCUMENTS[0]!,
    versions: [
      { id: "demo-managed-warranty-001-v2", documentId: warrantyId, versionNumber: 2, sourceOrigin: "MANUAL_UPLOAD", originalFilename: "NGL-WHX-warranty-revised.pdf", mimeType: "application/pdf", sizeBytes: 284_112, sha256: "1111111111111111111111111111111111111111111111111111111111111111", uploadedByUserId: "demo-user-finance", createdAt: "2026-09-18T14:10:00+08:00" },
      { id: "demo-managed-warranty-001-v1", documentId: warrantyId, versionNumber: 1, sourceOrigin: "MANUAL_UPLOAD", originalFilename: "NGL-WHX-warranty.pdf", mimeType: "application/pdf", sizeBytes: 276_800, sha256: "4444444444444444444444444444444444444444444444444444444444444444", uploadedByUserId: "demo-user-finance", createdAt: "2026-08-12T09:30:00+08:00" },
    ],
  },
  {
    ...DEMO_MANAGED_DOCUMENTS[1]!,
    versions: [
      { id: "demo-managed-artifact-001-v1", documentId: artifactId, versionNumber: 1, sourceOrigin: "GENERATED_ARTIFACT", originalFilename: "PO-2026-017.pdf", mimeType: "application/pdf", sizeBytes: 194_400, sha256: "2222222222222222222222222222222222222222222222222222222222222222", templateVersionId: "demo-template-version-po-001", createdAt: "2026-09-17T10:20:00+08:00" },
    ],
  },
];
