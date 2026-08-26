import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBoundingBox,
  calculateDistance,
  calculateNormalizedDistance,
  calculatePhysicalMeasurement,
  canvasToScreenPoint,
  clamp,
  clampPoint,
  compareRevisionNumbers,
  createDrawingAnnotation,
  createEngineeringDocument,
  createEngineeringDocumentRevision,
  createInitialEngineeringDocumentsWorkspaceData,
  deleteDrawingAnnotation,
  filterDocumentsByDiscipline,
  filterDocumentsByProject,
  fromNormalizedPoint,
  fromNormalizedPoints,
  fromNormalizedRect,
  isPointInsideRect,
  normalizedRectToScreen,
  normalizedToScreen,
  parseEngineeringScale,
  screenRectToNormalized,
  screenToCanvasPoint,
  screenToNormalized,
  sortRevisions,
  toNormalizedPoint,
  toNormalizedPoints,
  toNormalizedRect,
  updateDrawingAnnotation,
  updateEngineeringDocument,
  type AnnotationGeometry,
  type AnnotationStyle,
  type DisciplineType,
  type DrawingAnnotation,
  type EngineeringDocument,
  type EngineeringDocumentRevision,
  type EngineeringDocumentType,
  type StageTransform,
} from "../src/lib/engineeringDocuments.ts";
import {
  annotationFromRow,
  documentFromRow,
  emptyEngineeringDocumentsWorkspaceData,
  readEngineeringDocumentsWorkspaceFromLocal,
  revisionFromRow,
  writeEngineeringDocumentsWorkspaceToLocal,
} from "../src/lib/engineeringDocumentsPersistence.ts";

test("clamp and clampPoint ensure values stay bounded within [0, 1]", () => {
  assert.equal(clamp(0.5), 0.5);
  assert.equal(clamp(-0.2), 0);
  assert.equal(clamp(1.5), 1);
  assert.equal(clamp(NaN), 0);

  const clamped = clampPoint({ x: -0.5, y: 1.5 });
  assert.deepEqual(clamped, { x: 0, y: 1 });
});

test("normalized coordinate transformations round-trip cleanly with viewport dimensions", () => {
  const viewport = { width: 1920, height: 1080 };
  const rawPoint = { x: 960, y: 540 };

  const normPoint = toNormalizedPoint(rawPoint, viewport);
  assert.equal(normPoint.x, 0.5);
  assert.equal(normPoint.y, 0.5);

  const restored = fromNormalizedPoint(normPoint, viewport);
  assert.equal(restored.x, 960);
  assert.equal(restored.y, 540);

  const rawRect = { x: 192, y: 108, width: 960, height: 540 };
  const normRect = toNormalizedRect(rawRect, viewport);
  assert.equal(normRect.x, 0.1);
  assert.equal(normRect.y, 0.1);
  assert.equal(normRect.width, 0.5);
  assert.equal(normRect.height, 0.5);

  const restoredRect = fromNormalizedRect(normRect, viewport);
  assert.deepEqual(restoredRect, rawRect);

  const points = [
    { x: 0, y: 0 },
    { x: 960, y: 540 },
    { x: 1920, y: 1080 },
  ];
  const normPoints = toNormalizedPoints(points, viewport);
  assert.deepEqual(normPoints, [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
  ]);
  const restoredPoints = fromNormalizedPoints(normPoints, viewport);
  assert.deepEqual(restoredPoints, points);
});

