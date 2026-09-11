import fs from "node:fs/promises";
import path from "node:path";
import { ROUTE_DEFINITIONS, type RouteDefinition } from "../../src/utils/routes.ts";
import {
  QA_VIEWPORTS,
  createOverflowResult,
  normalizeBrowserPath,
  normalizeConsoleError,
  normalizeErrorMessage,
  normalizeFailedRequest,
  normalizePageError,
  type QaFailedRequest,
  type QaOverflowResult,
  type QaViewport,
} from "./structuredEvidence.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

export type LocalQaScenarioStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED";

export interface LocalQaScenarioAssertion {
  readonly id: string;
  readonly passed: boolean;
  readonly details?: string;
}

export interface LocalQaScenarioEvidence {
  readonly id: string;
  readonly surface: string;
  readonly requestedPath: string;
  readonly finalPath: string;
  readonly interactionState: string;
  readonly viewport: QaViewport;
  readonly status: LocalQaScenarioStatus;
  readonly screenshotPath: string | null;
  readonly screenshotError?: string;
  readonly consoleErrors: readonly ReturnType<typeof normalizeConsoleError>[];
  readonly pageErrors: readonly ReturnType<typeof normalizePageError>[];
  readonly failedRequests: readonly QaFailedRequest[];
  readonly overflow: QaOverflowResult;
  readonly dialogOverflowCount: number;
  readonly interactiveOverflowCount: number;
  readonly navigation: {
    readonly requestedPath: string;
    readonly finalPath: string;
    readonly status: number | null;
    readonly loaded: boolean;
    readonly error?: string;
  };
  readonly assertions: readonly LocalQaScenarioAssertion[];
  readonly details?: string;
}

export interface LocalQaScenarioRunResult {
  readonly scenarios: readonly LocalQaScenarioEvidence[];
  readonly summary: {
    readonly total: number;
    readonly pass: number;
    readonly fail: number;
    readonly blocked: number;
    readonly notTested: number;
    readonly overflowFailures: number;
    readonly dialogOverflowFailures: number;
    readonly interactiveOverflowFailures: number;
  };
}

interface ScenarioActionResult {
  readonly assertions?: readonly LocalQaScenarioAssertion[];
  readonly status?: Exclude<LocalQaScenarioStatus, "FAIL">;
  readonly details?: string;
}

export interface LocalQaScenarioDefinition {
  readonly id: string;
  readonly surface: string;
  readonly path: string;
  readonly interactionState: string;
  readonly viewport: QaViewport;
  readonly captureScreenshot?: boolean;
  readonly action?: (page: any, viewport: QaViewport) => Promise<ScenarioActionResult | void>;
}

export const LOCAL_QA_VIEWPORTS = [QA_VIEWPORTS.desktop, QA_VIEWPORTS.tablet, QA_VIEWPORTS.mobile] as const;

interface LocalQaScenarioRunOptions {
  readonly page: any;
  readonly baseUrl: string;
  readonly outputDir: string;
  readonly waitForApp: (page: any) => Promise<void>;
  readonly timeoutMs?: number;
}

function assertion(id: string, passed: boolean, details?: string): LocalQaScenarioAssertion {
  return { id, passed, ...(details ? { details } : {}) };
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "scenario";
}

function isExpectedUnavailableRequest(request: QaFailedRequest) {
  return request.url === "/api/deployment/company-ai" && request.status === 503;
}

function isExpectedUnavailableConsole(error: ReturnType<typeof normalizeConsoleError>) {
  return error.locationPath === "/api/deployment/company-ai" && /503|service unavailable/i.test(error.message);
}

function isExpectedNavigationAbort(request: QaFailedRequest) {
  return /ERR_ABORTED|aborted/i.test(request.failureText || "");
}

function telemetryFor(page: any) {
  const consoleErrors: Array<ReturnType<typeof normalizeConsoleError>> = [];
  const pageErrors: Array<ReturnType<typeof normalizePageError>> = [];
  const failedRequests: QaFailedRequest[] = [];

  const onConsole = (message: any) => {
    if (message.type?.() !== "error") return;
    const location = typeof message.location === "function" ? message.location()?.url : undefined;
    const normalized = normalizeConsoleError({ message: message.text?.() || "Browser console error", location });
    consoleErrors.push(isExpectedUnavailableConsole(normalized) ? { ...normalized, ignored: true } : normalized);
  };
  const onPageError = (error: unknown) => pageErrors.push(normalizePageError(error));
  const onResponse = (response: any) => {
    if (response.status?.() < 400) return;
    const request = response.request?.();
    const normalized = normalizeFailedRequest({
      url: response.url?.(),
      method: request?.method?.(),
      resourceType: request?.resourceType?.(),
      status: response.status?.(),
      statusText: response.statusText?.(),
    });
    if (normalized) failedRequests.push(isExpectedUnavailableRequest(normalized) ? { ...normalized, ignored: true } : normalized);
  };
  const onRequestFailed = (request: any) => {
    const normalized = normalizeFailedRequest({
      url: request.url?.(),
      method: request.method?.(),
      resourceType: request.resourceType?.(),
      failureText: request.failure?.()?.errorText,
    });
    if (normalized) failedRequests.push(isExpectedNavigationAbort(normalized) ? { ...normalized, ignored: true } : normalized);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    detach() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
    },
  };
}

