import type { CashBankingWorkspaceData } from "../lib/cashBanking.ts";
import type { EngineeringCoordinationWorkspaceData } from "../lib/engineeringCoordination.ts";
import type { EngineeringDailySiteLogsWorkspaceData } from "../lib/dailySiteLogs.ts";
import type { EngineeringDocumentsWorkspaceData } from "../lib/engineeringDocuments.ts";
import type { PayrollWorkspaceData } from "../lib/payroll.ts";
import type { Expense, FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, Project, ProjectCostCode, ProjectEquipment, ProjectMaterial, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderReceipt, RFQ, Subcontract, SubcontractProgressClaim, SubcontractVariation, SupplierQuotation, Vendor } from "../types.ts";
import type { ClientBilling, ClientBillingEvent } from "../lib/clientBilling.ts";
import type { ClientCollection, ClientCollectionEvent } from "../lib/clientCollections.ts";

export const DEMO_COMPANY_ID = "demo-company-meridian" as const;
export const DEMO_STORAGE_KEY = "engoryx:client-demo:v1" as const;

export interface DemoCompany {
  id: typeof DEMO_COMPANY_ID;
  name: string;
  country: "Philippines";
  currency: "PHP";
  locale: "en-PH";
  timezone: "Asia/Manila";
  industry: string;
  registrationNumber: string;
  taxId: string;
  address: string;
}

export interface DemoProjectPresentation {
  progressPercent: number;
  presentationNote: string;
}

export interface DemoWorkspaceData {
  version: 1;
  anchorDate: string;
  company: DemoCompany;
  projects: Project[];
  costCodes?: ProjectCostCode[];
  projectPresentation: Record<string, DemoProjectPresentation>;
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  financialFxSnapshots: FinancialFxSnapshot[];
  cash: CashBankingWorkspaceData;
  payroll: PayrollWorkspaceData;
  engineering: EngineeringDocumentsWorkspaceData;
  coordination: EngineeringCoordinationWorkspaceData;
  siteLogs: EngineeringDailySiteLogsWorkspaceData;
  materials: ProjectMaterial[];
  equipment: ProjectEquipment[];
  vendors?: Vendor[];
  purchaseOrders?: PurchaseOrder[];
  purchaseOrderReceipts?: PurchaseOrderReceipt[];
  purchaseOrderMatches?: PurchaseOrderInvoiceMatch[];
  rfqs?: RFQ[];
  supplierQuotations?: SupplierQuotation[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  clientBillings?: ClientBilling[];
  clientBillingEvents?: ClientBillingEvent[];
  clientCollections?: ClientCollection[];
  clientCollectionEvents?: ClientCollectionEvent[];
}

export type DemoAssistantActionKind = "ADD_WORKER";

export interface DemoPreparedAssistantAction {
  id: string;
  status: "PREPARED";
  kind: DemoAssistantActionKind;
  summary: string;
  createdAt: string;
  payload: {
    firstName: string;
    lastName: string;
    displayName: string;
    employeeCode: string;
    jobTitle: string;
    payType: "HOURLY";
    rate: number;
  };
}
