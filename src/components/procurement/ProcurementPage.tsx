import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  FileText,
  Plus,
  ShoppingCart,
} from "lucide-react";
import type {
  InvoiceData,
  Project,
  ProjectCostCode,
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
import type { InventoryMovement } from "../../lib/inventory.ts";
import { createDemoRFQs, createDemoSubcontractClaims, createDemoSubcontracts, createDemoSubcontractVariations, createDemoSupplierQuotations } from "../../demo/data/procurement.ts";
import { defaultDemoAnchorDate } from "../../demo/data/demoDates.ts";
import { isDemoApplicationPath } from "../../app/applicationMode.ts";
import {
  applySubcontractTransition,
  buildLocalSubcontract,
  deleteDraftSubcontract,
  readSubcontractsFromLocal,
  saveSubcontract,
  transitionSubcontract,
} from "../../lib/subcontracts.ts";
import {
  applySubcontractClaimTransition,
  buildLocalSubcontractClaim,
  computeSubcontractClaimMetrics,
  deleteDraftSubcontractClaim,
  readSubcontractClaimsFromLocal,
  saveSubcontractClaim,
  transitionSubcontractClaim,
} from "../../lib/subcontractClaims.ts";
import {
  deleteDraftSubcontractVariation,
  readSubcontractVariationsFromLocal,
  saveSubcontractVariation,
  transitionSubcontractVariation,
} from "../../lib/subcontractVariations.ts";
import { isCommittedPurchaseOrder, isCommittedSubcontract, purchaseOrderTotal, subcontractTotal } from "../../utils/projectCosting.ts";
import { calculatePOReceiptProgress } from "../../utils/purchaseOrderReceipts.ts";
import { PageHeader } from "../ui/OperationsUI.tsx";
import { PurchaseOrderRegisterSection } from "./PurchaseOrderRegisterSection.tsx";
import { RfqRegisterSection } from "./RfqRegisterSection.tsx";
import { ProcurementWorkbookPanel } from "./ProcurementWorkbookPanel.tsx";
import type { ProcurementRefreshContext } from "../../lib/procurementWorkbook.ts";
import {
  SubcontractRegisterSection,
  type SubcontractRegisterCounts,
  type SubcontractRegisterRow,
} from "./SubcontractRegisterSection.tsx";
import { PurchaseOrderEditorModal } from "./PurchaseOrderEditorModal.tsx";
import { RFQEditorModal } from "./RFQEditorModal.tsx";
import { SupplierQuotationModal } from "./SupplierQuotationModal.tsx";
import { RFQComparisonModal } from "./RFQComparisonModal.tsx";
import { SubcontractEditorModal } from "./SubcontractEditorModal.tsx";
import { SubcontractCancellationModal } from "./SubcontractCancellationModal.tsx";
import { SubcontractClaimEditorModal } from "./SubcontractClaimEditorModal.tsx";
import { SubcontractClaimsDrawer } from "./SubcontractClaimsDrawer.tsx";
import { SubcontractVariationModal } from "./SubcontractVariationModal.tsx";
import { SubcontractVariationDetailModal } from "./SubcontractVariationDetailModal.tsx";
import { SubcontractVariationsDrawer } from "./SubcontractVariationsDrawer.tsx";
import { DocumentPreviewModal } from "../DocumentPreviewModal.tsx";
import { buildPurchaseOrderDocumentSnapshot } from "../../lib/documentGeneration.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE } from "../../lib/companyDocumentProfile.ts";
import { appPathForEmailWorkspace, appPathForPurchaseOrder, appPathForWarehouseMovement, appPathForWarehouseReceipt } from "../../utils/appRouting.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface ProcurementPageProps {
  purchaseOrders: PurchaseOrder[];
  receipts?: readonly PurchaseOrderReceipt[];
  projects: Project[];
  vendors: Vendor[];
  costCodes: ProjectCostCode[];
  selectedProjectId?: string;
  initialTab?: "purchase_orders" | "rfqs" | "subcontracts";
  initialPurchaseOrderId?: string;
  initialReceiptId?: string;
  initialSubcontractId?: string;
  initialSubcontractClaimId?: string;
  initialReturnPath?: string;
  onNavigatePath?: AppNavigate;
  onRefreshProcurement?: () => Promise<ProcurementRefreshContext>;
  workspaceLoading?: boolean;
  canRead?: boolean;
  canManage?: boolean;
  canApprove?: boolean;
  matches?: readonly PurchaseOrderInvoiceMatch[];
  invoices?: readonly InvoiceData[];
  rfqs?: RFQ[];
  supplierQuotations?: SupplierQuotation[];
  subcontracts?: Subcontract[];
  onSavePO: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
    expectedUpdatedAt?: string,
  ) => Promise<void>;
  onTransitionPO: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  onDeletePO: (id: string) => Promise<void>;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; inventoryItemId?: string | null; notes?: string }>,
  ) => Promise<PurchaseOrderReceipt | void>;
  onVoidReceipt?: (receiptId: string, reason: string) => Promise<void>;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  onOpenInvoice?: (invoiceId: string) => void;
  inventoryMovements?: readonly InventoryMovement[];
  onSaveRFQ?: (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
    expectedUpdatedAt?: string,
  ) => Promise<void>;
  onTransitionRFQ?: (id: string, targetStatus: RFQStatus, reason?: string) => Promise<void>;
  onDeleteRFQ?: (id: string) => Promise<void>;
  onSaveSupplierQuotation?: (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onSelectSupplierQuotation?: (quotationId: string, reason: string) => Promise<void>;
  onRevertSupplierQuotationSelection?: (rfqId: string, reason: string) => Promise<void>;
  onConvertQuotationToPO?: (quotationId: string, poNumber: string, notes?: string) => Promise<void>;
  onSaveSubcontract?: (
    sc: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontract?: (id: string, targetStatus: SubcontractStatus, reason?: string) => Promise<void>;
  onDeleteSubcontract?: (id: string) => Promise<void>;
  subcontractClaims?: SubcontractProgressClaim[];
  onSaveSubcontractClaim?: (
    claim: Partial<SubcontractProgressClaim> & {
      subcontractId: string;
      projectId: string;
      claimNumber: string;
      valuationDate: string;
    },
    lines: Array<{ subcontractLineId?: string; subcontractVariationLineId?: string; claimedAmount: number; notes?: string }>,
  ) => Promise<void>;
  onTransitionSubcontractClaim?: (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => Promise<void>;
  onDeleteSubcontractClaim?: (id: string) => Promise<void>;
  subcontractVariations?: SubcontractVariation[];
  onSaveSubcontractVariation?: (
    variation: Partial<SubcontractVariation> & {
      subcontractId: string;
      projectId: string;
      variationNumber: string;
      title: string;
      currency?: string;
    },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontractVariation?: (
    id: string,
    targetStatus: SubcontractVariationStatus,
    reason?: string,
  ) => Promise<void>;
  onDeleteSubcontractVariation?: (id: string) => Promise<void>;
}

export const ProcurementPage: React.FC<ProcurementPageProps> = ({
  purchaseOrders,
  receipts = [],
  projects,
  vendors,
  costCodes,
  selectedProjectId,
  initialTab,
  initialPurchaseOrderId,
  initialReceiptId,
  initialSubcontractId,
  initialSubcontractClaimId,
  initialReturnPath,
  onNavigatePath,
  onRefreshProcurement,
  workspaceLoading = false,
  canRead = false,
  canManage = false,
  canApprove = false,
  matches = [],
  invoices = [],
  rfqs: initialRfqs,
  supplierQuotations: initialQuotations,
  subcontracts: initialSubcontracts,
  subcontractClaims: initialSubcontractClaims,
  subcontractVariations: initialSubcontractVariations,
  onSavePO,
  onTransitionPO,
  onDeletePO,
  onRecordReceipt,
  onVoidReceipt,
  onAddVendor,
  onOpenInvoice,
  inventoryMovements = [],
  onSaveRFQ,
  onTransitionRFQ,
  onDeleteRFQ,
  onSaveSupplierQuotation,
  onSelectSupplierQuotation,
  onRevertSupplierQuotationSelection,
  onConvertQuotationToPO,
  onSaveSubcontract,
  onTransitionSubcontract,
  onDeleteSubcontract,
  onSaveSubcontractClaim,
  onTransitionSubcontractClaim,
  onDeleteSubcontractClaim,
  onSaveSubcontractVariation,
  onTransitionSubcontractVariation,
  onDeleteSubcontractVariation,
}) => {
  // Top-level Navigation Sub-Tabs
  const [activeTab, setActiveTab] = useState<"purchase_orders" | "rfqs" | "subcontracts">(initialTab || "purchase_orders");

  // Search & Filters
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>(selectedProjectId || "ALL");

  // Purchase Order State
  const [activePo, setActivePo] = useState<PurchaseOrder | null | undefined>(undefined);
  const [previewPo, setPreviewPo] = useState<PurchaseOrder | null>(null);
  const [receiptContinuation, setReceiptContinuation] = useState<{ receipt: PurchaseOrderReceipt; purchaseOrder: PurchaseOrder } | null>(null);

  // RFQ State (with graceful fallback to demo seed when not provided)
  const defaultAnchor = useMemo(() => defaultDemoAnchorDate(), []);
  const [localRfqs, setLocalRfqs] = useState<RFQ[]>(() => initialRfqs || createDemoRFQs(defaultAnchor));
  const [localQuotations, setLocalQuotations] = useState<SupplierQuotation[]>(
    () => initialQuotations || createDemoSupplierQuotations(defaultAnchor),
  );

  useEffect(() => {
    if (initialRfqs) setLocalRfqs(initialRfqs);
  }, [initialRfqs]);

  useEffect(() => {
    if (initialQuotations) setLocalQuotations(initialQuotations);
  }, [initialQuotations]);

  // Subcontract State. An empty production prop is authoritative; only the
  // explicit demo route may seed the public demo fixture when its parent has
  // not mounted the demo collection yet.
  const isDemoMode = typeof window !== "undefined" && isDemoApplicationPath(window.location.pathname);
  const useProvidedSubcontracts = initialSubcontracts !== undefined;
  const [localSubcontracts, setLocalSubcontracts] = useState<Subcontract[]>(
    () => useProvidedSubcontracts
      ? initialSubcontracts || []
      : isDemoMode
        ? createDemoSubcontracts(defaultAnchor)
        : readSubcontractsFromLocal(),
  );

  useEffect(() => {
    if (useProvidedSubcontracts) setLocalSubcontracts(initialSubcontracts || []);
  }, [initialSubcontracts, useProvidedSubcontracts]);

  useEffect(() => {
    setProjectFilter(selectedProjectId || "ALL");
  }, [selectedProjectId]);

  useEffect(() => {
    if (!initialPurchaseOrderId) return;
    const requested = purchaseOrders.find((purchaseOrder) => purchaseOrder.id === initialPurchaseOrderId);
    if (requested) {
      setActiveTab("purchase_orders");
      setActivePo(requested);
    }
  }, [initialPurchaseOrderId, purchaseOrders]);

  const handleRecordReceiptInternal = async (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; inventoryItemId?: string | null; notes?: string }>,
  ) => {
    if (!onRecordReceipt) return undefined;
    const saved = await onRecordReceipt(receipt, lines);
    if (saved) {
      const purchaseOrder = purchaseOrders.find((candidate) => candidate.id === saved.purchaseOrderId);
      if (purchaseOrder) setReceiptContinuation({ receipt: saved, purchaseOrder });
    }
    return saved;
  };

  const requestedPurchaseOrder = initialPurchaseOrderId
    ? purchaseOrders.find((purchaseOrder) => purchaseOrder.id === initialPurchaseOrderId)
    : undefined;
  const requestedReceipt = initialReceiptId
    ? receipts.find((receipt) => receipt.id === initialReceiptId)
    : undefined;
  const requestedContextUnavailable = !workspaceLoading && Boolean(
    (initialPurchaseOrderId && !requestedPurchaseOrder)
      || (initialReceiptId && (!requestedReceipt || !requestedPurchaseOrder || requestedReceipt.purchaseOrderId !== requestedPurchaseOrder.id)),
  );
  const continuationMovement = receiptContinuation
    ? inventoryMovements.find((movement) => movement.sourceType === "PURCHASE_ORDER_RECEIPT" && movement.purchaseOrderReceiptId === receiptContinuation.receipt.id)
    : undefined;
  const continuationPath = receiptContinuation
    ? continuationMovement
      ? appPathForWarehouseMovement(continuationMovement.id, initialReturnPath || appPathForPurchaseOrder(receiptContinuation.purchaseOrder.id))
      : appPathForWarehouseReceipt(receiptContinuation.receipt.id, initialReturnPath || appPathForPurchaseOrder(receiptContinuation.purchaseOrder.id))
    : undefined;

  const [activeSubcontractModal, setActiveSubcontractModal] = useState<Subcontract | null | undefined>(undefined);
  const [cancellationSubcontract, setCancellationSubcontract] = useState<Subcontract | null>(null);
  const [subcontractActionId, setSubcontractActionId] = useState<string | null>(null);
  const [subcontractActionError, setSubcontractActionError] = useState<string | null>(null);

  // Subcontract Progress Claims State
  const useProvidedClaims = initialSubcontractClaims !== undefined;
  const [localClaims, setLocalClaims] = useState<SubcontractProgressClaim[]>(
    () => useProvidedClaims
      ? initialSubcontractClaims || []
      : isDemoMode
        ? createDemoSubcontractClaims(defaultAnchor)
        : readSubcontractClaimsFromLocal(),
  );

  useEffect(() => {
    if (useProvidedClaims) setLocalClaims(initialSubcontractClaims || []);
  }, [initialSubcontractClaims, useProvidedClaims]);

  const [claimsDrawerSubcontract, setClaimsDrawerSubcontract] = useState<Subcontract | null>(null);
  const [activeClaimModal, setActiveClaimModal] = useState<SubcontractProgressClaim | null | undefined>(undefined);

  useEffect(() => {
    if (!initialSubcontractId) return;
    const requested = localSubcontracts.find((subcontract) => subcontract.id === initialSubcontractId);
    if (!requested) return;
    setActiveTab("subcontracts");
    setClaimsDrawerSubcontract(requested);
    if (initialSubcontractClaimId) {
      const claim = localClaims.find((candidate) => candidate.id === initialSubcontractClaimId && candidate.subcontractId === requested.id);
      if (claim) setActiveClaimModal(claim);
    }
  }, [initialSubcontractClaimId, initialSubcontractId, localClaims, localSubcontracts]);

  // Subcontract Variations State
  const useProvidedVariations = initialSubcontractVariations !== undefined;
  const [localVariations, setLocalVariations] = useState<SubcontractVariation[]>(
    () => useProvidedVariations
      ? initialSubcontractVariations || []
      : isDemoMode
        ? createDemoSubcontractVariations(defaultAnchor)
        : readSubcontractVariationsFromLocal(),
  );

  useEffect(() => {
    if (useProvidedVariations) setLocalVariations(initialSubcontractVariations || []);
  }, [initialSubcontractVariations, useProvidedVariations]);

  const [variationsDrawerSubcontract, setVariationsDrawerSubcontract] = useState<Subcontract | null>(null);
  const [activeVariationModal, setActiveVariationModal] = useState<SubcontractVariation | null | undefined>(undefined);
  const [activeVariationDetailModal, setActiveVariationDetailModal] = useState<SubcontractVariation | null>(null);

  // Active Modals for RFQ
  const [activeRfqModal, setActiveRfqModal] = useState<RFQ | null | undefined>(undefined);
  const [activeQuotationRfq, setActiveQuotationRfq] = useState<RFQ | null>(null);
  const [editingQuotation, setEditingQuotation] = useState<SupplierQuotation | null>(null);
  const [activeComparisonRfq, setActiveComparisonRfq] = useState<RFQ | null>(null);
  const [cancellationRfq, setCancellationRfq] = useState<RFQ | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Precompute delivery progress for each PO
  const poProgressMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculatePOReceiptProgress>>();
    for (const po of purchaseOrders) {
      map.set(po.id, calculatePOReceiptProgress(po, receipts));
    }
    return map;
  }, [purchaseOrders, receipts]);

  // Quotations map by RFQ ID
  const quotationsByRfqId = useMemo(() => {
    const map = new Map<string, SupplierQuotation[]>();
    for (const q of localQuotations) {
      const existing = map.get(q.rfqId) || [];
      existing.push(q);
      map.set(q.rfqId, existing);
    }
    return map;
  }, [localQuotations]);

  // Filtered Purchase Orders
  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (selectedProjectId && po.projectId !== selectedProjectId) return false;
      if (projectFilter !== "ALL" && po.projectId !== projectFilter) return false;
      if (statusFilter !== "ALL" && po.status !== statusFilter) return false;

      if (deliveryFilter !== "ALL") {
        const prog = poProgressMap.get(po.id);
        if (prog?.deliveryStatus !== deliveryFilter) return false;
      }

      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const vendor = vendorMap.get(po.vendorId);
        const proj = projectMap.get(po.projectId);
        const matchPo = po.poNumber.toLowerCase().includes(q);
        const matchDesc = (po.description || "").toLowerCase().includes(q);
        const matchVendor = (vendor?.name || "").toLowerCase().includes(q);
        const matchProj =
          (proj?.projectName || "").toLowerCase().includes(q) ||
          (proj?.projectCode || "").toLowerCase().includes(q);
        if (!matchPo && !matchDesc && !matchVendor && !matchProj) return false;
      }
      return true;
    });
  }, [
    purchaseOrders,
    selectedProjectId,
    projectFilter,
    statusFilter,
    deliveryFilter,
    query,
    vendorMap,
    projectMap,
    poProgressMap,
  ]);

  // Filtered RFQs
  const filteredRfqs = useMemo(() => {
    return localRfqs.filter((rfq) => {
      if (selectedProjectId && rfq.projectId !== selectedProjectId) return false;
      if (projectFilter !== "ALL" && rfq.projectId !== projectFilter) return false;
      if (statusFilter !== "ALL" && rfq.status !== statusFilter) return false;

      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const matchNum = rfq.rfqNumber.toLowerCase().includes(q);
        const matchTitle = rfq.title.toLowerCase().includes(q);
        const matchDesc = (rfq.description || "").toLowerCase().includes(q);
        const proj = rfq.projectId ? projectMap.get(rfq.projectId) : undefined;
        const matchProj =
          (proj?.projectName || "").toLowerCase().includes(q) ||
          (proj?.projectCode || "").toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchDesc && !matchProj) return false;
      }
      return true;
    });
  }, [localRfqs, selectedProjectId, projectFilter, statusFilter, query, projectMap]);

  // Filtered Subcontracts
  const filteredSubcontracts = useMemo(() => {
    return localSubcontracts.filter((sc) => {
      if (selectedProjectId && sc.projectId !== selectedProjectId) return false;
      if (projectFilter !== "ALL" && sc.projectId !== projectFilter) return false;
      if (statusFilter !== "ALL" && sc.status !== statusFilter) return false;

      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const vendor = vendorMap.get(sc.vendorId);
        const proj = projectMap.get(sc.projectId);
        const matchNum = sc.subcontractNumber.toLowerCase().includes(q);
        const matchTitle = sc.title.toLowerCase().includes(q);
        const matchNotes = (sc.notes || "").toLowerCase().includes(q);
        const matchVendor = (vendor?.name || "").toLowerCase().includes(q);
        const matchProj =
          (proj?.projectName || "").toLowerCase().includes(q) ||
          (proj?.projectCode || "").toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchNotes && !matchVendor && !matchProj) return false;
      }
      return true;
    });
  }, [localSubcontracts, selectedProjectId, projectFilter, statusFilter, query, vendorMap, projectMap]);

  // Subcontract KPI Metrics
  const activeCommittedSubcontractTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sc of filteredSubcontracts) {
      if (!isCommittedSubcontract(sc.status)) continue;
      const currency = String(sc.currency || "PHP").trim().toUpperCase();
      const m = computeSubcontractClaimMetrics(sc, localClaims);
      totals.set(currency, (totals.get(currency) || 0) + m.remainingCommitment);
    }
    return [...totals.entries()].map(([currency, amount]) => [currency, Math.round(amount * 100) / 100] as const);
  }, [filteredSubcontracts, localClaims]);

  const certifiedSubcontractTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sc of filteredSubcontracts) {
      const currency = String(sc.currency || "PHP").trim().toUpperCase();
      const m = computeSubcontractClaimMetrics(sc, localClaims);
      totals.set(currency, (totals.get(currency) || 0) + m.cumulativeApprovedGross);
    }
    return [...totals.entries()].map(([currency, amount]) => [currency, Math.round(amount * 100) / 100] as const);
  }, [filteredSubcontracts, localClaims]);

  const retentionHeldTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sc of filteredSubcontracts) {
      const currency = String(sc.currency || "PHP").trim().toUpperCase();
      const m = computeSubcontractClaimMetrics(sc, localClaims);
      totals.set(currency, (totals.get(currency) || 0) + m.cumulativeRetentionHeld);
    }
    return [...totals.entries()].map(([currency, amount]) => [currency, Math.round(amount * 100) / 100] as const);
  }, [filteredSubcontracts, localClaims]);

  const subcontractRegisterRows = useMemo<SubcontractRegisterRow[]>(() => filteredSubcontracts.map((sc) => {
    const project = projectMap.get(sc.projectId);
    const vendor = vendorMap.get(sc.vendorId);
    const metrics = computeSubcontractClaimMetrics(sc, localClaims, localVariations);

    return {
      subcontract: sc,
      vendorLabel: vendor?.name || sc.vendorId,
      projectCode: project?.projectCode || "General",
      projectName: project?.projectName || "Unscoped",
      variationCount: localVariations.filter((variation) => variation.subcontractId === sc.id).length,
      metrics: {
        originalAmount: subcontractTotal(sc),
        revisedSubcontractValue: metrics.revisedSubcontractValue,
        netApprovedVariations: metrics.netApprovedVariations,
        cumulativeApprovedGross: metrics.cumulativeApprovedGross,
        remainingCommitment: metrics.remainingCommitment,
        claimsCount: metrics.claimsCount,
      },
      isApprovalReady: Boolean(sc.lines && sc.lines.length > 0) && subcontractTotal(sc) > 0,
    };
  }), [filteredSubcontracts, localClaims, localVariations, projectMap, vendorMap]);

  const subcontractRegisterCounts = useMemo<SubcontractRegisterCounts>(() => ({
    total: filteredSubcontracts.length,
    active: filteredSubcontracts.filter((sc) => sc.status === "ACTIVE").length,
    drafts: filteredSubcontracts.filter((sc) => sc.status === "DRAFT").length,
  }), [filteredSubcontracts]);

  const handleSaveClaimInternal = async (
    claim: Partial<SubcontractProgressClaim> & {
      subcontractId: string;
      projectId: string;
      claimNumber: string;
      valuationDate: string;
    },
    lines: Array<{
      id?: string;
      subcontractLineId?: string;
      subcontractVariationLineId?: string;
      claimedAmount: number;
      notes?: string;
    }>,
  ) => {
    if (onSaveSubcontractClaim) {
      await onSaveSubcontractClaim(claim, lines);
      return;
    }

    if (isDemoMode) {
      const existing = claim.id ? localClaims.find((item) => item.id === claim.id) : undefined;
      const saved = buildLocalSubcontractClaim(claim, lines, existing, existing?.companyId || null);
      setLocalClaims((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id);
        return index >= 0 ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
      });
      return;
    }

    const saved = await saveSubcontractClaim(claim, lines);
    setLocalClaims((prev) => {
      const index = prev.findIndex((item) => item.id === saved.id);
      return index >= 0 ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
    });
  };

  const handleTransitionClaimInternal = async (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => {
    if (onTransitionSubcontractClaim) {
      await onTransitionSubcontractClaim(id, targetStatus, reason, lineApprovals);
      return;
    }

    if (isDemoMode) {
      const current = localClaims.find((item) => item.id === id);
      if (!current) throw new Error("Progress claim not found");
      const parentSc = localSubcontracts.find((sc) => sc.id === current.subcontractId);
      const otherApproved = localClaims.filter(
        (c) => c.subcontractId === current.subcontractId && c.id !== current.id && c.status === "APPROVED",
      );
      const updated = applySubcontractClaimTransition(
        current,
        targetStatus,
        reason,
        lineApprovals,
        parentSc,
        otherApproved,
        localVariations,
      );
      setLocalClaims((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return;
    }

    const parentSc = localSubcontracts.find((sc) => sc.id === localClaims.find((c) => c.id === id)?.subcontractId);
    const updated = await transitionSubcontractClaim(id, targetStatus, reason, lineApprovals, parentSc, localVariations);
    setLocalClaims((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const handleDeleteClaimInternal = async (id: string) => {
    if (onDeleteSubcontractClaim) {
      await onDeleteSubcontractClaim(id);
      return;
    }

    if (!isDemoMode) await deleteDraftSubcontractClaim(id);
    setLocalClaims((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveVariationInternal = async (
    variation: Partial<SubcontractVariation> & {
      subcontractId: string;
      projectId: string;
      variationNumber: string;
      title: string;
      currency?: string;
    },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => {
    if (onSaveSubcontractVariation) {
      await onSaveSubcontractVariation(variation, lines);
      return;
    }

    const saved = await saveSubcontractVariation(variation, lines);
    setLocalVariations((prev) => {
      const idx = prev.findIndex((v) => v.id === saved.id);
      return idx >= 0 ? prev.map((v) => (v.id === saved.id ? saved : v)) : [saved, ...prev];
    });
  };

  const handleTransitionVariationInternal = async (
    id: string,
    targetStatus: SubcontractVariationStatus,
    reason?: string,
  ) => {
    if (onTransitionSubcontractVariation) {
      await onTransitionSubcontractVariation(id, targetStatus, reason);
      return;
    }

    const currentVar = localVariations.find((v) => v.id === id);
    const scId = currentVar?.subcontractId || variationsDrawerSubcontract?.id || activeVariationDetailModal?.subcontractId;
    const parentSc = localSubcontracts.find((s) => s.id === scId);
    const otherApproved = localVariations.filter((v) => v.subcontractId === scId && v.id !== id && v.status === "APPROVED");
    const approvedClaims = localClaims.filter((c) => c.subcontractId === scId && c.status === "APPROVED");

    const updated = await transitionSubcontractVariation(
      id,
      targetStatus,
      reason,
      parentSc,
      otherApproved,
      approvedClaims,
    );
    setLocalVariations((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  };

  const handleDeleteDraftVariationInternal = async (id: string) => {
    if (onDeleteSubcontractVariation) {
      await onDeleteSubcontractVariation(id);
      return;
    }

    await deleteDraftSubcontractVariation(id);
    setLocalVariations((prev) => prev.filter((v) => v.id !== id));
  };

  const handleSaveSubcontractInternal = async (
    sc: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => {
    if (onSaveSubcontract) {
      await onSaveSubcontract(sc, lines);
      return;
    }

    if (isDemoMode) {
      const existing = sc.id ? localSubcontracts.find((item) => item.id === sc.id) : undefined;
      const saved = buildLocalSubcontract(sc, lines, existing, existing?.companyId || null);
      setLocalSubcontracts((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id);
        return index >= 0 ? prev.map((item) => item.id === saved.id ? saved : item) : [saved, ...prev];
      });
      return;
    }

    const saved = await saveSubcontract(sc, lines);
    setLocalSubcontracts((prev) => {
      const index = prev.findIndex((item) => item.id === saved.id);
      return index >= 0 ? prev.map((item) => item.id === saved.id ? saved : item) : [saved, ...prev];
    });
  };

  const handleTransitionSubcontractInternal = async (
    id: string,
    targetStatus: SubcontractStatus,
    reason?: string,
  ) => {
    if (onTransitionSubcontract) {
      await onTransitionSubcontract(id, targetStatus, reason);
      return;
    }

    if (isDemoMode) {
      const current = localSubcontracts.find((item) => item.id === id);
      if (!current) throw new Error("Subcontract not found");
      const updated = applySubcontractTransition(current, targetStatus, reason, undefined, localVariations);
      setLocalSubcontracts((prev) => prev.map((item) => item.id === id ? updated : item));
      return;
    }

    const updated = await transitionSubcontract(id, targetStatus, reason);
    setLocalSubcontracts((prev) => prev.map((item) => item.id === updated.id ? updated : item));
  };

  const handleDeleteSubcontractInternal = async (id: string) => {
    if (onDeleteSubcontract) {
      await onDeleteSubcontract(id);
      return;
    }

    if (!isDemoMode) await deleteDraftSubcontract(id);
    setLocalSubcontracts((prev) => prev.filter((sc) => sc.id !== id));
  };

  const runSubcontractAction = async (id: string, action: () => Promise<void>, fallbackMessage: string) => {
    setSubcontractActionId(id);
    setSubcontractActionError(null);
    try {
      await action();
    } catch (error) {
      setSubcontractActionError(error instanceof Error ? error.message : fallbackMessage);
      throw error;
    } finally {
      setSubcontractActionId(null);
    }
  };

  const runSubcontractRowAction = (id: string, action: () => Promise<void>, fallbackMessage: string) => {
    void runSubcontractAction(id, action, fallbackMessage).catch(() => undefined);
  };

  // Purchase Order KPI Metrics
  const activeCommittedPurchaseOrderTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const po of filteredOrders) {
      if (!isCommittedPurchaseOrder(po.status)) continue;
      const currency = String(po.currency || "PHP").trim().toUpperCase();
      totals.set(currency, (totals.get(currency) || 0) + purchaseOrderTotal(po));
    }
    return [...totals.entries()].map(([currency, amount]) => [currency, Math.round(amount * 100) / 100] as const);
  }, [filteredOrders]);

  const poCounts = useMemo(() => {
    let draft = 0;
    let approved = 0;
    let issued = 0;
    let closed = 0;
    let cancelled = 0;
    for (const po of filteredOrders) {
      if (po.status === "DRAFT") draft++;
      else if (po.status === "APPROVED") approved++;
      else if (po.status === "ISSUED") issued++;
      else if (po.status === "CLOSED") closed++;
      else if (po.status === "CANCELLED") cancelled++;
    }
    return { draft, approved, issued, closed, cancelled, total: filteredOrders.length };
  }, [filteredOrders]);

  // RFQ KPI Metrics
  const rfqCounts = useMemo(() => {
    let draft = 0;
    let issued = 0;
    let closed = 0;
    let cancelled = 0;
    let decided = 0;
    let totalQuotes = 0;

    for (const rfq of filteredRfqs) {
      if (rfq.status === "DRAFT") draft++;
      else if (rfq.status === "ISSUED") issued++;
      else if (rfq.status === "CLOSED") closed++;
      else if (rfq.status === "CANCELLED") cancelled++;

      if (rfq.selectedQuotationId) decided++;

      const quotes = quotationsByRfqId.get(rfq.id) || [];
      totalQuotes += quotes.length;
    }

    return {
      draft,
      issued,
      closed,
      cancelled,
      decided,
      total: filteredRfqs.length,
      totalQuotes,
    };
  }, [filteredRfqs, quotationsByRfqId]);

  const selectedProject = selectedProjectId ? projectMap.get(selectedProjectId) : undefined;

  // RFQ CRUD Action Handlers
  const handleSaveRFQInternal = async (
    rfqData: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
    expectedUpdatedAt?: string,
  ) => {
    if (onSaveRFQ) {
      await onSaveRFQ(rfqData, lines, invitedVendorIds, expectedUpdatedAt);
    }
    // Optimistic / Local update
    setLocalRfqs((prev) => {
      if (rfqData.id) {
        return prev.map((item) =>
          item.id === rfqData.id
            ? {
                ...item,
                ...rfqData,
                invitedVendorIds: invitedVendorIds || item.invitedVendorIds,
                lines: lines.map((l, idx) => ({
                  id: l.id || `local-rfq-line-${Date.now()}-${idx}`,
                  rfqId: item.id,
                  lineNumber: idx + 1,
                  description: l.description,
                  quantity: l.quantity,
                  unit: l.unit || "pcs",
                  projectCostCodeId: l.projectCostCodeId || null,
                  requestedDeliveryDate: l.requestedDeliveryDate || null,
                  notes: l.notes || null,
                })),
                updatedAt: new Date().toISOString(),
              }
            : item,
        );
      } else {
        const newId = `rfq-${Date.now()}`;
        const createdRFQ: RFQ = {
          id: newId,
          rfqNumber: rfqData.rfqNumber,
          title: rfqData.title,
          description: rfqData.description || null,
          projectId: rfqData.projectId || null,
          currency: rfqData.currency || "PHP",
          status: "DRAFT",
          issueDate: rfqData.issueDate || null,
          dueDate: rfqData.dueDate || null,
          notes: rfqData.notes || null,
          invitedVendorIds: invitedVendorIds || [],
          lines: lines.map((l, idx) => ({
            id: `line-${newId}-${idx + 1}`,
            rfqId: newId,
            lineNumber: idx + 1,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit || "pcs",
            projectCostCodeId: l.projectCostCodeId || null,
            requestedDeliveryDate: l.requestedDeliveryDate || null,
            notes: l.notes || null,
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [createdRFQ, ...prev];
      }
    });
  };

  const handleTransitionRFQInternal = async (id: string, targetStatus: RFQStatus, reason?: string) => {
    if (onTransitionRFQ) {
      await onTransitionRFQ(id, targetStatus, reason);
    }
    setLocalRfqs((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: targetStatus,
              cancellationReason: targetStatus === "CANCELLED" ? reason || null : r.cancellationReason,
              updatedAt: new Date().toISOString(),
            }
          : r,
      ),
    );
  };

  const handleSaveSupplierQuotationInternal = async (
    quoteData: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => {
    if (onSaveSupplierQuotation) {
      await onSaveSupplierQuotation(quoteData, lines);
    }
    setLocalQuotations((prev) => {
      if (quoteData.id) {
        return prev.map((q) =>
          q.id === quoteData.id
            ? {
                ...q,
                ...quoteData,
                lines: lines.map((l, idx) => ({
                  id: l.id || `quote-line-${Date.now()}-${idx}`,
                  quotationId: q.id,
                  rfqLineId: l.rfqLineId || null,
                  lineNumber: idx + 1,
                  description: l.description,
                  quantity: l.quantity,
                  unit: l.unit || "pcs",
                  unitPrice: l.unitPrice,
                  amount: l.amount || Math.round(l.quantity * l.unitPrice * 100) / 100,
                  leadTimeDays: l.leadTimeDays || null,
                  isNoBid: Boolean(l.isNoBid),
                  notes: l.notes || null,
                })),
                updatedAt: new Date().toISOString(),
              }
            : q,
        );
      } else {
        const newId = `quote-${Date.now()}`;
        const newQuote: SupplierQuotation = {
          id: newId,
          rfqId: quoteData.rfqId,
          vendorId: quoteData.vendorId,
          quotationNumber: quoteData.quotationNumber,
          quotationDate: quoteData.quotationDate || new Date().toISOString().split("T")[0],
          validUntil: quoteData.validUntil || null,
          currency: quoteData.currency || "PHP",
          paymentTerms: quoteData.paymentTerms || null,
          deliveryTerms: quoteData.deliveryTerms || null,
          leadTimeDays: quoteData.leadTimeDays || null,
          notes: quoteData.notes || null,
          totalAmount: quoteData.totalAmount || 0,
          status: "SUBMITTED",
          lines: lines.map((l, idx) => ({
            id: `line-${newId}-${idx + 1}`,
            quotationId: newId,
            rfqLineId: l.rfqLineId || null,
            lineNumber: idx + 1,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit || "pcs",
            unitPrice: l.unitPrice,
            amount: l.amount || Math.round(l.quantity * l.unitPrice * 100) / 100,
            leadTimeDays: l.leadTimeDays || null,
            isNoBid: Boolean(l.isNoBid),
            notes: l.notes || null,
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [...prev, newQuote];
      }
    });
  };

  const handleSelectQuotationInternal = async (quotationId: string, reason: string) => {
    if (onSelectSupplierQuotation) {
      await onSelectSupplierQuotation(quotationId, reason);
    }
    const targetQuote = localQuotations.find((q) => q.id === quotationId);
    if (!targetQuote) return;

    // Update quote status
    setLocalQuotations((prev) =>
      prev.map((q) => {
        if (q.rfqId === targetQuote.rfqId) {
          if (q.id === quotationId) {
            return {
              ...q,
              status: "SELECTED",
              selectedAt: new Date().toISOString(),
              selectionReason: reason,
              updatedAt: new Date().toISOString(),
            };
          } else if (q.status === "SELECTED") {
            return {
              ...q,
              status: "SUBMITTED",
              deselectedAt: new Date().toISOString(),
              deselectionReason: `Replaced by quotation ${targetQuote.quotationNumber}`,
              updatedAt: new Date().toISOString(),
            };
          }
        }
        return q;
      }),
    );

    // Update RFQ pointer
    setLocalRfqs((prev) =>
      prev.map((r) => (r.id === targetQuote.rfqId ? { ...r, selectedQuotationId: quotationId } : r)),
    );
  };

  const handleRevertSelectionInternal = async (rfqId: string, reason: string) => {
    if (onRevertSupplierQuotationSelection) {
      await onRevertSupplierQuotationSelection(rfqId, reason);
    }
    setLocalQuotations((prev) =>
      prev.map((q) =>
        q.rfqId === rfqId && q.status === "SELECTED"
          ? {
              ...q,
              status: "SUBMITTED",
              deselectedAt: new Date().toISOString(),
              deselectionReason: reason,
              updatedAt: new Date().toISOString(),
            }
          : q,
      ),
    );
    setLocalRfqs((prev) =>
      prev.map((r) => (r.id === rfqId ? { ...r, selectedQuotationId: null } : r)),
    );
  };

  const handleConvertToPOInternal = async (quotationId: string, poNum: string, poNotesText?: string) => {
    if (onConvertQuotationToPO) {
      await onConvertQuotationToPO(quotationId, poNum, poNotesText);
      return;
    }

    // Fallback: use onSavePO
    const targetQuote = localQuotations.find((q) => q.id === quotationId);
    if (!targetQuote) return;
    const parentRfq = localRfqs.find((r) => r.id === targetQuote.rfqId);

    const poLines = (targetQuote.lines || [])
      .filter((l) => !l.isNoBid && l.quantity > 0)
      .map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unit: l.unit,
        amount: l.amount,
      }));

    await onSavePO(
      {
        poNumber: poNum,
        vendorId: targetQuote.vendorId,
        projectId: parentRfq?.projectId || projects[0]?.id || "",
        currency: targetQuote.currency,
        status: "DRAFT",
        description: `Generated from RFQ ${parentRfq?.rfqNumber || ""} / Quotation ${targetQuote.quotationNumber}`,
        notes: poNotesText || targetQuote.notes || null,
        rfqId: parentRfq?.id || null,
        supplierQuotationId: targetQuote.id,
      },
      poLines,
    );
  };

  if (!canRead) {
    return (
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900">
        Procurement records are not available for your current permission set.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {requestedContextUnavailable && <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
        <p className="font-black">The requested purchase order or receipt is unavailable.</p>
        <p className="mt-1">It may have been archived, removed from this company workspace, or is no longer accessible with the current permissions. No alternate record was selected.</p>
        {initialReturnPath && <a href={initialReturnPath} onClick={(event) => { if (!onNavigatePath) return; event.preventDefault(); onNavigatePath(initialReturnPath); }} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-white px-3 py-2 font-black text-amber-900 shadow-sm">Return to previous workspace</a>}
      </section>}
      {receiptContinuation && continuationPath && <section role="status" className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-black">Goods receipt {receiptContinuation.receipt.receiptNumber} recorded.</p><p className="mt-1">Warehouse posting remains a separate explicit movement. Continue with the exact receipt context{continuationMovement ? " or persisted movement" : ""}.</p></div>
        <a href={continuationPath} onClick={(event) => { if (!onNavigatePath) return; event.preventDefault(); onNavigatePath(continuationPath); }} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 font-black text-white hover:bg-emerald-800">{continuationMovement ? "Open exact Warehouse movement" : "Continue to Warehouse"}</a>
      </section>}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          eyebrow={selectedProject ? `Project Controls • ${selectedProject.projectCode}` : "Commercial Operations"}
          title={
            activeTab === "rfqs"
              ? selectedProject
                ? `${selectedProject.projectName} RFQs & Quotations`
                : "Requests for Quotation & Comparison"
              : activeTab === "subcontracts"
              ? selectedProject
                ? `${selectedProject.projectName} Subcontracts`
                : "Trade Subcontracts & Commitments"
              : selectedProject
              ? `${selectedProject.projectName} Procurement`
              : "Procurement & Purchase Orders"
          }
          description={
            activeTab === "rfqs"
              ? "Compare supplier bids and record the selection before creating a Purchase Order."
              : activeTab === "subcontracts"
              ? "Manage trade subcontract commitments and cost-code links."
              : "Manage supplier commitments and committed cost; actual cost stays separate."
          }
        />
        {canManage && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {activeTab === "rfqs" ? (
              <button
                type="button"
                onClick={() => setActiveRfqModal(null)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                New RFQ
              </button>
            ) : activeTab === "subcontracts" ? (
              <button
                type="button"
                onClick={() => setActiveSubcontractModal(null)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                New Subcontract
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActivePo(null)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                New Purchase Order
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sub-Tabs: [Purchase Orders] [Requests for Quotation (RFQs)] [Subcontracts] */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab("purchase_orders");
            setStatusFilter("ALL");
          }}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "purchase_orders"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Purchase Orders
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              activeTab === "purchase_orders" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {filteredOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("rfqs");
            setStatusFilter("ALL");
          }}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "rfqs"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="h-4 w-4" />
          Requests for Quotation (RFQs)
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              activeTab === "rfqs" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {filteredRfqs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("subcontracts");
            setStatusFilter("ALL");
          }}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "subcontracts"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Subcontracts
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              activeTab === "subcontracts" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {filteredSubcontracts.length}
          </span>
        </button>
      </div>

      {activeTab === "purchase_orders" && (
        <PurchaseOrderRegisterSection
          filteredOrders={filteredOrders}
          activeCommittedPurchaseOrderTotals={activeCommittedPurchaseOrderTotals}
          poCounts={poCounts}
          poProgressMap={poProgressMap}
          vendorMap={vendorMap}
          projectMap={projectMap}
          projects={projects}
          selectedProjectId={selectedProjectId}
          query={query}
          projectFilter={projectFilter}
          statusFilter={statusFilter}
          deliveryFilter={deliveryFilter}
          onQueryChange={setQuery}
          onProjectFilterChange={setProjectFilter}
          onStatusFilterChange={setStatusFilter}
          onDeliveryFilterChange={setDeliveryFilter}
          onPreviewPo={(po) => setPreviewPo(po)}
          onOpenPo={(po) => setActivePo(po)}
        />
      )}

      {activeTab === "rfqs" && (
        <RfqRegisterSection
          filteredRfqs={filteredRfqs}
          rfqCounts={rfqCounts}
          quotationsByRfqId={quotationsByRfqId}
          vendorMap={vendorMap}
          projectMap={projectMap}
          projects={projects}
          selectedProjectId={selectedProjectId}
          query={query}
          projectFilter={projectFilter}
          statusFilter={statusFilter}
          canManage={canManage}
          onQueryChange={setQuery}
          onProjectFilterChange={setProjectFilter}
          onStatusFilterChange={setStatusFilter}
          onCreateRfq={() => setActiveRfqModal(null)}
          onCompareRfq={(rfq) => setActiveComparisonRfq(rfq)}
          onAddQuotation={(rfq) => {
            setActiveQuotationRfq(rfq);
            setEditingQuotation(null);
          }}
          onEditRfq={(rfq) => setActiveRfqModal(rfq)}
          onIssueRfq={(rfq) => void handleTransitionRFQInternal(rfq.id, "ISSUED")}
          onCancelRfq={(rfq) => {
            setCancellationRfq(rfq);
            setCancellationReason("");
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: SUBCONTRACTS TAB */}
      {activeTab === "subcontracts" && (
        <SubcontractRegisterSection
          rows={subcontractRegisterRows}
          counts={subcontractRegisterCounts}
          activeCommittedSubcontractTotals={activeCommittedSubcontractTotals}
          certifiedSubcontractTotals={certifiedSubcontractTotals}
          retentionHeldTotals={retentionHeldTotals}
          projects={projects}
          selectedProjectId={selectedProjectId}
          query={query}
          projectFilter={projectFilter}
          statusFilter={statusFilter}
          canManage={canManage}
          canApprove={canApprove}
          subcontractActionId={subcontractActionId}
          subcontractActionError={subcontractActionError}
          onQueryChange={setQuery}
          onProjectFilterChange={setProjectFilter}
          onStatusFilterChange={setStatusFilter}
          onCreateSubcontract={() => setActiveSubcontractModal(null)}
          onOpenVariations={(subcontract) => setVariationsDrawerSubcontract(subcontract)}
          onOpenClaims={(subcontract) => setClaimsDrawerSubcontract(subcontract)}
          onOpenSubcontract={(subcontract) => setActiveSubcontractModal(subcontract)}
          onApproveSubcontract={(subcontract) => runSubcontractRowAction(subcontract.id, () => handleTransitionSubcontractInternal(subcontract.id, "APPROVED"), "Could not approve subcontract.")}
          onActivateSubcontract={(subcontract) => runSubcontractRowAction(subcontract.id, () => handleTransitionSubcontractInternal(subcontract.id, "ACTIVE"), "Could not activate subcontract.")}
          onCloseSubcontract={(subcontract) => runSubcontractRowAction(subcontract.id, () => handleTransitionSubcontractInternal(subcontract.id, "CLOSED"), "Could not close subcontract.")}
          onCancelSubcontract={(subcontract) => {
            setSubcontractActionError(null);
            setCancellationSubcontract(subcontract);
          }}
          onDeleteDraftSubcontract={(subcontract) => runSubcontractRowAction(subcontract.id, () => handleDeleteSubcontractInternal(subcontract.id), "Could not delete draft subcontract.")}
        />
      )}

      {activeTab !== "subcontracts" && <ProcurementWorkbookPanel
        rfqs={localRfqs}
        purchaseOrders={purchaseOrders}
        projects={projects}
        vendors={vendors}
        canManage={Boolean(canManage)}
        onSaveRFQ={handleSaveRFQInternal}
        onSavePurchaseOrder={onSavePO}
        onRefreshProcurement={onRefreshProcurement}
      />}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* 1. Purchase Order Editor Modal */}
      {activePo !== undefined && (
        <PurchaseOrderEditorModal
          open={true}
          purchaseOrder={activePo}
          receipts={receipts}
          projects={projects}
          vendors={vendors}
          costCodes={costCodes}
          defaultProjectId={selectedProjectId}
          canApprove={canApprove}
          canManage={canManage}
          matches={matches}
          invoices={invoices}
          onSave={onSavePO}
          onTransition={onTransitionPO}
          onDelete={onDeletePO}
          initialReceiptId={initialReceiptId}
          onRecordReceipt={handleRecordReceiptInternal}
          onVoidReceipt={onVoidReceipt}
          onClose={() => setActivePo(undefined)}
          onAddVendor={onAddVendor}
          onOpenInvoice={onOpenInvoice}
        />
      )}

      {previewPo && <DocumentPreviewModal document={buildPurchaseOrderDocumentSnapshot(previewPo, vendorMap.get(previewPo.vendorId), projectMap.get(previewPo.projectId), DEFAULT_COMPANY_DOCUMENT_PROFILE)} onClose={() => setPreviewPo(null)} onOpenCommunications={() => { setPreviewPo(null); onNavigatePath?.(appPathForEmailWorkspace("compose", { documentType: "PURCHASE_ORDER", documentId: previewPo.id, returnTo: appPathForPurchaseOrder(previewPo.id) })); }} />}

      {/* 2. RFQ Editor Modal */}
      {activeRfqModal !== undefined && (
        <RFQEditorModal
          open={true}
          rfq={activeRfqModal}
          projects={projects}
          vendors={vendors}
          costCodes={costCodes}
          defaultProjectId={selectedProjectId}
          onSave={handleSaveRFQInternal}
          onClose={() => setActiveRfqModal(undefined)}
        />
      )}

      {/* 3. Supplier Quotation Modal */}
      {activeQuotationRfq && (
        <SupplierQuotationModal
          open={true}
          rfq={activeQuotationRfq}
          quotation={editingQuotation}
          vendors={vendors}
          onSave={handleSaveSupplierQuotationInternal}
          onClose={() => {
            setActiveQuotationRfq(null);
            setEditingQuotation(null);
          }}
        />
      )}

      {/* 4. RFQ Comparison Modal */}
      {activeComparisonRfq && (
        <RFQComparisonModal
          open={true}
          rfq={activeComparisonRfq}
          quotations={quotationsByRfqId.get(activeComparisonRfq.id) || []}
          vendors={vendors}
          canManage={canManage}
          onSelectQuotation={handleSelectQuotationInternal}
          onRevertSelection={handleRevertSelectionInternal}
          onConvertToPO={handleConvertToPOInternal}
          onAddQuote={() => {
            setActiveQuotationRfq(activeComparisonRfq);
            setEditingQuotation(null);
          }}
          onEditQuote={(q) => {
            setActiveQuotationRfq(activeComparisonRfq);
            setEditingQuotation(q);
          }}
          onClose={() => setActiveComparisonRfq(null)}
        />
      )}

      {/* 5. RFQ Cancellation Modal */}
      {cancellationRfq && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cancel Request for Quotation</h3>
                <p className="text-xs text-slate-500">{cancellationRfq.rfqNumber} — {cancellationRfq.title}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Cancellation <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="State the commercial or project reason for cancelling this RFQ..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancellationRfq(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!cancellationReason.trim()}
                onClick={async () => {
                  await handleTransitionRFQInternal(cancellationRfq.id, "CANCELLED", cancellationReason.trim());
                  setCancellationRfq(null);
                }}
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Subcontract Editor Modal */}
      {activeSubcontractModal !== undefined && (
        <SubcontractEditorModal
          isOpen={true}
          onClose={() => setActiveSubcontractModal(undefined)}
          subcontract={activeSubcontractModal}
          projects={projects}
          vendors={vendors}
          costCodes={costCodes}
          selectedProjectId={selectedProjectId}
          canManage={canManage}
          onSave={handleSaveSubcontractInternal}
        />
      )}

      {/* 7. Subcontract Cancellation Modal */}
      {cancellationSubcontract && (
        <SubcontractCancellationModal
          isOpen={true}
          onClose={() => setCancellationSubcontract(null)}
          subcontract={cancellationSubcontract}
          onConfirm={async (id, reason) => {
            await runSubcontractAction(
              id,
              () => handleTransitionSubcontractInternal(id, "CANCELLED", reason),
              "Could not cancel subcontract.",
            );
          }}
        />
      )}

      {/* 8. Subcontract Claims Register Drawer */}
      {claimsDrawerSubcontract && (
        <SubcontractClaimsDrawer
          isOpen={true}
          onClose={() => setClaimsDrawerSubcontract(null)}
          subcontract={claimsDrawerSubcontract}
          claims={localClaims}
          variations={localVariations}
          project={projectMap.get(claimsDrawerSubcontract.projectId)}
          vendor={vendorMap.get(claimsDrawerSubcontract.vendorId)}
          canManage={canManage}
          canApprove={canApprove}
          onCreateClaim={() => setActiveClaimModal(null)}
          onEditClaim={(c) => setActiveClaimModal(c)}
          onDeleteDraftClaim={handleDeleteClaimInternal}
          onTransitionClaim={handleTransitionClaimInternal}
        />
      )}

      {/* 9. Subcontract Claim Editor Modal */}
      {activeClaimModal !== undefined && claimsDrawerSubcontract && (
        <SubcontractClaimEditorModal
          isOpen={true}
          onClose={() => setActiveClaimModal(undefined)}
          claim={activeClaimModal}
          subcontract={claimsDrawerSubcontract}
          project={projectMap.get(claimsDrawerSubcontract.projectId)}
          vendor={vendorMap.get(claimsDrawerSubcontract.vendorId)}
          existingClaims={localClaims}
          existingVariations={localVariations}
          canManage={canManage}
          canApprove={canApprove}
          onNavigatePath={onNavigatePath}
          onSave={handleSaveClaimInternal}
          onTransition={handleTransitionClaimInternal}
        />
      )}

      {/* 10. Subcontract Variations Register Drawer */}
      {variationsDrawerSubcontract && (
        <SubcontractVariationsDrawer
          isOpen={true}
          onClose={() => setVariationsDrawerSubcontract(null)}
          subcontract={variationsDrawerSubcontract}
          variations={localVariations}
          claims={localClaims}
          project={projectMap.get(variationsDrawerSubcontract.projectId)}
          vendor={vendorMap.get(variationsDrawerSubcontract.vendorId)}
          projectCostCodes={costCodes}
          canManage={canManage}
          canApprove={canApprove}
          onCreateVariation={() => setActiveVariationModal(null)}
          onViewVariation={(v) => setActiveVariationDetailModal(v)}
          onEditVariation={(v) => setActiveVariationModal(v)}
          onDeleteDraftVariation={handleDeleteDraftVariationInternal}
          onTransitionVariation={handleTransitionVariationInternal}
        />
      )}

      {/* 11. Subcontract Variation Editor Modal */}
      {activeVariationModal !== undefined && variationsDrawerSubcontract && (
        <SubcontractVariationModal
          isOpen={true}
          onClose={() => setActiveVariationModal(undefined)}
          variation={activeVariationModal}
          subcontract={variationsDrawerSubcontract}
          project={projectMap.get(variationsDrawerSubcontract.projectId)}
          vendor={vendorMap.get(variationsDrawerSubcontract.vendorId)}
          existingVariations={localVariations}
          existingClaims={localClaims}
          projectCostCodes={costCodes}
          canManage={canManage}
          canApprove={canApprove}
          onSave={handleSaveVariationInternal}
          onTransition={handleTransitionVariationInternal}
        />
      )}

      {/* 12. Subcontract Variation Detail Modal */}
      {activeVariationDetailModal && (
        <SubcontractVariationDetailModal
          isOpen={true}
          onClose={() => setActiveVariationDetailModal(null)}
          variation={activeVariationDetailModal}
          subcontract={
            localSubcontracts.find((s) => s.id === activeVariationDetailModal.subcontractId) ||
            variationsDrawerSubcontract!
          }
          project={projectMap.get(activeVariationDetailModal.projectId)}
          vendor={
            vendorMap.get(
              (
                localSubcontracts.find((s) => s.id === activeVariationDetailModal.subcontractId) ||
                variationsDrawerSubcontract
              )?.vendorId || "",
            )
          }
          projectCostCodes={costCodes}
          existingVariations={localVariations}
          existingClaims={localClaims}
          canManage={canManage}
          canApprove={canApprove}
          onEdit={(v) => {
            const sc = localSubcontracts.find((s) => s.id === v.subcontractId);
            if (sc) setVariationsDrawerSubcontract(sc);
            setActiveVariationModal(v);
          }}
          onTransition={handleTransitionVariationInternal}
          onDeleteDraft={handleDeleteDraftVariationInternal}
        />
      )}
    </div>
  );
};
