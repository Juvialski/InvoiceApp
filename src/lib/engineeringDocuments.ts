export type DisciplineType =
  | "ARCHITECTURAL"
  | "STRUCTURAL"
  | "CIVIL"
  | "MECHANICAL"
  | "ELECTRICAL"
  | "PLUMBING"
  | "FIRE_PROTECTION"
  | "GEOTECHNICAL"
  | "GENERAL_ENGINEERING"
  | "OTHER";

export type EngineeringDocumentType =
  | "DRAWING"
  | "CALCULATION"
  | "SPECIFICATION"
  | "REPORT"
  | "ESTIMATE"
  | "SUBMITTAL"
  | "PERMIT"
  | "OTHER";

export type DocumentStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED"
  | "ARCHIVED";

export type RevisionStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export type AnnotationType =
  | "RECTANGLE"
  | "CIRCLE"
  | "CLOUD"
  | "ARROW"
  | "LINE"
  | "TEXT"
  | "FREEHAND"
  | "HIGHLIGHT"
  | "CALLOUT"
  | "MEASUREMENT"
  | "STAMP";

export type AnnotationStatus =
  | "OPEN"
  | "RESOLVED"
  | "CLOSED"
  | "DELETED";

export interface Point {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationGeometry {
  type?: AnnotationType;
  points?: Point[];
  rect?: NormalizedRect;
  center?: Point;
  radius?: number;
  arrowStart?: Point;
  arrowEnd?: Point;
  calloutAnchor?: Point;
  calloutBox?: NormalizedRect;
  measurementStart?: Point;
  measurementEnd?: Point;
  rawPath?: string;
}

export interface AnnotationStyle {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  strokeDashArray?: number[];
  stampText?: string;
  textAlignment?: "left" | "center" | "right";
}

export interface DrawingAnnotation {
  id: string;
  companyId?: string;
  documentId: string;
  revisionId: string;
  pageNumber: number;
  annotationType: AnnotationType;
  geometry: AnnotationGeometry;
  style: AnnotationStyle;
  content?: string;
  measurementValue?: number;
  measurementUnit?: string;
  status: AnnotationStatus;
  resolvedByUserId?: string;
  resolvedAt?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDocumentRevision {
  id: string;
  companyId?: string;
  documentId: string;
  revisionNumber: string;
  revisionLabel?: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  fileType: string;
  fileFingerprint: string;
  pageCount?: number;
  sheetSize?: string;
  scale?: string;
  changeSummary?: string;
  status: RevisionStatus;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringDocument {
  id: string;
  companyId?: string;
  projectId?: string;
  documentNumber: string;
  title: string;
  description?: string;
  discipline: DisciplineType;
  documentType: EngineeringDocumentType;
  status: DocumentStatus;
  currentRevisionId?: string;
  currentRevisionNumber: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface EngineeringDocumentsWorkspaceData {
  documents: EngineeringDocument[];
  revisions: EngineeringDocumentRevision[];
  annotations: DrawingAnnotation[];
}

export interface StageTransform {
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function clampPoint(p: Point): Point {
  return {
    x: clamp(p.x, 0, 1),
    y: clamp(p.y, 0, 1),
  };
}

export function toNormalizedPoint(point: Point, viewport: ViewportSize): Point {
  const w = viewport.width > 0 ? viewport.width : 1;
  const h = viewport.height > 0 ? viewport.height : 1;
  return {
    x: clamp(point.x / w, 0, 1),
    y: clamp(point.y / h, 0, 1),
  };
}

export function fromNormalizedPoint(normalizedPoint: Point, viewport: ViewportSize): Point {
  return {
    x: normalizedPoint.x * viewport.width,
    y: normalizedPoint.y * viewport.height,
  };
}

export function toNormalizedRect(
  rect: { x: number; y: number; width: number; height: number },
  viewport: ViewportSize
): NormalizedRect {
  const w = viewport.width > 0 ? viewport.width : 1;
  const h = viewport.height > 0 ? viewport.height : 1;

  const normX = clamp(rect.x / w, 0, 1);
  const normY = clamp(rect.y / h, 0, 1);
  const normWidth = clamp(rect.width / w, 0, 1 - normX);
  const normHeight = clamp(rect.height / h, 0, 1 - normY);

  return {
    x: normX,
    y: normY,
    width: normWidth,
    height: normHeight,
  };
}

export function fromNormalizedRect(
  normalizedRect: NormalizedRect,
  viewport: ViewportSize
): { x: number; y: number; width: number; height: number } {
  return {
    x: normalizedRect.x * viewport.width,
    y: normalizedRect.y * viewport.height,
    width: normalizedRect.width * viewport.width,
    height: normalizedRect.height * viewport.height,
  };
}

export function toNormalizedPoints(points: Point[], viewport: ViewportSize): Point[] {
  return points.map((p) => toNormalizedPoint(p, viewport));
}

export function fromNormalizedPoints(points: Point[], viewport: ViewportSize): Point[] {
  return points.map((p) => fromNormalizedPoint(p, viewport));
}

export function screenToCanvasPoint(
  screenPoint: Point,
  stage: Pick<StageTransform, "scale" | "x" | "y">
): Point {
  const scale = stage.scale > 0 ? stage.scale : 1;
  return {
    x: (screenPoint.x - stage.x) / scale,
    y: (screenPoint.y - stage.y) / scale,
  };
}

export function canvasToScreenPoint(
  canvasPoint: Point,
  stage: Pick<StageTransform, "scale" | "x" | "y">
): Point {
  return {
    x: canvasPoint.x * stage.scale + stage.x,
    y: canvasPoint.y * stage.scale + stage.y,
  };
}

export function screenToNormalized(screenPoint: Point, stage: StageTransform): Point {
  const canvasPoint = screenToCanvasPoint(screenPoint, stage);
  return toNormalizedPoint(canvasPoint, { width: stage.width, height: stage.height });
}

export function normalizedToScreen(normalizedPoint: Point, stage: StageTransform): Point {
  const canvasPoint = fromNormalizedPoint(normalizedPoint, { width: stage.width, height: stage.height });
  return canvasToScreenPoint(canvasPoint, stage);
}

export function screenRectToNormalized(
  screenRect: { x: number; y: number; width: number; height: number },
  stage: StageTransform
): NormalizedRect {
  const scale = stage.scale > 0 ? stage.scale : 1;
  const canvasX = (screenRect.x - stage.x) / scale;
  const canvasY = (screenRect.y - stage.y) / scale;
  const canvasW = screenRect.width / scale;
  const canvasH = screenRect.height / scale;

  return toNormalizedRect(
    { x: canvasX, y: canvasY, width: canvasW, height: canvasH },
    { width: stage.width, height: stage.height }
  );
}

export function normalizedRectToScreen(
  normalizedRect: NormalizedRect,
  stage: StageTransform
): { x: number; y: number; width: number; height: number } {
  const canvasRect = fromNormalizedRect(normalizedRect, { width: stage.width, height: stage.height });
  const screenStart = canvasToScreenPoint({ x: canvasRect.x, y: canvasRect.y }, stage);
  return {
    x: screenStart.x,
    y: screenStart.y,
    width: canvasRect.width * stage.scale,
    height: canvasRect.height * stage.scale,
  };
}

export function calculateDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateNormalizedDistance(p1: Point, p2: Point, aspectRatio = 1): number {
  const dx = p2.x - p1.x;
  const dy = (p2.y - p1.y) / (aspectRatio > 0 ? aspectRatio : 1);
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculatePhysicalMeasurement(
  p1: Point,
  p2: Point,
  sheetDimensionsMm: { width: number; height: number },
  scaleRatio: number
): number {
  const dxMm = (p2.x - p1.x) * sheetDimensionsMm.width;
  const dyMm = (p2.y - p1.y) * sheetDimensionsMm.height;
  const distanceMm = Math.sqrt(dxMm * dxMm + dyMm * dyMm);
  const realDistanceMm = distanceMm * scaleRatio;
  return realDistanceMm / 1000; // Returns meters
}

export function calculateBoundingBox(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function isPointInsideRect(p: Point, rect: NormalizedRect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

export function parseEngineeringScale(scaleStr: string): number | null {
  if (!scaleStr || typeof scaleStr !== "string") return null;
  const trimmed = scaleStr.trim();

  // Pattern 1: "1:100", "1:50", "1/100", "1 : 20"
  const ratioMatch = trimmed.match(/^1\s*[:/]\s*(\d+(\.\d+)?)$/i);
  if (ratioMatch) {
    const val = Number(ratioMatch[1]);
    return val > 0 ? val : null;
  }

  // Pattern 2: Architectural scales like "1/4\" = 1'-0\"" -> 48 (1/4 inch = 12 inches)
  const archMatch = trimmed.match(/^(\d+)\/(\d+)\s*["']?\s*=\s*1\s*['ft]/i);
  if (archMatch) {
    const num = Number(archMatch[1]);
    const den = Number(archMatch[2]);
    if (num > 0 && den > 0) {
      return (12 * den) / num;
    }
  }

  // Pattern 3: Direct ratio number
  const numOnly = Number(trimmed);
  if (Number.isFinite(numOnly) && numOnly > 0) {
    return numOnly;
  }

  return null;
}

export function engineeringId(prefix = "eng"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Authenticated document/RPC identifiers must remain valid database UUIDs
  // even in browsers that do not expose randomUUID().  The prefix is kept in
  // the API for local callers, but UUID storage is the compatibility boundary.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Revision labels are user-facing metadata, so callers may enter `1`, `Rev
 * 1`, or `Revision 1`.  This helper gives validation a deterministic semantic
 * comparison without rewriting the historical label stored for a revision.
 */
export function normalizedRevisionNumber(value: string): string {
  return (value || "").trim().toUpperCase().replace(/^REV(?:ISION)?\.?\s*/, "").trim();
}

export function revisionNumbersEqual(a: string, b: string): boolean {
  const normalizedA = normalizedRevisionNumber(a);
  const normalizedB = normalizedRevisionNumber(b);
  if (!normalizedA || !normalizedB) return false;
  return normalizedA === normalizedB || compareRevisionNumbers(a, b) === 0;
}

export function compareRevisionNumbers(a: string, b: string): number {
  const normA = (a || "").trim().toUpperCase();
  const normB = (b || "").trim().toUpperCase();

  if (normA === normB) return 0;

  // Check if both are numeric (e.g. "0", "1", "2", "10")
  const numA = Number(normA);
  const numB = Number(normB);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    return numA - numB;
  }

  // Handle Rev / Revision prefix
  const cleanA = normA.replace(/^REV(\.|ISION)?\s*/i, "");
  const cleanB = normB.replace(/^REV(\.|ISION)?\s*/i, "");
  const subNumA = Number(cleanA);
  const subNumB = Number(cleanB);
  if (!Number.isNaN(subNumA) && !Number.isNaN(subNumB)) {
    return subNumA - subNumB;
  }

  return normA.localeCompare(normB, undefined, { numeric: true, sensitivity: "base" });
}

export function formatRevisionNumber(value: string): string {
  const normalized = (value || "").trim();
  if (!normalized) return "Rev";
  return /^rev(?:ision)?\.?\s/i.test(normalized) ? normalized : `Rev ${normalized}`;
}

export function sortRevisions(revisions: EngineeringDocumentRevision[]): EngineeringDocumentRevision[] {
  return [...revisions].sort((a, b) => {
    const revCompare = compareRevisionNumbers(a.revisionNumber, b.revisionNumber);
    if (revCompare !== 0) return revCompare;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function createEngineeringDocument(
  input: {
    documentNumber: string;
    title: string;
    discipline: DisciplineType;
    documentType: EngineeringDocumentType;
    description?: string;
    projectId?: string;
    companyId?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
  userId?: string
): EngineeringDocument {
  const now = new Date().toISOString();
  return {
    id: engineeringId("doc"),
    companyId: input.companyId,
    projectId: input.projectId,
    documentNumber: input.documentNumber.trim(),
    title: input.title.trim(),
    description: input.description?.trim(),
    discipline: input.discipline,
    documentType: input.documentType,
    status: "DRAFT",
    currentRevisionNumber: "0",
    tags: input.tags || [],
    metadata: input.metadata || {},
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEngineeringDocumentRevision(
  input: {
    id?: string;
    documentId: string;
    revisionNumber: string;
    fileName: string;
    filePath: string;
    fileSizeBytes: number;
    fileType: string;
    fileFingerprint: string;
    companyId?: string;
    revisionLabel?: string;
    pageCount?: number;
    sheetSize?: string;
    scale?: string;
    changeSummary?: string;
    status?: RevisionStatus;
  },
  userId?: string
): EngineeringDocumentRevision {
  const now = new Date().toISOString();
  return {
    id: input.id || engineeringId("rev"),
    companyId: input.companyId,
    documentId: input.documentId,
    revisionNumber: input.revisionNumber.trim(),
    revisionLabel: input.revisionLabel?.trim(),
    fileName: input.fileName.trim(),
    filePath: input.filePath.trim(),
    fileSizeBytes: Math.max(0, input.fileSizeBytes),
    fileType: input.fileType.trim(),
    fileFingerprint: input.fileFingerprint.trim(),
    pageCount: input.pageCount && input.pageCount > 0 ? input.pageCount : undefined,
    sheetSize: input.sheetSize?.trim(),
    scale: input.scale?.trim(),
    changeSummary: input.changeSummary?.trim(),
    status: input.status || "PENDING_REVIEW",
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDrawingAnnotation(
  input: {
    documentId: string;
    revisionId: string;
    pageNumber: number;
    annotationType: AnnotationType;
    geometry: AnnotationGeometry;
    style?: AnnotationStyle;
    companyId?: string;
    content?: string;
    measurementValue?: number;
    measurementUnit?: string;
    status?: AnnotationStatus;
  },
  userId?: string
): DrawingAnnotation {
  const now = new Date().toISOString();
  return {
    id: engineeringId("ann"),
    companyId: input.companyId,
    documentId: input.documentId,
    revisionId: input.revisionId,
    pageNumber: Math.max(1, input.pageNumber || 1),
    annotationType: input.annotationType,
    geometry: input.geometry,
    style: input.style || {
      strokeColor: "#ef4444",
      strokeWidth: 2,
      opacity: 1,
      fontSize: 14,
    },
    content: input.content?.trim(),
    measurementValue: input.measurementValue,
    measurementUnit: input.measurementUnit?.trim(),
    status: input.status || "OPEN",
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateEngineeringDocument(
  doc: EngineeringDocument,
  updates: Partial<Pick<EngineeringDocument, "title" | "description" | "discipline" | "documentType" | "status" | "tags" | "metadata" | "currentRevisionId" | "currentRevisionNumber" | "projectId">>
): EngineeringDocument {
  return {
    ...doc,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

export function archiveEngineeringDocument(doc: EngineeringDocument): EngineeringDocument {
  const now = new Date().toISOString();
  return {
    ...doc,
    status: "ARCHIVED",
    archivedAt: now,
    updatedAt: now,
  };
}

export function updateDrawingAnnotation(
  ann: DrawingAnnotation,
  updates: Partial<Pick<DrawingAnnotation, "geometry" | "style" | "content" | "status" | "measurementValue" | "measurementUnit" | "resolvedByUserId" | "resolvedAt">>
): DrawingAnnotation {
  return {
    ...ann,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

export function deleteDrawingAnnotation(ann: DrawingAnnotation): DrawingAnnotation {
  return {
    ...ann,
    status: "DELETED",
    updatedAt: new Date().toISOString(),
  };
}

export function filterDocumentsByDiscipline(
  documents: EngineeringDocument[],
  discipline: DisciplineType | "ALL"
): EngineeringDocument[] {
  if (discipline === "ALL") return documents;
  return documents.filter((d) => d.discipline === discipline);
}

export function filterDocumentsByProject(
  documents: EngineeringDocument[],
  projectId: string | null | undefined,
  options: { includeUnassigned?: boolean } = {},
): EngineeringDocument[] {
  if (!projectId) return options.includeUnassigned ? documents.filter((d) => !d.projectId) : [];
  return documents.filter((d) => d.projectId === projectId || (options.includeUnassigned === true && !d.projectId));
}

export function createInitialEngineeringDocumentsWorkspaceData(): EngineeringDocumentsWorkspaceData {
  const doc1Id = "00000000-0000-4000-a000-000000000001";
  const doc2Id = "00000000-0000-4000-a000-000000000002";
  const doc3Id = "00000000-0000-4000-a000-000000000003";

  const rev1Id = "00000000-0000-4000-a000-000000000011";
  const rev2Id = "00000000-0000-4000-a000-000000000012";
  const rev3Id = "00000000-0000-4000-a000-000000000013";

  const ann1Id = "00000000-0000-4000-a000-000000000021";
  const ann2Id = "00000000-0000-4000-a000-000000000022";

  const now = "2026-08-26T08:00:00.000Z";

  const documents: EngineeringDocument[] = [
    {
      id: doc1Id,
      documentNumber: "S-101",
      title: "Foundation & Column Layout Plan",
      description: "Structural foundation engineering plan with pile cap details and column schedules.",
      discipline: "STRUCTURAL",
      documentType: "DRAWING",
      status: "APPROVED",
      currentRevisionId: rev1Id,
      currentRevisionNumber: "1",
      tags: ["Foundation", "Structural", "Columns", "IFC"],
      metadata: { sheetSize: "A1", designer: "Engr. R. Santos", verified: true },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: doc2Id,
      documentNumber: "A-201",
      title: "Ground Floor Architectural Plan",
      description: "Architectural floor plan showing partitions, door/window schedules, and finish specs.",
      discipline: "ARCHITECTURAL",
      documentType: "DRAWING",
      status: "UNDER_REVIEW",
      currentRevisionId: rev2Id,
      currentRevisionNumber: "2",
      tags: ["Architectural", "FloorPlan", "GroundFloor"],
      metadata: { sheetSize: "A1", designer: "Ar. M. Cruz" },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: doc3Id,
      documentNumber: "MEP-301",
      title: "HVAC & Electrical Ducting Distribution",
      description: "Mechanical ventilation layout and electrical primary conduit routing.",
      discipline: "MECHANICAL",
      documentType: "DRAWING",
      status: "DRAFT",
      currentRevisionId: rev3Id,
      currentRevisionNumber: "0",
      tags: ["MEP", "HVAC", "Electrical"],
      metadata: { sheetSize: "A1", designer: "Engr. K. Reyes" },
      createdAt: now,
      updatedAt: now,
    },
  ];

  const revisions: EngineeringDocumentRevision[] = [
    {
      id: rev1Id,
      documentId: doc1Id,
      revisionNumber: "1",
      revisionLabel: "Issued for Construction (IFC)",
      fileName: "S-101_Foundation_Layout_Rev1.pdf",
      filePath: "sample/S-101_Foundation_Layout_Rev1.pdf",
      fileSizeBytes: 2450000,
      fileType: "application/pdf",
      fileFingerprint: "sha256_s101_rev1_mock_fingerprint_01",
      pageCount: 1,
      sheetSize: "A1",
      scale: "1:100",
      changeSummary: "Incorporated updated soil test bearing capacity data.",
      status: "APPROVED",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: rev2Id,
      documentId: doc2Id,
      revisionNumber: "2",
      revisionLabel: "Client Review Set",
      fileName: "A-201_GroundFloor_Rev2.pdf",
      filePath: "sample/A-201_GroundFloor_Rev2.pdf",
      fileSizeBytes: 3100000,
      fileType: "application/pdf",
      fileFingerprint: "sha256_a201_rev2_mock_fingerprint_02",
      pageCount: 1,
      sheetSize: "A1",
      scale: "1:100",
      changeSummary: "Shifted utility room partition and widened hallway.",
      status: "PENDING_REVIEW",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: rev3Id,
      documentId: doc3Id,
      revisionNumber: "0",
      revisionLabel: "Preliminary Design",
      fileName: "MEP-301_HVAC_Ducting_Rev0.pdf",
      filePath: "sample/MEP-301_HVAC_Ducting_Rev0.pdf",
      fileSizeBytes: 1800000,
      fileType: "application/pdf",
      fileFingerprint: "sha256_mep301_rev0_mock_fingerprint_03",
      pageCount: 1,
      sheetSize: "A1",
      scale: "1:50",
      changeSummary: "Initial preliminary routing draft.",
      status: "PENDING_REVIEW",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const annotations: DrawingAnnotation[] = [
    {
      id: ann1Id,
      documentId: doc1Id,
      revisionId: rev1Id,
      pageNumber: 1,
      annotationType: "CLOUD",
      geometry: {
        type: "CLOUD",
        rect: { x: 0.25, y: 0.35, width: 0.18, height: 0.12 },
        points: [
          { x: 0.25, y: 0.35 },
          { x: 0.43, y: 0.35 },
          { x: 0.43, y: 0.47 },
          { x: 0.25, y: 0.47 },
        ],
      },
      style: {
        strokeColor: "#ef4444",
        strokeWidth: 2,
        fillColor: "rgba(239, 68, 68, 0.1)",
        opacity: 1,
      },
      content: "Verify rebar embedment depth for column C-4.",
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ann2Id,
      documentId: doc1Id,
      revisionId: rev1Id,
      pageNumber: 1,
      annotationType: "MEASUREMENT",
      geometry: {
        type: "MEASUREMENT",
        measurementStart: { x: 0.25, y: 0.35 },
        measurementEnd: { x: 0.43, y: 0.35 },
      },
      style: {
        strokeColor: "#2563eb",
        strokeWidth: 2,
        fontSize: 12,
      },
      measurementValue: 18.0,
      measurementUnit: "m",
      content: "Grid Span A-B: 18.00m",
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    documents,
    revisions,
    annotations,
  };
}
