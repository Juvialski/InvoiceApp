import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";

export interface EngineeringCoordinationAccess {
  loading: boolean;
  rfisRead: boolean;
  rfisCreate: boolean;
  rfisRespond: boolean;
  rfisManage: boolean;
  submittalsRead: boolean;
  submittalsCreate: boolean;
  submittalsReview: boolean;
  submittalsManage: boolean;
  siteLogsRead: boolean;
  siteLogsCreate: boolean;
  siteLogsUpdate: boolean;
  siteLogsSubmit: boolean;
  siteLogsManage: boolean;
}

const DENIED: EngineeringCoordinationAccess = {
  loading: false,
  rfisRead: false,
  rfisCreate: false,
  rfisRespond: false,
  rfisManage: false,
  submittalsRead: false,
  submittalsCreate: false,
  submittalsReview: false,
  submittalsManage: false,
  siteLogsRead: false,
  siteLogsCreate: false,
  siteLogsUpdate: false,
  siteLogsSubmit: false,
  siteLogsManage: false,
};

const ALLOWED: EngineeringCoordinationAccess = {
  loading: false,
  rfisRead: true,
  rfisCreate: true,
  rfisRespond: true,
  rfisManage: true,
  submittalsRead: true,
  submittalsCreate: true,
  submittalsReview: true,
  submittalsManage: true,
  siteLogsRead: true,
  siteLogsCreate: true,
  siteLogsUpdate: true,
  siteLogsSubmit: true,
  siteLogsManage: true,
};

export function useEngineeringCoordinationAccess(companyId?: string, guestMode = false): EngineeringCoordinationAccess {
  const [access, setAccess] = useState<EngineeringCoordinationAccess>(() => guestMode ? ALLOWED : { ...DENIED, loading: Boolean(companyId) });

  useEffect(() => {
    let cancelled = false;
    if (guestMode) { setAccess(ALLOWED); return () => { cancelled = true; }; }
    if (!companyId || !supabase) { setAccess(DENIED); return () => { cancelled = true; }; }
    setAccess({ ...DENIED, loading: true });
    const checks = [
      PERMISSION_KEYS.engineeringRfisRead,
      PERMISSION_KEYS.engineeringRfisCreate,
      PERMISSION_KEYS.engineeringRfisRespond,
      PERMISSION_KEYS.engineeringRfisManage,
      PERMISSION_KEYS.engineeringSubmittalsRead,
      PERMISSION_KEYS.engineeringSubmittalsCreate,
      PERMISSION_KEYS.engineeringSubmittalsReview,
      PERMISSION_KEYS.engineeringSubmittalsManage,
      PERMISSION_KEYS.engineeringSiteLogsRead,
      PERMISSION_KEYS.engineeringSiteLogsCreate,
      PERMISSION_KEYS.engineeringSiteLogsUpdate,
      PERMISSION_KEYS.engineeringSiteLogsSubmit,
      PERMISSION_KEYS.engineeringSiteLogsManage,
    ] as const;
    void Promise.all(checks.map(async (permission) => {
      const { data, error } = await supabase.rpc("has_company_permission", { p_company_id: companyId, p_permission_key: permission });
      return !error && data === true;
    })).then((values) => {
      if (cancelled) return;
      setAccess({
        loading: false,
        rfisRead: values[0], rfisCreate: values[1], rfisRespond: values[2], rfisManage: values[3],
        submittalsRead: values[4], submittalsCreate: values[5], submittalsReview: values[6], submittalsManage: values[7],
        siteLogsRead: values[8], siteLogsCreate: values[9], siteLogsUpdate: values[10], siteLogsSubmit: values[11], siteLogsManage: values[12],
      });
    }).catch(() => { if (!cancelled) setAccess(DENIED); });
    return () => { cancelled = true; };
  }, [companyId, guestMode]);

  return access;
}
