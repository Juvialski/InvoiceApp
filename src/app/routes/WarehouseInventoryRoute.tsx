import React, { useMemo } from "react";
import { WarehouseInventoryPage } from "../../components/inventory/WarehouseInventoryPage.tsx";
import type { Project, ProjectMaterial, PurchaseOrder, PurchaseOrderReceipt } from "../../types.ts";
import type { InventoryBalance, InventoryItem, InventoryItemSaveInput, InventoryMovement, InventoryMovementInput } from "../../lib/inventory.ts";
import { buildWarehouseReceiptPresentationSources } from "../../lib/inventoryReceiptPresentation.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface WarehouseInventoryRouteProps {
  items: InventoryItem[];
  movements: InventoryMovement[];
  balances?: InventoryBalance[];
  projects: Project[];
  projectMaterials?: ProjectMaterial[];
  purchaseOrders?: PurchaseOrder[];
  receipts?: PurchaseOrderReceipt[];
  initialMovementId?: string;
  initialReceiptId?: string;
  initialReturnPath?: string;
  onNavigatePath?: AppNavigate;
  workspaceLoading?: boolean;
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
  initialMovementId,
  initialReceiptId,
  initialReturnPath,
  onNavigatePath,
  workspaceLoading = false,
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
  const warehouseReceiptSources = useMemo(
    () => canReadProcurement
      ? buildWarehouseReceiptPresentationSources(purchaseOrders, receipts)
      : { purchaseOrders: [], receipts: [] },
    [canReadProcurement, purchaseOrders, receipts],
  );

  return (
    <WarehouseInventoryPage
      items={items}
      movements={movements}
      balances={balances}
      projects={canReadProjects ? projects : []}
      projectMaterials={canReadProjects ? projectMaterials : []}
      purchaseOrders={warehouseReceiptSources.purchaseOrders}
      receipts={warehouseReceiptSources.receipts}
      initialMovementId={initialMovementId}
      initialReceiptId={initialReceiptId}
      initialReturnPath={initialReturnPath}
      onNavigatePath={onNavigatePath}
      workspaceLoading={workspaceLoading}
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