test("stage zooming and panning transformations correctly map screen to canvas and normalized space", () => {
  const stage: StageTransform = {
    width: 2000,
    height: 1000,
    scale: 2.0, // 200% zoom
    x: 100,     // pan offset X
    y: 50,      // pan offset Y
  };

  // Screen point (500, 250) -> canvas point: (500 - 100)/2 = 200, (250 - 50)/2 = 100
  const canvasPoint = screenToCanvasPoint({ x: 500, y: 250 }, stage);
  assert.equal(canvasPoint.x, 200);
  assert.equal(canvasPoint.y, 100);

  const screenPoint = canvasToScreenPoint(canvasPoint, stage);
  assert.equal(screenPoint.x, 500);
  assert.equal(screenPoint.y, 250);

  // Normalized coordinate for canvas (200, 100) on 2000x1000 sheet -> (0.1, 0.1)
  const normPoint = screenToNormalized({ x: 500, y: 250 }, stage);
  assert.equal(normPoint.x, 0.1);
  assert.equal(normPoint.y, 0.1);

  const backToScreen = normalizedToScreen(normPoint, stage);
  assert.equal(backToScreen.x, 500);
  assert.equal(backToScreen.y, 250);

  // Screen rect to normalized rect and back
  const screenRect = { x: 500, y: 250, width: 400, height: 200 };
  const normRect = screenRectToNormalized(screenRect, stage);
  assert.equal(normRect.x, 0.1);
  assert.equal(normRect.y, 0.1);
  assert.equal(normRect.width, 0.1); // 400 screen px / 2 scale = 200 canvas px / 2000 width = 0.1
  assert.equal(normRect.height, 0.1); // 200 screen px / 2 scale = 100 canvas px / 1000 height = 0.1

  const backToScreenRect = normalizedRectToScreen(normRect, stage);
  assert.deepEqual(backToScreenRect, screenRect);
});

test("geometry measurements, distance, and physical scale calibration calculate accurately", () => {
  const p1 = { x: 0, y: 0 };
  const p2 = { x: 3, y: 4 };
  assert.equal(calculateDistance(p1, p2), 5);

  const normP1 = { x: 0.1, y: 0.1 };
  const normP2 = { x: 0.4, y: 0.5 };
  const normDist = calculateNormalizedDistance(normP1, normP2, 1);
  assert.equal(Math.round(normDist * 100) / 100, 0.5);

  // A1 sheet: 841mm x 594mm at 1:100 scale
  // Points at x: 0.1 to x: 0.6 -> deltaX = 0.5 * 841 = 420.5 mm
  // At 1:100 scale: 420.5 mm * 100 = 42,050 mm = 42.05 meters
  const sheetA1 = { width: 841, height: 594 };
  const lengthMeters = calculatePhysicalMeasurement({ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.2 }, sheetA1, 100);
  assert.equal(Math.round(lengthMeters * 100) / 100, 42.05);

  // Scale parser tests
  assert.equal(parseEngineeringScale("1:100"), 100);
  assert.equal(parseEngineeringScale("1:50"), 50);
  assert.equal(parseEngineeringScale("1/20"), 20);
  assert.equal(parseEngineeringScale("1/4\" = 1'-0\""), 48);
  assert.equal(parseEngineeringScale("1/8\" = 1'-0\""), 96);
  assert.equal(parseEngineeringScale("invalid_scale"), null);
});

test("bounding box and point-in-rect tests behave correctly", () => {
  const points = [
    { x: 0.1, y: 0.2 },
    { x: 0.5, y: 0.8 },
    { x: 0.3, y: 0.4 },
  ];
  const bbox = calculateBoundingBox(points);
  assert.equal(bbox.minX, 0.1);
  assert.equal(bbox.minY, 0.2);
  assert.equal(bbox.maxX, 0.5);
  assert.equal(bbox.maxY, 0.8);
  assert.equal(Math.round(bbox.width * 10) / 10, 0.4);
  assert.equal(Math.round(bbox.height * 10) / 10, 0.6);

  const rect = { x: 0.1, y: 0.2, width: 0.4, height: 0.6 };
  assert.ok(isPointInsideRect({ x: 0.2, y: 0.3 }, rect));
  assert.ok(!isPointInsideRect({ x: 0.05, y: 0.3 }, rect));
  assert.ok(!isPointInsideRect({ x: 0.2, y: 0.9 }, rect));
});

