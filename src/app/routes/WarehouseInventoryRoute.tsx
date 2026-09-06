import React from "react";
import { WarehouseInventoryPage } from "../../components/inventory/WarehouseInventoryPage.tsx";
import type { Project, ProjectMaterial, PurchaseOrder, PurchaseOrderReceipt } from "../../types.ts";
import type { InventoryBalance, InventoryItem, InventoryItemSaveInput, InventoryMovement, InventoryMovementInput } from "../../lib/inventory.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";

export interface WarehouseInventoryRouteProps {
  items: InventoryItem[];
  movements: InventoryMovement[];
  balances?: InventoryBalance[];
  projects: Project[];
  projectMaterials?: ProjectMaterial[];
  purchaseOrders?: PurchaseOrder[];
  receipts?: PurchaseOrderReceipt[];
  guestMode?: boolean;
  onOpenProject?: (project: Project) => void;
  onSaveItem?: (input: InventoryItemSaveInput) => Promise<InventoryItem>;
  onRecordMovement?: (input: InventoryMovementInput) => Promise<InventoryMovement>;
  onReverseMovement?: (movementId: string, reason: string, idempotencyKey: string) => Promise<InventoryMovement>;
}

export const WarehouseInventoryRoute: React.FC<WarehouseInventoryRouteProps> = ({
  items,
  movements,
  balances,
  projects,
  projectMaterials = [],
  purchaseOrders = [],
  receipts = [],
  guestMode = false,
  onOpenProject,
  onSaveItem,
  onRecordMovement,
  onReverseMovement,
}) => {
  const permissions = useAppPermissions();
  const canRead = guestMode || hasPermission(permissions, PERMISSION_KEYS.inventoryRead);
  const canManage = guestMode || hasPermission(permissions, PERMISSION_KEYS.inventoryManage);
  const canReadProjects = guestMode || hasPermission(permissions, PERMISSION_KEYS.projectsRead);
  const canReadProcurement = guestMode || hasPermission(permissions, PERMISSION_KEYS.procurementRead);

  return (
    <WarehouseInventoryPage
      items={items}
      movements={movements}
      balances={balances}
      projects={canReadProjects ? projects : []}
      projectMaterials={canReadProjects ? projectMaterials : []}
      purchaseOrders={canReadProcurement ? purchaseOrders : []}
      receipts={canReadProcurement ? receipts : []}
      canRead={canRead}
      canManage={canManage}
      canReadProjects={canReadProjects}
      canReadProcurement={canReadProcurement}
      onOpenProject={onOpenProject}
      onSaveItem={onSaveItem}
      onRecordMovement={onRecordMovement}
      onReverseMovement={onReverseMovement}
    />
  );
};

export default WarehouseInventoryRoute;
