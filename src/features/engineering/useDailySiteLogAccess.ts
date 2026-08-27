import { useEffect, useMemo, useState } from "react";
import { getActiveCompanyId } from "../../lib/companyContext.ts";
import { supabase } from "../../lib/supabase.ts";

export interface DailySiteLogAccess {
  read: boolean;
  create: boolean;
  submit: boolean;
  review: boolean;
  manage: boolean;
  loading: boolean;
}

const DENIED: DailySiteLogAccess = { read: false, create: false, submit: false, review: false, manage: false, loading: false };
const ALLOWED: DailySiteLogAccess = { read: true, create: true, submit: true, review: true, manage: true, loading: false };

const PERMISSIONS = {
  read: "engineering.daily_logs.read",
  create: "engineering.daily_logs.create",
  submit: "engineering.daily_logs.submit",
  review: "engineering.daily_logs.review",
  manage: "engineering.daily_logs.manage",
} as const;

export function useDailySiteLogAccess(companyId?: string, guestMode = false): DailySiteLogAccess {
  const resolvedCompanyId = companyId?.trim() || getActiveCompanyId() || undefined;
  const [state, setState] = useState<DailySiteLogAccess>(() => guestMode ? ALLOWED : { ...DENIED, loading: true });
  const signature = useMemo(() => `${guestMode ? "guest" : "company"}:${resolvedCompanyId || "none"}`, [guestMode, resolvedCompanyId]);

  useEffect(() => {
    let cancelled = false;
    if (guestMode) { setState(ALLOWED); return () => { cancelled = true; }; }
    if (!supabase || !resolvedCompanyId) { setState(DENIED); return () => { cancelled = true; }; }
    setState({ ...DENIED, loading: true });
    void Promise.all(Object.entries(PERMISSIONS).map(async ([key, permission]) => {
      const { data, error } = await supabase!.rpc("has_company_permission", { p_company_id: resolvedCompanyId, p_permission_key: permission });
      if (error) throw error;
      return [key, data === true] as const;
    })).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries) as Record<keyof typeof PERMISSIONS, boolean>;
      setState({ ...next, loading: false });
    }).catch(() => { if (!cancelled) setState(DENIED); });
    return () => { cancelled = true; };
  }, [signature]);

  return state;
}
