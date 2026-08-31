import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  FileText,
  Layers,
  Search,
  Filter,
  Plus,
  History,
  Archive,
  Eye,
  Grid,
  List,
  Upload,
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  X,
  ChevronDown,
  Download,
  Tag,
  Check,
  Building2,
  HardHat,
  FileCode,
} from "lucide-react";
import type {
  DisciplineType,
  DocumentStatus,
  DrawingAnnotation,
  EngineeringDocument,
  EngineeringDocumentType,
} from "../../lib/engineeringDocuments.ts";
import {
  formatRevisionNumber,
  revisionNumbersEqual,
} from "../../lib/engineeringDocuments.ts";
import type { Project } from "../../types";
import { useEngineeringDocumentsController } from "../../features/engineering/useEngineeringDocumentsController.ts";
import type { EngineeringLifecycleAction, EngineeringLifecyclePreview } from "../../lib/engineeringLifecycle.ts";
import { EngineeringLifecycleDialog } from "./EngineeringLifecycleDialog.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

const BlueprintViewer = lazy(() => import("./BlueprintViewer").then((module) => ({ default: module.BlueprintViewer })));

export interface ProjectDocumentsProps {
  project: Project;
  companyId?: string;
  initialDocumentId?: string;
  initialRevisionId?: string;
  canRead?: boolean;
  canCreate?: boolean;
  canAnnotate?: boolean;
  canManage?: boolean;
  guestMode?: boolean;
  readOnly?: boolean;
}

