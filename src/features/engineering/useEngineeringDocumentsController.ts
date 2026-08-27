import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../../types.ts";
import {
  createEngineeringDocument,
  createEngineeringDocumentRevision,
  engineeringId,
  filterDocumentsByProject,
  sortRevisions,
  type DisciplineType,
  type DrawingAnnotation,
  type EngineeringDocument,
  type EngineeringDocumentRevision,
  type EngineeringDocumentsWorkspaceData,
  type EngineeringDocumentType,
} from "../../lib/engineeringDocuments.ts";
import {
  archiveEngineeringDocumentInSupabase,
  compensateUnprovenancedEngineeringDocumentUpload,
  createEngineeringDocumentWithRevisionInSupabase,
  createEngineeringRevisionInSupabase,
  getEngineeringDocumentStoragePath,
  loadEngineeringDocumentsWorkspaceFromSupabase,
  prepareEngineeringPdf,
  readEngineeringDocumentsWorkspaceFromLocal,
  saveDrawingAnnotationsBatchToSupabase,
  uploadEngineeringDocumentFile,
  writeEngineeringDocumentsWorkspaceToLocal,
} from "../../lib/engineeringDocumentsPersistence.ts";

export interface NewEngineeringDocumentInput {
  documentNumber: string;
  title: string;
  discipline: DisciplineType;
  documentType: EngineeringDocumentType;
  description?: string;
  initialRevision: string;
  revisionLabel?: string;
  scale?: string;
  sheetSize?: string;
  file?: File | null;
}

export interface NewEngineeringRevisionInput {
  document: EngineeringDocument;
  revisionNumber: string;
  revisionLabel?: string;
  changeSummary?: string;
  file?: File | null;
}

