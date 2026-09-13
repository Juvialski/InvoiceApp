import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildDocumentRegister } from "../src/lib/documentRegister.ts";
import { canAccessAppTab, PERMISSION_KEYS } from "../src/utils/accessControl.ts";

const documentsRoute = readFileSync(new URL("../src/app/routes/DocumentsRoute.tsx", import.meta.url), "utf8");
const appRouter = readFileSync(new URL("../src/app/routes/AppRouter.tsx", import.meta.url), "utf8");
const createViewPath = new URL("../src/components/documents/DocumentCreateView.tsx", import.meta.url);
const createView = existsSync(createViewPath) ? readFileSync(createViewPath, "utf8") : "";
const settings = readFileSync(new URL("../src/components/Settings.tsx", import.meta.url), "utf8");

test("Documents route exposes the Library, Create, and Templates workspace views", () => {
  assert.match(documentsRoute, /Library/);
  assert.match(documentsRoute, /Create/);
  assert.match(documentsRoute, /Templates/);
  assert.match(documentsRoute, /data-document-center-nav/);
  assert.match(documentsRoute, /CompanyDocumentTemplatesSettings/);
  assert.match(appRouter, /documentWorkspaceContextFromSearch/);
});

test("settings readers retain access to Documents after template administration moves there", () => {
  assert.equal(canAccessAppTab("documents", [PERMISSION_KEYS.settingsRead]), true);
});

test("Document Create uses business destinations and permission keys", () => {
  assert.match(createView, /Purchase Order/);
  assert.match(createView, /Client Invoice/);
  assert.match(createView, /Project report/);
  assert.match(createView, /Payroll report/);
  assert.match(createView, /Engineering document/);
  assert.match(createView, /PERMISSION_KEYS/);
  assert.match(createView, /appPathForDocumentsWorkspace\("templates"\)/);
  assert.doesNotMatch(createView, /DocumentTemplateEngine|immutable snapshot resolver|source-of-truth record/);
});

test("Settings keeps template administration as a Documents link", () => {
  assert.match(settings, /Manage Document Templates/);
  assert.match(settings, /appPathForDocumentsWorkspace\("templates"\)/);
  assert.doesNotMatch(settings, /<CompanyDocumentTemplatesSettings/);
});

test("Document Center projection remains permission-filtered across owning domains", () => {
  const entries = buildDocumentRegister({
    projects: [{ id: "project-1", projectCode: "P-1", projectName: "Site", clientName: "Client", status: "ACTIVE", projectBudget: 100, currency: "PHP", createdAt: "2026-09-01", updatedAt: "2026-09-01" }],
    vendors: [{ id: "vendor-1", name: "Supplier", normalizedName: "supplier", email: "supplier@example.test" }],
    purchaseOrders: [{ id: "po-1", poNumber: "PO-1", vendorId: "vendor-1", projectId: "project-1", currency: "PHP", status: "ISSUED", totalAmount: 100, lines: [] }],
    clientBillings: [{ id: "billing-1", projectId: "project-1", billingNumber: "INV-1", billingDate: "2026-09-02", currency: "PHP", status: "ISSUED", lines: [], createdAt: "2026-09-02", updatedAt: "2026-09-02" } as any],
    invoices: [{ id: "supplier-1", invoiceNumber: "SI-1", invoiceDate: "2026-09-03", currency: "PHP", vendor: { name: "Supplier" }, customer: { name: "Company" }, items: [], subtotal: 10, totalTax: 0, grandTotal: 10, extractedAt: "2026-09-03", modelUsed: "test", sourceDocumentId: "source-1" } as any],
    visibility: {
      invoices: true,
      projects: true,
      procurement: true,
      expenses: false,
      cash: false,
      engineering: false,
    },
  });
  assert.deepEqual(entries.map((entry) => entry.kind), ["SUPPLIER_INVOICE", "CLIENT_INVOICE", "PURCHASE_ORDER"]);
  assert.equal(entries.find((entry) => entry.id === "po:po-1")?.counterpartyEmail, "supplier@example.test");
  assert.equal(PERMISSION_KEYS.projectsRead, "projects.read");
});
