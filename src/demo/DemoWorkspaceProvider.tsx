import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DemoPreparedAssistantAction, DemoWorkspaceData } from "./demoTypes.ts";
import { DEMO_STORAGE_KEY } from "./demoTypes.ts";
import { createDemoWorkspace } from "./data/createDemoWorkspace.ts";
import { defaultDemoAnchorDate } from "./data/demoDates.ts";
import {
  executePreparedAssistantAction,
  isSafeStoredDemoWorkspace,
  prepareAddWorkerAction,
  reduceDemoWorkspace,
  resetDemoWorkspace,
  type DemoWorkspaceMutation,
} from "./demoState.ts";

interface DemoWorkspaceContextValue {
  data: DemoWorkspaceData;
  dispatch: (mutation: DemoWorkspaceMutation) => void;
  reset: () => void;
  preparedAction: DemoPreparedAssistantAction | null;
  prepareAddWorker: (input: { firstName: string; lastName: string; rate: number; jobTitle?: string }) => DemoPreparedAssistantAction;
  confirmPreparedAction: () => void;
  cancelPreparedAction: () => void;
  tourOpen: boolean;
  setTourOpen: (open: boolean) => void;
}

const DemoWorkspaceContext = createContext<DemoWorkspaceContextValue | null>(null);

function readInitialWorkspace(anchorDate: string): DemoWorkspaceData {
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isSafeStoredDemoWorkspace(parsed, anchorDate)) return parsed;
      }
    } catch {
      // A blocked or corrupt session store must never prevent the public demo.
    }
  }
  return createDemoWorkspace(anchorDate);
}

export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const anchorDate = useMemo(() => defaultDemoAnchorDate(), []);
  const [data, setData] = useState<DemoWorkspaceData>(() => readInitialWorkspace(anchorDate));
  const [preparedAction, setPreparedAction] = useState<DemoPreparedAssistantAction | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Session persistence is a convenience only. In-memory isolation remains.
    }
  }, [data]);

  const dispatch = useCallback((mutation: DemoWorkspaceMutation) => {
    setData((current) => reduceDemoWorkspace(current, mutation));
  }, []);

  const reset = useCallback(() => {
    setData(resetDemoWorkspace(anchorDate));
    setPreparedAction(null);
    setTourOpen(false);
    try { window.sessionStorage.removeItem(DEMO_STORAGE_KEY); } catch { /* optional session persistence */ }
  }, [anchorDate]);

  const prepareAddWorker = useCallback((input: { firstName: string; lastName: string; rate: number; jobTitle?: string }) => {
    const action = prepareAddWorkerAction(data, input);
    setPreparedAction(action);
    return action;
  }, [data]);

  const confirmPreparedAction = useCallback(() => {
    if (!preparedAction) return;
    setData((current) => executePreparedAssistantAction(current, preparedAction));
    setPreparedAction(null);
  }, [preparedAction]);

  const cancelPreparedAction = useCallback(() => setPreparedAction(null), []);

  const value = useMemo<DemoWorkspaceContextValue>(() => ({
    data,
    dispatch,
    reset,
    preparedAction,
    prepareAddWorker,
    confirmPreparedAction,
    cancelPreparedAction,
    tourOpen,
    setTourOpen,
  }), [cancelPreparedAction, confirmPreparedAction, data, dispatch, prepareAddWorker, preparedAction, reset, tourOpen]);

  return <DemoWorkspaceContext.Provider value={value}>{children}</DemoWorkspaceContext.Provider>;
}

export function useDemoWorkspace(): DemoWorkspaceContextValue {
  const value = useContext(DemoWorkspaceContext);
  if (!value) throw new Error("useDemoWorkspace must be used inside DemoWorkspaceProvider.");
  return value;
}
