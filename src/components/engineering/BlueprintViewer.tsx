import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Konva from "konva";
import * as pdfjsLib from "pdfjs-dist";
import {
  MousePointer,
  Hand,
  Square,
  MoveRight,
  Type,
  Cloud,
  Pencil,
  MessageSquare,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Layers,
  FileText,
  Compass,
} from "lucide-react";
import type {
  AnnotationGeometry,
  AnnotationStyle,
  AnnotationType,
  DisciplineType,
  DrawingAnnotation,
  EngineeringDocument,
  EngineeringDocumentRevision,
  Point,
} from "../../lib/engineeringDocuments.ts";
import {
  calculateBoundingBox,
  calculatePhysicalMeasurement,
  compareRevisionNumbers,
  createDrawingAnnotation,
  deleteDrawingAnnotation,
  engineeringId,
  fromNormalizedPoint,
  fromNormalizedPoints,
  fromNormalizedRect,
  toNormalizedPoint,
  toNormalizedPoints,
  toNormalizedRect,
  updateDrawingAnnotation,
} from "../../lib/engineeringDocuments.ts";
import {
  saveDrawingAnnotationToSupabase,
  deleteDrawingAnnotationInSupabase,
  writeEngineeringDocumentsWorkspaceToLocal,
  readEngineeringDocumentsWorkspaceFromLocal,
} from "../../lib/engineeringDocumentsPersistence.ts";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
    }
  } catch (err) {
    console.warn("PDF.js worker setup fallback:", err);
  }
}

export type BlueprintTool =
  | "select"
  | "pan"
  | "rect"
  | "arrow"
  | "text"
  | "cloud"
  | "freehand"
  | "callout"
  | "delete";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export interface BlueprintViewerProps {
  document: EngineeringDocument;
  revisions: EngineeringDocumentRevision[];
  currentRevisionId?: string;
  initialAnnotations?: DrawingAnnotation[];
  companyId?: string;
  readOnly?: boolean;
  onSaveAnnotations?: (annotations: DrawingAnnotation[]) => Promise<void> | void;
  onRevisionChange?: (revisionId: string) => void;
  onClose?: () => void;
}

const COLOR_PALETTE = [
  { label: "Red", value: "#ef4444", border: "border-red-500", bg: "bg-red-500" },
  { label: "Orange", value: "#f97316", border: "border-orange-500", bg: "bg-orange-500" },
  { label: "Blue", value: "#3b82f6", border: "border-blue-500", bg: "bg-blue-500" },
  { label: "Green", value: "#10b981", border: "border-emerald-500", bg: "bg-emerald-500" },
  { label: "Yellow", value: "#eab308", border: "border-yellow-500", bg: "bg-yellow-500" },
  { label: "Purple", value: "#8b5cf6", border: "border-purple-500", bg: "bg-purple-500" },
  { label: "Dark", value: "#0f172a", border: "border-slate-900", bg: "bg-slate-900" },
];

const STROKE_WIDTHS = [2, 4, 6];

// Generate AEC Scalloped Revision Cloud SVG Path
function generateRevisionCloudPath(
  x: number,
  y: number,
  w: number,
  h: number,
  arcRadius = 14
): string {
  const minX = Math.min(x, x + w);
  const maxX = Math.max(x, x + w);
  const minY = Math.min(y, y + h);
  const maxY = Math.max(y, y + h);
  const width = Math.max(8, maxX - minX);
  const height = Math.max(8, maxY - minY);

  const numHoriz = Math.max(2, Math.round(width / (arcRadius * 2)));
  const numVert = Math.max(2, Math.round(height / (arcRadius * 2)));

  const stepX = width / numHoriz;
  const stepY = height / numVert;

  const pathParts: string[] = [`M ${minX} ${minY}`];

  // Top edge (left -> right)
  for (let i = 0; i < numHoriz; i++) {
    const startX = minX + i * stepX;
    const endX = minX + (i + 1) * stepX;
    const midX = (startX + endX) / 2;
    const controlY = minY - arcRadius * 0.75;
    pathParts.push(`Q ${midX} ${controlY} ${endX} ${minY}`);
  }

  // Right edge (top -> bottom)
  for (let i = 0; i < numVert; i++) {
    const startY = minY + i * stepY;
    const endY = minY + (i + 1) * stepY;
    const midY = (startY + endY) / 2;
    const controlX = maxX + arcRadius * 0.75;
    pathParts.push(`Q ${controlX} ${midY} ${maxX} ${endY}`);
  }

  // Bottom edge (right -> left)
  for (let i = 0; i < numHoriz; i++) {
    const startX = maxX - i * stepX;
    const endX = maxX - (i + 1) * stepX;
    const midX = (startX + endX) / 2;
    const controlY = maxY + arcRadius * 0.75;
    pathParts.push(`Q ${midX} ${controlY} ${endX} ${maxY}`);
  }

  // Left edge (bottom -> top)
  for (let i = 0; i < numVert; i++) {
    const startY = maxY - i * stepY;
    const endY = maxY - (i + 1) * stepY;
    const midY = (startY + endY) / 2;
    const controlX = minX - arcRadius * 0.75;
    pathParts.push(`Q ${controlX} ${midY} ${minX} ${endY}`);
  }

  pathParts.push("Z");
  return pathParts.join(" ");
}

