import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../../types.ts";
import {
  aggregateForDailySiteLog,
  createDraftDailySiteLog,
  emptyDailySiteLogsWorkspaceData,
  eventForDailySiteLogTransition,
  replaceDailySiteLogAggregate,
  reportNumberForSiteDate,
  type EngineeringDailySiteLogAddendum,
  transitionDailySiteLog,
  validateDailySiteLogAggregate,
  type CreateDailySiteLogInput,
  type DailySiteLogStatus,
  type EngineeringDailySiteLogAggregate,
  type EngineeringDailySiteLogsWorkspaceData,
  scopeDailySiteLogsToProject,
} from "../../lib/dailySiteLogs.ts";
import { buildLocalSiteLogLifecyclePreview, type EngineeringLifecyclePreview } from "../../lib/engineeringLifecycle.ts";
import {
  applyDailySiteLogLifecycleInSupabase,
  createDailySiteLogAddendumRpc,
  createDailySiteLogRpc,
  finalizeDailySiteLogRpc,
  loadDailySiteLogsFromSupabase,
  previewDailySiteLogLifecycleInSupabase,
  readDailySiteLogsFromLocal,
  submitDailySiteLogRpc,
  updateDailySiteLogDraftRpc,
  writeDailySiteLogsToLocal,
} from "../../lib/dailySiteLogsPersistence.ts";

