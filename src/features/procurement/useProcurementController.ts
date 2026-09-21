import { useCallback, useState } from "react";
import type { InvoiceData } from "../../types.ts";
import type {
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
  PurchaseOrderStatus,
  RFQ,
  RFQLine,
  RFQStatus,
  Subcontract,
  SubcontractLine,
  SubcontractProgressClaim,
  SubcontractProgressClaimLine,
  SubcontractProgressClaimStatus,
  SubcontractStatus,
  SubcontractVariation,
  SubcontractVariationLine,
  SubcontractVariationStatus,
  SupplierQuotation,
  SupplierQuotationLine,
  Vendor,
} from "../../types.ts";
import { PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
import {
  confirmPurchaseOrderMatch,
  convertQuotationToDraftPO,
  deleteDraftPurchaseOrder,
  deleteDraftRFQ,
  deleteDraftSubcontract,
  deactivateVendor,
  reactivateVendor,
  readPurchaseOrderMatchesFromLocal,
  readPurchaseOrderReceiptsFromLocal,
  readPurchaseOrdersFromLocal,
  readRFQsFromLocal,
  readSubcontractsFromLocal,
  readSupplierQuotationsFromLocal,
  readVendorsFromLocal,
  recordPurchaseOrderReceipt,
  revertSupplierQuotationSelection,
  savePurchaseOrder,
  saveRFQ,
  saveSubcontract,
  saveSupplierQuotation,
  saveVendor,
  selectSupplierQuotation,
  transitionPurchaseOrderStatus,
  transitionRFQStatus,
  transitionSubcontract,
  unmatchPurchaseOrderMatch,
  voidPurchaseOrderReceipt,
  writePurchaseOrderMatchesToLocal,
  writePurchaseOrderReceiptsToLocal,
  writePurchaseOrdersToLocal,
  writeRFQsToLocal,
  writeSubcontractsToLocal,
  writeSupplierQuotationsToLocal,
  writeVendorsToLocal,
} from "../../lib/persistence.ts";
import {
  deleteDraftSubcontractClaim,
  readSubcontractClaimsFromLocal,
  saveSubcontractClaim,
  transitionSubcontractClaim,
  writeSubcontractClaimsToLocal,
} from "../../lib/subcontractClaims.ts";
import {
  deleteDraftSubcontractVariation,
  readSubcontractVariationsFromLocal,
  saveSubcontractVariation,
  transitionSubcontractVariation,
  writeSubcontractVariationsToLocal,
} from "../../lib/subcontractVariations.ts";
import { ensurePurchaseOrderDocumentSnapshot } from "../../lib/documentSnapshots.ts";

export interface ProcurementWorkspaceData {
  purchaseOrders: PurchaseOrder[];
  subcontracts: Subcontract[];
  subcontractClaims: SubcontractProgressClaim[];
  subcontractVariations: SubcontractVariation[];
  receipts: PurchaseOrderReceipt[];
  purchaseOrderMatches: PurchaseOrderInvoiceMatch[];
  rfqs: RFQ[];
  supplierQuotations: SupplierQuotation[];
  vendors: Vendor[];
}

export interface ProcurementControllerOptions {
  authenticated: boolean;
  remoteWorkspaceConfigured: boolean;
  can: (permission: PermissionKey) => boolean;
  selectedInvoice: InvoiceData | null;
  onSuccess: (message: string) => void;
  onError: (error: unknown, fallback: string) => void;
}

export interface ProcurementController extends ProcurementWorkspaceData {
  applyWorkspaceData: (data: ProcurementWorkspaceData) => void;
  reset: () => void;
  savePurchaseOrder: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
    expectedUpdatedAt?: string,
  ) => Promise<void>;
  transitionPurchaseOrder: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  deletePurchaseOrder: (id: string) => Promise<void>;
  saveSubcontract: (
    subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  transitionSubcontract: (id: string, targetStatus: SubcontractStatus, reason?: string) => Promise<void>;
  deleteSubcontract: (id: string) => Promise<void>;
  saveSubcontractClaim: (
    claim: Partial<SubcontractProgressClaim> & { subcontractId: string; projectId: string; claimNumber: string; valuationDate: string },
    lines: Array<Partial<SubcontractProgressClaimLine> & { subcontractLineId?: string; subcontractVariationLineId?: string; claimedAmount: number; notes?: string }>,
  ) => Promise<void>;
  transitionSubcontractClaim: (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => Promise<void>;
  deleteSubcontractClaim: (id: string) => Promise<void>;
  saveSubcontractVariation: (
    variation: Partial<SubcontractVariation> & { subcontractId: string; projectId: string; variationNumber: string; title: string; currency?: string },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  transitionSubcontractVariation: (id: string, targetStatus: SubcontractVariationStatus, reason?: string) => Promise<void>;
  deleteSubcontractVariation: (id: string) => Promise<void>;
  addVendor: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  deactivateVendor: (vendorId: string, reason: string) => Promise<void>;
  reactivateVendor: (vendorId: string) => Promise<void>;
  recordReceipt: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; inventoryItemId?: string | null; notes?: string }>,
  ) => Promise<PurchaseOrderReceipt | void>;
  voidReceipt: (receiptId: string, reason: string) => Promise<void>;
  confirmPurchaseOrderMatch: (
    poId: string,
    lines: Array<{ invoiceLineId: string; purchaseOrderLineId: string; matchedQuantity?: number; matchedAmount?: number }>,
    notes?: string,
  ) => Promise<void>;
  unmatchPurchaseOrderMatch: (matchId: string, reason: string) => Promise<void>;
  saveRFQ: (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
    expectedUpdatedAt?: string,
  ) => Promise<void>;
  transitionRFQ: (id: string, targetStatus: RFQStatus, reason?: string) => Promise<void>;
  deleteRFQ: (id: string) => Promise<void>;
  saveSupplierQuotation: (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  selectSupplierQuotation: (quotationId: string, reason: string) => Promise<void>;
  revertSupplierQuotationSelection: (rfqId: string, reason: string) => Promise<void>;
  convertQuotationToPO: (quotationId: string, poNumber: string, notes?: string) => Promise<void>;
}

export function useProcurementController({
  authenticated,
  remoteWorkspaceConfigured,
  can,
  selectedInvoice,
  onSuccess,
  onError,
}: ProcurementControllerOptions): ProcurementController {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => remoteWorkspaceConfigured ? [] : readPurchaseOrdersFromLocal());
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>(() => remoteWorkspaceConfigured ? [] : readSubcontractsFromLocal());
  const [subcontractClaims, setSubcontractClaims] = useState<SubcontractProgressClaim[]>(() => remoteWorkspaceConfigured ? [] : readSubcontractClaimsFromLocal());
  const [subcontractVariations, setSubcontractVariations] = useState<SubcontractVariation[]>(() => remoteWorkspaceConfigured ? [] : readSubcontractVariationsFromLocal());
  const [receipts, setReceipts] = useState<PurchaseOrderReceipt[]>(() => remoteWorkspaceConfigured ? [] : readPurchaseOrderReceiptsFromLocal());
  const [purchaseOrderMatches, setPurchaseOrderMatches] = useState<PurchaseOrderInvoiceMatch[]>(() => remoteWorkspaceConfigured ? [] : readPurchaseOrderMatchesFromLocal());
  const [rfqs, setRfqs] = useState<RFQ[]>(() => remoteWorkspaceConfigured ? [] : readRFQsFromLocal());
  const [supplierQuotations, setSupplierQuotations] = useState<SupplierQuotation[]>(() => remoteWorkspaceConfigured ? [] : readSupplierQuotationsFromLocal());
  const [vendors, setVendors] = useState<Vendor[]>(() => remoteWorkspaceConfigured ? [] : readVendorsFromLocal());

  const applyWorkspaceData = useCallback((data: ProcurementWorkspaceData) => {
    setPurchaseOrders(data.purchaseOrders);
    setSubcontracts(data.subcontracts);
    setSubcontractClaims(data.subcontractClaims);
    setSubcontractVariations(data.subcontractVariations);
    setReceipts(data.receipts);
    setPurchaseOrderMatches(data.purchaseOrderMatches);
    setRfqs(data.rfqs);
    setSupplierQuotations(data.supplierQuotations);
    setVendors(data.vendors);
  }, []);

  const reset = useCallback(() => {
    setPurchaseOrders([]);
    setSubcontracts([]);
    setSubcontractClaims([]);
    setSubcontractVariations([]);
    setReceipts([]);
    setPurchaseOrderMatches([]);
    setRfqs([]);
    setSupplierQuotations([]);
    setVendors([]);
  }, []);

  const savePurchaseOrderHandler = useCallback(async (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
    expectedUpdatedAt?: string,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit purchase orders.");
      }
      const saved = await savePurchaseOrder(po, lines, expectedUpdatedAt || po.updatedAt);
      setPurchaseOrders((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      onSuccess(`Purchase order ${saved.poNumber} saved.`);
    } catch (error) {
      onError(error, "Could not save purchase order.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const transitionPurchaseOrderHandler = useCallback(async (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => {
    try {
      if (remoteWorkspaceConfigured) {
        if (targetStatus === "APPROVED" && !can(PERMISSION_KEYS.procurementApprove)) {
          throw new Error("You do not have permission to approve purchase orders.");
        }
        if (targetStatus !== "APPROVED" && !can(PERMISSION_KEYS.procurementWrite)) {
          throw new Error("You do not have permission to manage purchase orders.");
        }
      }
      const updated = await transitionPurchaseOrderStatus(id, targetStatus, reason);
      if (targetStatus === "ISSUED" && authenticated) await ensurePurchaseOrderDocumentSnapshot(updated.id);
      setPurchaseOrders((previous) => {
        const next = previous.map((item) => item.id === updated.id ? updated : item);
        if (!remoteWorkspaceConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      onSuccess(`Purchase order ${updated.poNumber} transitioned to ${targetStatus}.`);
    } catch (error) {
      onError(error, "Could not transition purchase order.");
      throw error;
    }
  }, [authenticated, can, onError, onSuccess, remoteWorkspaceConfigured]);

  const deletePurchaseOrderHandler = useCallback(async (id: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft purchase orders.");
      }
      await deleteDraftPurchaseOrder(id);
      setPurchaseOrders((previous) => {
        const next = previous.filter((item) => item.id !== id);
        if (!remoteWorkspaceConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      onSuccess("Draft purchase order deleted.");
    } catch (error) {
      onError(error, "Could not delete draft purchase order.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveSubcontractHandler = useCallback(async (
    subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit subcontracts.");
      }
      const saved = await saveSubcontract(subcontract, lines);
      setSubcontracts((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeSubcontractsToLocal(next);
        return next;
      });
      onSuccess(`Subcontract ${saved.subcontractNumber} saved.`);
    } catch (error) {
      onError(error, "Could not save subcontract.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const transitionSubcontractHandler = useCallback(async (id: string, targetStatus: SubcontractStatus, reason?: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementApprove)) {
        throw new Error("You do not have permission to transition subcontract lifecycle status.");
      }
      const updated = await transitionSubcontract(id, targetStatus, reason);
      setSubcontracts((previous) => {
        const next = previous.map((item) => item.id === updated.id ? updated : item);
        if (!remoteWorkspaceConfigured) writeSubcontractsToLocal(next);
        return next;
      });
      onSuccess(`Subcontract ${updated.subcontractNumber} transitioned to ${targetStatus}.`);
    } catch (error) {
      onError(error, "Could not transition subcontract.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const deleteSubcontractHandler = useCallback(async (id: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft subcontracts.");
      }
      await deleteDraftSubcontract(id);
      setSubcontracts((previous) => {
        const next = previous.filter((item) => item.id !== id);
        if (!remoteWorkspaceConfigured) writeSubcontractsToLocal(next);
        return next;
      });
      onSuccess("Draft subcontract deleted.");
    } catch (error) {
      onError(error, "Could not delete draft subcontract.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveSubcontractClaimHandler = useCallback(async (
    claim: Partial<SubcontractProgressClaim> & { subcontractId: string; projectId: string; claimNumber: string; valuationDate: string },
    lines: Array<Partial<SubcontractProgressClaimLine> & { subcontractLineId?: string; subcontractVariationLineId?: string; claimedAmount: number; notes?: string }>,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit subcontract progress claims.");
      }
      const saved = await saveSubcontractClaim(claim, lines);
      setSubcontractClaims((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeSubcontractClaimsToLocal(next);
        return next;
      });
      onSuccess(`Progress claim ${saved.claimNumber} saved.`);
    } catch (error) {
      onError(error, "Could not save subcontract progress claim.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const transitionSubcontractClaimHandler = useCallback(async (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => {
    try {
      if (remoteWorkspaceConfigured) {
        if (targetStatus === "APPROVED" && !can(PERMISSION_KEYS.procurementApprove)) {
          throw new Error("You do not have permission to approve subcontract progress claims.");
        }
        if (targetStatus !== "APPROVED" && !can(PERMISSION_KEYS.procurementWrite)) {
          throw new Error("You do not have permission to manage subcontract progress claims.");
        }
      }
      const current = subcontractClaims.find((item) => item.id === id);
      const parent = current ? subcontracts.find((item) => item.id === current.subcontractId) : undefined;
      const approvedVariations = current ? subcontractVariations.filter((item) => item.subcontractId === current.subcontractId && item.status === "APPROVED") : [];
      const updated = await transitionSubcontractClaim(id, targetStatus, reason, lineApprovals, parent, approvedVariations);
      setSubcontractClaims((previous) => {
        const next = previous.map((item) => item.id === updated.id ? updated : item);
        if (!remoteWorkspaceConfigured) writeSubcontractClaimsToLocal(next);
        return next;
      });
      onSuccess(`Progress claim ${updated.claimNumber} transitioned to ${targetStatus}.`);
    } catch (error) {
      onError(error, "Could not transition subcontract progress claim.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured, subcontractClaims, subcontractVariations, subcontracts]);

  const deleteSubcontractClaimHandler = useCallback(async (id: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft subcontract progress claims.");
      }
      await deleteDraftSubcontractClaim(id);
      setSubcontractClaims((previous) => {
        const next = previous.filter((item) => item.id !== id);
        if (!remoteWorkspaceConfigured) writeSubcontractClaimsToLocal(next);
        return next;
      });
      onSuccess("Draft progress claim deleted.");
    } catch (error) {
      onError(error, "Could not delete draft subcontract progress claim.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveSubcontractVariationHandler = useCallback(async (
    variation: Partial<SubcontractVariation> & { subcontractId: string; projectId: string; variationNumber: string; title: string; currency?: string },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to create or edit subcontract variations.");
      }
      const saved = await saveSubcontractVariation(variation, lines);
      setSubcontractVariations((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeSubcontractVariationsToLocal(next);
        return next;
      });
      onSuccess(`Variation ${saved.variationNumber} saved.`);
    } catch (error) {
      onError(error, "Could not save subcontract variation.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const transitionSubcontractVariationHandler = useCallback(async (id: string, targetStatus: SubcontractVariationStatus, reason?: string) => {
    try {
      if (remoteWorkspaceConfigured) {
        if (targetStatus === "APPROVED" && !can(PERMISSION_KEYS.procurementApprove)) {
          throw new Error("You do not have permission to approve subcontract variations.");
        }
        if (targetStatus !== "APPROVED" && !can(PERMISSION_KEYS.procurementWrite)) {
          throw new Error("You do not have permission to manage subcontract variations.");
        }
      }
      const current = subcontractVariations.find((item) => item.id === id);
      const parent = current ? subcontracts.find((item) => item.id === current.subcontractId) : undefined;
      const otherApproved = current ? subcontractVariations.filter((item) => item.subcontractId === current.subcontractId && item.id !== id && item.status === "APPROVED") : [];
      const approvedClaims = current ? subcontractClaims.filter((item) => item.subcontractId === current.subcontractId && item.status === "APPROVED") : [];
      const updated = await transitionSubcontractVariation(id, targetStatus, reason, parent, otherApproved, approvedClaims);
      setSubcontractVariations((previous) => {
        const next = previous.map((item) => item.id === updated.id ? updated : item);
        if (!remoteWorkspaceConfigured) writeSubcontractVariationsToLocal(next);
        return next;
      });
      onSuccess(`Variation ${updated.variationNumber} transitioned to ${targetStatus}.`);
    } catch (error) {
      onError(error, "Could not transition subcontract variation.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured, subcontractClaims, subcontractVariations, subcontracts]);

  const deleteSubcontractVariationHandler = useCallback(async (id: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to delete draft subcontract variations.");
      }
      await deleteDraftSubcontractVariation(id);
      setSubcontractVariations((previous) => {
        const next = previous.filter((item) => item.id !== id);
        if (!remoteWorkspaceConfigured) writeSubcontractVariationsToLocal(next);
        return next;
      });
      onSuccess("Draft subcontract variation deleted.");
    } catch (error) {
      onError(error, "Could not delete draft subcontract variation.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const addVendorHandler = useCallback(async (vendor: Partial<Vendor> & { name: string }) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.vendorsManage)) {
        throw new Error("You do not have permission to manage Vendors.");
      }
      const saved = await saveVendor(vendor);
      setVendors((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [...previous, saved];
        if (!remoteWorkspaceConfigured) writeVendorsToLocal(next);
        return next;
      });
      onSuccess(`Vendor "${saved.name}" ${vendor.id ? "saved" : "created"}.`);
      return saved;
    } catch (error) {
      onError(error, "Could not save Vendor.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const deactivateVendorHandler = useCallback(async (vendorId: string, reason: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.vendorsManage)) throw new Error("You do not have permission to deactivate Vendors.");
      const current = vendors.find((vendor) => vendor.id === vendorId);
      if (!current) throw new Error("Vendor is no longer available in this company.");
      const saved = authenticated
        ? await deactivateVendor(vendorId, reason)
        : { ...current, active: false, archivedAt: new Date().toISOString(), deactivatedAt: new Date().toISOString(), deactivationReason: reason, updatedAt: new Date().toISOString() };
      setVendors((previous) => previous.map((vendor) => vendor.id === saved.id ? saved : vendor));
      onSuccess(`Vendor "${saved.name}" was deactivated; history remains retained.`);
    } catch (error) {
      onError(error, "Could not deactivate Vendor.");
      throw error;
    }
  }, [authenticated, can, onError, onSuccess, remoteWorkspaceConfigured, vendors]);

  const reactivateVendorHandler = useCallback(async (vendorId: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.vendorsManage)) throw new Error("You do not have permission to reactivate Vendors.");
      const current = vendors.find((vendor) => vendor.id === vendorId);
      if (!current) throw new Error("Vendor is no longer available in this company.");
      const saved = authenticated
        ? await reactivateVendor(vendorId)
        : { ...current, active: true, archivedAt: null, deactivatedAt: null, deactivatedByUserId: null, deactivationReason: null, updatedAt: new Date().toISOString() };
      setVendors((previous) => previous.map((vendor) => vendor.id === saved.id ? saved : vendor));
      onSuccess(`Vendor "${saved.name}" was reactivated.`);
    } catch (error) {
      onError(error, "Could not reactivate Vendor.");
      throw error;
    }
  }, [authenticated, can, onError, onSuccess, remoteWorkspaceConfigured, vendors]);

  const recordReceiptHandler = useCallback(async (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; inventoryItemId?: string | null; notes?: string }>,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to record purchase order delivery receipts.");
      }
      const saved = await recordPurchaseOrderReceipt(receipt, lines);
      setReceipts((previous) => {
        const next = [saved, ...previous.filter((item) => item.id !== saved.id)];
        if (!remoteWorkspaceConfigured) writePurchaseOrderReceiptsToLocal(next);
        return next;
      });
      onSuccess(`Goods receipt ${saved.receiptNumber} recorded successfully.`);
      return saved;
    } catch (error) {
      onError(error, "Could not record delivery receipt.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const voidReceiptHandler = useCallback(async (receiptId: string, reason: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) {
        throw new Error("You do not have permission to void purchase order receipts.");
      }
      const voided = await voidPurchaseOrderReceipt(receiptId, reason);
      setReceipts((previous) => {
        const next = previous.map((item) => item.id === voided.id ? voided : item);
        if (!remoteWorkspaceConfigured) writePurchaseOrderReceiptsToLocal(next);
        return next;
      });
      onSuccess(`Goods receipt ${voided.receiptNumber} has been voided.`);
    } catch (error) {
      onError(error, "Could not void delivery receipt.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const confirmPurchaseOrderMatchHandler = useCallback(async (
    poId: string,
    lines: Array<{ invoiceLineId: string; purchaseOrderLineId: string; matchedQuantity?: number; matchedAmount?: number }>,
    notes?: string,
  ) => {
    try {
      if (remoteWorkspaceConfigured && (!can(PERMISSION_KEYS.procurementWrite) || !can(PERMISSION_KEYS.invoicesWrite))) {
        throw new Error("You do not have permission to match supplier invoices to purchase orders.");
      }
      if (!selectedInvoice) throw new Error("No invoice selected to match.");
      const match = await confirmPurchaseOrderMatch({ invoiceId: selectedInvoice.id, purchaseOrderId: poId, matchSource: "MANUAL", notes, lines });
      setPurchaseOrderMatches((previous) => {
        const next = [match, ...previous.filter((item) => item.id !== match.id && !(item.invoiceId === selectedInvoice.id && item.status === "CONFIRMED"))];
        if (!remoteWorkspaceConfigured) writePurchaseOrderMatchesToLocal(next);
        return next;
      });
      onSuccess("Supplier invoice matched to purchase order.");
    } catch (error) {
      onError(error, "Could not match purchase order.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured, selectedInvoice]);

  const unmatchPurchaseOrderMatchHandler = useCallback(async (matchId: string, reason: string) => {
    try {
      if (remoteWorkspaceConfigured && (!can(PERMISSION_KEYS.procurementWrite) || !can(PERMISSION_KEYS.invoicesWrite))) {
        throw new Error("You do not have permission to unmatch supplier invoices.");
      }
      const result = await unmatchPurchaseOrderMatch(matchId, reason);
      setPurchaseOrderMatches((previous) => {
        const next = previous.map((item) => item.id === matchId ? result : item);
        if (!remoteWorkspaceConfigured) writePurchaseOrderMatchesToLocal(next);
        return next;
      });
      onSuccess("Purchase order match removed.");
    } catch (error) {
      onError(error, "Could not unmatch purchase order.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveRFQHandler = useCallback(async (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
    expectedUpdatedAt?: string,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to create or edit RFQs.");
      const saved = await saveRFQ(rfq, lines, invitedVendorIds, expectedUpdatedAt || rfq.updatedAt);
      setRfqs((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeRFQsToLocal(next);
        return next;
      });
      onSuccess(`RFQ ${saved.rfqNumber} saved.`);
    } catch (error) {
      onError(error, "Could not save RFQ.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const transitionRFQHandler = useCallback(async (id: string, targetStatus: RFQStatus, reason?: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to transition RFQ status.");
      const updated = await transitionRFQStatus(id, targetStatus, reason);
      setRfqs((previous) => {
        const next = previous.map((item) => item.id === updated.id ? updated : item);
        if (!remoteWorkspaceConfigured) writeRFQsToLocal(next);
        return next;
      });
      onSuccess(`RFQ ${updated.rfqNumber} transitioned to ${targetStatus}.`);
    } catch (error) {
      onError(error, "Could not transition RFQ.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const deleteRFQHandler = useCallback(async (id: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to delete draft RFQs.");
      await deleteDraftRFQ(id);
      setRfqs((previous) => {
        const next = previous.filter((item) => item.id !== id);
        if (!remoteWorkspaceConfigured) writeRFQsToLocal(next);
        return next;
      });
      onSuccess("Draft RFQ deleted.");
    } catch (error) {
      onError(error, "Could not delete draft RFQ.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveSupplierQuotationHandler = useCallback(async (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to record supplier quotations.");
      const saved = await saveSupplierQuotation(quotation, lines);
      setSupplierQuotations((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id);
        const next = index >= 0 ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeSupplierQuotationsToLocal(next);
        return next;
      });
      onSuccess(`Supplier quotation ${saved.quotationNumber} saved.`);
    } catch (error) {
      onError(error, "Could not save supplier quotation.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const selectSupplierQuotationHandler = useCallback(async (quotationId: string, reason: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to select preferred suppliers.");
      const selected = await selectSupplierQuotation(quotationId, reason);
      setSupplierQuotations((previous) => {
        const next = previous.map((item) => {
          if (item.id === quotationId) return selected;
          if (item.rfqId === selected.rfqId && item.status === "SELECTED") return { ...item, status: "SUBMITTED" as const };
          return item;
        });
        if (!remoteWorkspaceConfigured) writeSupplierQuotationsToLocal(next);
        return next;
      });
      setRfqs((previous) => {
        const next = previous.map((item) => item.id === selected.rfqId ? { ...item, selectedQuotationId: selected.id } : item);
        if (!remoteWorkspaceConfigured) writeRFQsToLocal(next);
        return next;
      });
      onSuccess(`Supplier quotation ${selected.quotationNumber} selected.`);
    } catch (error) {
      onError(error, "Could not select supplier quotation.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const revertSupplierQuotationSelectionHandler = useCallback(async (rfqId: string, reason: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to revert supplier selections.");
      const updatedRfq = await revertSupplierQuotationSelection(rfqId, reason);
      setSupplierQuotations((previous) => {
        const next = previous.map((item) => item.rfqId === rfqId && item.status === "SELECTED" ? { ...item, status: "SUBMITTED" as const } : item);
        if (!remoteWorkspaceConfigured) writeSupplierQuotationsToLocal(next);
        return next;
      });
      setRfqs((previous) => {
        const next = previous.map((item) => item.id === rfqId ? updatedRfq : item);
        if (!remoteWorkspaceConfigured) writeRFQsToLocal(next);
        return next;
      });
      onSuccess("Supplier selection reverted.");
    } catch (error) {
      onError(error, "Could not revert supplier selection.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  const convertQuotationToPOHandler = useCallback(async (quotationId: string, poNumber: string, notes?: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.procurementWrite)) throw new Error("You do not have permission to convert quotations to purchase orders.");
      const draftPo = await convertQuotationToDraftPO(quotationId, poNumber, notes);
      setPurchaseOrders((previous) => {
        const next = [draftPo, ...previous.filter((item) => item.id !== draftPo.id)];
        if (!remoteWorkspaceConfigured) writePurchaseOrdersToLocal(next);
        return next;
      });
      onSuccess(`Draft purchase order ${draftPo.poNumber} created from quotation.`);
    } catch (error) {
      onError(error, "Could not convert quotation to purchase order.");
      throw error;
    }
  }, [can, onError, onSuccess, remoteWorkspaceConfigured]);

  return {
    purchaseOrders,
    subcontracts,
    subcontractClaims,
    subcontractVariations,
    receipts,
    purchaseOrderMatches,
    rfqs,
    supplierQuotations,
    vendors,
    applyWorkspaceData,
    reset,
    savePurchaseOrder: savePurchaseOrderHandler,
    transitionPurchaseOrder: transitionPurchaseOrderHandler,
    deletePurchaseOrder: deletePurchaseOrderHandler,
    saveSubcontract: saveSubcontractHandler,
    transitionSubcontract: transitionSubcontractHandler,
    deleteSubcontract: deleteSubcontractHandler,
    saveSubcontractClaim: saveSubcontractClaimHandler,
    transitionSubcontractClaim: transitionSubcontractClaimHandler,
    deleteSubcontractClaim: deleteSubcontractClaimHandler,
    saveSubcontractVariation: saveSubcontractVariationHandler,
    transitionSubcontractVariation: transitionSubcontractVariationHandler,
    deleteSubcontractVariation: deleteSubcontractVariationHandler,
    addVendor: addVendorHandler,
    deactivateVendor: deactivateVendorHandler,
    reactivateVendor: reactivateVendorHandler,
    recordReceipt: recordReceiptHandler,
    voidReceipt: voidReceiptHandler,
    confirmPurchaseOrderMatch: confirmPurchaseOrderMatchHandler,
    unmatchPurchaseOrderMatch: unmatchPurchaseOrderMatchHandler,
    saveRFQ: saveRFQHandler,
    transitionRFQ: transitionRFQHandler,
    deleteRFQ: deleteRFQHandler,
    saveSupplierQuotation: saveSupplierQuotationHandler,
    selectSupplierQuotation: selectSupplierQuotationHandler,
    revertSupplierQuotationSelection: revertSupplierQuotationSelectionHandler,
    convertQuotationToPO: convertQuotationToPOHandler,
  };
}
