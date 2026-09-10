import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDocumentRegister } from "../src/lib/documentRegister.ts";
import { emailWorkspaceContextFromSearch, appPathForEmailWorkspace } from "../src/utils/appRouting.ts";
import { getSmsProviderStatus, resolveSmsProvider } from "../src/server/messaging/smsProvider.ts";

const workspace = readFileSync(new URL("../src/app/routes/EmailSmsRoute.tsx", import.meta.url), "utf8");
const documentsRoute = readFileSync(new URL("../src/app/routes/DocumentsRoute.tsx", import.meta.url), "utf8");
const compose = readFileSync(new URL("../src/components/EmailComposePanel.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/components/CommunicationHistoryPanel.tsx", import.meta.url), "utf8");
const sms = readFileSync(new URL("../src/components/SmsProviderStatusPanel.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260910131014_email_sms_workspace_delivery.sql", import.meta.url), "utf8");

test("Documents is a projection over authoritative records with permission-scoped visibility", () => {
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
  assert.equal(entries.some((entry) => entry.id.startsWith("bank-statement:")), false);

  const financeOnly = buildDocumentRegister({
    invoices: [{ id: "supplier-1", invoiceNumber: "SI-1", invoiceDate: "2026-09-03", currency: "PHP", vendor: { name: "Supplier" }, customer: { name: "Company" }, items: [], subtotal: 10, totalTax: 0, grandTotal: 10, extractedAt: "2026-09-03", modelUsed: "test" } as any],
    visibility: { invoices: true, projects: false, procurement: false, expenses: false, cash: false, engineering: false },
  });
  assert.deepEqual(financeOnly.map((entry) => entry.kind), ["SUPPLIER_INVOICE"]);
});

test("Email / SMS document handoff is exact and does not embed message content in URLs", () => {
  const path = appPathForEmailWorkspace("compose", { documentType: "CLIENT_INVOICE", documentId: "billing-1", returnTo: "/documents" });
  assert.equal(path, "/email-sms?view=compose&documentType=CLIENT_INVOICE&documentId=billing-1&from=%2Fdocuments");
  assert.deepEqual(emailWorkspaceContextFromSearch(path.split("?", 2)[1]), { view: "compose", documentType: "CLIENT_INVOICE", documentId: "billing-1", returnTo: "/documents" });
  assert.equal(path.includes("Message"), false);
});

test("SMS remains truthful and provider-neutral without configured credentials", () => {
  assert.equal(resolveSmsProvider({ SMS_PROVIDER: "twilio", SMS_API_KEY: "not-used" }), null);
  assert.deepEqual(getSmsProviderStatus({}), { status: "NOT_CONFIGURED" });
  assert.match(workspace, /SMS \/ Provider Status/);
  assert.match(sms, /SMS · Not configured/);
  assert.match(sms, /server-side provider adapter/);
});

test("Wave 4D workspace surfaces reuse existing intake, send, history, and template ownership", () => {
  assert.match(workspace, /<EmailInbox/);
  assert.match(workspace, /<EmailComposePanel/);
  assert.match(workspace, /<CommunicationHistoryPanel/);
  assert.match(workspace, /<SmsProviderStatusPanel/);
  assert.match(compose, /sendEmailMessageByGmail/);
  assert.match(compose, /prepare an email draft/i);
  assert.match(compose, /Confirm & Send/);
  assert.match(history, /loadCommunicationsDeliveryHistory/);
  assert.match(documentsRoute, /buildDocumentRegister/);
  assert.match(documentsRoute, /Open owning record/);
  assert.match(documentsRoute, /Document templates/);
  assert.match(migration, /GENERAL_EMAIL/);
  assert.match(migration, /can_read_general_delivery/);
  assert.match(migration, /message_body_sha256/);
  assert.match(migration, /document_send_intents_delivery_shape_check/);
});
