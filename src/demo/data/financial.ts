import type { Expense } from "../../types.ts";
import type { CashBankingWorkspaceData, FinancialAccount, FinancialBalanceSnapshot, FinancialTransaction } from "../../lib/cashBanking.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

export function createDemoExpenses(anchorDate: string): Expense[] {
  const rows: Array<[string, string | undefined, number, string, string, string, Expense["status"]]> = [
    ["01", DEMO_PROJECT_IDS.warehouse, 67_842.35, "Fuel", "Diesel for boom lift, generator, and site service vehicle", "PetroLink Service Station", "PAID"],
    ["02", DEMO_PROJECT_IDS.warehouse, 24_681.80, "Tolls & Transport", "Tolls and hauling route fees for steel deliveries", "Site Cash Fund", "PAID"],
    ["03", DEMO_PROJECT_IDS.warehouse, 91_550.25, "Equipment Repair", "Hydraulic hose and preventive repair for rented lifting equipment", "Allied Hydraulics Services", "APPROVED"],
    ["04", DEMO_PROJECT_IDS.warehouse, 38_915.40, "Testing & Inspection", "Concrete cylinder testing and weld visual inspection", "Metro Materials Laboratory", "PAID"],
    ["05", DEMO_PROJECT_IDS.warehouse, 18_264.70, "Site Supplies", "Marking paint, tarpaulins, grinding discs, and consumables", "QC Industrial Depot", "APPROVED"],
    ["06", DEMO_PROJECT_IDS.drainage, 73_420.15, "Hauling", "Spoils hauling and legal disposal fees", "Eastline Hauling Services", "PAID"],
    ["07", DEMO_PROJECT_IDS.drainage, 44_870.50, "Permits", "Road occupation, excavation, and traffic-management permit fees", "Local Permits & Fees", "PAID"],
    ["08", DEMO_PROJECT_IDS.drainage, 56_318.90, "Fuel", "Excavator, compactor, and dump-truck fuel", "PetroLink Service Station", "APPROVED"],
    ["09", DEMO_PROJECT_IDS.drainage, 22_640.00, "Crew Transportation", "Crew shuttle and night-shift transport", "TransitPro Van Rental", "DRAFT"],
    ["10", DEMO_PROJECT_IDS.solar, 112_875.60, "Fuel", "Earthmoving fleet fuel and water-truck operations", "South Luzon Fuel Depot", "PAID"],
    ["11", DEMO_PROJECT_IDS.solar, 86_445.35, "Accommodation", "Field crew accommodation near Laguna project site", "Makiling Business Inn", "APPROVED"],
    ["12", DEMO_PROJECT_IDS.solar, 41_280.90, "Small Tools", "Survey stakes, hand tools, laser accessories, and consumables", "Laguna Builders Mart", "PAID"],
    ["13", DEMO_PROJECT_IDS.solar, 64_725.10, "Testing & Inspection", "Soil density and concrete testing package", "GeoTest Philippines", "APPROVED"],
    ["14", DEMO_PROJECT_IDS.solar, 28_940.55, "Site Utilities", "Temporary power, water, and communications charges", "Site Utility Fund", "DRAFT"],
    ["15", DEMO_PROJECT_IDS.cebu, 52_480.25, "Permits", "Fit-out permit and final occupancy processing", "Cebu Local Permits", "PAID"],
    ["16", DEMO_PROJECT_IDS.cebu, 33_760.80, "Crew Transportation", "Project close-out travel and material transfers", "Cebu Transport Services", "PAID"],
    ["17", DEMO_PROJECT_IDS.cebu, 46_915.40, "Testing & Inspection", "Electrical insulation and plumbing pressure tests", "VisMin Technical Testing", "PAID"],
    ["18", undefined, 31_684.75, "General Operations", "Printing, courier, project-document reproduction, and office supplies", "Central Office Supplies", "APPROVED"],
  ];

  return rows.map(([id, projectId, amount, category, description, payee, status], index) => {
    const expenseDate = addDemoDays(anchorDate, -(8 + index * 5));
    return {
      id: `demo-expense-${id}`,
      projectId,
      expenseDate,
      category,
      description,
      payee,
      amount,
      currency: "PHP",
      paymentMethod: amount > 50_000 ? "Bank Transfer" : "Petty Cash / Reimbursement",
      referenceNumber: `EXP-${anchorDate.slice(0, 4)}-${String(index + 31).padStart(4, "0")}`,
      status,
      notes: projectId ? "Project direct cost in the client demo workspace." : "General operating cost outside a project.",
      createdAt: demoTimestamp(expenseDate, 15, 10),
      updatedAt: demoTimestamp(addDemoDays(expenseDate, 1), 9, 20),
    };
  });
}

