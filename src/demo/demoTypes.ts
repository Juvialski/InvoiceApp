import type { CashBankingWorkspaceData } from "../lib/cashBanking.ts";
import type { EngineeringCoordinationWorkspaceData } from "../lib/engineeringCoordination.ts";
import type { EngineeringDailySiteLogsWorkspaceData } from "../lib/dailySiteLogs.ts";
import type { EngineeringDocumentsWorkspaceData } from "../lib/engineeringDocuments.ts";
import type { PayrollWorkspaceData } from "../lib/payroll.ts";
import type { Expense, InvoiceData, InvoiceProjectAllocation, Project, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderReceipt, RFQ, SupplierQuotation, Vendor } from "../types.ts";

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
  projectPresentation: Record<string, DemoProjectPresentation>;
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  cash: CashBankingWorkspaceData;
  payroll: PayrollWorkspaceData;
  engineering: EngineeringDocumentsWorkspaceData;
  coordination: EngineeringCoordinationWorkspaceData;
  siteLogs: EngineeringDailySiteLogsWorkspaceData;
  vendors?: Vendor[];
  purchaseOrders?: PurchaseOrder[];
  purchaseOrderReceipts?: PurchaseOrderReceipt[];
  purchaseOrderMatches?: PurchaseOrderInvoiceMatch[];
  rfqs?: RFQ[];
  supplierQuotations?: SupplierQuotation[];
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
