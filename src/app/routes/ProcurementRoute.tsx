import React from "react";
import { ProcurementPage, type ProcurementPageProps } from "../../components/procurement/ProcurementPage.tsx";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";

export interface ProcurementRouteProps extends Omit<ProcurementPageProps, "canRead" | "canManage" | "canApprove"> {
  canRead?: boolean;
  canManage?: boolean;
  canApprove?: boolean;
}

export const ProcurementRoute: React.FC<ProcurementRouteProps> = (props) => {
  const permissions = useAppPermissions();
  const canRead = props.canRead ?? hasPermission(permissions, PERMISSION_KEYS.procurementRead);
  const canManage = props.canManage ?? hasPermission(permissions, PERMISSION_KEYS.procurementWrite);
  const canApprove = props.canApprove ?? hasPermission(permissions, PERMISSION_KEYS.procurementApprove);

  return (
    <ProcurementPage
      {...props}
      canRead={canRead}
      canManage={canManage}
      canApprove={canApprove}
    />
  );
};

export default ProcurementRoute;