test("revision number comparison and sorting handle versions, letters, and numbers", () => {
  assert.equal(compareRevisionNumbers("0", "1") < 0, true);
  assert.equal(compareRevisionNumbers("1", "2") < 0, true);
  assert.equal(compareRevisionNumbers("2", "10") < 0, true);
  assert.equal(compareRevisionNumbers("A", "B") < 0, true);
  assert.equal(compareRevisionNumbers("Rev A", "Rev B") < 0, true);
  assert.equal(compareRevisionNumbers("Rev 1", "Rev 2") < 0, true);
  assert.equal(compareRevisionNumbers("Rev 2", "Rev 10") < 0, true);

  const revisions: EngineeringDocumentRevision[] = [
    {
      id: "r3",
      documentId: "d1",
      revisionNumber: "Rev 10",
      fileName: "f3.pdf",
      filePath: "p3",
      fileSizeBytes: 100,
      fileType: "application/pdf",
      fileFingerprint: "fp3",
      status: "APPROVED",
      createdAt: "2026-08-26T03:00:00Z",
      updatedAt: "2026-08-26T03:00:00Z",
    },
    {
      id: "r1",
      documentId: "d1",
      revisionNumber: "Rev 1",
      fileName: "f1.pdf",
      filePath: "p1",
      fileSizeBytes: 100,
      fileType: "application/pdf",
      fileFingerprint: "fp1",
      status: "APPROVED",
      createdAt: "2026-08-26T01:00:00Z",
      updatedAt: "2026-08-26T01:00:00Z",
    },
    {
      id: "r2",
      documentId: "d1",
      revisionNumber: "Rev 2",
      fileName: "f2.pdf",
      filePath: "p2",
      fileSizeBytes: 100,
      fileType: "application/pdf",
      fileFingerprint: "fp2",
      status: "APPROVED",
      createdAt: "2026-08-26T02:00:00Z",
      updatedAt: "2026-08-26T02:00:00Z",
    },
  ];

  const sorted = sortRevisions(revisions);
  assert.equal(sorted[0].revisionNumber, "Rev 1");
  assert.equal(sorted[1].revisionNumber, "Rev 2");
  assert.equal(sorted[2].revisionNumber, "Rev 10");
});