const DISCIPLINES: Array<{ id: DisciplineType | "ALL"; label: string; color: string }> = [
  { id: "ALL", label: "All Disciplines", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "ARCHITECTURAL", label: "Architectural", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "STRUCTURAL", label: "Structural", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "CIVIL", label: "Civil", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "MECHANICAL", label: "Mechanical", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "ELECTRICAL", label: "Electrical", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { id: "PLUMBING", label: "Plumbing", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { id: "GENERAL_ENGINEERING", label: "General", color: "bg-slate-50 text-slate-700 border-slate-200" },
  { id: "OTHER", label: "Other", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

const DOCUMENT_TYPES: Array<{ id: EngineeringDocumentType | "ALL"; label: string }> = [
  { id: "ALL", label: "All Types" },
  { id: "DRAWING", label: "Drawings" },
  { id: "SPECIFICATION", label: "Specifications" },
  { id: "REPORT", label: "Reports" },
  { id: "CALCULATION", label: "Calculations" },
  { id: "SUBMITTAL", label: "Submittals" },
  { id: "OTHER", label: "Other" },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export const ProjectDocuments: React.FC<ProjectDocumentsProps> = ({
  project,
  companyId,
  initialDocumentId,
  initialRevisionId,
  canRead = true,
  canCreate = true,
  canAnnotate = true,
  canManage = true,
  guestMode = false,
  readOnly = false,
}) => {
  const effectiveCanCreate = canCreate && !readOnly;
  const effectiveCanAnnotate = canAnnotate && !readOnly;
  const effectiveCanManage = canManage && !readOnly;

  const engineeringDocuments = useEngineeringDocumentsController({ project, companyId, canRead, guestMode });
  const {
    projectDocuments,
    revisions,
    isLoading,
    hasLoaded,
    loadError,
    retryLoad,
    getDocRevisions,
    getDocAnnotations,
    createDocument,
    createRevision,
    saveAnnotations,
  } = engineeringDocuments;

  // Filters & Views
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDiscipline, setSelectedDiscipline] = useState<DisciplineType | "ALL">("ALL");
  const [selectedDocType, setSelectedDocType] = useState<EngineeringDocumentType | "ALL">("ALL");
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Active Blueprint Viewer Modal State
  const [activeViewerDoc, setActiveViewerDoc] = useState<EngineeringDocument | null>(null);
  const [activeViewerRevId, setActiveViewerRevId] = useState<string | undefined>(undefined);

  // Modals
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState<boolean>(false);
  const [isUploadRevModalOpen, setIsUploadRevModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [modalTargetDoc, setModalTargetDoc] = useState<EngineeringDocument | null>(null);

  // Form State: New Document
  const [newDocNumber, setNewDocNumber] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocDiscipline, setNewDocDiscipline] = useState<DisciplineType>("ARCHITECTURAL");
  const [newDocType, setNewDocType] = useState<EngineeringDocumentType>("DRAWING");
  const [newDocDescription, setNewDocDescription] = useState("");
  const [newDocInitialRev, setNewDocInitialRev] = useState("Rev 0");
  const [newDocRevLabel, setNewDocRevLabel] = useState("Initial Issue");
  const [newDocScale, setNewDocScale] = useState("");
  const [newDocSheetSize, setNewDocSheetSize] = useState("");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [isSubmittingNewDoc, setIsSubmittingNewDoc] = useState(false);
  const [newDocError, setNewDocError] = useState<string | null>(null);

  // Form State: New Revision
  const [revCode, setRevCode] = useState("");
  const [revLabel, setRevLabel] = useState("");
  const [revChangeSummary, setRevChangeSummary] = useState("");
  const [revFile, setRevFile] = useState<File | null>(null);
  const [isSubmittingRev, setIsSubmittingRev] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [lifecyclePreview, setLifecyclePreview] = useState<EngineeringLifecyclePreview | null>(null);
  const [lifecycleTargetDoc, setLifecycleTargetDoc] = useState<EngineeringDocument | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const newDocumentFirstFieldRef = useRef<HTMLInputElement>(null);
  const uploadRevisionFirstFieldRef = useRef<HTMLInputElement>(null);
  const historyCloseButtonRef = useRef<HTMLButtonElement>(null);
  const newDocumentDialogRef = useDialogFocus({ open: isNewDocModalOpen, onClose: () => { if (!isSubmittingNewDoc) setIsNewDocModalOpen(false); }, initialFocusRef: newDocumentFirstFieldRef });
  const uploadRevisionDialogRef = useDialogFocus({ open: isUploadRevModalOpen, onClose: () => { if (!isSubmittingRev) setIsUploadRevModalOpen(false); }, initialFocusRef: uploadRevisionFirstFieldRef });
  const historyDialogRef = useDialogFocus({ open: isHistoryModalOpen, onClose: () => setIsHistoryModalOpen(false), initialFocusRef: historyCloseButtonRef });

  useEffect(() => {
    setActiveViewerDoc(null);
    setActiveViewerRevId(undefined);
    setDeepLinkError(null);
    setModalTargetDoc(null);
    setIsHistoryModalOpen(false);
    setIsUploadRevModalOpen(false);
    setLifecyclePreview(null);
    setLifecycleTargetDoc(null);
  }, [companyId, guestMode, project.id]);

  useEffect(() => {
    if (isLoading || loadError) return;
    if (!initialDocumentId) {
      setActiveViewerDoc(null);
      setActiveViewerRevId(undefined);
      setDeepLinkError(null);
      return;
    }
    const found = projectDocuments.find((document) => document.id === initialDocumentId);
    if (!found) {
      setActiveViewerDoc(null);
      setActiveViewerRevId(undefined);
      setDeepLinkError("The requested engineering document is not assigned to this project.");
      return;
    }
    const requestedRevision = initialRevisionId && revisions.some((revision) => revision.id === initialRevisionId && revision.documentId === found.id)
      ? initialRevisionId
      : found.currentRevisionId;
    setActiveViewerDoc(found);
    setActiveViewerRevId(requestedRevision);
    setDeepLinkError(null);
  }, [initialDocumentId, initialRevisionId, isLoading, loadError, projectDocuments, revisions]);

  // Filtered Project Documents
  const projectDocs = useMemo(() => {
    let result = projectDocuments;
    if (!showArchived) {
      result = result.filter((d) => !["ARCHIVED", "SUPERSEDED"].includes(d.status));
    }
    if (selectedDiscipline !== "ALL") {
      result = result.filter((d) => d.discipline === selectedDiscipline);
    }
    if (selectedDocType !== "ALL") {
      result = result.filter((d) => d.documentType === selectedDocType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (d) =>
          d.documentNumber.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q) ||
          d.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [projectDocuments, searchQuery, selectedDiscipline, selectedDocType, showArchived]);
  const hasDocumentFilters = Boolean(searchQuery.trim()) || selectedDiscipline !== "ALL" || selectedDocType !== "ALL" || showArchived;
  const clearDocumentFilters = () => {
    setSearchQuery("");
    setSelectedDiscipline("ALL");
    setSelectedDocType("ALL");
    setShowArchived(false);
  };

  // Statistics KPI
  const stats = useMemo(() => {
    const all = projectDocuments;
    const drawings = all.filter((d) => d.documentType === "DRAWING");
    const specs = all.filter((d) => d.documentType === "SPECIFICATION" || d.documentType === "REPORT");
    const underReview = all.filter((d) => d.status === "UNDER_REVIEW");
    return {
      total: all.length,
      drawings: drawings.length,
      specs: specs.length,
      underReview: underReview.length,
    };
  }, [projectDocuments]);

  const handleViewerSaveAnnotations = useCallback(async (nextAnnotations: DrawingAnnotation[], savedRevisionId?: string) => {
    const revisionId = savedRevisionId || activeViewerRevId || activeViewerDoc?.currentRevisionId;
    if (!revisionId || !activeViewerDoc) throw new Error("The active engineering revision is no longer available. Reopen the document and retry.");
    await saveAnnotations(activeViewerDoc.id, revisionId, nextAnnotations);
  }, [activeViewerDoc, activeViewerRevId, saveAnnotations]);

  // Handle Create New Document
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewDocError(null);
    if (!newDocNumber.trim() || !newDocTitle.trim()) {
      setNewDocError("Document number and title are required.");
      return;
    }
    if (!guestMode && !newDocFile) {
      setNewDocError("Select the source PDF before creating an authenticated engineering document.");
      return;
    }

    setIsSubmittingNewDoc(true);
    try {
      await createDocument({
        documentNumber: newDocNumber,
        title: newDocTitle,
        discipline: newDocDiscipline,
        documentType: newDocType,
        description: newDocDescription,
        initialRevision: newDocInitialRev,
        revisionLabel: newDocRevLabel,
        scale: newDocScale,
        sheetSize: newDocSheetSize,
        file: newDocFile,
      });

      setIsNewDocModalOpen(false);
      setNewDocNumber("");
      setNewDocTitle("");
      setNewDocDescription("");
      setNewDocFile(null);
      setNewDocError(null);
    } catch (err) {
      setNewDocError(errorMessage(err, "The engineering document was not created. Your form values remain available for retry."));
    } finally {
      setIsSubmittingNewDoc(false);
    }
  };

  // Handle Upload New Revision
  const handleUploadRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevError(null);
    if (!modalTargetDoc || !revCode.trim()) {
      setRevError("A revision code is required.");
      return;
    }
    if (["ARCHIVED", "SUPERSEDED"].includes(modalTargetDoc.status)) {
      setRevError("Archived or superseded engineering documents cannot receive new revisions.");
      return;
    }
    if (!guestMode && !revFile) {
      setRevError("Select the source PDF before uploading an authenticated revision.");
      return;
    }
    if (revisions.some((revision) => revision.documentId === modalTargetDoc.id && revisionNumbersEqual(revision.revisionNumber, revCode))) {
      setRevError("That revision code already exists. Create a new revision instead of replacing the historical source.");
      return;
    }

    setIsSubmittingRev(true);
    try {
      await createRevision({
        document: modalTargetDoc,
        revisionNumber: revCode,
        revisionLabel: revLabel,
        changeSummary: revChangeSummary,
        file: revFile,
      });

      setIsUploadRevModalOpen(false);
      setRevCode("");
      setRevLabel("");
      setRevChangeSummary("");
      setRevFile(null);
      setModalTargetDoc(null);
      setRevError(null);
    } catch (err) {
      setRevError(errorMessage(err, "The engineering revision was not saved. Your form values remain available for retry."));
    } finally {
      setIsSubmittingRev(false);
    }
  };

  const openLifecycleReview = async (document: EngineeringDocument) => {
    if (!effectiveCanManage) return;
    setLifecycleTargetDoc(document);
    setLifecycleBusy(true);
    setArchiveError(null);
    try {
      setLifecyclePreview(await engineeringDocuments.previewLifecycle(document));
    } catch (err) {
      setArchiveError(errorMessage(err, "The document lifecycle preview could not be loaded."));
      setLifecycleTargetDoc(null);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const applyLifecycleAction = (action: EngineeringLifecycleAction, reason?: string) => {
    if (!lifecycleTargetDoc || (action !== "DELETE_UNUSED" && action !== "ARCHIVE" && action !== "SUPERSEDE")) return;
    setLifecycleBusy(true);
    setArchiveError(null);
    void engineeringDocuments.applyLifecycle(lifecycleTargetDoc, action, reason).then((result) => {
      setLifecyclePreview(null);
      setLifecycleTargetDoc(null);
      if (result.deleted && activeViewerDoc?.id === lifecycleTargetDoc.id) {
        setActiveViewerDoc(null);
        setActiveViewerRevId(undefined);
      }
    }).catch((err) => {
      setArchiveError(errorMessage(err, "The document lifecycle action could not be completed."));
    }).finally(() => setLifecycleBusy(false));
  };

  // Open Blueprint Viewer
  const handleOpenViewer = (doc: EngineeringDocument, revId?: string) => {
    if (doc.projectId !== project.id) return;
    setActiveViewerDoc(doc);
    setActiveViewerRevId(revId || doc.currentRevisionId);
  };

  // Discipline Color Pill
  const getDisciplineBadge = (discipline: DisciplineType) => {
    const found = DISCIPLINES.find((d) => d.id === discipline);
    return (
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold border ${
          found?.color || "bg-slate-100 text-slate-700 border-slate-200"
        }`}
      >
        {found?.label || discipline}
      </span>
    );
  };

  // Status Badge
  const getStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case "UNDER_REVIEW":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" /> Under Review
          </span>
        );
      case "ARCHIVED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-500 border border-slate-200">
            <Archive className="h-3 w-3" /> Archived
          </span>
        );
      case "SUPERSEDED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 border border-amber-200">
            <Layers className="h-3 w-3" /> Superseded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  if (!canRead) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        <p className="font-black">Engineering documents are not available for this account.</p>
        <p className="mt-1 text-xs leading-5">Your company role does not include engineering document read access.</p>
      </div>
    );
  }

  if (isLoading && !hasLoaded) {
    return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-600">Loading engineering documents…</div>;
  }

  if (loadError && !hasLoaded) {
    return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900"><p className="font-black">Engineering documents are unavailable</p><p className="mt-1 text-xs leading-5">{loadError}</p><button type="button" onClick={retryLoad} className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-rose-800 shadow-sm">Retry load</button></div>;
  }

  return (
    <div className="space-y-6">
      {(loadError || deepLinkError || archiveError) && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-black">{archiveError && !loadError && !deepLinkError ? "Engineering lifecycle action unavailable." : hasLoaded ? "Engineering documents could not be refreshed." : "Engineering documents could not be loaded."}</p>
            <p className="mt-1 break-words">{loadError || deepLinkError || archiveError}</p>
          </div>
          <button type="button" onClick={retryLoad} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-2 text-[10px] font-black text-rose-800 hover:bg-rose-100">Retry load</button>
        </div>
      )}
      {isLoading && hasLoaded && <p role="status" className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">Refreshing engineering documents… Existing records remain available.</p>}
      {/* 1. Header & KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Total Documents</span>
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{stats.total}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Engineering document set</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Drawings</span>
            <Compass className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{stats.drawings}</p>
          <p className="mt-0.5 text-[11px] text-purple-600 font-medium">CAD / BIM Blueprints</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Specifications & Reports</span>
            <Layers className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{stats.specs}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Tech specs & submittals</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Under Review</span>
            <Clock className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600">{stats.underReview}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Pending client/eng sign-off</p>
        </div>
      </div>

      {/* 2. Filter & Search Controls Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3" aria-labelledby="engineering-document-filters-title">
        <h2 id="engineering-document-filters-title" className="sr-only">Engineering document filters</h2>
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Bar */}
          <div className="relative w-full min-w-0 max-w-md lg:flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              aria-label="Search engineering documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drawings, specs, or document #..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition"
            />
          </div>

            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {/* Document Type Dropdown */}
            <select
              aria-label="Filter engineering documents by type"
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value as EngineeringDocumentType | "ALL")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.label}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={`min-h-10 min-w-10 rounded-lg p-1.5 transition ${
                  viewMode === "grid" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
                title="Grid view"
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-label="Table view"
                aria-pressed={viewMode === "table"}
                className={`min-h-10 min-w-10 rounded-lg p-1.5 transition ${
                  viewMode === "table" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* New Document Action Button */}
              {effectiveCanCreate && (
                <button
                  type="button"
                  onClick={() => setIsNewDocModalOpen(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                New Document
                </button>
              )}
              <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  aria-label="Show inactive engineering documents"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Show inactive
              </label>
            </div>
        </div>

        {/* Discipline Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5" role="group" aria-label="Filter engineering documents by discipline">
          {DISCIPLINES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDiscipline(d.id)}
              aria-pressed={selectedDiscipline === d.id}
              className={`rounded-xl px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
                selectedDiscipline === d.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {d.label}
            </button>
          ))}
          {hasDocumentFilters && <button type="button" onClick={clearDocumentFilters} className="ml-auto shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Clear filters</button>}
        </div>
        <p role="status" aria-live="polite" className="text-[10px] font-semibold text-slate-500">Showing {projectDocs.length} of {projectDocuments.length} document{projectDocuments.length === 1 ? "" : "s"}{hasDocumentFilters ? " for the current filters" : ""}.</p>
      </section>

      {/* 3. Document Items View (Grid or Table) */}
      {isLoading && !hasLoaded ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Clock className="mx-auto h-8 w-8 text-blue-500 animate-spin" />
          <p className="mt-3 text-sm font-bold text-slate-700">Loading engineering drawings & specifications...</p>
        </div>
      ) : projectDocs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Compass className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No documents found</h3>
          <p className="mt-1 text-xs text-slate-500">
            {searchQuery
              ? "No documents match your search query."
              : hasDocumentFilters
                ? "No documents match the current filters."
              : "Upload architectural drawings, structural layouts, and engineering specifications."}
          </p>
          {effectiveCanCreate && !searchQuery && (
            <button
              type="button"
              onClick={() => setIsNewDocModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 transition"
            >
              <Plus className="h-4 w-4" />
              Add First Drawing
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectDocs.map((doc) => {
            const docRevs = getDocRevisions(doc.id);
            const currentRev = docRevs.find((r) => r.id === doc.currentRevisionId);
            const docAnns = getDocAnnotations(doc.id, currentRev?.id).filter((annotation) => annotation.status !== "DELETED");

            return (
              <div
                key={doc.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs hover:shadow-md transition hover:border-blue-300"
              >
                {/* Card Top Preview / Discipline Banner */}
                <div className="relative h-28 bg-slate-900 p-4 text-white flex flex-col justify-between overflow-hidden">
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:12px_12px]" />
                  <div className="relative z-10 flex items-start justify-between">
                    <div>
                      <span className="font-mono text-sm font-black text-blue-400">{doc.documentNumber}</span>
                      <h4 className="mt-0.5 text-xs font-black text-white line-clamp-1">{doc.title}</h4>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>

                  <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-300">
                    <span className="rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-200 border border-slate-700">
                      {formatRevisionNumber(currentRev?.revisionNumber || doc.currentRevisionNumber)}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {currentRev?.scale || "Scale metadata not verified"} • {currentRev?.sheetSize || "Sheet size not verified"}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      {getDisciplineBadge(doc.discipline)}
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {doc.documentType}
                      </span>
                    </div>
                    {doc.description && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{doc.description}</p>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(doc.updatedAt || doc.createdAt).toLocaleDateString()}
                    </span>
                    {docAnns.length > 0 && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-600 border border-rose-200">
                        {docAnns.length} Redline{docAnns.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="flex items-center divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/70 p-1.5 text-xs font-bold text-slate-700">
                  <button
                    type="button"
                    onClick={() => handleOpenViewer(doc, currentRev?.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-blue-600 hover:text-blue-700 hover:bg-white rounded-lg transition"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Open Blueprint
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalTargetDoc(doc);
                      setIsHistoryModalOpen(true);
                    }}
                    className="px-3 py-1.5 hover:text-slate-900 hover:bg-white rounded-lg transition"
                    title="Revision History"
                    aria-label={`Open revision history for ${doc.documentNumber}`}
                  >
                    <History className="h-3.5 w-3.5 text-slate-500" />
                  </button>

                  {effectiveCanCreate && !["ARCHIVED", "SUPERSEDED"].includes(doc.status) && <button
                        type="button"
                        onClick={() => {
                          setModalTargetDoc(doc);
                          setIsUploadRevModalOpen(true);
                        }}
                        className="px-3 py-1.5 hover:text-slate-900 hover:bg-white rounded-lg transition"
                        title="Upload New Revision"
                        aria-label={`Upload a new revision for ${doc.documentNumber}`}
                      >
                        <Upload className="h-3.5 w-3.5 text-slate-500" />
                      </button>}

                  {effectiveCanManage && !["ARCHIVED", "SUPERSEDED"].includes(doc.status) && <button
                        type="button"
                        onClick={() => void openLifecycleReview(doc)}
                        className="px-3 py-1.5 hover:text-rose-600 hover:bg-white rounded-lg transition"
                        title="Review lifecycle"
                        aria-label={`Review lifecycle for ${doc.documentNumber}`}
                      >
                        <Archive className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" />
                      </button>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">Doc Number</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Discipline</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Current Rev</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {projectDocs.map((doc) => {
                const docRevs = getDocRevisions(doc.id);
                const currentRev = docRevs.find((r) => r.id === doc.currentRevisionId);

                return (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono font-black text-blue-600">{doc.documentNumber}</td>
                    <td className="max-w-[280px] px-4 py-3 font-bold text-slate-900"><span className="block truncate" title={doc.title}>{doc.title}</span></td>
                    <td className="px-4 py-3">{getDisciplineBadge(doc.discipline)}</td>
                    <td className="px-4 py-3 text-slate-500 uppercase text-[10px] font-bold">{doc.documentType}</td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {formatRevisionNumber(currentRev?.revisionNumber || doc.currentRevisionNumber)}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(doc.status)}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(doc.updatedAt || doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleOpenViewer(doc, currentRev?.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 font-bold text-blue-600 hover:bg-blue-100 transition"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalTargetDoc(doc);
                          setIsHistoryModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition"
                        title="Revision History"
                        aria-label={`Open revision history for ${doc.documentNumber}`}
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {effectiveCanCreate && !["ARCHIVED", "SUPERSEDED"].includes(doc.status) && <button
                            type="button"
                            onClick={() => {
                              setModalTargetDoc(doc);
                              setIsUploadRevModalOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition"
                            title="Upload New Revision"
                            aria-label={`Upload a new revision for ${doc.documentNumber}`}
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </button>}
                      {effectiveCanManage && !["ARCHIVED", "SUPERSEDED"].includes(doc.status) && <button
                            type="button"
                            onClick={() => void openLifecycleReview(doc)}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Review lifecycle"
                            aria-label={`Review lifecycle for ${doc.documentNumber}`}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Modal: New Engineering Document */}
      {isNewDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-xs sm:items-center sm:p-4" role="presentation">
          <div ref={newDocumentDialogRef} role="dialog" aria-modal="true" aria-labelledby="new-engineering-document-dialog-title" aria-describedby="new-engineering-document-dialog-description" aria-busy={isSubmittingNewDoc} className="max-h-[min(92vh,54rem)] min-h-0 w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-blue-600" />
                <div><h3 id="new-engineering-document-dialog-title" className="break-words text-base font-black text-slate-900">New Engineering Document</h3><p id="new-engineering-document-dialog-description" className="mt-1 text-[10px] leading-4 text-slate-500">Create a document shell and its first immutable source revision.</p></div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewDocModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close new engineering document dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700">Document Number *</label>
                  <input
                    type="text"
                    ref={newDocumentFirstFieldRef}
                    required
                    value={newDocNumber}
                    onChange={(e) => setNewDocNumber(e.target.value)}
                    placeholder="e.g. S-101 or A-201"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700">Discipline *</label>
                  <select
                    value={newDocDiscipline}
                    onChange={(e) => setNewDocDiscipline(e.target.value as DisciplineType)}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {DISCIPLINES.filter((d) => d.id !== "ALL").map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">Document Title *</label>
                <input
                  type="text"
                  required
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="e.g. Ground Floor Foundation & Column Layout"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700">Document Type</label>
                  <select
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value as EngineeringDocumentType)}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {DOCUMENT_TYPES.filter((dt) => dt.id !== "ALL").map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700">Initial Revision Code</label>
                  <input
                    type="text"
                    value={newDocInitialRev}
                    onChange={(e) => setNewDocInitialRev(e.target.value)}
                    placeholder="Rev 0 or Rev A"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700">Drawing Scale</label>
                  <input
                    type="text"
                    value={newDocScale}
                    onChange={(e) => setNewDocScale(e.target.value)}
                    placeholder="Optional source metadata; not calibrated"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700">Sheet Size</label>
                  <input
                    type="text"
                    value={newDocSheetSize}
                    onChange={(e) => setNewDocSheetSize(e.target.value)}
                    placeholder="Optional source sheet size"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">Description / Scope Notes</label>
                <textarea
                  rows={2}
                  value={newDocDescription}
                  onChange={(e) => setNewDocDescription(e.target.value)}
                  placeholder="Optional engineering notes or drawing scope..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">PDF Drawing File {guestMode ? "(Optional guest sample)" : "*"}</label>
                <div className="mt-1 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-4 text-center hover:border-blue-400 transition">
                  <input
                    type="file"
                    required={!guestMode}
                    accept=".pdf,application/pdf"
                    onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-blue-700"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {guestMode ? "Guest mode may use an explicitly labeled sample drawing when no source is selected." : "The original PDF is uploaded to private Storage before the revision metadata is committed."}
                </p>
              </div>

              {newDocError && <div role="alert" aria-live="assertive" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">{newDocError}</div>}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsNewDocModalOpen(false)}
                  className="w-full rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewDoc}
                  className="w-full rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 sm:w-auto"
                >
                  {isSubmittingNewDoc ? "Creating..." : "Create Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Upload New Revision */}
      {isUploadRevModalOpen && modalTargetDoc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-xs sm:items-center sm:p-4" role="presentation">
          <div ref={uploadRevisionDialogRef} role="dialog" aria-modal="true" aria-labelledby="upload-engineering-revision-dialog-title" aria-describedby="upload-engineering-revision-dialog-description" aria-busy={isSubmittingRev} className="max-h-[min(92vh,54rem)] min-h-0 w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="upload-engineering-revision-dialog-title" className="text-base font-black text-slate-900">Upload New Revision</h3>
                <p id="upload-engineering-revision-dialog-description" className="break-words text-xs font-mono text-blue-600">{modalTargetDoc.documentNumber} • {modalTargetDoc.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadRevModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close upload revision dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUploadRevision} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">New Revision Code *</label>
                <input
                  type="text"
                  ref={uploadRevisionFirstFieldRef}
                  required
                  value={revCode}
                  onChange={(e) => setRevCode(e.target.value)}
                  placeholder="e.g. Rev 2 or Rev B"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">Revision Label / Purpose</label>
                <input
                  type="text"
                  value={revLabel}
                  onChange={(e) => setRevLabel(e.target.value)}
                  placeholder="e.g. Issued for Construction (IFC) or Client Set"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">Change Summary</label>
                <textarea
                  rows={2}
                  value={revChangeSummary}
                  onChange={(e) => setRevChangeSummary(e.target.value)}
                  placeholder="Summary of engineering modifications in this revision..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700">Revision PDF {guestMode ? "(Optional guest sample)" : "*"}</label>
                <div className="mt-1 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-4 text-center">
                  <input
                    type="file"
                    required={!guestMode}
                    accept=".pdf,application/pdf"
                    onChange={(e) => setRevFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-blue-700"
                  />
                </div>
              </div>

              {revError && <div role="alert" aria-live="assertive" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">{revError}</div>}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsUploadRevModalOpen(false)}
                  className="w-full rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRev}
                  className="w-full rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 sm:w-auto"
                >
                  {isSubmittingRev ? "Uploading..." : "Save Revision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Revision History */}
      {isHistoryModalOpen && modalTargetDoc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-xs sm:items-center sm:p-4" role="presentation">
          <div ref={historyDialogRef} role="dialog" aria-modal="true" aria-labelledby="engineering-revision-history-dialog-title" aria-describedby="engineering-revision-history-dialog-description" className="max-h-[min(92vh,54rem)] min-h-0 w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="engineering-revision-history-dialog-title" className="text-base font-black text-slate-900">Revision History</h3>
                <p id="engineering-revision-history-dialog-description" className="break-words text-xs font-mono text-blue-600">
                  {modalTargetDoc.documentNumber} • {modalTargetDoc.title}
                </p>
              </div>
              <button
                type="button"
                ref={historyCloseButtonRef}
                onClick={() => setIsHistoryModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close revision history dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {getDocRevisions(modalTargetDoc.id).map((rev) => (
                <div
                  key={rev.id}
                  className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition hover:bg-slate-100 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-black text-blue-700">
                        {formatRevisionNumber(rev.revisionNumber)}
                      </span>
                      {rev.revisionLabel && (
                        <span className="break-words text-xs font-bold text-slate-800">{rev.revisionLabel}</span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {new Date(rev.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {rev.changeSummary && (
                      <p className="break-words text-xs text-slate-600">{rev.changeSummary}</p>
                    )}

                    <p className="break-words text-[10px] text-slate-400">
                      {rev.fileName} • {formatBytes(rev.fileSizeBytes)} • {rev.scale || "Scale metadata not verified"} ({rev.sheetSize || "Sheet size not verified"})
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsHistoryModalOpen(false);
                      handleOpenViewer(modalTargetDoc, rev.id);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 self-start rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-500 sm:self-auto"
                  >
                    <Eye className="h-3 w-3" />
                    Open Rev
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Fullscreen Blueprint Viewer Overlay */}
      {activeViewerDoc && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 p-3 sm:p-6 backdrop-blur-md">
          <div className="relative flex-1 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            <Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-950 text-xs font-bold text-slate-300">Loading the PDF viewer…</div>}>
              <BlueprintViewer
                document={activeViewerDoc}
                revisions={getDocRevisions(activeViewerDoc.id)}
                currentRevisionId={activeViewerRevId}
                initialAnnotations={getDocAnnotations(activeViewerDoc.id, activeViewerRevId)}
                companyId={companyId}
                canAnnotate={effectiveCanAnnotate}
                guestMode={guestMode}
                onClose={() => setActiveViewerDoc(null)}
                onRevisionChange={(newRevId) => setActiveViewerRevId(newRevId)}
                allAnnotations={getDocAnnotations(activeViewerDoc.id)}
                onSaveAnnotations={handleViewerSaveAnnotations}
              />
            </Suspense>
          </div>
        </div>
      )}
      {lifecyclePreview && lifecycleTargetDoc && <EngineeringLifecycleDialog entityLabel="engineering document" recordLabel={`${lifecycleTargetDoc.documentNumber} · ${lifecycleTargetDoc.title}`} preview={lifecyclePreview} actions={[{ action: "DELETE_UNUSED", label: "Delete unused", description: "Permanently remove only an untouched DRAFT document shell with no revisions, annotations, links, Storage objects, or meaningful history.", tone: "danger" }, { action: "ARCHIVE", label: "Archive", description: "Remove this document from normal active choices while preserving every revision, annotation, link, and source file.", requiresReason: true, tone: "warning" }, { action: "SUPERSEDE", label: "Supersede", description: "Mark this document as replaced historical material without deleting its immutable revision lineage.", requiresReason: true, tone: "primary" }]} busy={lifecycleBusy} error={archiveError} onClose={() => { setLifecyclePreview(null); setLifecycleTargetDoc(null); }} onApply={applyLifecycleAction} />}
    </div>
  );
};