export interface EngineeringDocumentsController {
  documents: EngineeringDocument[];
  revisions: EngineeringDocumentRevision[];
  annotations: DrawingAnnotation[];
  projectDocuments: EngineeringDocument[];
  isLoading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  applyWorkspaceData: (data: EngineeringDocumentsWorkspaceData) => void;
  getDocRevisions: (documentId: string) => EngineeringDocumentRevision[];
  getDocAnnotations: (documentId: string, revisionId?: string) => DrawingAnnotation[];
  createDocument: (input: NewEngineeringDocumentInput) => Promise<{ document: EngineeringDocument; revision: EngineeringDocumentRevision }>;
  createRevision: (input: NewEngineeringRevisionInput) => Promise<{ document: EngineeringDocument; revision: EngineeringDocumentRevision }>;
  archiveDocument: (document: EngineeringDocument) => Promise<EngineeringDocument>;
  saveAnnotations: (documentId: string, revisionId: string, nextAnnotations: DrawingAnnotation[]) => Promise<DrawingAnnotation[]>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function useEngineeringDocumentsController({
  project,
  companyId,
  canRead,
  guestMode,
}: {
  project: Project;
  companyId?: string;
  canRead: boolean;
  guestMode: boolean;
}): EngineeringDocumentsController {
  const [documents, setDocuments] = useState<EngineeringDocument[]>([]);
  const [revisions, setRevisions] = useState<EngineeringDocumentRevision[]>([]);
  const [annotations, setAnnotations] = useState<DrawingAnnotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const guestObjectUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      setLoadError(null);
      if (!canRead) {
        if (isMounted) setIsLoading(false);
        return;
      }
      try {
        const data = guestMode
          ? readEngineeringDocumentsWorkspaceFromLocal()
          : await loadEngineeringDocumentsWorkspaceFromSupabase(companyId);
        if (isMounted) {
          setDocuments(data.documents);
          setRevisions(data.revisions);
          setAnnotations(data.annotations);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(errorMessage(error, "Engineering documents could not be loaded. Retry the workspace request."));
          setDocuments([]);
          setRevisions([]);
          setAnnotations([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [canRead, companyId, guestMode, loadAttempt, project.id]);

  useEffect(() => () => {
    for (const url of guestObjectUrlsRef.current) URL.revokeObjectURL(url);
    guestObjectUrlsRef.current.clear();
  }, []);

  const projectDocuments = useMemo(() => filterDocumentsByProject(documents, project.id), [documents, project.id]);

  const applyWorkspaceData = useCallback((data: EngineeringDocumentsWorkspaceData) => {
    setDocuments(data.documents);
    setRevisions(data.revisions);
    setAnnotations(data.annotations);
  }, []);

  const retryLoad = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);

  const getDocRevisions = useCallback((documentId: string) => (
    sortRevisions(revisions.filter((revision) => revision.documentId === documentId))
  ), [revisions]);

  const getDocAnnotations = useCallback((documentId: string, revisionId?: string) => (
    annotations.filter((annotation) => annotation.documentId === documentId && (!revisionId || annotation.revisionId === revisionId))
  ), [annotations]);

  const persistGuestDocumentWorkspace = useCallback((nextDocuments: EngineeringDocument[], nextRevisions: EngineeringDocumentRevision[]) => {
    const localData = readEngineeringDocumentsWorkspaceFromLocal();
    writeEngineeringDocumentsWorkspaceToLocal({ ...localData, documents: nextDocuments, revisions: nextRevisions });
  }, []);

  const createDocument = useCallback(async (input: NewEngineeringDocumentInput) => {
    const createdDocument = createEngineeringDocument({
      documentNumber: input.documentNumber,
      title: input.title,
      discipline: input.discipline,
      documentType: input.documentType,
      description: input.description,
      projectId: project.id,
      companyId,
    });
    const revisionId = engineeringId("rev");
    let fileName = `${input.documentNumber}_${input.initialRevision}.pdf`;
    let filePath = `sample/${createdDocument.id}/${revisionId}.pdf`;
    let fileSizeBytes = 0;
    let fileType = "application/pdf";
    let fileFingerprint = "sample:unverified";
    let preparedPdf: Awaited<ReturnType<typeof prepareEngineeringPdf>> | null = null;

    if (input.file) {
      preparedPdf = await prepareEngineeringPdf(input.file, { fileName: input.file.name, contentType: input.file.type });
      fileName = preparedPdf.fileName;
      fileSizeBytes = preparedPdf.fileSizeBytes;
      fileType = preparedPdf.contentType;
      fileFingerprint = preparedPdf.fileFingerprint;
      if (guestMode) {
        filePath = URL.createObjectURL(input.file);
        guestObjectUrlsRef.current.add(filePath);
      } else {
        filePath = getEngineeringDocumentStoragePath(companyId || "", createdDocument.id, revisionId, preparedPdf.fileName);
      }
    }

    const createdRevision = createEngineeringDocumentRevision({
      id: revisionId,
      documentId: createdDocument.id,
      revisionNumber: input.initialRevision,
      revisionLabel: input.revisionLabel,
      fileName,
      filePath,
      fileSizeBytes,
      fileType,
      fileFingerprint,
      sheetSize: input.sheetSize,
      scale: input.scale,
      status: "PENDING_REVIEW",
      companyId,
    });
    const localDocument = { ...createdDocument, currentRevisionId: createdRevision.id, currentRevisionNumber: createdRevision.revisionNumber };

    if (guestMode) {
      const nextDocuments = [localDocument, ...documents];
      const nextRevisions = [createdRevision, ...revisions];
      setDocuments(nextDocuments);
      setRevisions(nextRevisions);
      // Object URLs are session-scoped and must not be persisted as if they
      // were durable Storage sources. Metadata-only guest samples may persist.
      if (!preparedPdf) persistGuestDocumentWorkspace(nextDocuments, nextRevisions);
      return { document: localDocument, revision: createdRevision };
    }

    if (!preparedPdf) throw new Error("A validated PDF is required for an authenticated engineering document.");
    const uploaded = await uploadEngineeringDocumentFile(preparedPdf.bytes, {
      companyId: companyId || "",
      documentId: localDocument.id,
      revisionId: createdRevision.id,
      fileName: preparedPdf.fileName,
      contentType: preparedPdf.contentType,
    });
    try {
      const committed = await createEngineeringDocumentWithRevisionInSupabase(localDocument, { ...createdRevision, filePath: uploaded.path }, companyId);
      setDocuments((current) => [committed.document, ...current]);
      setRevisions((current) => [committed.revision, ...current]);
      return committed;
    } catch (error) {
      try {
        await compensateUnprovenancedEngineeringDocumentUpload(uploaded.path, localDocument.id, createdRevision.id, companyId);
      } catch (cleanupError) {
        throw new Error(`${errorMessage(error, "The engineering document metadata transaction failed.")} Storage cleanup also failed: ${errorMessage(cleanupError, "the uploaded object may require administrative cleanup")}`);
      }
      throw error;
    }
  }, [companyId, documents, guestMode, persistGuestDocumentWorkspace, project.id, revisions]);

  const createRevision = useCallback(async (input: NewEngineeringRevisionInput) => {
    const currentDocument = documents.find((document) => document.id === input.document.id);
    if (!currentDocument || currentDocument.status === "ARCHIVED") {
      throw new Error("Archived or unavailable engineering documents cannot receive new revisions.");
    }
    const revisionId = engineeringId("rev");
    let fileName = `${input.document.documentNumber}_${input.revisionNumber}.pdf`;
    let filePath = `sample/${input.document.id}/${revisionId}.pdf`;
    let fileSizeBytes = 0;
    let fileType = "application/pdf";
    let fileFingerprint = "sample:unverified";
    let preparedPdf: Awaited<ReturnType<typeof prepareEngineeringPdf>> | null = null;

    if (input.file) {
      preparedPdf = await prepareEngineeringPdf(input.file, { fileName: input.file.name, contentType: input.file.type });
      fileName = preparedPdf.fileName;
      fileSizeBytes = preparedPdf.fileSizeBytes;
      fileType = preparedPdf.contentType;
      fileFingerprint = preparedPdf.fileFingerprint;
      if (guestMode) {
        filePath = URL.createObjectURL(input.file);
        guestObjectUrlsRef.current.add(filePath);
      } else {
        filePath = getEngineeringDocumentStoragePath(companyId || "", input.document.id, revisionId, preparedPdf.fileName);
      }
    }

    const createdRevision = createEngineeringDocumentRevision({
      id: revisionId,
      documentId: input.document.id,
      revisionNumber: input.revisionNumber,
      revisionLabel: input.revisionLabel,
      changeSummary: input.changeSummary,
      fileName,
      filePath,
      fileSizeBytes,
      fileType,
      fileFingerprint,
      status: "PENDING_REVIEW",
      companyId,
    });
    const localDocument: EngineeringDocument = {
      ...input.document,
      currentRevisionId: createdRevision.id,
      currentRevisionNumber: createdRevision.revisionNumber,
      status: "UNDER_REVIEW",
      updatedAt: new Date().toISOString(),
    };

    if (guestMode) {
      const nextDocuments = documents.map((document) => document.id === input.document.id ? localDocument : document);
      const nextRevisions = [createdRevision, ...revisions];
      setDocuments(nextDocuments);
      setRevisions(nextRevisions);
      if (!preparedPdf) persistGuestDocumentWorkspace(nextDocuments, nextRevisions);
      return { document: localDocument, revision: createdRevision };
    }

    if (!preparedPdf) throw new Error("A validated PDF is required for an authenticated revision.");
    const uploaded = await uploadEngineeringDocumentFile(preparedPdf.bytes, {
      companyId: companyId || "",
      documentId: input.document.id,
      revisionId: createdRevision.id,
      fileName: preparedPdf.fileName,
      contentType: preparedPdf.contentType,
    });
    try {
      const committed = await createEngineeringRevisionInSupabase(input.document.id, { ...createdRevision, filePath: uploaded.path }, companyId);
      setRevisions((current) => [committed.revision, ...current]);
      setDocuments((current) => current.map((document) => document.id === input.document.id ? committed.document : document));
      return committed;
    } catch (error) {
      try {
        await compensateUnprovenancedEngineeringDocumentUpload(uploaded.path, input.document.id, createdRevision.id, companyId);
      } catch (cleanupError) {
        throw new Error(`${errorMessage(error, "The engineering revision metadata transaction failed.")} Storage cleanup also failed: ${errorMessage(cleanupError, "the uploaded object may require administrative cleanup")}`);
      }
      throw error;
    }
  }, [companyId, documents, guestMode, persistGuestDocumentWorkspace, revisions]);

  const archiveDocument = useCallback(async (document: EngineeringDocument) => {
    if (guestMode) {
      const archived = { ...document, status: "ARCHIVED" as const, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const nextDocuments = documents.map((item) => item.id === archived.id ? archived : item);
      setDocuments(nextDocuments);
      persistGuestDocumentWorkspace(nextDocuments, revisions);
      return archived;
    }
    const archived = await archiveEngineeringDocumentInSupabase(document.id, companyId);
    setDocuments((current) => current.map((item) => item.id === archived.id ? archived : item));
    return archived;
  }, [companyId, documents, guestMode, persistGuestDocumentWorkspace, revisions]);

  const saveAnnotations = useCallback(async (documentId: string, revisionId: string, nextAnnotations: DrawingAnnotation[]) => {
    const document = documents.find((item) => item.id === documentId);
    const revision = revisions.find((item) => item.id === revisionId && item.documentId === documentId);
    if (!document || !revision) {
      throw new Error("The engineering document or revision is no longer available. Reopen the document and retry.");
    }
    if (nextAnnotations.some((annotation) => annotation.documentId !== documentId || annotation.revisionId !== revisionId)) {
      throw new Error("The engineering annotation snapshot no longer matches the active revision. Reopen the document and retry.");
    }
    const persisted = guestMode
      ? nextAnnotations
      : await saveDrawingAnnotationsBatchToSupabase(nextAnnotations, companyId);
    setAnnotations((current) => [
      ...current.filter((annotation) => !(annotation.documentId === documentId && annotation.revisionId === revisionId)),
      ...persisted,
    ]);
    if (guestMode) {
      const localData = readEngineeringDocumentsWorkspaceFromLocal();
      writeEngineeringDocumentsWorkspaceToLocal({
        ...localData,
        annotations: [
          ...localData.annotations.filter((annotation) => !(annotation.documentId === documentId && annotation.revisionId === revisionId)),
          ...persisted,
        ],
      });
    }
    return persisted;
  }, [companyId, documents, guestMode, revisions]);

  return {
    documents,
    revisions,
    annotations,
    projectDocuments,
    isLoading,
    loadError,
    retryLoad,
    applyWorkspaceData,
    getDocRevisions,
    getDocAnnotations,
    createDocument,
    createRevision,
    archiveDocument,
    saveAnnotations,
  };
}