test("document lifecycle helpers: create, update, archive, and filter", () => {
  const doc = createEngineeringDocument({
    documentNumber: "  STR-001  ",
    title: "  Foundation Layout  ",
    discipline: "STRUCTURAL",
    documentType: "DRAWING",
    projectId: "proj-123",
  }, "user-1");

  assert.equal(doc.documentNumber, "STR-001");
  assert.equal(doc.title, "Foundation Layout");
  assert.equal(doc.discipline, "STRUCTURAL");
  assert.equal(doc.documentType, "DRAWING");
  assert.equal(doc.status, "DRAFT");
  assert.equal(doc.currentRevisionNumber, "0");
  assert.equal(doc.createdByUserId, "user-1");

  const updated = updateEngineeringDocument(doc, {
    title: "Updated Foundation Layout",
    status: "UNDER_REVIEW",
  });
  assert.equal(updated.title, "Updated Foundation Layout");
  assert.equal(updated.status, "UNDER_REVIEW");

  const archived = deleteDrawingAnnotation({
    id: "ann-1",
    documentId: doc.id,
    revisionId: "rev-1",
    pageNumber: 1,
    annotationType: "CLOUD",
    geometry: { type: "CLOUD" },
    style: { strokeColor: "#f00" },
    status: "OPEN",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal(archived.status, "DELETED");

  const docs = [
    doc,
    createEngineeringDocument({
      documentNumber: "ARC-101",
      title: "Floor Plan",
      discipline: "ARCHITECTURAL",
      documentType: "DRAWING",
      projectId: "proj-456",
    }),
  ];

  const structDocs = filterDocumentsByDiscipline(docs, "STRUCTURAL");
  assert.equal(structDocs.length, 1);
  assert.equal(structDocs[0].documentNumber, "STR-001");

  const projDocs = filterDocumentsByProject(docs, "proj-123");
  assert.equal(projDocs.length, 1);
  assert.equal(projDocs[0].documentNumber, "STR-001");
});

test("drawing annotation lifecycle helpers: create, update, and soft delete", () => {
  const ann = createDrawingAnnotation({
    documentId: "doc-1",
    revisionId: "rev-1",
    pageNumber: 1,
    annotationType: "RECTANGLE",
    geometry: { rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
    content: "Check footing depth",
  }, "user-1");

  assert.equal(ann.documentId, "doc-1");
  assert.equal(ann.annotationType, "RECTANGLE");
  assert.equal(ann.content, "Check footing depth");
  assert.equal(ann.status, "OPEN");

  const resolved = updateDrawingAnnotation(ann, {
    status: "RESOLVED",
    resolvedByUserId: "user-2",
    resolvedAt: "2026-08-26T12:00:00Z",
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.resolvedByUserId, "user-2");
});

test("local fallback workspace data initializes with sample drawings and annotations", () => {
  const initial = createInitialEngineeringDocumentsWorkspaceData();
  assert.ok(initial.documents.length >= 3);
  assert.ok(initial.revisions.length >= 3);
  assert.ok(initial.annotations.length >= 2);

  const structDoc = initial.documents.find((d) => d.discipline === "STRUCTURAL");
  assert.ok(structDoc);
  assert.equal(structDoc.documentNumber, "S-101");

  const archDoc = initial.documents.find((d) => d.discipline === "ARCHITECTURAL");
  assert.ok(archDoc);
  assert.equal(archDoc.documentNumber, "A-201");
});

test("persistence row mappings accurately convert between database snake_case and TypeScript camelCase", () => {
  const dbDocRow = {
    id: "d1234567-0000-0000-0000-000000000001",
    company_id: "c1234567-0000-0000-0000-000000000001",
    project_id: "p1234567-0000-0000-0000-000000000001",
    document_number: "DWG-001",
    title: "Structural Frame Plan",
    description: "Steel frame framing details",
    discipline: "STRUCTURAL",
    document_type: "DRAWING",
    status: "APPROVED",
    current_revision_id: "r1234567-0000-0000-0000-000000000001",
    current_revision_number: "1",
    tags: ["Frame", "Steel"],
    metadata: { floor: 2 },
    created_by_user_id: "u1234567-0000-0000-0000-000000000001",
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:30:00Z",
  };

  const doc = documentFromRow(dbDocRow);
  assert.equal(doc.id, "d1234567-0000-0000-0000-000000000001");
  assert.equal(doc.companyId, "c1234567-0000-0000-0000-000000000001");
  assert.equal(doc.documentNumber, "DWG-001");
  assert.equal(doc.title, "Structural Frame Plan");
  assert.equal(doc.discipline, "STRUCTURAL");
  assert.equal(doc.currentRevisionNumber, "1");
  assert.deepEqual(doc.tags, ["Frame", "Steel"]);

  const dbRevRow = {
    id: "r1234567-0000-0000-0000-000000000001",
    company_id: "c1234567-0000-0000-0000-000000000001",
    document_id: "d1234567-0000-0000-0000-000000000001",
    revision_number: "1",
    revision_label: "Issued for Review",
    file_name: "DWG-001_Rev1.pdf",
    file_path: "companies/c1/d1/r1_DWG-001_Rev1.pdf",
    file_size_bytes: 4500000,
    file_type: "application/pdf",
    file_fingerprint: "sha256_mock_fingerprint",
    page_count: 3,
    sheet_size: "A1",
    scale: "1:100",
    status: "APPROVED",
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
  };

  const rev = revisionFromRow(dbRevRow);
  assert.equal(rev.revisionNumber, "1");
  assert.equal(rev.fileName, "DWG-001_Rev1.pdf");
  assert.equal(rev.fileSizeBytes, 4500000);
  assert.equal(rev.pageCount, 3);
  assert.equal(rev.scale, "1:100");

  const dbAnnRow = {
    id: "a1234567-0000-0000-0000-000000000001",
    company_id: "c1234567-0000-0000-0000-000000000001",
    document_id: "d1234567-0000-0000-0000-000000000001",
    revision_id: "r1234567-0000-0000-0000-000000000001",
    page_number: 2,
    annotation_type: "MEASUREMENT",
    geometry: { measurementStart: { x: 0.1, y: 0.2 }, measurementEnd: { x: 0.5, y: 0.2 } },
    style: { strokeColor: "#00f" },
    content: "Grid Span 1-2",
    measurement_value: 25.5,
    measurement_unit: "m",
    status: "OPEN",
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
  };

  const ann = annotationFromRow(dbAnnRow);
  assert.equal(ann.pageNumber, 2);
  assert.equal(ann.annotationType, "MEASUREMENT");
  assert.equal(ann.measurementValue, 25.5);
  assert.equal(ann.measurementUnit, "m");
});

test("localStorage workspace serialization and deserialization works correctly", () => {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => { store.set(key, val); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i) => Array.from(store.keys())[i] ?? null,
    length: store.size,
  };

  const initial = createInitialEngineeringDocumentsWorkspaceData();
  writeEngineeringDocumentsWorkspaceToLocal(initial, mockStorage);

  const loaded = readEngineeringDocumentsWorkspaceFromLocal(mockStorage);
  assert.equal(loaded.documents.length, initial.documents.length);
  assert.equal(loaded.revisions.length, initial.revisions.length);
  assert.equal(loaded.annotations.length, initial.annotations.length);
});
