import test from "node:test";
import assert from "node:assert/strict";
import { resolveGmailConnectionStatus, classifyEmailIntakeCandidate, type EmailIntakeClassification } from "../src/lib/emailIntake.ts";
import { getNavigationModel, getPrimaryModuleForRoute, NAVIGATION_MODULES } from "../src/navigation/navigationModel.ts";
import { appPathForTab, parseAppLocation } from "../src/utils/appRouting.ts";
import { getRouteForAppTab, resolveRoute, ROUTE_DEFINITIONS } from "../src/utils/routes.ts";
import type { GmailConnectionInfo, GmailMessageCandidate } from "../src/types.ts";

test("Email Intake Phase 3: Top-level navigation and module structure", () => {
  // 1. Route definition points to /email-intake canonically with /inbox alias
  const inboxRoute = getRouteForAppTab("inbox");
  assert.ok(inboxRoute);
  assert.equal(inboxRoute.path, "/email-intake");
  assert.equal(inboxRoute.label, "Email Intake");
  assert.deepEqual(inboxRoute.aliases, ["/inbox"]);

  // 2. Navigation modules: email-intake is top-level between invoices and projects
  const moduleIds = NAVIGATION_MODULES.map((m) => m.id);
  assert.deepEqual(moduleIds, [
    "dashboard",
    "cash",
    "invoices",
    "email-intake",
    "projects",
    "expenses",
    "payroll",
    "reports",
  ]);

  // 3. Invoices module does NOT contain inbox
  const invoicesModule = NAVIGATION_MODULES.find((m) => m.id === "invoices");
  assert.ok(invoicesModule);
  assert.ok(!invoicesModule.routeIds.includes("inbox"));
  assert.deepEqual(invoicesModule.routeIds, ["extract", "review", "invoices", "vendors"]);

  // 4. email-intake module definition
  const emailIntakeModule = NAVIGATION_MODULES.find((m) => m.id === "email-intake");
  assert.ok(emailIntakeModule);
  assert.equal(emailIntakeModule.label, "Email Intake");
  assert.equal(emailIntakeModule.defaultRouteId, "inbox");
  assert.deepEqual(emailIntakeModule.routeIds, ["inbox"]);

  // 5. getPrimaryModuleForRoute mapping
  assert.equal(getPrimaryModuleForRoute("inbox")?.id, "email-intake");
  assert.equal(getPrimaryModuleForRoute("invoices")?.id, "invoices");

  // 6. getNavigationModel output
  const navModel = getNavigationModel();
  const navModuleIds = navModel.modules.map((m) => m.id);
  assert.ok(navModuleIds.includes("email-intake"));
  const navEmailIntake = navModel.modules.find((m) => m.id === "email-intake");
  assert.equal(navEmailIntake?.label, "Email Intake");
  assert.equal(navEmailIntake?.defaultRoute?.path, "/email-intake");
});

test("Email Intake Phase 3: Route parsing and aliases", () => {
  // Canonical /email-intake
  const canonical = parseAppLocation("/email-intake");
  assert.equal(canonical.kind, "tab");
  assert.equal(canonical.tab, "inbox");
  assert.equal(canonical.routeId, "inbox");

  // Backward-compatible alias /inbox
  const legacy = parseAppLocation("/inbox");
  assert.equal(legacy.kind, "tab");
  assert.equal(legacy.tab, "inbox");
  assert.equal(legacy.routeId, "inbox");

  // resolveRoute helper
  assert.equal(resolveRoute("/email-intake").routeId, "inbox");
  assert.equal(resolveRoute("/inbox").routeId, "inbox");

  // appPathForTab
  assert.equal(appPathForTab("inbox"), "/email-intake");
});

