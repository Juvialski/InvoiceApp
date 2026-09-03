import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Award,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileEdit,
  FileText,
  Filter,
  Layers,
  PackageCheck,
  Percent,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Truck,
  Users,
  X,
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
  calculateRevisedSubcontractValue,
} from "../../lib/subcontractVariations.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { isCommittedPurchaseOrder, isCommittedSubcontract, purchaseOrderTotal, subcontractTotal } from "../../utils/projectCosting.ts";
import { calculatePOReceiptProgress, type PODeliveryStatus } from "../../utils/purchaseOrderReceipts.ts";
import { EmptyState, PageHeader } from "../ui/OperationsUI.tsx";
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

export interface ProcurementPageProps {
  purchaseOrders: PurchaseOrder[];
  receipts?: readonly PurchaseOrderReceipt[];
  projects: Project[];
  vendors: Vendor[];
  costCodes: ProjectCostCode[];
  selectedProjectId?: string;
  initialTab?: "purchase_orders" | "rfqs" | "subcontracts";
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
  ) => Promise<void>;
  onTransitionPO: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  onDeletePO: (id: string) => Promise<void>;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => Promise<void>;
  onVoidReceipt?: (receiptId: string, reason: string) => Promise<void>;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  onOpenInvoice?: (invoiceId: string) => void;
  onSaveRFQ?: (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
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
    lines: Array<{ subcontractLineId: string; claimedAmount: number; notes?: string }>,
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

  const handleSaveClaimInternal = async (
    claim: Partial<SubcontractProgressClaim> & {
      subcontractId: string;
      projectId: string;
      claimNumber: string;
      valuationDate: string;
    },
    lines: Array<{ subcontractLineId: string; claimedAmount: number; notes?: string }>,
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
      const updated = applySubcontractTransition(current, targetStatus, reason);
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
  ) => {
    if (onSaveRFQ) {
      await onSaveRFQ(rfqData, lines, invitedVendorIds);
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
              ? "Solicit competitive supplier bids, evaluate line-item pricing side-by-side, and audit selection reasons before generating purchase orders."
              : activeTab === "subcontracts"
              ? "Manage specialized trade subcontract commitments, schedule milestones, and track committed liabilities linked to project cost codes."
              : "Manage supplier commitments, track purchase orders, and monitor committed cost obligations without distorting actual cost."
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
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab("purchase_orders");
            setStatusFilter("ALL");
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
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

      {/* ========================================================================= */}
      {/* VIEW 1: PURCHASE ORDERS TAB */}
      {/* ========================================================================= */}
      {activeTab === "purchase_orders" && (
        <>
          {/* PO KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-indigo-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Active Committed</span>
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">
                {activeCommittedPurchaseOrderTotals.length > 0 ? (
                  <div className="space-y-0.5">
                    {activeCommittedPurchaseOrderTotals.map(([currency, amount]) => (
                      <div key={currency}>{formatMoney(amount, currency)}</div>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Approved &amp; Issued orders; currencies shown separately</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{poCounts.total}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Across active filters</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-blue-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Approved / Issued</span>
                <FileCheck className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">
                {poCounts.approved + poCounts.issued}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {poCounts.approved} approved, {poCounts.issued} issued
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-amber-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">In Draft</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{poCounts.draft}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Not yet committed</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-emerald-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Closed</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{poCounts.closed}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Completed obligations</div>
            </div>
          </div>

          {/* PO Filters Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search PO #, supplier, project, description..."
                className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!selectedProjectId && (
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.projectName}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="ISSUED">Issued</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={deliveryFilter}
                onChange={(e) => setDeliveryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All Delivery States</option>
                <option value="NOT_RECEIVED">Pending Delivery (0%)</option>
                <option value="PARTIALLY_RECEIVED">Partially Delivered</option>
                <option value="FULLY_RECEIVED">Fully Delivered (100%)</option>
              </select>
            </div>
          </div>

          {/* PO Register Table */}
          {filteredOrders.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">PO Number</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Delivery Progress</th>
                      <th className="px-4 py-3">Supplier / Vendor</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Issue Date</th>
                      <th className="px-4 py-3 text-center">Items</th>
                      <th className="px-4 py-3 text-right">Committed Amount</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((po) => {
                      const vendor = vendorMap.get(po.vendorId);
                      const proj = projectMap.get(po.projectId);
                      const prog = poProgressMap.get(po.id);
                      return (
                        <tr
                          key={po.id}
                          onClick={() => setActivePo(po)}
                          className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">
                            {po.poNumber}
                            {po.description && (
                              <div className="font-sans font-normal text-[11px] text-slate-500 truncate max-w-xs">
                                {po.description}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                po.status === "APPROVED"
                                  ? "bg-blue-100 text-blue-800"
                                  : po.status === "ISSUED"
                                  ? "bg-purple-100 text-purple-800"
                                  : po.status === "CLOSED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : po.status === "CANCELLED"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {po.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {po.status === "ISSUED" || po.status === "CLOSED" ? (
                              <div className="space-y-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                    prog?.deliveryStatus === "FULLY_RECEIVED"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : prog?.deliveryStatus === "PARTIALLY_RECEIVED"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  <Truck className="h-3 w-3" />
                                  {prog?.deliveryStatus === "FULLY_RECEIVED"
                                    ? "Fully Delivered"
                                    : prog?.deliveryStatus === "PARTIALLY_RECEIVED"
                                    ? `${prog.overallProgressPercent}% Received`
                                    : "0% Delivered"}
                                </span>
                                {prog && prog.totalOrderedQuantity > 0 && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {prog.totalReceivedQuantity} / {prog.totalOrderedQuantity} units
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                {po.status === "DRAFT" ? "Draft" : po.status === "APPROVED" ? "Not issued" : "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{vendor?.name || "Unknown Vendor"}</div>
                            {vendor?.taxId && <div className="text-[10px] text-slate-400">TIN: {vendor.taxId}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{proj?.projectCode || "—"}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                              {proj?.projectName || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono">
                            {po.issueDate ? formatDate(po.issueDate, "short") : "—"}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-slate-600">
                            {po.lines?.length || 0}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            {formatMoney(po.totalAmount || 0, po.currency || "PHP")}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setActivePo(po)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-900 rounded-lg hover:bg-indigo-50 transition"
                            >
                              View / Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title={
                query || statusFilter !== "ALL" || projectFilter !== "ALL" || deliveryFilter !== "ALL"
                  ? "No purchase orders match your filter"
                  : "No purchase orders yet"
              }
              description="Create purchase orders to establish authoritative commitments for materials, equipment, and subcontracts."
            />
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: REQUESTS FOR QUOTATION (RFQS) TAB */}
      {/* ========================================================================= */}
      {activeTab === "rfqs" && (
        <>
          {/* RFQ KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total RFQs</span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.total}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Across active filters</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-amber-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">In Draft</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.draft}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Specifications in preparation</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-purple-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Issued (Out for Quote)</span>
                <FileCheck className="h-4 w-4 text-purple-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.issued}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Awaiting supplier quotes</div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-emerald-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Decided / Selected</span>
                <Award className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.decided}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Preferred supplier chosen</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-indigo-700 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Quotations</span>
                <Layers className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.totalQuotes}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Supplier bids received</div>
            </div>
          </div>

          {/* RFQ Filters Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search RFQ #, title, description, project..."
                className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!selectedProjectId && (
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.projectName}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="ISSUED">Issued (Out for Quote)</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {/* RFQ Register Table */}
          {filteredRfqs.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">RFQ Number</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3 text-center">Lines</th>
                      <th className="px-4 py-3">Invited Vendors</th>
                      <th className="px-4 py-3 text-center">Quotes</th>
                      <th className="px-4 py-3">Decision Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRfqs.map((rfq) => {
                      const proj = rfq.projectId ? projectMap.get(rfq.projectId) : undefined;
                      const quotes = quotationsByRfqId.get(rfq.id) || [];
                      const selectedQuoteItem = quotes.find(
                        (q) => q.id === rfq.selectedQuotationId || q.status === "SELECTED",
                      );
                      const selectedVendor = selectedQuoteItem ? vendorMap.get(selectedQuoteItem.vendorId) : undefined;
                      const invitedCount = rfq.invitedVendorIds?.length || rfq.invitedVendors?.length || 0;

                      return (
                        <tr
                          key={rfq.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          {/* RFQ Number & Title */}
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">
                            {rfq.rfqNumber}
                            <div className="font-sans font-medium text-[11px] text-slate-700 truncate max-w-xs mt-0.5">
                              {rfq.title}
                            </div>
                            {rfq.description && (
                              <div className="font-sans font-normal text-[10px] text-slate-400 truncate max-w-xs">
                                {rfq.description}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                rfq.status === "ISSUED"
                                  ? "bg-purple-100 text-purple-800"
                                  : rfq.status === "CLOSED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : rfq.status === "CANCELLED"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {rfq.status === "ISSUED" ? "ISSUED (OUT FOR QUOTE)" : rfq.status}
                            </span>
                          </td>

                          {/* Project */}
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{proj?.projectCode || "General"}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                              {proj?.projectName || "Unscoped"}
                            </div>
                          </td>

                          {/* Dates */}
                          <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                            {rfq.issueDate && (
                              <div>
                                <span className="text-[10px] text-slate-400">Issued: </span>
                                {formatDate(rfq.issueDate, "short")}
                              </div>
                            )}
                            {rfq.dueDate && (
                              <div className="text-slate-500">
                                <span className="text-[10px] text-slate-400">Due: </span>
                                {formatDate(rfq.dueDate, "short")}
                              </div>
                            )}
                            {!rfq.issueDate && !rfq.dueDate && <span className="text-slate-400 italic">—</span>}
                          </td>

                          {/* Line items count */}
                          <td className="px-4 py-3 text-center tabular-nums text-slate-700 font-semibold">
                            {rfq.lines?.length || 0}
                          </td>

                          {/* Invited vendors count */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-semibold">{invitedCount}</span>
                              <span className="text-[10px] text-slate-400">invited</span>
                            </div>
                          </td>

                          {/* Quotes count */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                quotes.length > 0
                                  ? "bg-indigo-100 text-indigo-800"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
                            </span>
                          </td>

                          {/* Decision Status */}
                          <td className="px-4 py-3">
                            {selectedQuoteItem ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                                  <Award className="h-3 w-3 text-emerald-600" />
                                  Selected: {selectedVendor?.name || "Supplier"}
                                </span>
                                <div className="text-[10px] font-mono text-slate-500">
                                  {formatMoney(selectedQuoteItem.totalAmount, selectedQuoteItem.currency)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Pending Decision</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Compare / View Quotes button */}
                              <button
                                type="button"
                                onClick={() => setActiveComparisonRfq(rfq)}
                                className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900 rounded-lg hover:bg-indigo-50 transition"
                              >
                                {quotes.length > 0 ? "View & Compare" : "Compare"}
                              </button>

                              {/* Add Quote button */}
                              {canManage && rfq.status !== "CANCELLED" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveQuotationRfq(rfq);
                                    setEditingQuotation(null);
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-purple-600 hover:text-purple-900 rounded-lg hover:bg-purple-50 transition"
                                >
                                  + Quote
                                </button>
                              )}

                              {/* Edit RFQ (if draft) */}
                              {canManage && rfq.status === "DRAFT" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setActiveRfqModal(rfq)}
                                    className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTransitionRFQInternal(rfq.id, "ISSUED")}
                                    className="px-2 py-1 text-xs font-semibold text-emerald-600 hover:text-emerald-900 rounded-lg hover:bg-emerald-50 transition"
                                  >
                                    Issue
                                  </button>
                                </>
                              )}

                              {/* Cancel RFQ */}
                              {canManage && rfq.status !== "CLOSED" && rfq.status !== "CANCELLED" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancellationRfq(rfq);
                                    setCancellationReason("");
                                  }}
                                  className="px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title={
                query || statusFilter !== "ALL" || projectFilter !== "ALL"
                  ? "No RFQs match your filter"
                  : "No Requests for Quotation yet"
              }
              description="Create an RFQ to specify required materials, invite vendors, and compare competitive bids side-by-side."
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setActiveRfqModal(null)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    New RFQ
                  </button>
                ) : undefined
              }
            />
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: SUBCONTRACTS TAB */}
      {/* ========================================================================= */}
      {activeTab === "subcontracts" && (
        <>
          {/* Subcontracts KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-indigo-600 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total Subcontracts
                </span>
                <Building2 className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums">
                {filteredSubcontracts.length}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">
                Registered trade packages
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-emerald-600 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Active Packages
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums">
                {filteredSubcontracts.filter((sc) => sc.status === "ACTIVE").length}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">
                In-progress commitments
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-emerald-600 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Certified Work
                </span>
                <FileCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-black text-emerald-700 tabular-nums">
                {certifiedSubcontractTotals.length > 0 ? (
                  <div className="space-y-0.5">
                    {certifiedSubcontractTotals.map(([currency, amount]) => (
                      <div key={currency}>{formatMoney(amount, currency)}</div>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">
                Approved progress claims
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-blue-600 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Remaining Commitment
                </span>
                <DollarSign className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums">
                {activeCommittedSubcontractTotals.length > 0 ? (
                  <div className="space-y-0.5">
                    {activeCommittedSubcontractTotals.map(([currency, amount]) => (
                      <div key={currency}>{formatMoney(amount, currency)}</div>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">
                Uncertified liability
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/50 to-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-amber-600 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Retention Held
                </span>
                <Percent className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-xl font-black text-amber-700 tabular-nums">
                {retentionHeldTotals.length > 0 ? (
                  <div className="space-y-0.5">
                    {retentionHeldTotals.map(([currency, amount]) => (
                      <div key={currency}>{formatMoney(amount, currency)}</div>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">
                Withheld retention
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/50 to-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-slate-600 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Drafts
                </span>
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums">
                {filteredSubcontracts.filter((sc) => sc.status === "DRAFT").length}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">
                Pending commercial review
              </div>
            </div>
          </div>

          {subcontractActionError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{subcontractActionError}</span>
            </div>
          )}

          {/* Subcontracts Filters Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search subcontract #, vendor, project, scope title..."
                className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!selectedProjectId && (
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.projectName}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="ACTIVE">Active Commitments</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Subcontracts Register Table */}
          {filteredSubcontracts.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Subcontract #</th>
                      <th scope="col" className="px-4 py-3">Vendor</th>
                      <th scope="col" className="px-4 py-3">Project</th>
                      <th scope="col" className="px-4 py-3">Scope Title</th>
                      <th scope="col" className="px-4 py-3 text-right">Contract Value</th>
                      <th scope="col" className="px-4 py-3 text-right">Certified Work</th>
                      <th scope="col" className="px-4 py-3 text-right">Remaining Commitment</th>
                      <th scope="col" className="px-4 py-3 text-center">Status</th>
                      <th scope="col" className="px-4 py-3">Schedule (Start - Target)</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubcontracts.map((sc) => {
                      const vendor = vendorMap.get(sc.vendorId);
                      const proj = projectMap.get(sc.projectId);
                      const scVariations = localVariations.filter((v) => v.subcontractId === sc.id);
                      const scMetrics = computeSubcontractClaimMetrics(sc, localClaims, localVariations);
                      const originalAmt = subcontractTotal(sc);
                      const revisedAmt = scMetrics.revisedSubcontractValue;
                      const isDraft = sc.status === "DRAFT";
                      const isApproved = sc.status === "APPROVED";
                      const isActive = sc.status === "ACTIVE";
                      const isTerminal = sc.status === "CLOSED" || sc.status === "CANCELLED";
                      const isBusy = subcontractActionId !== null;
                      const isApprovalReady = Boolean(sc.lines && sc.lines.length > 0) && subcontractTotal(sc) > 0;

                      return (
                        <tr key={sc.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Subcontract # */}
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">
                            {sc.subcontractNumber}
                            {sc.notes && (
                              <div className="font-sans font-normal text-[10px] text-slate-400 truncate max-w-xs mt-0.5">
                                {sc.notes}
                              </div>
                            )}
                          </td>

                          {/* Vendor */}
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {vendor?.name || sc.vendorId}
                          </td>

                          {/* Project */}
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{proj?.projectCode || "General"}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                              {proj?.projectName || "Unscoped"}
                            </div>
                          </td>

                          {/* Scope Title */}
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 max-w-xs">{sc.title}</div>
                            {sc.lines && sc.lines.length > 0 && (
                              <div className="text-[10px] text-slate-400">
                                {sc.lines.length} {sc.lines.length === 1 ? "line item" : "line items"}
                              </div>
                            )}
                          </td>

                          {/* Contract Value */}
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            <div>{formatMoney(revisedAmt, sc.currency || "PHP")}</div>
                            {scMetrics.netApprovedVariations !== 0 && (
                              <div className="text-[10px] text-purple-700 font-sans font-medium">
                                Orig: {formatMoney(originalAmt, sc.currency || "PHP")}{" "}
                                ({scMetrics.netApprovedVariations > 0 ? "+" : ""}
                                {formatMoney(scMetrics.netApprovedVariations, sc.currency || "PHP")})
                              </div>
                            )}
                          </td>

                          {/* Certified Work */}
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            {formatMoney(scMetrics.cumulativeApprovedGross, sc.currency || "PHP")}
                          </td>

                          {/* Remaining Commitment */}
                          <td className="px-4 py-3 text-right font-mono font-medium text-blue-700">
                            {formatMoney(scMetrics.remainingCommitment, sc.currency || "PHP")}
                          </td>

                          {/* Status Badge */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                sc.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : sc.status === "APPROVED"
                                  ? "bg-blue-100 text-blue-800"
                                  : sc.status === "CLOSED"
                                  ? "bg-slate-100 text-slate-700"
                                  : sc.status === "CANCELLED"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {sc.status}
                            </span>
                          </td>

                          {/* Schedule (Start - Target) */}
                          <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                            {sc.startDate || sc.targetCompletionDate ? (
                              <span>
                                {sc.startDate ? formatDate(sc.startDate, "short") : "—"} to{" "}
                                {sc.targetCompletionDate ? formatDate(sc.targetCompletionDate, "short") : "—"}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not scheduled</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Variations Register Drawer */}
                              <button
                                type="button"
                                onClick={() => setVariationsDrawerSubcontract(sc)}
                                disabled={isBusy}
                                className="rounded-lg border border-purple-200 bg-purple-50/70 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition shadow-xs flex items-center gap-1"
                                title={`Open variations register for ${sc.subcontractNumber}`}
                              >
                                <FileEdit className="h-3.5 w-3.5" />
                                <span>Variations ({scVariations.length})</span>
                              </button>

                              {/* Claims Register Drawer */}
                              <button
                                type="button"
                                onClick={() => setClaimsDrawerSubcontract(sc)}
                                disabled={isBusy}
                                className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-xs flex items-center gap-1"
                                title={`Open claims register for ${sc.subcontractNumber}`}
                              >
                                <FileCheck className="h-3.5 w-3.5" />
                                <span>Claims ({scMetrics.claimsCount})</span>
                              </button>

                              {/* View / Edit */}
                              <button
                                type="button"
                                onClick={() => setActiveSubcontractModal(sc)}
                                disabled={isBusy}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                              >
                                {isDraft && canManage ? "Edit" : "View"}
                              </button>

                              {/* Approve */}
                              {isDraft && canApprove && (
                                <button
                                  type="button"
                                  onClick={() => runSubcontractRowAction(sc.id, () => handleTransitionSubcontractInternal(sc.id, "APPROVED"), "Could not approve subcontract.")}
                                  disabled={isBusy || !isApprovalReady}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  title={isApprovalReady ? "Approve Subcontract" : "Add a positive scope line before approval"}
                                  aria-label={`Approve subcontract ${sc.subcontractNumber}`}
                                  aria-busy={subcontractActionId === sc.id || undefined}
                                >
                                  {subcontractActionId === sc.id ? "Working…" : "Approve"}
                                </button>
                              )}

                              {/* Activate */}
                              {isApproved && canApprove && (
                                <button
                                  type="button"
                                  onClick={() => runSubcontractRowAction(sc.id, () => handleTransitionSubcontractInternal(sc.id, "ACTIVE"), "Could not activate subcontract.")}
                                  disabled={isBusy}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Activate Commitment (requires procurement.approve)"
                                  aria-label={`Activate subcontract ${sc.subcontractNumber}`}
                                  aria-busy={subcontractActionId === sc.id || undefined}
                                >
                                  {subcontractActionId === sc.id ? "Working…" : "Activate"}
                                </button>
                              )}

                              {/* Close */}
                              {isActive && canApprove && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (typeof window !== "undefined" && !window.confirm(`Close subcontract ${sc.subcontractNumber}? It will become terminal and no longer contribute to committed cost.`)) return;
                                    runSubcontractRowAction(sc.id, () => handleTransitionSubcontractInternal(sc.id, "CLOSED"), "Could not close subcontract.");
                                  }}
                                  disabled={isBusy}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Close Subcontract (requires procurement.approve)"
                                  aria-label={`Close subcontract ${sc.subcontractNumber}`}
                                  aria-busy={subcontractActionId === sc.id || undefined}
                                >
                                  {subcontractActionId === sc.id ? "Working…" : "Close"}
                                </button>
                              )}

                              {/* Cancel */}
                              {!isTerminal && canApprove && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubcontractActionError(null);
                                    setCancellationSubcontract(sc);
                                  }}
                                  disabled={isBusy}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Cancel Subcontract (requires procurement.approve)"
                                  aria-label={`Cancel subcontract ${sc.subcontractNumber}`}
                                >
                                  Cancel
                                </button>
                              )}

                              {/* Delete */}
                              {isDraft && canManage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Delete draft subcontract ${sc.subcontractNumber}?`)) {
                                      runSubcontractRowAction(sc.id, () => handleDeleteSubcontractInternal(sc.id), "Could not delete draft subcontract.");
                                    }
                                  }}
                                  disabled={isBusy}
                                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Delete Draft"
                                  aria-label={`Delete draft subcontract ${sc.subcontractNumber}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Building2}
              title="No subcontracts found"
              description={
                query || statusFilter !== "ALL" || projectFilter !== "ALL"
                  ? "No subcontracts matched your current search filters."
                  : "No subcontract commitments have been established yet."
              }
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setActiveSubcontractModal(null)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Subcontract
                  </button>
                ) : undefined
              }
            />
          )}
        </>
      )}

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
          onRecordReceipt={onRecordReceipt}
          onVoidReceipt={onVoidReceipt}
          onClose={() => setActivePo(undefined)}
          onAddVendor={onAddVendor}
          onOpenInvoice={onOpenInvoice}
        />
      )}

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
