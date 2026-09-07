import React from "react";
import { EquipmentPage } from "../../components/equipment/EquipmentPage.tsx";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { Equipment, EquipmentAssignment, EquipmentLifecycleStatus, Project, ProjectEquipment } from "../../types.ts";
import type { EquipmentSaveInput } from "../../lib/equipment.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";

export interface EquipmentRouteProps {
  equipment: Equipment[];
  assignments: EquipmentAssignment[];
  projects: Project[];
  legacyEquipment?: ProjectEquipment[];
  siteLogsData?: EngineeringDailySiteLogsWorkspaceData;
  guestMode?: boolean;
  onOpenProject?: (project: Project) => void;
  onSave?: (input: EquipmentSaveInput) => Promise<Equipment>;
  onAssign?: (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => Promise<void>;
  onTransfer?: (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => Promise<void>;
  onReturn?: (equipmentId: string, assignmentEnd: string, notes?: string) => Promise<void>;
  onSetLifecycle?: (equipmentId: string, status: EquipmentLifecycleStatus, reason: string) => Promise<void>;
}

export const EquipmentRoute: React.FC<EquipmentRouteProps> = (props) => {
  const permissions = useAppPermissions();
  const canRead = props.guestMode || hasPermission(permissions, PERMISSION_KEYS.equipmentRead);
  const canManage = props.guestMode || hasPermission(permissions, PERMISSION_KEYS.equipmentManage);
  return <EquipmentPage {...props} canRead={canRead} canManage={canManage} />;
};

export default EquipmentRoute;