test("Email Intake Phase 3: Deterministic Gmail Connection State Model", () => {
  // 1. UNCONFIGURED: Supabase / OAuth not configured
  const unconfigured: GmailConnectionInfo = {
    configured: false,
    signedIn: false,
    hasGmailToken: false,
  };
  assert.equal(resolveGmailConnectionStatus(unconfigured), "UNCONFIGURED");

  // 2. NEVER_CONNECTED: Configured and signed in, but no Gmail token and no past sync history
  const neverConnected: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: false,
  };
  assert.equal(resolveGmailConnectionStatus(neverConnected), "NEVER_CONNECTED");

  // 3. HEALTHY: Configured, signed in, has valid token, no active auth error
  const healthy: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: true,
    email: "finance@company.com",
    displayName: "Finance Lead",
    lastSyncedAt: "2026-08-30T10:00:00Z",
    lastHistoryId: "123456",
  };
  assert.equal(resolveGmailConnectionStatus(healthy), "HEALTHY");

  // 4. RECONNECT_REQUIRED: Token expired/revoked, but user previously connected (has email / history)
  const expiredTokenWithHistory: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: false,
    email: "finance@company.com",
    lastSyncedAt: "2026-08-25T10:00:00Z",
    lastHistoryId: "123456",
  };
  assert.equal(resolveGmailConnectionStatus(expiredTokenWithHistory), "RECONNECT_REQUIRED");

  // 5. Stale email alone without valid token NEVER evaluates to HEALTHY
  const staleEmailNoToken: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: false,
    email: "finance@company.com",
  };
  assert.equal(resolveGmailConnectionStatus(staleEmailNoToken), "RECONNECT_REQUIRED");
  assert.notEqual(resolveGmailConnectionStatus(staleEmailNoToken), "HEALTHY");

  // 6. Active auth error forces RECONNECT_REQUIRED even if hasGmailToken was true in session cache
  const activeErrorWithToken: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: true,
    email: "finance@company.com",
  };
  assert.equal(resolveGmailConnectionStatus(activeErrorWithToken, "invalid_grant: Token has been expired or revoked."), "RECONNECT_REQUIRED");
  assert.equal(resolveGmailConnectionStatus(activeErrorWithToken, "Google re-authentication required"), "RECONNECT_REQUIRED");
  assert.equal(resolveGmailConnectionStatus(activeErrorWithToken, null), "HEALTHY");
});

test("Email Intake Phase 3: Finance destination classification and filtering", () => {
  const invoiceCandidate: GmailMessageCandidate = {
    id: "msg-1",
    threadId: "thread-1",
    sender: "billing@concrete-supplier.com",
    to: ["finance@company.com"],
    cc: [],
    labels: ["INBOX"],
    subject: "Tax Invoice INV-2026-901",
    receivedAt: "2026-08-30T09:00:00Z",
    snippet: "Please find attached your tax invoice for concrete delivery.",
    bodyText: "Total amount due: $15,400.00",
    attachments: [{ attachmentId: "att-1", filename: "INV-2026-901.pdf", mimeType: "application/pdf", size: 102400 }],
  };

  const statementCandidate: GmailMessageCandidate = {
    id: "msg-2",
    threadId: "thread-2",
    sender: "statements@bank.com",
    to: ["finance@company.com"],
    cc: [],
    labels: ["INBOX"],
    subject: "Monthly Bank Statement - Account 4920",
    receivedAt: "2026-08-30T08:00:00Z",
    snippet: "Your official statement for the period ending August 2026 is attached.",
    bodyText: "Account ending in 4920 statement summary.",
    attachments: [{ attachmentId: "att-2", filename: "statement_aug_2026.csv", mimeType: "text/csv", size: 51200 }],
  };

  const expenseCandidate: GmailMessageCandidate = {
    id: "msg-3",
    threadId: "thread-3",
    sender: "receipts@fuel-station.com",
    to: ["finance@company.com"],
    cc: [],
    labels: ["INBOX"],
    subject: "Receipt for fuel purchase at Shell Station",
    receivedAt: "2026-08-30T07:30:00Z",
    snippet: "Thanks for your purchase. Total receipt: $85.50.",
    bodyText: "Diesel fuel purchase. Tax receipt attached.",
    attachments: [{ attachmentId: "att-3", filename: "fuel_receipt.png", mimeType: "image/png", size: 32000 }],
  };

  const clsInvoice = classifyEmailIntakeCandidate(invoiceCandidate);
  assert.equal(clsInvoice.suggestedDestination, "INVOICE");
  assert.ok(clsInvoice.confidence > 50);

  const clsStatement = classifyEmailIntakeCandidate(statementCandidate);
  assert.equal(clsStatement.suggestedDestination, "BANK_STATEMENT");
  assert.ok(clsStatement.statementAttachmentIds?.includes("att-2"));

  const clsExpense = classifyEmailIntakeCandidate(expenseCandidate);
  assert.equal(clsExpense.suggestedDestination, "EXPENSE");
  assert.ok(clsExpense.expenseAttachmentIds?.includes("att-3"));

  // Ensure non-finance candidates don't get routed to finance destinations
  const unrelatedCandidate: GmailMessageCandidate = {
    id: "msg-4",
    threadId: "thread-4",
    sender: "newsletter@techblog.com",
    to: ["dev@company.com"],
    cc: [],
    labels: ["INBOX"],
    subject: "Weekly engineering newsletter #42",
    receivedAt: "2026-08-30T06:00:00Z",
    snippet: "Here is your weekly roundup of software engineering articles.",
    bodyText: "Read more online.",
    attachments: [],
  };
  const clsUnrelated = classifyEmailIntakeCandidate(unrelatedCandidate);
  assert.equal(clsUnrelated.suggestedDestination, "UNSUPPORTED");
});