async function pageMetrics(page: any) {
  return page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']"));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dialogOverflowCount = dialogs.filter((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const style = window.getComputedStyle(dialog);
      const widthOverflow = rect.left < -2 || rect.right > viewportWidth + 2 || rect.width > viewportWidth + 2;
      const heightOverflow = rect.top < -2 || rect.bottom > viewportHeight + 2 || rect.height > viewportHeight + 2;
      const canScroll = style.overflowY === "auto" || style.overflowY === "scroll" || dialog.scrollHeight > dialog.clientHeight + 2;
      return widthOverflow || (heightOverflow && !canScroll);
    }).length;
    const interactiveOverflowCount = Array.from(document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.hasAttribute("aria-hidden")) return false;
        if (element.closest("details:not([open])")) return false;
        let parent: HTMLElement | null = element.parentElement;
        while (parent) {
          const parentStyle = window.getComputedStyle(parent);
          if (parentStyle.overflowX === "auto" || parentStyle.overflowX === "scroll") return false;
          parent = parent.parentElement;
        }
        const rect = element.getBoundingClientRect();
        return rect.left < -2 || rect.right > viewportWidth + 2;
      }).length;
    return {
      documentWidth: document.documentElement?.scrollWidth || 0,
      bodyWidth: document.body?.scrollWidth || 0,
      viewportWidth,
      dialogOverflowCount,
      interactiveOverflowCount,
      headingCount: document.querySelectorAll("h1, h2, h3").length,
      bodyLength: (document.body?.innerText || "").trim().length,
      authFormCount: document.querySelectorAll("#auth-email, #auth-password").length,
      workspaceReadyCount: document.querySelectorAll("[data-workspace-state='ready']").length,
    };
  });
}

async function waitForVisible(locator: any, timeoutMs: number) {
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
}