export function createDemoCashBanking(anchorDate: string): CashBankingWorkspaceData {
  const accounts: FinancialAccount[] = [
    { id: "demo-account-bdo", companyId: DEMO_COMPANY_ID, accountType: "BANK", institutionCode: "BDO", institutionName: "BDO Unibank", displayName: "BDO Operating Account", maskedIdentifier: "•••• 4812", currency: "PHP", openingBalance: 4_860_000, openingBalanceDate: addDemoDays(anchorDate, -120), connectionType: "STATEMENT", active: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -180)), updatedAt: demoTimestamp(anchorDate) },
    { id: "demo-account-bpi", companyId: DEMO_COMPANY_ID, accountType: "BANK", institutionCode: "BPI", institutionName: "Bank of the Philippine Islands", displayName: "BPI Payroll Account", maskedIdentifier: "•••• 7734", currency: "PHP", openingBalance: 1_180_000, openingBalanceDate: addDemoDays(anchorDate, -120), connectionType: "STATEMENT", active: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -180)), updatedAt: demoTimestamp(anchorDate) },
    { id: "demo-account-petty", companyId: DEMO_COMPANY_ID, accountType: "CASH", institutionName: "Meridian Head Office", displayName: "Petty Cash", maskedIdentifier: "Cash Fund", currency: "PHP", openingBalance: 75_000, openingBalanceDate: addDemoDays(anchorDate, -120), connectionType: "MANUAL", active: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -180)), updatedAt: demoTimestamp(anchorDate) },
  ];

  const transactionSpecs: Array<[string, string, number, "CREDIT" | "DEBIT", number, string, string, FinancialTransaction["reconciliationStatus"]]> = [
    ["01", "demo-account-bdo", 26, "CREDIT", 2_750_000, "Progress billing receipt — Quezon City Warehouse Expansion", "NGL-PB-06", "MATCHED"],
    ["02", "demo-account-bdo", 22, "DEBIT", 1_487_360.40, "Metrosteel Supply Corp. — MS-260481", "MS-260481", "MATCHED"],
    ["03", "demo-account-bdo", 18, "CREDIT", 1_425_000, "Mobilization / progress receipt — Laguna Solar Facility", "SRP-PB-02", "MATCHED"],
    ["04", "demo-account-bdo", 15, "DEBIT", 682_340.20, "Metro Aggregates Trading — MAT-89336", "MAT-89336", "MATCHED"],
    ["05", "demo-account-bdo", 12, "DEBIT", 448_775.25, "Southline Equipment Rental — SER-76031", "SER-76031", "MATCHED"],
    ["06", "demo-account-bdo", 9, "CREDIT", 980_000, "Progress billing receipt — Pasig Drainage Rehabilitation", "RCE-PB-04", "MATCHED"],
    ["07", "demo-account-bdo", 7, "DEBIT", 570_000, "Partial payment — BuildMix Concrete Solutions", "BM-118204", "MATCHED"],
    ["08", "demo-account-bdo", 5, "DEBIT", 315_000, "Partial payment — Southline Equipment Rental / Solar", "SER-77940", "MATCHED"],
    ["09", "demo-account-bdo", 3, "DEBIT", 112_875.60, "South Luzon Fuel Depot — solar earthworks", "EXP-SOLAR-FUEL", "MATCHED"],
    ["10", "demo-account-bdo", 1, "DEBIT", 86_445.35, "Makiling Business Inn — field accommodation", "EXP-SOLAR-LODGE", "SUGGESTED"],
    ["11", "demo-account-bpi", 17, "CREDIT", 620_000, "Payroll funding transfer from operating account", "PAY-FUND-01", "MATCHED"],
    ["12", "demo-account-bpi", 14, "DEBIT", 241_886.50, "Weekly payroll disbursement", "PAY-RUN-08", "MATCHED"],
    ["13", "demo-account-bpi", 10, "DEBIT", 248_411.75, "Weekly payroll disbursement", "PAY-RUN-09", "MATCHED"],
    ["14", "demo-account-bpi", 7, "CREDIT", 540_000, "Payroll funding transfer from operating account", "PAY-FUND-02", "MATCHED"],
    ["15", "demo-account-bpi", 3, "DEBIT", 252_096.30, "Weekly payroll disbursement", "PAY-RUN-10", "MATCHED"],
    ["16", "demo-account-petty", 13, "DEBIT", 24_681.80, "Warehouse tolls and hauling route fees", "PC-118", "MATCHED"],
    ["17", "demo-account-petty", 8, "CREDIT", 50_000, "Petty cash replenishment", "PC-REPL-22", "MATCHED"],
    ["18", "demo-account-petty", 4, "DEBIT", 18_264.70, "Warehouse site supplies and consumables", "PC-124", "MATCHED"],
    ["19", "demo-account-petty", 2, "DEBIT", 31_684.75, "Office printing, courier, and supplies", "PC-127", "UNMATCHED"],
  ];

  const transactions: FinancialTransaction[] = transactionSpecs.map(([id, accountId, daysAgo, direction, amount, description, referenceNumber, reconciliationStatus]) => ({
    id: `demo-transaction-${id}`,
    companyId: DEMO_COMPANY_ID,
    accountId,
    transactionDate: addDemoDays(anchorDate, -daysAgo),
    postedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 11, Number(id) % 45),
    referenceNumber,
    description,
    direction,
    amount,
    currency: "PHP",
    status: "POSTED",
    source: accountId === "demo-account-petty" ? "MANUAL" : "XLSX",
    sourceFingerprint: `demo:${accountId}:${id}:${amount}`,
    reconciliationStatus,
    createdAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 13, 5),
    updatedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 13, 20),
  }));

  const snapshots: FinancialBalanceSnapshot[] = [
    { id: "demo-snapshot-bdo", companyId: DEMO_COMPANY_ID, accountId: "demo-account-bdo", capturedAt: demoTimestamp(anchorDate, 8, 0), ledgerBalance: 6_212_440.15, availableBalance: 6_187_440.15, pendingBalance: 25_000, source: "STATEMENT", createdAt: demoTimestamp(anchorDate, 8, 2) },
    { id: "demo-snapshot-bpi", companyId: DEMO_COMPANY_ID, accountId: "demo-account-bpi", capturedAt: demoTimestamp(anchorDate, 8, 0), ledgerBalance: 1_597_605.45, availableBalance: 1_597_605.45, pendingBalance: 0, source: "STATEMENT", createdAt: demoTimestamp(anchorDate, 8, 2) },
    { id: "demo-snapshot-petty", companyId: DEMO_COMPANY_ID, accountId: "demo-account-petty", capturedAt: demoTimestamp(anchorDate, 8, 0), ledgerBalance: 50_368.75, availableBalance: 50_368.75, pendingBalance: 0, source: "MANUAL", createdAt: demoTimestamp(anchorDate, 8, 2) },
  ];

  return { accounts, snapshots, transactions, importBatches: [], matches: [] };
}