export interface DailySiteLogControllerOptions {
  project: Project;
  companyId?: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canSubmit: boolean;
  canManage: boolean;
  guestMode: boolean;
  controlledData?: EngineeringDailySiteLogsWorkspaceData;
  onControlledDataChange?: (data: EngineeringDailySiteLogsWorkspaceData) => void;
  /** Controlled snapshots can still use guarded remote RPCs in production. */
  controlledPersistence?: "local" | "remote";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function requirePermission(allowed: boolean, message: string) {
  if (!allowed) throw new Error(message);
}

function updateAggregateForDraft(current: EngineeringDailySiteLogAggregate, input: CreateDailySiteLogInput): EngineeringDailySiteLogAggregate {
  const candidate = createDraftDailySiteLog({ ...input, id: current.log.id, companyId: current.log.companyId, preparedByUserId: current.log.preparedByUserId });
  const automaticReportNumber = current.log.reportNumber === reportNumberForSiteDate(current.log.siteDate)
    ? reportNumberForSiteDate(candidate.log.siteDate)
    : current.log.reportNumber;
  candidate.log = {
    ...candidate.log,
    status: current.log.status,
    reportNumber: automaticReportNumber,
    createdAt: current.log.createdAt,
    preparedByUserId: current.log.preparedByUserId,
    submittedAt: current.log.submittedAt,
    submittedByUserId: current.log.submittedByUserId,
    finalizedAt: current.log.finalizedAt,
    finalizedByUserId: current.log.finalizedByUserId,
    voidedAt: current.log.voidedAt,
    voidedByUserId: current.log.voidedByUserId,
    voidReason: current.log.voidReason,
  };
  if (current.weather && candidate.weather) candidate.weather = { ...candidate.weather, id: current.weather.id, createdAt: current.weather.createdAt };
  candidate.crew = candidate.crew.map((row, index) => ({ ...row, id: input.crew?.[index]?.id || current.crew[index]?.id || row.id, createdAt: current.crew[index]?.createdAt || row.createdAt }));
  candidate.equipment = candidate.equipment.map((row, index) => ({ ...row, id: input.equipment?.[index]?.id || current.equipment[index]?.id || row.id, createdAt: current.equipment[index]?.createdAt || row.createdAt }));
  candidate.work = candidate.work.map((row, index) => ({ ...row, id: input.work?.[index]?.id || current.work[index]?.id || row.id, createdAt: current.work[index]?.createdAt || row.createdAt }));
  candidate.materialDeliveries = candidate.materialDeliveries.map((row, index) => ({ ...row, id: input.materialDeliveries?.[index]?.id || current.materialDeliveries[index]?.id || row.id, createdAt: current.materialDeliveries[index]?.createdAt || row.createdAt }));
  candidate.issues = candidate.issues.map((row, index) => ({ ...row, id: input.issues?.[index]?.id || current.issues[index]?.id || row.id, createdAt: current.issues[index]?.createdAt || row.createdAt }));
  candidate.safety = candidate.safety.map((row, index) => ({ ...row, id: input.safety?.[index]?.id || current.safety[index]?.id || row.id, createdAt: current.safety[index]?.createdAt || row.createdAt }));
  candidate.events = current.events;
  return candidate;
}

export function useDailySiteLogsController(options: DailySiteLogControllerOptions) {
  const { project, companyId, canRead, canCreate, canUpdate, canSubmit, canManage, guestMode, controlledData, onControlledDataChange, controlledPersistence = "local" } = options;
  const isControlled = controlledData !== undefined;
  const usesRemotePersistence = !guestMode && (!isControlled || controlledPersistence === "remote");
  const [data, setData] = useState<EngineeringDailySiteLogsWorkspaceData>(() => controlledData || (guestMode ? readDailySiteLogsFromLocal() : emptyDailySiteLogsWorkspaceData()));
  const [isLoading, setIsLoading] = useState(!isControlled);
  const [hasLoaded, setHasLoaded] = useState(isControlled);
  const scopeKey = `${companyId || ""}:${project.id}:${guestMode}:${canRead}:${isControlled}:${controlledPersistence}`;
  const loadedScopeRef = useRef<string | null>(isControlled ? scopeKey : null);
  const loadRequestRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const pendingCreateIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (controlledData !== undefined) {
      loadRequestRef.current += 1;
      setData(controlledData);
      loadedScopeRef.current = scopeKey;
      setHasLoaded(true);
      setLoadError(null);
      setIsLoading(false);
    }
  }, [controlledData, scopeKey]);

  const projectData = useMemo<EngineeringDailySiteLogsWorkspaceData>(() => {
    return scopeDailySiteLogsToProject(data, project.id);
  }, [data, project.id]);

  const publish = useCallback((next: EngineeringDailySiteLogsWorkspaceData) => {
    setData(next);
    if (isControlled) onControlledDataChange?.(next);
    else if (guestMode) writeDailySiteLogsToLocal(next);
  }, [guestMode, isControlled, onControlledDataChange]);

  const reload = useCallback(async (force = false) => {
    const requestId = ++loadRequestRef.current;
    if (isControlled && (!usesRemotePersistence || !force)) {
      loadedScopeRef.current = scopeKey;
      setHasLoaded(true);
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    if (!canRead) {
      setData(guestMode ? readDailySiteLogsFromLocal() : emptyDailySiteLogsWorkspaceData());
      loadedScopeRef.current = scopeKey;
      setHasLoaded(true);
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const loaded = guestMode ? readDailySiteLogsFromLocal() : await loadDailySiteLogsFromSupabase(companyId, project.id);
      if (loadRequestRef.current !== requestId) return;
      setData(loaded);
      onControlledDataChange?.(loaded);
      loadedScopeRef.current = scopeKey;
      setHasLoaded(true);
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;
      setLoadError(errorMessage(error, "Site Logs could not be loaded. Your local form state remains available for retry."));
    } finally {
      if (loadRequestRef.current === requestId) setIsLoading(false);
    }
  }, [canRead, companyId, guestMode, isControlled, onControlledDataChange, project.id, scopeKey, usesRemotePersistence]);

  useEffect(() => { void reload(); }, [reload, generation]);
  const retryLoad = useCallback(() => setGeneration((value) => value + 1), []);

  const aggregate = useCallback((siteLogId: string) => aggregateForDailySiteLog(projectData, siteLogId), [projectData]);

  const previewLifecycle = useCallback(async (siteLogId: string): Promise<EngineeringLifecyclePreview> => {
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (!usesRemotePersistence) {
      return buildLocalSiteLogLifecyclePreview({
        siteLogId,
        status: current.log.status,
        projectId: current.log.projectId,
        formalEvents: current.events.filter((event) => ["SUBMITTED", "FINALIZED", "VOIDED"].includes(event.eventType)).length,
        addenda: projectData.addenda.filter((item) => item.siteLogId === siteLogId).length,
        draftObservations: (current.weather ? 1 : 0) + current.crew.length + current.equipment.length + (current.work || []).length + (current.materialDeliveries || []).length + (current.issues || []).length + current.safety.length,
        narrativeFields: [current.log.workSummary, current.log.progressNotes, current.log.delaysConstraints, current.log.generalNotes].filter((value) => Boolean(value?.trim())).length,
        source: guestMode ? "demo" : "local",
      });
    }
    return previewDailySiteLogLifecycleInSupabase(siteLogId, companyId);
  }, [aggregate, companyId, guestMode, projectData, usesRemotePersistence]);

  const create = useCallback(async (input: Omit<CreateDailySiteLogInput, "projectId" | "companyId">) => {
    requirePermission(canCreate, "You do not have permission to create Site Logs in this company.");
    const identity = `${companyId || "guest"}:${project.id}:${input.siteDate}`;
    const draft = createDraftDailySiteLog({ ...input, id: input.id || pendingCreateIdsRef.current.get(identity), projectId: project.id, companyId });
    if (data.logs.some((item) => item.projectId === project.id && item.siteDate === draft.log.siteDate)) throw new Error("A Site Log already exists for this project and date.");
    pendingCreateIdsRef.current.set(identity, draft.log.id);
    if (usesRemotePersistence) {
      await createDailySiteLogRpc(draft, companyId);
      pendingCreateIdsRef.current.delete(identity);
      await reload(true);
    } else {
      publish(replaceDailySiteLogAggregate(data, draft));
      pendingCreateIdsRef.current.delete(identity);
    }
    return draft.log;
  }, [canCreate, companyId, data, project.id, publish, reload, usesRemotePersistence]);

  const updateDraft = useCallback(async (siteLogId: string, input: Omit<CreateDailySiteLogInput, "projectId" | "companyId" | "id">) => {
    requirePermission(canUpdate, "You do not have permission to update Site Log drafts in this company.");
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (current.log.status !== "DRAFT") throw new Error("Submitted or finalized Site Logs are read-only.");
    const draftUpdate = updateAggregateForDraft(current, { ...input, id: siteLogId, projectId: project.id, companyId });
    const next = { ...draftUpdate, events: [...current.events, eventForDailySiteLogTransition(current.log, draftUpdate.log)] };
    if (data.logs.some((item) => item.id !== siteLogId && item.projectId === project.id && item.siteDate === next.log.siteDate)) throw new Error("A Site Log already exists for this project and date.");
    if (usesRemotePersistence) {
      await updateDailySiteLogDraftRpc(next, companyId);
      await reload(true);
    } else {
      publish(replaceDailySiteLogAggregate(data, next));
    }
    return next.log;
  }, [aggregate, canUpdate, companyId, data, project.id, publish, reload, usesRemotePersistence]);

  const transition = useCallback(async (siteLogId: string, target: Exclude<DailySiteLogStatus, "DRAFT">, reason?: string) => {
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (target === "SUBMITTED") {
      requirePermission(canSubmit, "You do not have permission to submit Site Logs in this company.");
      validateDailySiteLogAggregate(current);
    } else {
      requirePermission(canManage, "You do not have permission to manage Site Log lifecycle state in this company.");
    }
    if (usesRemotePersistence) {
      if (target === "SUBMITTED") await submitDailySiteLogRpc(siteLogId, companyId);
      else if (target === "FINALIZED") await finalizeDailySiteLogRpc(siteLogId, companyId);
      else await applyDailySiteLogLifecycleInSupabase(siteLogId, "VOID", reason || "Voided by manager", companyId);
      await reload(true);
      return;
    }
    const nextLog = transitionDailySiteLog(current.log, target, { reason });
    const next = { ...current, log: nextLog, events: [...current.events, eventForDailySiteLogTransition(current.log, nextLog, { reason })] };
    publish(replaceDailySiteLogAggregate(data, next));
  }, [aggregate, canManage, canSubmit, companyId, data, publish, reload, usesRemotePersistence]);

  const applyLifecycle = useCallback(async (siteLogId: string, action: "DELETE_UNUSED" | "VOID", reason?: string) => {
    requirePermission(canManage, "You do not have permission to manage Site Log lifecycle state in this company.");
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (usesRemotePersistence) {
      await applyDailySiteLogLifecycleInSupabase(siteLogId, action, reason, companyId);
      await reload(true);
      return { deleted: action === "DELETE_UNUSED" };
    }
    const preview = await previewLifecycle(siteLogId);
    const allowed = action === "DELETE_UNUSED" ? preview.canDelete : preview.canVoid;
    if (!allowed) throw new Error(preview.blockedReason || "This Site Log lifecycle action is not available.");
    if (action === "DELETE_UNUSED") {
      const without = <T extends { siteLogId: string }>(rows: T[]) => rows.filter((row) => row.siteLogId !== siteLogId);
      publish({ ...data, logs: data.logs.filter((item) => item.id !== siteLogId), weather: without(data.weather), crew: without(data.crew), equipment: without(data.equipment), work: without(data.work || []), materialDeliveries: without(data.materialDeliveries || []), issues: without(data.issues || []), safety: without(data.safety), events: without(data.events), addenda: without(data.addenda || []) });
      return { deleted: true };
    }
    const nextLog = transitionDailySiteLog(current.log, "VOID", { reason });
    const next = { ...current, log: nextLog, events: [...current.events, eventForDailySiteLogTransition(current.log, nextLog, { reason })] };
    publish(replaceDailySiteLogAggregate(data, next));
    return { deleted: false };
  }, [aggregate, canManage, companyId, data, previewLifecycle, publish, reload, usesRemotePersistence]);

  const addAddendum = useCallback(async (siteLogId: string, reason: string, correctionText: string): Promise<EngineeringDailySiteLogAddendum> => {
    requirePermission(canManage, "You do not have permission to add Site Log corrections in this company.");
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (current.log.status !== "FINALIZED") throw new Error("Addenda are available only for FINALIZED Site Logs.");
    if (!reason.trim()) throw new Error("A reason is required for a Site Log addendum.");
    if (!correctionText.trim()) throw new Error("Correction or addendum text is required.");
    if (usesRemotePersistence) {
      const created = await createDailySiteLogAddendumRpc(siteLogId, reason, correctionText, companyId);
      await reload(true);
      return created;
    }
    const createdAt = new Date().toISOString();
    const addendum: EngineeringDailySiteLogAddendum = {
      id: `demo-site-log-addendum-${siteLogId}-${(data.addenda || []).filter((item) => item.siteLogId === siteLogId).length + 1}`,
      companyId: current.log.companyId,
      siteLogId,
      addendumNumber: (data.addenda || []).filter((item) => item.siteLogId === siteLogId).length + 1,
      reason: reason.trim(),
      correctionText: correctionText.trim(),
      createdByUserId: current.log.preparedByUserId,
      createdAt,
    };
    publish({ ...data, addenda: [...(data.addenda || []), addendum] });
    return addendum;
  }, [aggregate, canManage, companyId, data, publish, reload, usesRemotePersistence]);

  return {
    data: projectData,
    isLoading,
    hasLoaded: hasLoaded && loadedScopeRef.current === scopeKey,
    loadError,
    retryLoad,
    aggregate,
    previewLifecycle,
    applyLifecycle,
    addAddendum,
    create,
    updateDraft,
    submit: (siteLogId: string) => transition(siteLogId, "SUBMITTED"),
    finalize: (siteLogId: string) => transition(siteLogId, "FINALIZED"),
    voidLog: (siteLogId: string, reason: string) => transition(siteLogId, "VOID", reason),
  };
}