async function navigateBackTo(page: any, routePath: string, timeoutMs: number) {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}${routePath}`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForFunction(() => {
    const body = document.body?.innerText || "";
    return document.querySelector("[data-workspace-state='ready']")
      && !document.querySelector("#auth-email, #auth-password")
      && !/Loading company access|Checking your workspace session|Loading workspace/i.test(body);
  }, undefined, { timeout: timeoutMs });
}

async function closeTopDialog(page: any, timeoutMs: number) {
  const dialog = page.locator("[role='dialog']").last();
  if (await dialog.count() === 0) return false;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  if (await dialog.count() === 0) return true;
  const closeButton = dialog.getByRole("button", { name: /close|cancel/i }).last();
  if (await closeButton.count() > 0) {
    await closeButton.click();
    await dialog.waitFor({ state: "detached", timeout: timeoutMs }).catch(() => {});
  }
  return await dialog.count() === 0;
}

async function openAndCloseDialog(page: any, button: any, actionId: string, timeoutMs: number): Promise<ScenarioActionResult> {
  if (await button.count() === 0) {
    return {
      status: "BLOCKED",
      assertions: [assertion(`${actionId}-available`, true, "The control is not exposed in the current permission/data state.")],
      details: "The requested dialog control was not available in the current authenticated QA state.",
    };
  }
  await button.first().click();
  const dialog = page.locator("[role='dialog']").last();
  await waitForVisible(dialog, timeoutMs);
  const dialogFitsViewport = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[role='dialog']")]
    .filter((element) => getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden")
    .every((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const widthFits = rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.width <= window.innerWidth + 2;
      const heightFits = rect.top >= -2 && rect.bottom <= window.innerHeight + 2 && rect.height <= window.innerHeight + 2;
      const scrollable = style.overflowY === "auto" || style.overflowY === "scroll" || element.scrollHeight > element.clientHeight + 2;
      return widthFits && (heightFits || scrollable);
    }));
  const closed = await closeTopDialog(page, timeoutMs);
  return {
    assertions: [
      assertion(`${actionId}-opened`, true, "The dialog opened."),
      assertion(`${actionId}-fits-viewport`, dialogFitsViewport, "The open dialog remains within the viewport or provides internal scrolling."),
      assertion(`${actionId}-closed`, closed, closed ? "The dialog closed through Escape/close controls." : "The dialog remained open after the close interaction."),
    ],
  };
}

async function verifyProjects(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const cards = page.locator("[aria-label='Projects list cards']");
  const table = page.locator("[aria-label='Projects table']");
  const projectActionsFit = await page.evaluate(() => [...document.querySelectorAll("[aria-label='Projects list cards'] button")]
    .filter((button) => /Open Project/.test(button.textContent || ""))
    .every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= -2 && rect.right <= window.innerWidth + 2;
    }));
  const dialogResult = await openAndCloseDialog(page, page.getByRole("button", { name: "New project", exact: true }), "new-project-dialog", DEFAULT_TIMEOUT_MS);
  return {
    assertions: [
      assertion("portfolio-summary", await page.getByRole("region", { name: "Portfolio Management Summary" }).count() > 0, "Portfolio summary is present."),
      assertion("responsive-project-register", (await cards.count()) > 0 || (await table.count()) > 0 || (await page.getByText(/No projects match|No projects yet/i).count()) > 0, "A project register or explicit empty state is present."),
      assertion("project-primary-actions-fit", projectActionsFit, "Mobile project primary actions remain inside the viewport."),
      ...(dialogResult.assertions || []),
    ],
    status: dialogResult.status,
    details: dialogResult.details,
  };
}

async function verifyProcurement(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const assertions: LocalQaScenarioAssertion[] = [];
  const poDialog = await openAndCloseDialog(page, page.getByRole("button", { name: "New Purchase Order", exact: true }), "new-po-dialog", DEFAULT_TIMEOUT_MS);
  assertions.push(...(poDialog.assertions || []));
  const rfqDialog = await openAndCloseDialog(page, page.getByRole("button", { name: "New RFQ", exact: true }), "new-rfq-dialog", DEFAULT_TIMEOUT_MS);
  assertions.push(...(rfqDialog.assertions || []));

  const rfqTab = page.getByRole("button", { name: /Requests for Quotation \(RFQs\)/ });
  if (await rfqTab.count() > 0) {
    await rfqTab.first().click();
    await page.waitForTimeout(100);
    assertions.push(assertion("rfq-register", await page.locator("[aria-label='RFQ register cards']").count() > 0 || await page.getByText(/No RFQs match|No Requests for Quotation yet/i).count() > 0, "RFQ register or empty state is visible."));
    const compare = page.getByRole("button", { name: /View & Compare|Compare/, exact: false });
    if (await compare.count() > 0) {
      await compare.first().click();
      const closed = await closeTopDialog(page, DEFAULT_TIMEOUT_MS);
      assertions.push(assertion("quotation-comparison-dialog", closed, closed ? "Quotation comparison opened and closed safely." : "Quotation comparison did not close safely."));
    }
  } else {
    assertions.push(assertion("rfq-tab", true, "RFQ tab is not exposed in the current permission/deployment state."));
  }

  const poTab = page.getByRole("button", { name: /Purchase Orders/i, exact: true });
  if (await poTab.count() > 0) {
    await poTab.first().click();
    await page.waitForTimeout(100);
    assertions.push(assertion("purchase-order-register", await page.locator("[aria-label='Purchase order register cards']").count() > 0 || await page.getByText(/No purchase orders match|No purchase orders yet/i).count() > 0, "Purchase Order register or empty state is visible."));
    const viewEdit = page.getByRole("button", { name: "View / Edit", exact: true });
    if (await viewEdit.count() > 0) {
      await viewEdit.first().click();
      const editor = page.locator("[role='dialog']").last();
      await waitForVisible(editor, DEFAULT_TIMEOUT_MS);
      assertions.push(assertion("purchase-order-editor", true, "Purchase Order detail/editor opened."));
      const receipt = page.getByRole("button", { name: "Record Delivery / Receipt", exact: true });
      if (await receipt.count() > 0) {
        await receipt.first().click();
        const receiptDialog = page.locator("[role='dialog']").last();
        await waitForVisible(receiptDialog, DEFAULT_TIMEOUT_MS);
        const receiptMetrics = await pageMetrics(page);
        assertions.push(assertion("receipt-dialog-fit", receiptMetrics.dialogOverflowCount === 0, "Receipt entry remains within the viewport or scrolls internally."));
        assertions.push(assertion("receipt-dialog-close", await closeTopDialog(page, DEFAULT_TIMEOUT_MS), "Receipt entry closed without changing the Purchase Order."));
      }
      assertions.push(assertion("purchase-order-editor-close", await closeTopDialog(page, DEFAULT_TIMEOUT_MS), "Purchase Order editor closed without mutation."));
    }
  }
  return { assertions };
}

async function verifyWarehouse(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const assertions: LocalQaScenarioAssertion[] = [assertion("warehouse-domain", await page.locator("[data-domain='warehouse-inventory']").count() > 0, "Warehouse Inventory domain is mounted.")];
  const history = page.getByRole("button", { name: "History", exact: true });
  if (await history.count() > 0) {
    await history.first().click();
    assertions.push(assertion("inventory-history-dialog", await page.getByRole("dialog").count() > 0, "Inventory history opened."));
    assertions.push(assertion("inventory-history-close", await closeTopDialog(page, DEFAULT_TIMEOUT_MS), "Inventory history closed safely."));
  }
  const addItem = await openAndCloseDialog(page, page.getByRole("button", { name: "Add item", exact: true }), "inventory-add-item", DEFAULT_TIMEOUT_MS);
  assertions.push(...(addItem.assertions || []));
  return { assertions, status: addItem.status, details: addItem.details };
}

async function verifyEquipment(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const assertions = [assertion("equipment-domain", await page.locator("[data-domain='equipment-registry']").count() > 0, "Equipment Registry domain is mounted.")];
  const add = await openAndCloseDialog(page, page.getByRole("button", { name: "Add Equipment", exact: true }), "equipment-add-dialog", DEFAULT_TIMEOUT_MS);
  assertions.push(...(add.assertions || []));
  return { assertions, status: add.status, details: add.details };
}

async function verifyInvoices(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const moreFilters = page.getByRole("button", { name: /More filters/i });
  if (await moreFilters.count() > 0) {
    await moreFilters.first().click();
    await page.waitForTimeout(100);
  }
  const openInvoice = page.getByRole("button", { name: /^(Open review|Open read-only):/i });
  const detailAssertions: LocalQaScenarioAssertion[] = [];
  if (await openInvoice.count() > 0) {
    await openInvoice.first().click();
    await page.waitForFunction(() => window.location.pathname.startsWith("/invoices/"), undefined, { timeout: DEFAULT_TIMEOUT_MS });
    detailAssertions.push(assertion("supplier-invoice-detail", true, "Supplier invoice detail opened from the register."));
    await navigateBackTo(page, "/invoices", DEFAULT_TIMEOUT_MS);
  }
  return {
    assertions: [
      assertion("invoice-surface", await page.getByRole("heading", { name: /Supplier source documents|Invoices/i }).count() > 0 || await page.getByText(/No invoices yet|No invoices match/i).count() > 0, "Supplier invoice register or explicit empty state is visible."),
      assertion("invoice-filters", await page.getByRole("combobox", { name: "Review status" }).count() > 0 || await page.getByRole("button", { name: /More filters/i }).count() === 0, "Invoice filters are available when the register is exposed."),
      ...detailAssertions,
    ],
  };
}

async function verifyCash(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const assertions: LocalQaScenarioAssertion[] = [
    assertion("cash-surface", await page.getByRole("heading", { name: "Cash & Banking", exact: true }).count() > 0 || await page.getByText(/No cash accounts yet|No active cash accounts/i).count() > 0, "Cash & Banking landing or explicit empty state is visible."),
    assertion("cash-controls", await page.getByRole("region", { name: "Cash controls" }).count() > 0, "Cash controls are grouped and labeled."),
  ];
  for (const [label, id] of [["Add account", "cash-account-dialog"], ["Import statement", "cash-import-dialog"]] as const) {
    const result = await openAndCloseDialog(page, page.getByRole("button", { name: label, exact: true }), id, DEFAULT_TIMEOUT_MS);
    assertions.push(...(result.assertions || []));
  }
  const addTransaction = await openAndCloseDialog(page, page.getByRole("button", { name: "Add transaction", exact: true }), "cash-transaction-dialog", DEFAULT_TIMEOUT_MS);
  assertions.push(...(addTransaction.assertions || []));
  return { assertions, status: addTransaction.status, details: addTransaction.details };
}

async function verifyExtraction(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const pasteTab = page.getByRole("button", { name: "Paste text", exact: true });
  if (await pasteTab.count() > 0) {
    await pasteTab.first().click();
    await page.waitForTimeout(50);
  }
  const textarea = page.locator("textarea").first();
  const assertions = [
    assertion("extraction-surface", await page.getByRole("heading", { name: /invoice extraction|upload/i }).count() > 0 || await page.getByText(/Paste raw invoice text|Upload supplier invoice/i).count() > 0, "Supplier invoice extraction surface is visible."),
    assertion("extraction-input", await textarea.count() > 0, "A labeled or described extraction input is available."),
  ];
  if (await textarea.count() > 0) {
    await textarea.fill("Synthetic Local-QA invoice text; no extraction is submitted.");
    await textarea.fill("");
  }
  return { assertions, details: "Extraction input was exercised without submitting a provider or persistence action." };
}

async function verifyReviewQueue(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const openReview = page.getByRole("button", { name: /Open (?:and|&) review|Inspect/i });
  const assertions: LocalQaScenarioAssertion[] = [];
  if (await openReview.count() > 0) {
    await openReview.first().click();
    await page.waitForFunction(() => window.location.pathname === "/review" && new URLSearchParams(window.location.search).has("invoiceId"), undefined, { timeout: DEFAULT_TIMEOUT_MS });
    assertions.push(assertion("review-detail", true, "Review queue opened the exact supplier invoice context."));
    await navigateBackTo(page, "/review", DEFAULT_TIMEOUT_MS);
  }
  return {
    assertions: [assertion("review-queue-surface", await page.getByRole("heading", { name: /supplier invoice review queue/i }).count() > 0 || await page.getByText(/Review queue is clear|awaiting action/i).count() > 0, "Supplier review queue or explicit empty state is visible."), ...assertions],
    details: "Review state was inspected without opening or mutating an invoice record.",
  };
}

async function verifyReports(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  return {
    assertions: [
      assertion("reports-surface", await page.getByRole("heading", { name: "Reports", exact: true }).count() > 0, "Reports landing is visible."),
      assertion("report-summary", await page.locator("[aria-label='Report summary']").count() > 0, "Report summary cards are grouped and labeled."),
    ],
  };
}

async function verifySettings(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const featureDetails = page.getByRole("button", { name: /What this includes/i });
  if (await featureDetails.count() > 0) {
    await featureDetails.first().click();
    await page.waitForTimeout(50);
  }
  const documentIdentity = page.getByRole("textbox", { name: "Prepared by / Processed by name", exact: true });
  return {
    assertions: [
      assertion("settings-surface", await page.getByRole("heading", { name: /Operational settings|Settings/i }).count() > 0, "Settings landing is visible."),
      assertion("client-roadmap", await page.getByText(/HydroQualiSense Features & Roadmap/i).count() > 0, "Client-facing feature roadmap is visible."),
      assertion("sms-truthful-status", await page.getByText(/SMS provider-backed messaging/i).count() > 0, "SMS remains represented as a future/provider-gated capability."),
      assertion("document-identity-field", await documentIdentity.count() > 0, "The authenticated user can set a human-readable Prepared by / Processed by name."),
      assertion("document-identity-editable", await documentIdentity.isEnabled().catch(() => false), "The document identity field is editable without changing the sign-in email."),
    ],
    details: "Settings was inspected without changing company, permission, regional, template, or AI configuration.",
  };
}

async function verifyInbox(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  return {
    assertions: [
      assertion("email-inbox-domain", await page.locator("[data-domain='email-sms-inbox']").count() > 0, "Email / SMS inbox domain is mounted."),
      assertion("read-only-scope-copy", await page.getByText(/Inbox access: read-only/i).count() > 0 || await page.getByText(/Gmail.*read-only/i).count() > 0, "Inbound Gmail scope is explicitly described."),
      assertion("compose-direction", await page.getByText(/Compose.*outbound|outbound.*Compose/i).count() > 0 || await page.getByRole("button", { name: /Compose/i }).count() > 0, "Outbound composition remains discoverable."),
    ],
    details: "Inbox content is not persisted to evidence; provider scans/imports are not triggered by this scenario.",
  };
}

async function verifyDocuments(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const assertions: LocalQaScenarioAssertion[] = [
    assertion("documents-domain", await page.locator("[data-documents-workspace]").count() > 0, "Documents workspace is mounted."),
    assertion("document-search", await page.getByRole("textbox", { name: "Search documents", exact: true }).count() > 0, "Document search is labeled."),
  ];
  const search = page.getByRole("textbox", { name: "Search documents", exact: true });
  if (await search.count() > 0) {
    await search.fill("LOCAL-QA-NO-MATCH-9F4C");
    await page.waitForTimeout(100);
    assertions.push(assertion("document-empty-state", await page.getByText("No documents match the current view", { exact: true }).count() > 0, "A no-match search exposes an explicit empty state."));
    await search.fill("");
  }
  const ownerButton = page.getByRole("button", { name: "Open owning record", exact: true });
  if (await ownerButton.count() > 0) {
    await ownerButton.first().click();
    const ownerPath = new URL(page.url()).pathname;
    assertions.push(assertion("document-owner-handoff", ownerPath !== "/documents", "Documents opened the owning record route."));
    await navigateBackTo(page, "/documents", DEFAULT_TIMEOUT_MS);
    await waitForVisible(page.locator("[data-documents-workspace]"), DEFAULT_TIMEOUT_MS);
  }
  const sendButton = page.getByRole("button", { name: "Send", exact: true });
  if (await sendButton.count() > 0 && await sendButton.first().isEnabled().catch(() => false)) {
    await sendButton.first().click();
    const composeUrl = new URL(page.url());
    assertions.push(assertion("document-compose-handoff", composeUrl.pathname === "/email-sms" && composeUrl.searchParams.get("view") === "compose", "Documents carried the selected document into Compose."));
    await navigateBackTo(page, "/documents", DEFAULT_TIMEOUT_MS);
    await waitForVisible(page.locator("[data-documents-workspace]"), DEFAULT_TIMEOUT_MS);
  }
  if (_viewport.width === QA_VIEWPORTS.mobile.width) {
    const preview = page.getByRole("button", { name: "Preview / Download", exact: true });
    if (await preview.count() > 0) {
      await preview.first().click();
      const previewDialog = page.locator("[role='dialog']").last();
      await waitForVisible(previewDialog, DEFAULT_TIMEOUT_MS);
      const previewMetrics = await pageMetrics(page);
      assertions.push(assertion("mobile-document-preview", previewMetrics.dialogOverflowCount === 0, "Issued-document preview fits and scrolls correctly on mobile."));
      assertions.push(assertion("mobile-document-preview-close", await closeTopDialog(page, DEFAULT_TIMEOUT_MS), "Mobile document preview closed safely."));
    }
  }
  return { assertions, details: "Document actions remain owner-routed; no document source ownership is created by this scenario." };
}

async function verifyEmailCompose(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const to = page.getByRole("textbox", { name: "To", exact: true });
  const subject = page.getByRole("textbox", { name: "Subject", exact: true });
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  if (await to.count() === 0 || await subject.count() === 0 || await message.count() === 0) {
    return { status: "BLOCKED", assertions: [assertion("compose-fields", true, "Compose is not exposed in the current permission/provider state.")] };
  }
  await to.fill("qa@example.invalid");
  await subject.fill("Local QA review draft");
  await message.fill("Synthetic QA draft prepared for review only.");
  const review = page.getByRole("button", { name: "Preview / Review", exact: true });
  if (await review.count() > 0) await review.click();
  return {
    assertions: [
      assertion("compose-review-fields", true, "Recipient, subject, and message fields accepted synthetic review input."),
      assertion("compose-review-gate", await page.locator("[data-email-compose-review='true']").count() > 0 || await page.getByText(/Review before sending/i).count() > 0, "Review-before-send state is visible."),
      assertion("compose-send-not-automatic", await page.getByRole("button", { name: "Confirm & Send", exact: true }).count() > 0, "Confirm & Send remains an explicit action."),
    ],
    details: "No send action is triggered; the recipient is a non-deliverable synthetic address.",
  };
}

async function verifySms(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  return {
    assertions: [assertion("sms-truthful-status", await page.getByText(/SMS.*Not configured|No approved SMS provider is configured/i).count() > 0, "SMS remains truthfully not configured.")],
    details: "No SMS provider or send action is used.",
  };
}

async function verifyPayroll(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const nav = page.getByRole("navigation", { name: "Payroll workspace sections" });
  const assertions = [assertion("payroll-surface", await page.getByRole("heading", { name: /Payroll|Payroll & labor/i }).count() > 0 || await page.getByText(/Set up payroll schedule|No period yet/i).count() > 0, "Payroll landing or explicit schedule state is visible.")];
  if (await nav.count() > 0) {
    const buttons = nav.getByRole("button");
    const buttonCount = await buttons.count();
    for (let index = 0; index < buttonCount; index += 1) {
      await buttons.nth(index).click();
      await page.waitForTimeout(50);
    }
    assertions.push(assertion("payroll-sections", buttonCount >= 3, `${buttonCount} payroll workspace sections are discoverable.`));
  }
  return { assertions };
}

async function verifyProjectWorkspace(page: any, _viewport: QaViewport): Promise<ScenarioActionResult> {
  const nav = page.locator('nav[aria-label="Project workspace sections"]');
  if (await nav.count() === 0) {
    await nav.waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
  }
  if (await nav.count() === 0) {
    return { status: "BLOCKED", assertions: [assertion("project-workspace-nav", true, "No project workspace is available for the current QA dataset.")] };
  }
  const buttons = nav.getByRole("tab");
  const buttonCount = await buttons.count();
  const labels = await buttons.allTextContents();
  const nestedAssertions: LocalQaScenarioAssertion[] = [];
  for (let index = 0; index < buttonCount; index += 1) {
    await buttons.nth(index).click();
    await page.waitForTimeout(75);
    const label = labels[index] || "";
    if (/Client Invoices/i.test(label)) {
      nestedAssertions.push(...(await verifyClientBilling(page)).assertions || []);
    }
    if (/Engineering Documents/i.test(label)) {
      nestedAssertions.push(...(await verifyEngineeringDocuments(page)).assertions || []);
    }
  }
  return {
    assertions: [
      assertion("project-workspace-nav", buttonCount >= 2, `${buttonCount} project workspace sections are discoverable.`),
      assertion("project-workspace-owner-context", await page.getByText(/Project|Client Invoices|Engineering Documents/i).count() > 0, "Project owner context remains visible while sections change."),
      ...nestedAssertions,
    ],
  };
}

async function verifyClientBilling(page: any): Promise<ScenarioActionResult> {
  const assertions: LocalQaScenarioAssertion[] = [
    assertion("client-billing-surface", await page.getByRole("heading", { name: /Client Invoices & Collections/i }).count() > 0, "Client billing and collections workspace is visible."),
  ];
  const billingTab = page.getByRole("button", { name: /Client Invoices \(/i });
  if (await billingTab.count() > 0) await billingTab.first().click();
  const newBilling = page.getByRole("button", { name: "New client invoice draft", exact: true });
  if (await newBilling.count() > 0) {
    await newBilling.first().click();
    assertions.push(assertion("client-billing-editor", await page.getByRole("heading", { name: /Create client invoice draft|Edit client invoice draft/i }).count() > 0, "Client invoice draft editor opened."));
    const cancel = page.getByRole("button", { name: "Cancel", exact: true }).last();
    if (await cancel.count() > 0) await cancel.click();
  }
  const collectionsTab = page.getByRole("button", { name: /Collections \/ Receivables \(/i });
  if (await collectionsTab.count() > 0) {
    await collectionsTab.first().click();
    assertions.push(assertion("collections-register", await page.getByRole("heading", { name: "Collections register", exact: true }).count() > 0 || await page.getByText(/No collection history yet|No collections/i).count() > 0, "Collections register or explicit empty state is visible."));
    assertions.push(assertion("collection-action-state", await page.getByRole("button", { name: "Record collection", exact: true }).count() > 0 || await page.getByText(/only allocate against ISSUED/i).count() > 0, "Collection action or its lifecycle restriction is explained."));
  }
  return { assertions };
}

async function verifyEngineeringDocuments(page: any): Promise<ScenarioActionResult> {
  const domain = page.locator("[data-domain='engineering-documents']");
  if (await domain.count() === 0) {
    await domain.waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
  }
  const assertions: LocalQaScenarioAssertion[] = [
    assertion("engineering-documents-surface", await domain.count() > 0, "Engineering Documents domain is mounted."),
  ];
  const search = page.getByRole("textbox", { name: "Search engineering documents", exact: true });
  if (await search.count() > 0) {
    await search.fill("LOCAL-QA-NO-MATCH-9F4C");
    await page.waitForTimeout(100);
    assertions.push(assertion("engineering-documents-empty-state", await page.getByText("No documents found", { exact: true }).count() > 0, "Engineering document no-match state is explicit."));
    await search.fill("");
  }
  const newDocument = await openAndCloseDialog(page, page.getByRole("button", { name: "New Document", exact: true }), "engineering-new-document-dialog", DEFAULT_TIMEOUT_MS);
  assertions.push(...(newDocument.assertions || []));
  const history = page.getByRole("button", { name: /Open revision history/i });
  if (await history.count() > 0) {
    await history.first().click();
    assertions.push(assertion("engineering-history-dialog", await page.getByRole("dialog").count() > 0, "Engineering revision history opened."));
    assertions.push(assertion("engineering-history-close", await closeTopDialog(page, DEFAULT_TIMEOUT_MS), "Engineering revision history closed safely."));
  }
  return { assertions, status: newDocument.status, details: newDocument.details };
}

function routeAction(routeId: RouteDefinition["id"]) {
  switch (routeId) {
    case "projects": return verifyProjects;
    case "procurement": return verifyProcurement;
    case "warehouse": return verifyWarehouse;
    case "equipment": return verifyEquipment;
    case "invoices": return verifyInvoices;
    case "extract": return verifyExtraction;
    case "review": return verifyReviewQueue;
    case "inbox": return verifyInbox;
    case "documents": return verifyDocuments;
    case "cash": return verifyCash;
    case "payroll": return verifyPayroll;
    case "reports": return verifyReports;
    case "settings": return verifySettings;
    default: return undefined;
  }
}

export function getLocalQaScenarioDefinitions(): readonly LocalQaScenarioDefinition[] {
  return ROUTE_DEFINITIONS.flatMap((route) => LOCAL_QA_VIEWPORTS.map((viewport) => ({
    id: `route-${route.id}-${viewport.name}`,
    surface: route.label,
    path: route.path,
    interactionState: "authenticated base route and responsive surface",
    viewport,
    captureScreenshot: route.id !== "inbox" && viewport.name === "mobile-390",
    action: routeAction(route.id),
  })));
}

async function projectIdFromRegister(page: any, baseUrl: string, waitForApp: (page: any) => Promise<void>, timeoutMs: number) {
  await page.setViewportSize({ width: QA_VIEWPORTS.desktop.width, height: QA_VIEWPORTS.desktop.height });
  await page.goto(`${baseUrl}/projects`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await waitForApp(page);
  const rows = await page.locator("[data-project-id]").evaluateAll((elements: HTMLElement[]) => elements.map((element) => ({
    id: element.getAttribute("data-project-id") || "",
    synthetic: (element.textContent || "").includes("QA-LOCAL-HARNESS"),
  })));
  return rows.find((row) => row.synthetic)?.id || rows[0]?.id || "";
}

async function runScenario(options: LocalQaScenarioRunOptions, definition: LocalQaScenarioDefinition): Promise<LocalQaScenarioEvidence> {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const telemetry = telemetryFor(options.page);
  const requestedPath = normalizeBrowserPath(definition.path);
  let response: any = null;
  let screenshotPath: string | null = null;
  let screenshotError = "";
  let actionResult: ScenarioActionResult = {};
  let metrics = { documentWidth: 0, bodyWidth: 0, viewportWidth: definition.viewport.width, dialogOverflowCount: 0, interactiveOverflowCount: 0, headingCount: 0, bodyLength: 0, authFormCount: 0, workspaceReadyCount: 0 };
  let navigationError = "";
  try {
    await options.page.setViewportSize({ width: definition.viewport.width, height: definition.viewport.height });
    response = await options.page.goto(`${options.baseUrl}${definition.path}`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await options.waitForApp(options.page);
    if (definition.action) actionResult = (await definition.action(options.page, definition.viewport)) || {};
    metrics = await pageMetrics(options.page);
  } catch (error) {
    navigationError = normalizeErrorMessage(error, "Local QA scenario failed.");
    try { metrics = await pageMetrics(options.page); } catch { /* preserve the primary scenario error */ }
  }

  const overflow = createOverflowResult(metrics);
  const assertions: LocalQaScenarioAssertion[] = [
    assertion("authenticated-workspace", metrics.authFormCount === 0 && metrics.workspaceReadyCount > 0, "The authenticated workspace shell remained mounted."),
    assertion("route-has-content", metrics.headingCount > 0 && metrics.bodyLength > 80, "The route rendered a headed content surface."),
    ...(actionResult.assertions || []),
  ];
  if (navigationError) assertions.push(assertion("scenario-executed", false, navigationError));

  if (definition.captureScreenshot !== false) {
    try {
      await options.page.evaluate(() => window.scrollTo(0, 0));
      const relative = path.join("screenshots", `${slug(definition.id)}.png`);
      const absolute = path.join(options.outputDir, relative);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await options.page.screenshot({ path: absolute, fullPage: true });
      screenshotPath = relative.replaceAll("\\", "/");
    } catch (error) {
      screenshotError = normalizeErrorMessage(error, "Scenario screenshot failed.");
    }
  }

  const hasBlockingTelemetry = telemetry.consoleErrors.some((error) => !error.ignored)
    || telemetry.pageErrors.length > 0
    || telemetry.failedRequests.some((request) => !request.ignored);
  const hasFailedAssertion = assertions.some((item) => !item.passed);
  const failed = Boolean(navigationError || hasBlockingTelemetry || hasFailedAssertion || overflow.detected || metrics.dialogOverflowCount > 0 || metrics.interactiveOverflowCount > 0 || screenshotError);
  const finalPath = normalizeBrowserPath(options.page.url?.() || definition.path);
  const status: LocalQaScenarioStatus = failed
    ? "FAIL"
    : actionResult.status || "PASS";
  telemetry.detach();
  return {
    id: definition.id,
    surface: definition.surface,
    requestedPath,
    finalPath,
    interactionState: definition.interactionState,
    viewport: definition.viewport,
    status,
    screenshotPath,
    ...(screenshotError ? { screenshotError } : {}),
    consoleErrors: telemetry.consoleErrors,
    pageErrors: telemetry.pageErrors,
    failedRequests: telemetry.failedRequests,
    overflow,
    dialogOverflowCount: metrics.dialogOverflowCount,
    interactiveOverflowCount: metrics.interactiveOverflowCount,
    navigation: {
      requestedPath,
      finalPath,
      status: response?.status?.() ?? null,
      loaded: !navigationError && Boolean(response ? (response.status?.() || 200) < 400 : true),
      ...(navigationError ? { error: navigationError } : {}),
    },
    assertions,
    ...(actionResult.details ? { details: actionResult.details } : {}),
  };
}

export async function runLocalQaScenarios(options: LocalQaScenarioRunOptions): Promise<LocalQaScenarioRunResult> {
  const scenarios: LocalQaScenarioEvidence[] = [];
  for (const definition of getLocalQaScenarioDefinitions()) {
    scenarios.push(await runScenario(options, definition));
  }

  const legacyAliases = [
    { path: "/email-intake", viewport: QA_VIEWPORTS.desktop },
    { path: "/inbox", viewport: QA_VIEWPORTS.mobile },
  ] as const;
  for (const { path: alias, viewport } of legacyAliases) {
    scenarios.push(await runScenario(options, {
      id: `legacy-email-alias-${slug(alias)}-${viewport.name}`,
      surface: "Email / SMS",
      path: alias,
      interactionState: "legacy Gmail intake alias preserved",
      viewport,
      captureScreenshot: false,
      action: verifyInbox,
    }));
  }

  let projectId = "";
  try {
    projectId = await projectIdFromRegister(options.page, options.baseUrl, options.waitForApp, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  } catch {
    // Keep the route-level evidence and report the project workspace as
    // untested when the current authenticated QA dataset cannot provide a
    // safe project context.
  }
  if (projectId) {
    for (const viewport of LOCAL_QA_VIEWPORTS) {
      scenarios.push(await runScenario(options, {
        id: `project-workspace-${viewport.name}`,
        surface: "Projects / related workspaces",
        path: `/projects/${projectId}`,
        interactionState: "project workspace tabs and cross-module owner context",
        viewport,
        captureScreenshot: viewport.name === "mobile-390",
        action: verifyProjectWorkspace,
      }));
    }
  } else {
    scenarios.push({
      id: "project-workspace-unavailable",
      surface: "Projects / related workspaces",
      requestedPath: "/projects/:synthetic-project-id",
      finalPath: "/projects",
      interactionState: "project workspace tabs and cross-module owner context",
      viewport: QA_VIEWPORTS.desktop,
      status: "NOT_TESTED",
      screenshotPath: null,
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      overflow: createOverflowResult({ documentWidth: QA_VIEWPORTS.desktop.width, bodyWidth: QA_VIEWPORTS.desktop.width, viewportWidth: QA_VIEWPORTS.desktop.width }),
      dialogOverflowCount: 0,
      interactiveOverflowCount: 0,
      navigation: { requestedPath: "/projects/:synthetic-project-id", finalPath: "/projects", status: null, loaded: false, error: "No project record was available in the authenticated QA register." },
      assertions: [assertion("project-workspace-available", true, "No project record was available in the authenticated QA register.")],
      details: "Project workspace coverage requires at least one authorized QA project record.",
    });
  }

  for (const viewport of [QA_VIEWPORTS.desktop, QA_VIEWPORTS.mobile] as const) {
    scenarios.push(await runScenario(options, {
      id: `email-compose-review-${viewport.name}`,
      surface: "Email / SMS",
      path: "/email-sms?view=compose",
      interactionState: "compose draft reviewed without send",
      viewport,
      captureScreenshot: viewport.name === "mobile-390",
      action: verifyEmailCompose,
    }));
    scenarios.push(await runScenario(options, {
      id: `sms-provider-status-${viewport.name}`,
      surface: "Email / SMS",
      path: "/email-sms?view=sms",
      interactionState: "SMS provider status inspected",
      viewport,
      captureScreenshot: viewport.name === "mobile-390",
      action: verifySms,
    }));
  }

  const summary = {
    total: scenarios.length,
    pass: scenarios.filter((scenario) => scenario.status === "PASS").length,
    fail: scenarios.filter((scenario) => scenario.status === "FAIL").length,
    blocked: scenarios.filter((scenario) => scenario.status === "BLOCKED").length,
    notTested: scenarios.filter((scenario) => scenario.status === "NOT_TESTED").length,
    overflowFailures: scenarios.filter((scenario) => scenario.overflow.detected).length,
    dialogOverflowFailures: scenarios.filter((scenario) => scenario.dialogOverflowCount > 0).length,
    interactiveOverflowFailures: scenarios.filter((scenario) => scenario.interactiveOverflowCount > 0).length,
  } as const;
  return { scenarios, summary };
}
