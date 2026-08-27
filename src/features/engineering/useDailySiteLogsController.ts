import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../../types.ts";
import {
  appendDailySiteLogAmendment,
  createDraftDailySiteLog,
  dailySiteLogId,
  emptyDailySiteLogsWorkspaceData,
  transitionDailySiteLog,
  updateDraftDailySiteLog,
  type DailySiteLog,
  type DailySiteLogDraftSections,
  type DailySiteLogsWorkspaceData,
  type DailySiteShift,
} from "../../lib/dailySiteLogs.ts";
import {
  amendDailySiteLogRpc,
  loadDailySiteLogsFromSupabase,
  readDailySiteLogsFromLocal,
  reviewDailySiteLogRpc,
  saveDailySiteLogDraftRpc,
  submitDailySiteLogRpc,
  voidDailySiteLogRpc,
  writeDailySiteLogsToLocal,
} from "../../lib/dailySiteLogsPersistence.ts";

export interface SaveDailySiteLogInput {
  id?: string;
  logDate: string;
  shiftCode?: DailySiteShift;
  shiftLabel?: string;
  sequenceNo?: number;
  sections: DailySiteLogDraftSections;
}

function message(error: unknown, fallback: string) { return error instanceof Error && error.message.trim() ? error.message : fallback; }
function persistenceUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function mergeNewLog(current: DailySiteLogsWorkspaceData, created: DailySiteLogsWorkspaceData): DailySiteLogsWorkspaceData {
  return {
    logs: [...created.logs, ...current.logs],
    weather: [...current.weather, ...created.weather],
    crews: [...current.crews, ...created.crews],
    equipment: [...current.equipment, ...created.equipment],
    events: [...current.events, ...created.events],
    amendments: current.amendments,
    attachments: current.attachments,
  };
}

export function useDailySiteLogsController({ project, companyId, canRead, guestMode }: { project: Project; companyId?: string; canRead: boolean; guestMode: boolean }) {
  const [data, setData] = useState<DailySiteLogsWorkspaceData>(() => readDailySiteLogsFromLocal());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const projectData = useMemo<DailySiteLogsWorkspaceData>(() => {
    const logs = data.logs.filter((item) => item.projectId === project.id);
    const ids = new Set(logs.map((item) => item.id));
    return {
      logs,
      weather: data.weather.filter((item) => ids.has(item.dailyLogId)),
      crews: data.crews.filter((item) => ids.has(item.dailyLogId)),
      equipment: data.equipment.filter((item) => ids.has(item.dailyLogId)),
      events: data.events.filter((item) => ids.has(item.dailyLogId)),
      amendments: data.amendments.filter((item) => ids.has(item.dailyLogId)),
      attachments: data.attachments.filter((item) => ids.has(item.dailyLogId)),
    };
  }, [data, project.id]);

  const persistLocal = useCallback((next: DailySiteLogsWorkspaceData) => { setData(next); writeDailySiteLogsToLocal(next); }, []);
  const reload = useCallback(async () => {
    if (!canRead) { setData(emptyDailySiteLogsWorkspaceData()); setIsLoading(false); return; }
    setIsLoading(true); setLoadError(null);
    try {
      const loaded = guestMode ? readDailySiteLogsFromLocal() : await loadDailySiteLogsFromSupabase(companyId, project.id);
      setData(loaded);
    } catch (error) {
      setLoadError(message(error, "Daily Site Logs could not be loaded."));
    } finally { setIsLoading(false); }
  }, [canRead, companyId, guestMode, project.id]);

  useEffect(() => { void reload(); }, [reload, generation]);
  const retryLoad = useCallback(() => setGeneration((value) => value + 1), []);

  const saveDraft = useCallback(async (input: SaveDailySiteLogInput) => {
    const existing = input.id ? data.logs.find((item) => item.id === input.id) : undefined;
    const id = existing?.id || input.id || (guestMode ? dailySiteLogId() : persistenceUuid());
    const shiftCode = input.shiftCode || existing?.shiftCode || "DAY";
    const sequenceNo = input.sequenceNo || existing?.sequenceNo || 1;
    if (!guestMode) {
      await saveDailySiteLogDraftRpc({ id, projectId: project.id, logDate: input.logDate, shiftCode, shiftLabel: input.shiftLabel, sequenceNo, sections: input.sections }, companyId);
      await reload();
      return id;
    }
    if (existing) {
      const next = updateDraftDailySiteLog(data, existing, input.sections, { logDate: input.logDate, shiftCode, shiftLabel: input.shiftLabel, sequenceNo });
      persistLocal(next);
      return id;
    }
    const created = createDraftDailySiteLog({ id, companyId, projectId: project.id, logDate: input.logDate, shiftCode, shiftLabel: input.shiftLabel, sequenceNo, sections: input.sections });
    persistLocal(mergeNewLog(data, created.data));
    return id;
  }, [companyId, data, guestMode, persistLocal, project.id, reload]);

  const submit = useCallback(async (log: DailySiteLog) => {
    if (!guestMode) { await submitDailySiteLogRpc(log.id, companyId); await reload(); return; }
    const updated = transitionDailySiteLog(log, "SUBMITTED");
    persistLocal({ ...data, logs: data.logs.map((item) => item.id === log.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const review = useCallback(async (log: DailySiteLog) => {
    if (!guestMode) { await reviewDailySiteLogRpc(log.id, companyId); await reload(); return; }
    const updated = transitionDailySiteLog(log, "REVIEWED");
    persistLocal({ ...data, logs: data.logs.map((item) => item.id === log.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const voidLog = useCallback(async (log: DailySiteLog, reason: string) => {
    if (!guestMode) { await voidDailySiteLogRpc(log.id, reason, companyId); await reload(); return; }
    const updated = transitionDailySiteLog(log, "VOID", { reason });
    persistLocal({ ...data, logs: data.logs.map((item) => item.id === log.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const amend = useCallback(async (log: DailySiteLog, amendmentText: string) => {
    const amendmentId = guestMode ? dailySiteLogId("amendment") : persistenceUuid();
    if (!guestMode) { await amendDailySiteLogRpc(log.id, amendmentId, amendmentText, companyId); await reload(); return; }
    persistLocal(appendDailySiteLogAmendment(data, log, amendmentText, { id: amendmentId, companyId }));
  }, [companyId, data, guestMode, persistLocal, reload]);

  return { data: projectData, isLoading, loadError, retryLoad, saveDraft, submit, review, voidLog, amend };
}