// Fallback high-fidelity Architectural/Structural Blueprint vector canvas generator
function renderBlueprintFallback(
  canvas: HTMLCanvasElement,
  doc: EngineeringDocument,
  rev?: EngineeringDocumentRevision
) {
  const dpr = window.devicePixelRatio || 1;
  const width = 1200;
  const height = 850;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Background: Deep blueprint navy
  ctx.fillStyle = "#0b192c";
  ctx.fillRect(0, 0, width, height);

  // Fine grid lines
  ctx.strokeStyle = "rgba(30, 58, 95, 0.45)";
  ctx.lineWidth = 1;
  const gridSize = 25;
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Major grid lines
  ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
  ctx.lineWidth = 1.5;
  const majorGrid = 100;
  for (let x = 0; x <= width; x += majorGrid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += majorGrid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Drawing border frame
  const margin = 40;
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

  // Inner margin line
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(margin + 5, margin + 5, width - (margin + 5) * 2, height - (margin + 5) * 2);

  // Structural Grid Axes
  const gridStartX = 140;
  const gridStartY = 120;
  const gridWidth = 720;
  const gridHeight = 520;
  const colSpans = [0, 200, 420, 600, 720];
  const rowSpans = [0, 160, 340, 520];
  const colLabels = ["1", "2", "3", "4", "5"];
  const rowLabels = ["A", "B", "C", "D"];

  ctx.strokeStyle = "rgba(148, 163, 184, 0.6)";
  ctx.lineWidth = 1;
  ctx.setLineDash([12, 4, 3, 4]);

  colSpans.forEach((offset, idx) => {
    const x = gridStartX + offset;
    ctx.beginPath();
    ctx.moveTo(x, gridStartY - 30);
    ctx.lineTo(x, gridStartY + gridHeight + 30);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(x, gridStartY - 40, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(colLabels[idx], x, gridStartY - 40);

    ctx.setLineDash([12, 4, 3, 4]);
  });

  rowSpans.forEach((offset, idx) => {
    const y = gridStartY + offset;
    ctx.beginPath();
    ctx.moveTo(gridStartX - 30, y);
    ctx.lineTo(gridStartX + gridWidth + 30, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(gridStartX - 40, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(rowLabels[idx], gridStartX - 40, y);

    ctx.setLineDash([12, 4, 3, 4]);
  });

  ctx.setLineDash([]);

  // Outer Walls
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3.5;
  ctx.strokeRect(gridStartX, gridStartY, gridWidth, gridHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gridStartX + 8, gridStartY + 8, gridWidth - 16, gridHeight - 16);

  // Partitions
  ctx.strokeStyle = "#93c5fd";
  ctx.lineWidth = 2;
  const corridorY = gridStartY + 260;
  ctx.beginPath();
  ctx.moveTo(gridStartX, corridorY);
  ctx.lineTo(gridStartX + gridWidth, corridorY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(gridStartX + 420, gridStartY);
  ctx.lineTo(gridStartX + 420, corridorY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(gridStartX + 200, corridorY);
  ctx.lineTo(gridStartX + 200, gridStartY + gridHeight);
  ctx.stroke();

  // Columns
  colSpans.forEach((colX) => {
    rowSpans.forEach((rowY) => {
      const cx = gridStartX + colX;
      const cy = gridStartY + rowY;

      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 8, cy - 8, 16, 16);
    });
  });

  // Labels
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText("MAIN LOBBY & RECEPTION", gridStartX + 210, gridStartY + 130);
  ctx.font = "10px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("FFL: ±0.000m • AREA: 110.0 m²", gridStartX + 210, gridStartY + 150);

  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText("CONFERENCE & BRIEFING 101", gridStartX + 570, gridStartY + 130);
  ctx.font = "10px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("FFL: ±0.000m • AREA: 78.5 m²", gridStartX + 570, gridStartY + 150);

  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText("STRUCTURAL CORE / ELEVATORS", gridStartX + 100, gridStartY + 390);

  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText("OPEN ENGINEERING WORKSPACE", gridStartX + 460, gridStartY + 390);

  // Dimension lines
  ctx.strokeStyle = "#facc15";
  ctx.fillStyle = "#facc15";
  ctx.lineWidth = 1;
  const dimY = gridStartY + gridHeight + 60;
  ctx.beginPath();
  ctx.moveTo(gridStartX, dimY);
  ctx.lineTo(gridStartX + gridWidth, dimY);
  ctx.stroke();

  colSpans.forEach((offset) => {
    const x = gridStartX + offset;
    ctx.beginPath();
    ctx.moveTo(x, dimY - 8);
    ctx.lineTo(x, dimY + 8);
    ctx.stroke();
  });

  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("TOTAL BUILDING SPAN: 36,000 mm (36.00 m)", gridStartX + gridWidth / 2, dimY - 12);

  // Title Block
  const tbWidth = 280;
  const tbHeight = 160;
  const tbX = width - margin - tbWidth - 5;
  const tbY = height - margin - tbHeight - 5;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(tbX, tbY, tbWidth, tbHeight);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tbX, tbY, tbWidth, tbHeight);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.beginPath();
  ctx.moveTo(tbX, tbY + 40);
  ctx.lineTo(tbX + tbWidth, tbY + 40);
  ctx.moveTo(tbX, tbY + 80);
  ctx.lineTo(tbX + tbWidth, tbY + 80);
  ctx.moveTo(tbX, tbY + 120);
  ctx.lineTo(tbX + tbWidth, tbY + 120);
  ctx.moveTo(tbX + 140, tbY + 80);
  ctx.lineTo(tbX + 140, tbY + tbHeight);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 10px monospace";
  ctx.fillText("ENGORYX ENGINEERING & DESIGN", tbX + 10, tbY + 18);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px sans-serif";
  ctx.fillText("PROJECT DRAWING SET", tbX + 10, tbY + 32);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText(doc.title.toUpperCase(), tbX + 10, tbY + 58);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px monospace";
  ctx.fillText(`DISCIPLINE: ${doc.discipline}`, tbX + 10, tbY + 72);

  ctx.fillStyle = "#64748b";
  ctx.font = "8px sans-serif";
  ctx.fillText("DRAWING NO.", tbX + 10, tbY + 93);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 13px monospace";
  ctx.fillText(doc.documentNumber, tbX + 10, tbY + 110);

  ctx.fillStyle = "#64748b";
  ctx.font = "8px sans-serif";
  ctx.fillText("CURRENT REVISION", tbX + 150, tbY + 93);
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 12px monospace";
  ctx.fillText(rev?.revisionNumber ? `REV ${rev.revisionNumber}` : `REV ${doc.currentRevisionNumber}`, tbX + 150, tbY + 110);

  ctx.fillStyle = "#64748b";
  ctx.font = "8px sans-serif";
  ctx.fillText("SCALE / SHEET", tbX + 10, tbY + 133);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "9px monospace";
  ctx.fillText(`${rev?.scale || "1:100"} • ${rev?.sheetSize || "A1"}`, tbX + 10, tbY + 148);

  ctx.fillStyle = "#64748b";
  ctx.font = "8px sans-serif";
  ctx.fillText("DATE", tbX + 150, tbY + 133);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "9px monospace";
  ctx.fillText(new Date(doc.updatedAt || Date.now()).toLocaleDateString("en-US"), tbX + 150, tbY + 148);

  // North Arrow
  const naX = width - margin - 50;
  const naY = margin + 50;
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(naX, naY - 20);
  ctx.lineTo(naX - 8, naY + 10);
  ctx.lineTo(naX, naY + 5);
  ctx.closePath();
  ctx.fill();

  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#38bdf8";
  ctx.textAlign = "center";
  ctx.fillText("N", naX, naY - 25);

  ctx.restore();
}

export const BlueprintViewer: React.FC<BlueprintViewerProps> = ({
  document: doc,
  revisions = [],
  currentRevisionId: initialRevisionId,
  initialAnnotations = [],
  companyId,
  readOnly = false,
  onSaveAnnotations,
  onRevisionChange,
  onClose,
}) => {
  // Sort revisions
  const sortedRevisions = useMemo(() => {
    return [...revisions].sort((a, b) => compareRevisionNumbers(a.revisionNumber, b.revisionNumber));
  }, [revisions]);

  const [selectedRevisionId, setSelectedRevisionId] = useState<string>(
    initialRevisionId || doc.currentRevisionId || sortedRevisions[0]?.id || ""
  );

  const currentRevision = useMemo(() => {
    return sortedRevisions.find((r) => r.id === selectedRevisionId) || sortedRevisions[0];
  }, [sortedRevisions, selectedRevisionId]);

  // Page & Viewport State
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 1200, height: 850 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);

  // Tool & Styling State
  const [tool, setTool] = useState<BlueprintTool>("select");
  const [activeColor, setActiveColor] = useState<string>("#ef4444");
  const [activeStrokeWidth, setActiveStrokeWidth] = useState<number>(2);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Annotations & History State
  const [annotations, setAnnotations] = useState<DrawingAnnotation[]>(initialAnnotations);
  const [undoStack, setUndoStack] = useState<DrawingAnnotation[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingAnnotation[][]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  // Text / Callout Modal Input
  const [pendingTextPrompt, setPendingTextPrompt] = useState<{
    type: "text" | "callout";
    point: Point;
    anchorPoint?: Point;
  } | null>(null);
  const [textInputVal, setTextInputVal] = useState("");

  // DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const konvaContainerRef = useRef<HTMLDivElement>(null);

  // Konva Instances
  const stageRef = useRef<Konva.Stage | null>(null);
  const annotationLayerRef = useRef<Konva.Layer | null>(null);
  const drawLayerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  // Active drawing refs
  const isDrawingRef = useRef<boolean>(false);
  const drawStartPosRef = useRef<Point | null>(null);
  const activeFreehandPointsRef = useRef<number[]>([]);
  const touchStartDistRef = useRef<number | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Page annotations filter
  const pageAnnotations = useMemo(() => {
    return annotations.filter((a) => a.pageNumber === pageNumber && a.status !== "DELETED");
  }, [annotations, pageNumber]);

  // Load PDF or Fallback Rendering
  const loadDocumentContent = useCallback(async () => {
    if (!pdfCanvasRef.current) return;
    const canvas = pdfCanvasRef.current;

    // Check if revision has a real PDF file URL or blob
    const filePath = currentRevision?.filePath;
    const isRealPdf = filePath && (filePath.startsWith("http") || filePath.startsWith("blob:") || filePath.startsWith("data:"));

    if (isRealPdf) {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: filePath });
        const pdf = await loadingTask.promise;
        setTotalPages(pdf.numPages || 1);

        const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
        const viewport = page.getViewport({ scale: 1.0 });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(dpr, dpr);
          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise;
        }

        setPageSize({ width: viewport.width, height: viewport.height });
        return;
      } catch (pdfErr) {
        console.warn("Could not load PDF directly, rendering vector CAD blueprint template:", pdfErr);
      }
    }

    // Default vector CAD blueprint fallback
    setTotalPages(1);
    setPageSize({ width: 1200, height: 850 });
    renderBlueprintFallback(canvas, doc, currentRevision);
  }, [currentRevision, doc, pageNumber]);

  useEffect(() => {
    loadDocumentContent();
  }, [loadDocumentContent]);

  // Initialize Konva Stage
  useEffect(() => {
    if (!konvaContainerRef.current) return;

    const width = pageSize.width * zoom;
    const height = pageSize.height * zoom;

    // Create stage if not yet created
    if (!stageRef.current) {
      const stage = new Konva.Stage({
        container: konvaContainerRef.current,
        width,
        height,
      });

      const annotationLayer = new Konva.Layer();
      const drawLayer = new Konva.Layer();

      const transformer = new Konva.Transformer({
        rotateEnabled: true,
        borderStroke: "#3b82f6",
        borderStrokeWidth: 1.5,
        anchorFill: "#ffffff",
        anchorStroke: "#3b82f6",
        anchorSize: 8,
        anchorCornerRadius: 2,
      });

      annotationLayer.add(transformer);
      stage.add(annotationLayer);
      stage.add(drawLayer);

      stageRef.current = stage;
      annotationLayerRef.current = annotationLayer;
      drawLayerRef.current = drawLayer;
      transformerRef.current = transformer;
    } else {
      const stage = stageRef.current;
      stage.width(width);
      stage.height(height);
      annotationLayerRef.current?.scale({ x: zoom, y: zoom });
      drawLayerRef.current?.scale({ x: zoom, y: zoom });
      annotationLayerRef.current?.batchDraw();
      drawLayerRef.current?.batchDraw();
    }
  }, [pageSize, zoom]);

  // Destroy Konva stage on unmount
  useEffect(() => {
    return () => {
      if (stageRef.current) {
        stageRef.current.destroy();
        stageRef.current = null;
      }
    };
  }, []);

  // Push to Undo Stack
  const pushStateToHistory = useCallback((newAnnotations: DrawingAnnotation[]) => {
    setUndoStack((prev) => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(newAnnotations);
    setSaveStatus("unsaved");
  }, [annotations]);

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, annotations]);
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setAnnotations(previous);
    setSelectedAnnotationId(null);
    setSaveStatus("unsaved");
  }, [annotations, undoStack]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, annotations]);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setAnnotations(next);
    setSelectedAnnotationId(null);
    setSaveStatus("unsaved");
  }, [annotations, redoStack]);

  // Delete Selected Annotation
  const handleDeleteSelected = useCallback(() => {
    if (!selectedAnnotationId || readOnly) return;
    const updated = annotations.map((ann) => {
      if (ann.id === selectedAnnotationId) {
        return deleteDrawingAnnotation(ann);
      }
      return ann;
    });
    pushStateToHistory(updated);
    setSelectedAnnotationId(null);
  }, [annotations, pushStateToHistory, readOnly, selectedAnnotationId]);

  // Save Annotations
  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      if (onSaveAnnotations) {
        await onSaveAnnotations(annotations);
      } else {
        // Persist to local & Supabase
        const currentData = readEngineeringDocumentsWorkspaceFromLocal();
        const otherAnnotations = currentData.annotations.filter(
          (a) => a.documentId !== doc.id || a.revisionId !== (currentRevision?.id || "")
        );
        writeEngineeringDocumentsWorkspaceToLocal({
          ...currentData,
          annotations: [...otherAnnotations, ...annotations],
        });

        // Supabase async sync
        for (const ann of annotations) {
          try {
            if (ann.status === "DELETED") {
              await deleteDrawingAnnotationInSupabase(ann.id, companyId);
            } else {
              await saveDrawingAnnotationToSupabase(ann, companyId);
            }
          } catch {
            // Best effort remote sync
          }
        }
      }
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to save annotations:", err);
      setSaveStatus("error");
    }
  }, [annotations, companyId, currentRevision?.id, doc.id, onSaveAnnotations]);

  // Autosave Debounce Effect
  useEffect(() => {
    if (saveStatus === "unsaved" && !readOnly) {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = setTimeout(() => {
        handleSave();
      }, 1200);
    }
    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [handleSave, readOnly, saveStatus]);

  // Keyboard Shortcuts (Delete, Undo, Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotationId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Escape") {
        setSelectedAnnotationId(null);
        setTool("select");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDeleteSelected, handleRedo, handleUndo, selectedAnnotationId]);

  // Render Annotations onto Konva Layer
  useEffect(() => {
    const layer = annotationLayerRef.current;
    const transformer = transformerRef.current;
    if (!layer || !transformer) return;

    // Clear previous shapes (except transformer)
    layer.destroyChildren();
    layer.add(transformer);
    transformer.nodes([]);

    let selectedNode: Konva.Node | null = null;

    pageAnnotations.forEach((ann) => {
      const strokeColor = ann.style.strokeColor || "#ef4444";
      const strokeWidth = ann.style.strokeWidth || 2;
      const isSelected = ann.id === selectedAnnotationId;
      const isSelectTool = tool === "select" && !readOnly;

      if (ann.annotationType === "RECTANGLE" && ann.geometry.rect) {
        const rectPx = fromNormalizedRect(ann.geometry.rect, pageSize);
        const rectShape = new Konva.Rect({
          id: ann.id,
          x: rectPx.x,
          y: rectPx.y,
          width: rectPx.width,
          height: rectPx.height,
          stroke: strokeColor,
          strokeWidth,
          fill: `${strokeColor}18`,
          draggable: isSelectTool,
        });

        rectShape.on("click tap", () => {
          if (tool === "select") {
            setSelectedAnnotationId(ann.id);
          } else if (tool === "delete") {
            handleDeleteSelected();
          }
        });

        rectShape.on("dragend", (e) => {
          const target = e.target;
          const newRectPx = {
            x: target.x(),
            y: target.y(),
            width: target.width() * target.scaleX(),
            height: target.height() * target.scaleY(),
          };
          const normRect = toNormalizedRect(newRectPx, pageSize);
          const updated = annotations.map((item) =>
            item.id === ann.id ? updateDrawingAnnotation(item, { geometry: { ...item.geometry, rect: normRect } }) : item
          );
          pushStateToHistory(updated);
        });

        rectShape.on("transformend", () => {
          const target = rectShape;
          const scaleX = target.scaleX();
          const scaleY = target.scaleY();
          target.scaleX(1);
          target.scaleY(1);
          const newRectPx = {
            x: target.x(),
            y: target.y(),
            width: Math.max(5, target.width() * scaleX),
            height: Math.max(5, target.height() * scaleY),
          };
          const normRect = toNormalizedRect(newRectPx, pageSize);
          const updated = annotations.map((item) =>
            item.id === ann.id ? updateDrawingAnnotation(item, { geometry: { ...item.geometry, rect: normRect } }) : item
          );
          pushStateToHistory(updated);
        });

        layer.add(rectShape);
        if (isSelected) selectedNode = rectShape;
      } else if (ann.annotationType === "ARROW" && ann.geometry.arrowStart && ann.geometry.arrowEnd) {
        const startPx = fromNormalizedPoint(ann.geometry.arrowStart, pageSize);
        const endPx = fromNormalizedPoint(ann.geometry.arrowEnd, pageSize);

        const arrowShape = new Konva.Arrow({
          id: ann.id,
          points: [startPx.x, startPx.y, endPx.x, endPx.y],
          pointerLength: 12,
          pointerWidth: 10,
          fill: strokeColor,
          stroke: strokeColor,
          strokeWidth,
          draggable: isSelectTool,
        });

        arrowShape.on("click tap", () => {
          if (tool === "select") setSelectedAnnotationId(ann.id);
        });

        arrowShape.on("dragend", (e) => {
          const target = e.target;
          const dx = target.x();
          const dy = target.y();
          target.position({ x: 0, y: 0 });

          const newStart = { x: startPx.x + dx, y: startPx.y + dy };
          const newEnd = { x: endPx.x + dx, y: endPx.y + dy };

          const updated = annotations.map((item) =>
            item.id === ann.id
              ? updateDrawingAnnotation(item, {
                  geometry: {
                    ...item.geometry,
                    arrowStart: toNormalizedPoint(newStart, pageSize),
                    arrowEnd: toNormalizedPoint(newEnd, pageSize),
                  },
                })
              : item
          );
          pushStateToHistory(updated);
        });

        layer.add(arrowShape);
        if (isSelected) selectedNode = arrowShape;
      } else if (ann.annotationType === "CLOUD" && ann.geometry.rect) {
        const rectPx = fromNormalizedRect(ann.geometry.rect, pageSize);
        const pathData = generateRevisionCloudPath(rectPx.x, rectPx.y, rectPx.width, rectPx.height, 16);

        const cloudShape = new Konva.Path({
          id: ann.id,
          data: pathData,
          stroke: strokeColor,
          strokeWidth,
          fill: `${strokeColor}15`,
          draggable: isSelectTool,
        });

        cloudShape.on("click tap", () => {
          if (tool === "select") setSelectedAnnotationId(ann.id);
        });

        cloudShape.on("dragend", (e) => {
          const target = e.target;
          const dx = target.x();
          const dy = target.y();
          target.position({ x: 0, y: 0 });

          const newRectPx = {
            x: rectPx.x + dx,
            y: rectPx.y + dy,
            width: rectPx.width,
            height: rectPx.height,
          };
          const normRect = toNormalizedRect(newRectPx, pageSize);
          const updated = annotations.map((item) =>
            item.id === ann.id ? updateDrawingAnnotation(item, { geometry: { ...item.geometry, rect: normRect } }) : item
          );
          pushStateToHistory(updated);
        });

        layer.add(cloudShape);
        if (isSelected) selectedNode = cloudShape;
      } else if (ann.annotationType === "FREEHAND" && ann.geometry.points && ann.geometry.points.length > 1) {
        const ptsPx = fromNormalizedPoints(ann.geometry.points, pageSize);
        const flatPts: number[] = [];
        ptsPx.forEach((p) => flatPts.push(p.x, p.y));

        const lineShape = new Konva.Line({
          id: ann.id,
          points: flatPts,
          stroke: strokeColor,
          strokeWidth,
          tension: 0.5,
          lineCap: "round",
          lineJoin: "round",
          draggable: isSelectTool,
        });

        lineShape.on("click tap", () => {
          if (tool === "select") setSelectedAnnotationId(ann.id);
        });

        lineShape.on("dragend", (e) => {
          const target = e.target;
          const dx = target.x();
          const dy = target.y();
          target.position({ x: 0, y: 0 });

          const newPts = ptsPx.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          const normPts = toNormalizedPoints(newPts, pageSize);
          const updated = annotations.map((item) =>
            item.id === ann.id ? updateDrawingAnnotation(item, { geometry: { ...item.geometry, points: normPts } }) : item
          );
          pushStateToHistory(updated);
        });

        layer.add(lineShape);
        if (isSelected) selectedNode = lineShape;
      } else if (ann.annotationType === "TEXT" && ann.geometry.points?.[0]) {
        const posPx = fromNormalizedPoint(ann.geometry.points[0], pageSize);
        const textContent = ann.content || "Note";

        const group = new Konva.Group({
          id: ann.id,
          x: posPx.x,
          y: posPx.y,
          draggable: isSelectTool,
        });

        const textShape = new Konva.Text({
          text: textContent,
          fontSize: ann.style.fontSize || 13,
          fontFamily: "sans-serif",
          fill: "#0f172a",
          padding: 6,
        });

        const pillBg = new Konva.Rect({
          width: textShape.width(),
          height: textShape.height(),
          fill: "#ffffff",
          stroke: strokeColor,
          strokeWidth,
          cornerRadius: 6,
          shadowColor: "rgba(0,0,0,0.15)",
          shadowBlur: 4,
          shadowOffset: { x: 0, y: 2 },
          shadowOpacity: 0.5,
        });

        group.add(pillBg);
        group.add(textShape);

        group.on("click tap", () => {
          if (tool === "select") setSelectedAnnotationId(ann.id);
        });

        group.on("dragend", (e) => {
          const target = e.target;
          const newPos = { x: target.x(), y: target.y() };
          const normPos = toNormalizedPoint(newPos, pageSize);
          const updated = annotations.map((item) =>
            item.id === ann.id ? updateDrawingAnnotation(item, { geometry: { ...item.geometry, points: [normPos] } }) : item
          );
          pushStateToHistory(updated);
        });

        layer.add(group);
        if (isSelected) selectedNode = group;
      } else if (ann.annotationType === "CALLOUT" && ann.geometry.calloutAnchor && ann.geometry.calloutBox) {
        const anchorPx = fromNormalizedPoint(ann.geometry.calloutAnchor, pageSize);
        const boxPx = fromNormalizedRect(ann.geometry.calloutBox, pageSize);
        const textContent = ann.content || "Callout";

        const group = new Konva.Group({
          id: ann.id,
          draggable: isSelectTool,
        });

        const leaderLine = new Konva.Line({
          points: [anchorPx.x, anchorPx.y, boxPx.x, boxPx.y + boxPx.height / 2],
          stroke: strokeColor,
          strokeWidth,
          dash: [4, 4],
        });

        const anchorDot = new Konva.Circle({
          x: anchorPx.x,
          y: anchorPx.y,
          radius: 4,
          fill: strokeColor,
        });

        const textShape = new Konva.Text({
          x: boxPx.x,
          y: boxPx.y,
          text: textContent,
          fontSize: ann.style.fontSize || 12,
          fontFamily: "sans-serif",
          fill: "#0f172a",
          padding: 6,
        });

        const boxBg = new Konva.Rect({
          x: boxPx.x,
          y: boxPx.y,
          width: Math.max(boxPx.width, textShape.width()),
          height: Math.max(boxPx.height, textShape.height()),
          fill: "#ffffff",
          stroke: strokeColor,
          strokeWidth,
          cornerRadius: 4,
          shadowColor: "rgba(0,0,0,0.1)",
          shadowBlur: 3,
        });

        group.add(leaderLine);
        group.add(anchorDot);
        group.add(boxBg);
        group.add(textShape);

        group.on("click tap", () => {
          if (tool === "select") setSelectedAnnotationId(ann.id);
        });

        layer.add(group);
        if (isSelected) selectedNode = group;
      }
    });

    if (selectedNode && tool === "select" && !readOnly) {
      transformer.nodes([selectedNode]);
    } else {
      transformer.nodes([]);
    }

    layer.batchDraw();
  }, [
    annotations,
    handleDeleteSelected,
    pageSize,
    pageAnnotations,
    pushStateToHistory,
    readOnly,
    selectedAnnotationId,
    tool,
  ]);

  // Stage Mouse / Touch Events for Drawing
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly || tool === "select" || tool === "pan" || tool === "delete") {
        if (tool === "select" && e.target === stageRef.current) {
          setSelectedAnnotationId(null);
        }
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const pageX = pointer.x / zoom;
      const pageY = pointer.y / zoom;

      isDrawingRef.current = true;
      drawStartPosRef.current = { x: pageX, y: pageY };

      if (tool === "freehand") {
        activeFreehandPointsRef.current = [pageX, pageY];
      } else if (tool === "text") {
        const normPt = toNormalizedPoint({ x: pageX, y: pageY }, pageSize);
        setPendingTextPrompt({ type: "text", point: normPt });
        setTextInputVal("");
        isDrawingRef.current = false;
      }
    },
    [pageSize, readOnly, tool, zoom]
  );

  const handleStageMouseMove = useCallback(() => {
    if (!isDrawingRef.current || !drawStartPosRef.current || !stageRef.current) return;
    const stage = stageRef.current;
    const drawLayer = drawLayerRef.current;
    if (!drawLayer) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const currentX = pointer.x / zoom;
    const currentY = pointer.y / zoom;
    const startX = drawStartPosRef.current.x;
    const startY = drawStartPosRef.current.y;

    drawLayer.destroyChildren();

    if (tool === "rect") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      const previewRect = new Konva.Rect({
        x,
        y,
        width: w,
        height: h,
        stroke: activeColor,
        strokeWidth: activeStrokeWidth,
        fill: `${activeColor}18`,
        dash: [6, 4],
      });
      drawLayer.add(previewRect);
    } else if (tool === "arrow") {
      const previewArrow = new Konva.Arrow({
        points: [startX, startY, currentX, currentY],
        pointerLength: 12,
        pointerWidth: 10,
        fill: activeColor,
        stroke: activeColor,
        strokeWidth: activeStrokeWidth,
      });
      drawLayer.add(previewArrow);
    } else if (tool === "cloud") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      const pathData = generateRevisionCloudPath(x, y, w, h, 16);
      const previewCloud = new Konva.Path({
        data: pathData,
        stroke: activeColor,
        strokeWidth: activeStrokeWidth,
        fill: `${activeColor}15`,
      });
      drawLayer.add(previewCloud);
    } else if (tool === "freehand") {
      activeFreehandPointsRef.current.push(currentX, currentY);
      const previewLine = new Konva.Line({
        points: activeFreehandPointsRef.current,
        stroke: activeColor,
        strokeWidth: activeStrokeWidth,
        tension: 0.5,
        lineCap: "round",
        lineJoin: "round",
      });
      drawLayer.add(previewLine);
    } else if (tool === "callout") {
      const previewLine = new Konva.Line({
        points: [startX, startY, currentX, currentY],
        stroke: activeColor,
        strokeWidth: activeStrokeWidth,
        dash: [4, 4],
      });
      const previewDot = new Konva.Circle({
        x: startX,
        y: startY,
        radius: 4,
        fill: activeColor,
      });
      const previewBox = new Konva.Rect({
        x: currentX,
        y: currentY - 12,
        width: 80,
        height: 24,
        stroke: activeColor,
        strokeWidth: 1,
        cornerRadius: 4,
        fill: "#ffffff",
      });
      drawLayer.add(previewLine);
      drawLayer.add(previewDot);
      drawLayer.add(previewBox);
    }

    drawLayer.batchDraw();
  }, [activeColor, activeStrokeWidth, tool, zoom]);

  const handleStageMouseUp = useCallback(() => {
    if (!isDrawingRef.current || !drawStartPosRef.current || !stageRef.current) {
      isDrawingRef.current = false;
      return;
    }

    const stage = stageRef.current;
    const drawLayer = drawLayerRef.current;
    const pointer = stage.getPointerPosition();

    if (!pointer) {
      isDrawingRef.current = false;
      drawLayer?.destroyChildren();
      drawLayer?.batchDraw();
      return;
    }

    const currentX = pointer.x / zoom;
    const currentY = pointer.y / zoom;
    const startX = drawStartPosRef.current.x;
    const startY = drawStartPosRef.current.y;

    let newAnnotation: DrawingAnnotation | null = null;

    if (tool === "rect") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      if (w > 5 && h > 5) {
        const normRect = toNormalizedRect({ x, y, width: w, height: h }, pageSize);
        newAnnotation = createDrawingAnnotation({
          documentId: doc.id,
          revisionId: currentRevision?.id || "",
          pageNumber,
          annotationType: "RECTANGLE",
          geometry: {
            type: "RECTANGLE",
            rect: normRect,
          },
          style: {
            strokeColor: activeColor,
            strokeWidth: activeStrokeWidth,
          },
          companyId,
        });
      }
    } else if (tool === "arrow") {
      const dist = Math.hypot(currentX - startX, currentY - startY);
      if (dist > 8) {
        const startNorm = toNormalizedPoint({ x: startX, y: startY }, pageSize);
        const endNorm = toNormalizedPoint({ x: currentX, y: currentY }, pageSize);
        newAnnotation = createDrawingAnnotation({
          documentId: doc.id,
          revisionId: currentRevision?.id || "",
          pageNumber,
          annotationType: "ARROW",
          geometry: {
            type: "ARROW",
            arrowStart: startNorm,
            arrowEnd: endNorm,
            points: [startNorm, endNorm],
          },
          style: {
            strokeColor: activeColor,
            strokeWidth: activeStrokeWidth,
          },
          companyId,
        });
      }
    } else if (tool === "cloud") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      if (w > 6 && h > 6) {
        const normRect = toNormalizedRect({ x, y, width: w, height: h }, pageSize);
        newAnnotation = createDrawingAnnotation({
          documentId: doc.id,
          revisionId: currentRevision?.id || "",
          pageNumber,
          annotationType: "CLOUD",
          geometry: {
            type: "CLOUD",
            rect: normRect,
          },
          style: {
            strokeColor: activeColor,
            strokeWidth: activeStrokeWidth,
          },
          companyId,
        });
      }
    } else if (tool === "freehand") {
      const rawPoints: Point[] = [];
      const flat = activeFreehandPointsRef.current;
      for (let i = 0; i < flat.length; i += 2) {
        rawPoints.push({ x: flat[i], y: flat[i + 1] });
      }
      if (rawPoints.length > 2) {
        const normPoints = toNormalizedPoints(rawPoints, pageSize);
        newAnnotation = createDrawingAnnotation({
          documentId: doc.id,
          revisionId: currentRevision?.id || "",
          pageNumber,
          annotationType: "FREEHAND",
          geometry: {
            type: "FREEHAND",
            points: normPoints,
          },
          style: {
            strokeColor: activeColor,
            strokeWidth: activeStrokeWidth,
          },
          companyId,
        });
      }
    } else if (tool === "callout") {
      const anchorNorm = toNormalizedPoint({ x: startX, y: startY }, pageSize);
      const boxNorm = toNormalizedRect({ x: currentX, y: currentY - 12, width: 80, height: 24 }, pageSize);
      setPendingTextPrompt({
        type: "callout",
        point: { x: boxNorm.x, y: boxNorm.y },
        anchorPoint: anchorNorm,
      });
      setTextInputVal("");
    }

    if (newAnnotation) {
      pushStateToHistory([...annotations, newAnnotation]);
      setSelectedAnnotationId(newAnnotation.id);
      setTool("select");
    }

    isDrawingRef.current = false;
    drawStartPosRef.current = null;
    activeFreehandPointsRef.current = [];

    drawLayer?.destroyChildren();
    drawLayer?.batchDraw();
  }, [
    activeColor,
    activeStrokeWidth,
    annotations,
    companyId,
    currentRevision?.id,
    doc.id,
    pageNumber,
    pageSize,
    pushStateToHistory,
    tool,
    zoom,
  ]);

  // Submit Text / Callout Modal
  const handleSaveTextPrompt = () => {
    if (!pendingTextPrompt || !textInputVal.trim()) {
      setPendingTextPrompt(null);
      return;
    }

    let newAnnotation: DrawingAnnotation;

    if (pendingTextPrompt.type === "text") {
      newAnnotation = createDrawingAnnotation({
        documentId: doc.id,
        revisionId: currentRevision?.id || "",
        pageNumber,
        annotationType: "TEXT",
        content: textInputVal.trim(),
        geometry: {
          type: "TEXT",
          points: [pendingTextPrompt.point],
        },
        style: {
          strokeColor: activeColor,
          strokeWidth: activeStrokeWidth,
          fontSize: 13,
        },
        companyId,
      });
    } else {
      newAnnotation = createDrawingAnnotation({
        documentId: doc.id,
        revisionId: currentRevision?.id || "",
        pageNumber,
        annotationType: "CALLOUT",
        content: textInputVal.trim(),
        geometry: {
          type: "CALLOUT",
          calloutAnchor: pendingTextPrompt.anchorPoint,
          calloutBox: {
            x: pendingTextPrompt.point.x,
            y: pendingTextPrompt.point.y,
            width: 0.12,
            height: 0.04,
          },
        },
        style: {
          strokeColor: activeColor,
          strokeWidth: activeStrokeWidth,
          fontSize: 12,
        },
        companyId,
      });
    }

    pushStateToHistory([...annotations, newAnnotation]);
    setSelectedAnnotationId(newAnnotation.id);
    setPendingTextPrompt(null);
    setTextInputVal("");
    setTool("select");
  };

  // Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(5.0, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))));
  const handleResetZoom = () => setZoom(1.0);

  const handleFitPage = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 48;
    const containerHeight = containerRef.current.clientHeight - 48;
    const scaleX = containerWidth / pageSize.width;
    const scaleY = containerHeight / pageSize.height;
    const fitScale = Math.min(scaleX, scaleY, 2.0);
    setZoom(Math.max(0.25, Number(fitScale.toFixed(2))));
  };

  const handleFitWidth = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 48;
    const scaleX = containerWidth / pageSize.width;
    setZoom(Math.max(0.25, Math.min(3.0, Number(scaleX.toFixed(2)))));
  };

  // Touch Pinch-to-zoom and Multi-touch Support
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchStartDistRef.current;
      if (Math.abs(ratio - 1) > 0.05) {
        setZoom((z) => Math.max(0.25, Math.min(5.0, Number((z * ratio).toFixed(2)))));
        touchStartDistRef.current = currentDist;
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  return (
    <div
      className={`flex flex-col bg-slate-950 text-slate-100 ${
        isMaximized ? "fixed inset-0 z-50 overflow-hidden" : "relative h-[850px] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
      }`}
    >
      {/* 1. Header Metadata & Revision Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black text-blue-400">{doc.documentNumber}</span>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                {doc.discipline}
              </span>
              <h2 className="text-sm font-black text-white truncate max-w-[280px] sm:max-w-md">{doc.title}</h2>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>{currentRevision?.fileName || "Drawing"}</span>
              <span>•</span>
              <span>{currentRevision?.scale || "Scale 1:100"}</span>
              <span>•</span>
              <span>{currentRevision?.sheetSize || "A1"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Revision Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 rounded-xl px-2.5 py-1 border border-slate-700">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedRevisionId}
              onChange={(e) => {
                setSelectedRevisionId(e.target.value);
                onRevisionChange?.(e.target.value);
              }}
              className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer pr-2"
            >
              {sortedRevisions.map((rev) => (
                <option key={rev.id} value={rev.id} className="bg-slate-900 text-slate-200">
                  Rev {rev.revisionNumber} {rev.revisionLabel ? `(${rev.revisionLabel})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Autosave Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-[11px]">Saved</span>
              </>
            )}
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                <span className="text-blue-400 text-[11px]">Saving...</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-400 text-[11px]">Unsaved</span>
              </>
            )}
            {saveStatus === "error" && (
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:underline"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Retry Save
              </button>
            )}
          </div>

          {/* Manual Save Button */}
          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
          )}

          {/* Fullscreen / Close Controls */}
          <button
            type="button"
            onClick={() => setIsMaximized((m) => !m)}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 p-2 text-slate-300 transition"
            title={isMaximized ? "Exit fullscreen" : "Maximize viewer"}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-800 hover:bg-rose-900/60 p-2 text-slate-300 hover:text-rose-200 transition"
              title="Close viewer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* 2. Main Redline Tools & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/60 px-4 py-2">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {[
            { id: "select", label: "Select / Move", icon: MousePointer },
            { id: "pan", label: "Pan Hand", icon: Hand },
            { id: "rect", label: "Rectangle", icon: Square },
            { id: "arrow", label: "Arrow Leader", icon: MoveRight },
            { id: "cloud", label: "Revision Cloud", icon: Cloud },
            { id: "freehand", label: "Freehand Pen", icon: Pencil },
            { id: "text", label: "Text Note", icon: Type },
            { id: "callout", label: "Callout", icon: MessageSquare },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              disabled={readOnly && id !== "select" && id !== "pan"}
              onClick={() => {
                setTool(id as BlueprintTool);
                setIsPanMode(id === "pan");
                if (id !== "select") setSelectedAnnotationId(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                tool === id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30"
              }`}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}

          {/* Delete Selected Tool */}
          <button
            type="button"
            disabled={!selectedAnnotationId || readOnly}
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-950/40 disabled:opacity-20 transition"
            title="Delete selected annotation (Del)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Delete</span>
          </button>
        </div>

        {/* Undo / Redo & Styling Palette */}
        <div className="flex items-center gap-3">
          {/* History Controls */}
          <div className="flex items-center gap-1 border-r border-slate-800 pr-2">
            <button
              type="button"
              disabled={undoStack.length === 0 || readOnly}
              onClick={handleUndo}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-25 transition"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={redoStack.length === 0 || readOnly}
              onClick={handleRedo}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-25 transition"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Color Palette */}
          <div className="flex items-center gap-1.5 border-r border-slate-800 pr-2">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={readOnly}
                onClick={() => setActiveColor(c.value)}
                className={`h-5 w-5 rounded-full transition ${c.bg} ${
                  activeColor === c.value
                    ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110"
                    : "opacity-70 hover:opacity-100"
                }`}
                title={c.label}
              />
            ))}
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-1">
            {STROKE_WIDTHS.map((sw) => (
              <button
                key={sw}
                type="button"
                disabled={readOnly}
                onClick={() => setActiveStrokeWidth(sw)}
                className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold transition ${
                  activeStrokeWidth === sw
                    ? "bg-blue-600/30 text-blue-400 border border-blue-500"
                    : "text-slate-400 hover:bg-slate-800"
                }`}
                title={`${sw}px stroke`}
              >
                {sw}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Central Canvas / Konva Drawing Viewport */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative flex-1 overflow-auto bg-slate-950 p-6 flex items-center justify-center ${
          isPanMode ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
      >
        <div
          className="relative shadow-2xl rounded-sm overflow-hidden bg-slate-900 transition-transform duration-75"
          style={{
            width: pageSize.width * zoom,
            height: pageSize.height * zoom,
          }}
        >
          {/* Base PDF Canvas */}
          <canvas
            ref={pdfCanvasRef}
            className="absolute inset-0 pointer-events-none select-none"
            style={{
              width: pageSize.width * zoom,
              height: pageSize.height * zoom,
            }}
          />

          {/* Konva Overlay Stage */}
          <div
            ref={konvaContainerRef}
            className="absolute inset-0 z-10"
            onMouseDown={(e) => {
              if (stageRef.current) {
                // @ts-ignore
                handleStageMouseDown(e);
              }
            }}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
          />
        </div>

        {/* Text Prompt Modal Input */}
        {pendingTextPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
              <h3 className="text-sm font-black text-white">
                {pendingTextPrompt.type === "callout" ? "Add Engineering Callout" : "Add Drawing Redline Note"}
              </h3>
              <textarea
                autoFocus
                rows={3}
                value={textInputVal}
                onChange={(e) => setTextInputVal(e.target.value)}
                placeholder="Enter annotation comment or engineering mark..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingTextPrompt(null)}
                  className="rounded-xl px-3 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTextPrompt}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Bottom Viewport Controls (Page Navigation & Zoom) */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/90 px-4 py-2 text-xs text-slate-400">
        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-25 transition"
            title="Previous Page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-300">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageNumber}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 1 && val <= totalPages) setPageNumber(val);
              }}
              className="w-12 rounded-md border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-center text-xs text-white focus:border-blue-500 focus:outline-none"
            />
            <span>of {totalPages}</span>
          </div>
          <button
            type="button"
            disabled={pageNumber >= totalPages}
            onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-25 transition"
            title="Next Page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom & Viewport Preset Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.25}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-25 transition"
            title="Zoom out (-25%)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <span className="w-14 text-center font-mono text-xs font-bold text-slate-200">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 5.0}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-25 transition"
            title="Zoom in (+25%)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleFitPage}
            className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700 transition"
            title="Fit Entire Page to Window"
          >
            Fit Page
          </button>

          <button
            type="button"
            onClick={handleFitWidth}
            className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700 transition"
            title="Fit Page Width to Window"
          >
            Fit Width
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 transition"
            title="Reset Zoom to 100%"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </div>
  );
};