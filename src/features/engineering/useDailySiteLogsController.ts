import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../../types.ts";
import {
  aggregateForDailySiteLog,
  createDraftDailySiteLog,
  emptyDailySiteLogsWorkspaceData,
  eventForDailySiteLogTransition,
  replaceDailySiteLogAggregate,
  reportNumberForSiteDate,
  transitionDailySiteLog,
  validateDailySiteLogAggregate,
  type CreateDailySiteLogInput,
  type DailySiteLogStatus,
  type EngineeringDailySiteLogAggregate,
  type EngineeringDailySiteLogsWorkspaceData,
} from "../../lib/dailySiteLogs.ts";
import {
  createDailySiteLogRpc,
  finalizeDailySiteLogRpc,
  loadDailySiteLogsFromSupabase,
  readDailySiteLogsFromLocal,
  submitDailySiteLogRpc,
  updateDailySiteLogDraftRpc,
  voidDailySiteLogRpc,
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
  candidate.safety = candidate.safety.map((row, index) => ({ ...row, id: input.safety?.[index]?.id || current.safety[index]?.id || row.id, createdAt: current.safety[index]?.createdAt || row.createdAt }));
  candidate.events = current.events;
  return candidate;
}

export function useDailySiteLogsController(options: DailySiteLogControllerOptions) {
  const { project, companyId, canRead, canCreate, canUpdate, canSubmit, canManage, guestMode, controlledData, onControlledDataChange } = options;
  const isControlled = controlledData !== undefined;
  const [data, setData] = useState<EngineeringDailySiteLogsWorkspaceData>(() => controlledData || (guestMode ? readDailySiteLogsFromLocal() : emptyDailySiteLogsWorkspaceData()));
  const [isLoading, setIsLoading] = useState(!isControlled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const pendingCreateIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (controlledData !== undefined) setData(controlledData);
  }, [controlledData]);

  const projectData = useMemo<EngineeringDailySiteLogsWorkspaceData>(() => {
    const logs = data.logs.filter((item) => item.projectId === project.id);
    const logIds = new Set(logs.map((item) => item.id));
    return {
      logs,
      weather: data.weather.filter((item) => logIds.has(item.siteLogId)),
      crew: data.crew.filter((item) => logIds.has(item.siteLogId)),
      equipment: data.equipment.filter((item) => logIds.has(item.siteLogId)),
      safety: data.safety.filter((item) => logIds.has(item.siteLogId)),
      events: data.events.filter((item) => logIds.has(item.siteLogId)),
    };
  }, [data, project.id]);

  const publish = useCallback((next: EngineeringDailySiteLogsWorkspaceData) => {
    setData(next);
    if (isControlled) onControlledDataChange?.(next);
    else if (guestMode) writeDailySiteLogsToLocal(next);
  }, [guestMode, isControlled, onControlledDataChange]);

  const reload = useCallback(async () => {
    if (isControlled) {
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    if (!canRead) {
      setData(guestMode ? readDailySiteLogsFromLocal() : emptyDailySiteLogsWorkspaceData());
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const loaded = guestMode ? readDailySiteLogsFromLocal() : await loadDailySiteLogsFromSupabase(companyId, project.id);
      setData(loaded);
    } catch (error) {
      setLoadError(errorMessage(error, "Site Logs could not be loaded. Your local form state remains available for retry."));
    } finally {
      setIsLoading(false);
    }
  }, [canRead, companyId, guestMode, isControlled, project.id]);

  useEffect(() => { void reload(); }, [reload, generation]);
  const retryLoad = useCallback(() => setGeneration((value) => value + 1), []);

  const aggregate = useCallback((siteLogId: string) => aggregateForDailySiteLog(data, siteLogId), [data]);

  const create = useCallback(async (input: Omit<CreateDailySiteLogInput, "projectId" | "companyId">) => {
    requirePermission(canCreate, "You do not have permission to create Site Logs in this company.");
    const identity = `${companyId || "guest"}:${project.id}:${input.siteDate}`;
    const draft = createDraftDailySiteLog({ ...input, id: input.id || pendingCreateIdsRef.current.get(identity), projectId: project.id, companyId });
    if (data.logs.some((item) => item.projectId === project.id && item.siteDate === draft.log.siteDate)) throw new Error("A Site Log already exists for this project and date.");
    pendingCreateIdsRef.current.set(identity, draft.log.id);
    if (!guestMode && !isControlled) {
      await createDailySiteLogRpc(draft, companyId);
      pendingCreateIdsRef.current.delete(identity);
      await reload();
    } else {
      publish(replaceDailySiteLogAggregate(data, draft));
      pendingCreateIdsRef.current.delete(identity);
    }
    return draft.log;
  }, [canCreate, companyId, data, guestMode, isControlled, project.id, publish, reload]);

  const updateDraft = useCallback(async (siteLogId: string, input: Omit<CreateDailySiteLogInput, "projectId" | "companyId" | "id">) => {
    requirePermission(canUpdate, "You do not have permission to update Site Log drafts in this company.");
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (current.log.status !== "DRAFT") throw new Error("Submitted or finalized Site Logs are read-only.");
    const draftUpdate = updateAggregateForDraft(current, { ...input, id: siteLogId, projectId: project.id, companyId });
    const next = { ...draftUpdate, events: [...current.events, eventForDailySiteLogTransition(current.log, draftUpdate.log)] };
    if (data.logs.some((item) => item.id !== siteLogId && item.projectId === project.id && item.siteDate === next.log.siteDate)) throw new Error("A Site Log already exists for this project and date.");
    if (!guestMode && !isControlled) {
      await updateDailySiteLogDraftRpc(next, companyId);
      await reload();
    } else {
      publish(replaceDailySiteLogAggregate(data, next));
    }
    return next.log;
  }, [aggregate, canUpdate, companyId, data, guestMode, isControlled, project.id, publish, reload]);

  const transition = useCallback(async (siteLogId: string, target: Exclude<DailySiteLogStatus, "DRAFT">, reason?: string) => {
    const current = aggregate(siteLogId);
    if (!current) throw new Error("The selected Site Log is no longer available.");
    if (target === "SUBMITTED") {
      requirePermission(canSubmit, "You do not have permission to submit Site Logs in this company.");
      validateDailySiteLogAggregate(current);
    } else {
      requirePermission(canManage, "You do not have permission to manage Site Log lifecycle state in this company.");
    }
    if (!guestMode && !isControlled) {
      if (target === "SUBMITTED") await submitDailySiteLogRpc(siteLogId, companyId);
      else if (target === "FINALIZED") await finalizeDailySiteLogRpc(siteLogId, companyId);
      else await voidDailySiteLogRpc(siteLogId, reason || "Voided by manager", companyId);
      await reload();
      return;
    }
    const nextLog = transitionDailySiteLog(current.log, target, { reason });
    const next = { ...current, log: nextLog, events: [...current.events, eventForDailySiteLogTransition(current.log, nextLog, { reason })] };
    publish(replaceDailySiteLogAggregate(data, next));
  }, [aggregate, canManage, canSubmit, companyId, data, guestMode, isControlled, publish, reload]);

  return {
    data: projectData,
    isLoading,
    loadError,
    retryLoad,
    aggregate,
    create,
    updateDraft,
    submit: (siteLogId: string) => transition(siteLogId, "SUBMITTED"),
    finalize: (siteLogId: string) => transition(siteLogId, "FINALIZED"),
    voidLog: (siteLogId: string, reason: string) => transition(siteLogId, "VOID", reason),
  };
}
