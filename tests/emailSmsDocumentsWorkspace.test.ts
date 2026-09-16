import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDocumentRegister } from "../src/lib/documentRegister.ts";
import { emailWorkspaceContextFromSearch, appPathForEmailWorkspace } from "../src/utils/appRouting.ts";
import { canAccessAppTab, PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import { getSmsProviderStatus, resolveSmsProvider } from "../src/server/messaging/smsProvider.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = source("src/app/routes/EmailSmsRoute.tsx");
const documentsRoute = source("src/app/routes/DocumentsRoute.tsx");
const compose = source("src/components/EmailComposePanel.tsx");
const providerStatus = source("src/components/EmailProviderStatusPanel.tsx");
const history = source("src/components/CommunicationHistoryPanel.tsx");
const sms = source("src/components/SmsProviderStatusPanel.tsx");

test("Documents remains a permission-scoped projection over authoritative records", () => {
  const entries = buildDocumentRegister({
    projects: [{ id: "project-1", projectCode: "P-1", projectName: "Warehouse", clientName: "Client", status: "ACTIVE", projectBudget: 100, currency: "PHP", createdAt: "2026-09-01", updatedAt: "2026-09-01" }],
    vendors: [{ id: "vendor-1", name: "Supplier", normalizedName: "supplier", email: "supplier@example.test" }],
    purchaseOrders: [{ id: "po-1", poNumber: "PO-1", vendorId: "vendor-1", projectId: "project-1", currency: "PHP", status: "ISSUED", totalAmount: 100, lines: [] }],
    clientBillings: [{ id: "billing-1", projectId: "project-1", billingNumber: "INV-1", billingDate: "2026-09-02", currency: "PHP", status: "ISSUED", lines: [], createdAt: "2026-09-02", updatedAt: "2026-09-02", billingEmail: "client@example.test" } as any],
    invoices: [{ id: "supplier-1", invoiceNumber: "SI-1", invoiceDate: "2026-09-03", currency: "PHP", vendor: { name: "Supplier" }, customer: { name: "Company" }, items: [], subtotal: 10, totalTax: 0, grandTotal: 10, extractedAt: "2026-09-03", modelUsed: "test", sourceDocumentId: "source-1" } as any],
    expenses: [{ id: "expense-1", expenseDate: "2026-09-04", category: "Meals", description: "Receipt", payee: "Supplier", amount: 5, currency: "PHP", status: "APPROVED", receiptSourceDocumentId: "source-2", createdAt: "2026-09-04", updatedAt: "2026-09-04" }],
    visibility: { invoices: true, projects: true, procurement: true, expenses: true, cash: false, engineering: false },
  });
  assert.equal(entries.length, 4);
  assert.equal(entries.filter((entry) => entry.emailEligible).length, 2);
  assert.equal(entries.find((entry) => entry.id === "po:po-1")?.counterpartyEmail, "supplier@example.test");
});

test("Email / SMS preserves exact Documents handoff and permission boundaries", () => {
  const path = appPathForEmailWorkspace("compose", { documentType: "CLIENT_INVOICE", documentId: "billing-1", returnTo: "/documents" });
  assert.equal(path, "/email-sms?view=compose&documentType=CLIENT_INVOICE&documentId=billing-1&from=%2Fdocuments");
  assert.deepEqual(emailWorkspaceContextFromSearch(path.split("?", 2)[1]), { view: "compose", documentType: "CLIENT_INVOICE", documentId: "billing-1", returnTo: "/documents" });
  assert.equal(canAccessAppTab("documents", [PERMISSION_KEYS.documentSend]), true);
  assert.equal(path.includes("Message"), false);
});

test("Email workspace exposes Compose, history, provider status, and unchanged SMS status", () => {
  assert.match(workspace, /<EmailComposePanel/);
  assert.match(workspace, /<CommunicationHistoryPanel/);
  assert.match(workspace, /<EmailProviderStatusPanel/);
  assert.match(workspace, /<SmsProviderStatusPanel/);
  assert.match(compose, /Confirm & Send/);
  assert.match(compose, /prepare an email draft/i);
  assert.match(providerStatus, /Brevo/);
  assert.match(history, /Accepted by provider/);
  assert.match(sms, /Company SIM Gateway/);
  assert.match(sms, /PhilSMS/);
});

test("SMS remains truthful and provider-neutral without configured credentials", () => {
  assert.equal(resolveSmsProvider({ SMS_PROVIDER: "twilio", SMS_API_KEY: "not-used" }), null);
  assert.deepEqual(getSmsProviderStatus({}), { status: "NOT_CONFIGURED" });
});

test("Documents keeps list/filter and owning-workflow language", () => {
  assert.match(documentsRoute, /Document filters/);
  assert.match(documentsRoute, /Open owning record/);
  assert.match(documentsRoute, /Document templates/);
});
