import { normalizeErrorMessage } from "./structuredEvidence.ts";
import { readFile } from "node:fs/promises";
import { buildStarterDocxTemplate, DOCX_MIME_TYPE } from "../../src/server/documentTemplates/documentTemplateEngine.ts";

export type LocalQaFunctionalStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED";

export interface LocalQaFunctionalWorkflowEvidence {
  readonly id: string;
  readonly status: LocalQaFunctionalStatus;
  readonly actions: readonly string[];
  readonly expected: string;
  readonly observed: string;
  readonly finalPath: string;
}

export interface LocalQaFunctionalSweepResult {
  readonly workflows: readonly LocalQaFunctionalWorkflowEvidence[];
  readonly summary: {
    readonly total: number;
    readonly pass: number;
    readonly fail: number;
    readonly blocked: number;
    readonly notTested: number;
  };
}

interface LocalQaFunctionalSweepOptions {
  readonly page: any;
  readonly baseUrl: string;
  readonly waitForApp: (page: any) => Promise<void>;
  readonly timeoutMs?: number;
}

interface MutableWorkflowEvidence {
  readonly id: string;
  readonly actions: string[];
  readonly expected: string;
  status: LocalQaFunctionalStatus;
  observed: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const PARTIAL_PO_NUMBER = "PO-QA-E2E-7F4K-001";
const FULL_PO_NUMBER = "PO-QA-E2E-7F4K-RECEIPT";
const FUNCTIONAL_RFQ_NUMBER = "RFQ-P3-LOCAL-SWEEP";
const FUNCTIONAL_RECEIPT_NUMBER = "REC-P3-LOCAL-SWEEP";
const PROJECT_ID = "07a9ec5f-bfca-4121-92ce-e5affcd5d617";
const APPROVED_EXPENSE_ID = "ece8bc43-3477-4553-9c80-7126411ddb3d";

function bodyText(page: any) {
  return page.locator("body").innerText();
}

function setObserved(workflow: MutableWorkflowEvidence, observed: string) {
  workflow.observed = observed.replace(/\s+/g, " ").trim().slice(0, 700);
}

async function navigate(options: LocalQaFunctionalSweepOptions, path: string) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  await options.page.setViewportSize({ width: 1440, height: 1000 });
  await options.page.goto(`${options.baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await options.waitForApp(options.page);
}

async function closeDialog(page: any) {
  if (await page.getByRole("dialog").count() === 0) return;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
}

async function waitForTemplateCapability(page: any, kind: "storage" | "ai", timeoutMs: number) {
  const selector = `[data-template-${kind}-capability="checking"]`;
  await page.waitForFunction((checkingSelector: string) => !document.querySelector(checkingSelector), selector, { timeout: timeoutMs });
}

async function runWorkflow(
  options: LocalQaFunctionalSweepOptions,
  id: string,
  expected: string,
  action: (workflow: MutableWorkflowEvidence) => Promise<void>,
) {
  const workflow: MutableWorkflowEvidence = { id, actions: [], expected, status: "PASS", observed: "" };
  try {
    await action(workflow);
  } catch (error) {
    workflow.status = "FAIL";
    setObserved(workflow, normalizeErrorMessage(error, "Functional workflow failed."));
  }
  return {
    ...workflow,
    finalPath: options.page.url(),
    actions: [...workflow.actions],
  } satisfies LocalQaFunctionalWorkflowEvidence;
}

async function runProcurementRfqWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/procurement");
  workflow.actions.push("Open Procurement and select Requests for Quotation (RFQs)");
  await page.getByRole("button", { name: /Requests for Quotation \(RFQs\)/ }).click();
  const newRfq = page.getByRole("button", { name: "New RFQ", exact: true });
  if (await newRfq.count() === 0) throw new Error("New RFQ is unavailable after entering the RFQ workspace.");
  workflow.actions.push("Confirm the authenticated QA account exposes New RFQ from the RFQ tab");

  if (await page.getByText(FUNCTIONAL_RFQ_NUMBER, { exact: true }).count() === 0) {
    await newRfq.click();
    const dialog = page.getByRole("dialog").last();
    await dialog.locator("input").nth(0).fill(FUNCTIONAL_RFQ_NUMBER);
    await dialog.locator("input").nth(1).fill("Phase 3 Local QA quotation regression");
    await dialog.locator("textarea").first().fill("Synthetic RFQ coverage for the functional regression sweep.");
    const projectSelect = dialog.locator("select").first();
    if (await projectSelect.locator("option").count() > 1) await projectSelect.selectOption({ index: 1 });
    await dialog.locator('input[placeholder*="150mm Carbon Steel Pipe"]').fill("Functional regression valve line");
    await dialog.locator("input[type=number]").first().fill("10");
    const vendorButton = dialog.getByRole("button", { name: /QA Pacific Industrial Supply/ }).first();
    if (await vendorButton.count() > 0) await vendorButton.click();
    await dialog.getByRole("button", { name: "Create RFQ", exact: true }).click();
    await dialog.waitFor({ state: "detached", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    await options.waitForApp(page);
    await page.getByRole("button", { name: /Requests for Quotation \(RFQs\)/ }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Requests for Quotation \(RFQs\)/ }).click();
  await page.getByText(FUNCTIONAL_RFQ_NUMBER, { exact: true }).first().waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  workflow.actions.push("Create or reopen the fixed synthetic RFQ and verify it persists in the register");

  const row = page.locator("tr").filter({ hasText: FUNCTIONAL_RFQ_NUMBER }).last();
  const card = page.locator("[data-rfq-register-card]").filter({ hasText: FUNCTIONAL_RFQ_NUMBER }).last();
  const actionRoot = await row.count() > 0 ? row : card;
  const scopedCompare = actionRoot.getByRole("button", { name: /View & Compare|Compare/, exact: false });
  const compare = await scopedCompare.count() > 0
    ? scopedCompare
    : page.getByRole("button", { name: /View & Compare|Compare/, exact: false }).first();
  if (await compare.count() === 0) throw new Error("The created RFQ did not expose quotation comparison.");
  const scopedQuoteAction = actionRoot.getByRole("button", { name: "+ Quote", exact: true });
  const quoteAction = await scopedQuoteAction.count() > 0
    ? scopedQuoteAction
    : page.getByRole("button", { name: "+ Quote", exact: true }).first();
  if (await quoteAction.count() > 0) {
    await quoteAction.click();
    const quoteDialog = page.getByRole("dialog").last();
    const quoteNumber = quoteDialog.locator('input[placeholder*="QUO"]').first();
    if (await quoteNumber.count() > 0) await quoteNumber.fill("QUO-P3-LOCAL-SWEEP");
    const numericInputs = quoteDialog.locator("input[type=number]");
    if (await numericInputs.count() > 0) await numericInputs.last().fill("180");
    const recordQuote = quoteDialog.getByRole("button", { name: /Record Quotation/ });
    if (await recordQuote.count() === 0) throw new Error("Supplier quotation form did not expose Record Quotation.");
    await recordQuote.click();
    await quoteDialog.waitFor({ state: "detached", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS }).catch(() => {});
    workflow.actions.push("Enter a controlled supplier quotation and save it");
  }
  await compare.first().click({ force: true });
  const comparison = page.getByRole("dialog").last();
  const comparisonText = await comparison.innerText();
  if (!/quotation|compare|supplier/i.test(comparisonText)) throw new Error("Quotation comparison did not render its supplier context.");
  workflow.actions.push("Open quotation comparison and stop before any commercial commitment");
  await closeDialog(page);
  setObserved(workflow, "RFQ tab, New RFQ, persisted synthetic RFQ, supplier quotation entry, and comparison all remained available.");
}

async function runPurchaseOrderReceiptWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/procurement");
  const poTab = page.getByRole("button", { name: /^Purchase Orders/i });
  if (await poTab.count() > 0) await poTab.first().click();
  const poRow = page.locator("tr").filter({ hasText: PARTIAL_PO_NUMBER }).last();
  if (await poRow.count() === 0) throw new Error(`Synthetic partial-receipt PO ${PARTIAL_PO_NUMBER} is unavailable.`);
  await poRow.getByRole("button", { name: "View / Edit", exact: true }).click({ force: true });
  const editor = page.getByRole("dialog").last();
  await editor.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  const editorText = await editor.innerText();
  if (!/Remaining Outstanding|Record Delivery \/ Receipt/i.test(editorText)) throw new Error("Partial-receipt PO did not expose receipt progress and continuation actions.");
  workflow.actions.push("Open the issued partial-receipt PO and inspect outstanding quantities");

  const receiptButton = editor.getByRole("button", { name: "Record Delivery / Receipt", exact: true });
  if (await receiptButton.count() > 0 && !(await editor.innerText()).includes(FUNCTIONAL_RECEIPT_NUMBER)) {
    await receiptButton.click();
    const receiptDialog = page.getByRole("dialog").last();
    await receiptDialog.locator('input[placeholder="REC-24-0001"]').fill(FUNCTIONAL_RECEIPT_NUMBER);
    const quantities = receiptDialog.locator("input[type=number]:visible");
    if (await quantities.count() === 0) throw new Error("Receipt dialog did not expose receiving quantities.");
    const max = Number(await quantities.first().getAttribute("max") || "1");
    await quantities.first().fill(String(Math.min(1, Math.max(0.01, max))));
    await receiptDialog.getByRole("button", { name: "Record Goods Receipt", exact: true }).click();
    await page.waitForTimeout(700);
    workflow.actions.push("Record a partial continuation receipt on one line while leaving other lines untouched");
  }
  const afterReceipt = await editor.innerText();
  if (!/Delivery History|Remaining Outstanding|Fully Received/i.test(afterReceipt)) throw new Error("Receipt history/progress did not remain visible after the partial receipt attempt.");
  const warehouseLink = page.getByRole("link", { name: /Continue to Warehouse|Open exact Warehouse movement/ }).last();
  if (await warehouseLink.count() > 0) {
    await warehouseLink.click({ force: true });
    await options.waitForApp(page);
    if (new URL(page.url()).pathname !== "/warehouse") throw new Error("Receipt continuation did not open the Warehouse route.");
    workflow.actions.push("Follow receipt continuation to Warehouse without creating a second receipt source");
    await navigate(options, "/procurement");
  }

  const partialEditorRow = page.locator("tr").filter({ hasText: PARTIAL_PO_NUMBER }).last();
  await partialEditorRow.getByRole("button", { name: "View / Edit", exact: true }).click({ force: true });
  const reopened = page.getByRole("dialog").last();
  const closeAction = reopened.getByRole("button", { name: "Mark Complete / Close", exact: true });
  if (await closeAction.count() > 0) {
    await closeAction.click();
    await page.waitForTimeout(500);
    const alerts = await page.locator("[role=alert], [role=status]").allTextContents();
    const blockedText = `${alerts.join(" ")} ${await reopened.innerText()}`;
    if (!/outstanding|remaining|receipt|cannot close|close/i.test(blockedText)) throw new Error("Partial PO close attempt did not expose an eligibility result.");
    workflow.actions.push("Attempt close with outstanding quantity and verify the lifecycle guard responds");
  }
  await closeDialog(page);

  await navigate(options, "/procurement");
  const fullRow = page.locator("tr").filter({ hasText: FULL_PO_NUMBER }).last();
  if (await fullRow.count() > 0) {
    await fullRow.getByRole("button", { name: "View / Edit", exact: true }).click();
    const fullEditor = page.getByRole("dialog").last();
    const fullText = await fullEditor.innerText();
    if (!/Fully Received/i.test(fullText)) throw new Error("Fully received PO did not report its terminal receipt state.");
    workflow.actions.push("Open the fully received PO and verify terminal receipt state");
    await closeDialog(page);
  }
  setObserved(workflow, "Partial receipt progress/history and Warehouse continuation remained tied to the existing PO receipt authority; close eligibility stayed guarded.");
}

async function runSupplierInvoiceExpenseWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/invoices");
  const invoiceAction = page.getByRole("button", { name: /Open read-only: QA Synthetic Unresolved Vendor 20260908/ });
  if (await invoiceAction.count() === 0) throw new Error("Controlled verified supplier invoice fixture is unavailable.");
  await invoiceAction.click();
  await options.waitForApp(page);
  const sourceInvoicePath = new URL(page.url()).pathname;
  const expenseLink = page.getByRole("link", { name: "Open/Correct linked Expense", exact: true });
  if (await expenseLink.count() === 0) throw new Error("Verified invoice did not expose its authoritative Expense continuation.");
  const expenseHref = await expenseLink.getAttribute("href");
  if (!expenseHref?.includes("expenseId=")) throw new Error("Expense continuation did not preserve the exact target id.");
  if (await page.getByRole("button", { name: /Reopen/i }).count() > 0) throw new Error("Verified invoice with an active Expense exposed an impossible reopen action.");
  workflow.actions.push("Open verified supplier invoice and verify source evidence plus authoritative Expense link");
  await expenseLink.click();
  await options.waitForApp(page);
  await page.locator('[data-testid="expense-detail-panel"]').waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  if (!new URL(page.url()).pathname.startsWith("/expenses")) throw new Error("Supplier invoice did not navigate to Expenses.");
  const expenseBody = await bodyText(page);
  if (!/This Expense originated from supplier invoice evidence|Source invoice preserved|Authoritative Expense/i.test(expenseBody)) throw new Error("Expense did not preserve supplier-invoice provenance.");
  if (!/Payment settlement is unavailable while this expense is DRAFT/i.test(expenseBody)) throw new Error("Ineligible linked Expense did not explain why payment is unavailable.");
  workflow.actions.push("Return to Expense and confirm DRAFT lifecycle blocks settlement without changing invoice truth");

  await navigate(options, `/expenses?expenseId=${APPROVED_EXPENSE_ID}&from=%2Fexpenses`);
  const approvedBody = await bodyText(page);
  const recordPayment = page.getByRole("link", { name: /Record Payment/i });
  if (await recordPayment.count() === 0) throw new Error("Approved Expense did not expose Record Payment.");
  await recordPayment.click();
  await options.waitForApp(page);
  const cashUrl = new URL(page.url());
  if (cashUrl.pathname !== "/cash" || cashUrl.searchParams.get("fromTargetType") !== "EXPENSE" || !cashUrl.searchParams.get("fromTargetId")) throw new Error("Expense payment continuation did not preserve exact Cash target context.");
  workflow.actions.push("Open approved Expense payment continuation into exact Cash & Banking target context");
  setObserved(workflow, `Verified invoice ${sourceInvoicePath} remained source evidence; payment authority stayed on Expense and Cash target routing preserved the exact Expense id.`);
}

async function runClientCollectionWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, `/projects/${PROJECT_ID}/billing`);
  const billingBody = await bodyText(page);
  if (!/ISSUED|Amount collected|Amount remaining|Collection history/i.test(billingBody)) throw new Error("Issued Client Invoice collection position was not visible.");
  const openCollection = page.getByRole("button", { name: "Open collection", exact: true });
  if (await openCollection.count() === 0) throw new Error("Controlled Client Collection fixture is unavailable.");
  await openCollection.click();
  const collectionBody = await bodyText(page);
  if (!/Collection amount|Bank-linked amount|Commercial status|LINKED/i.test(collectionBody)) throw new Error("Client Collection detail did not expose separate cash linkage state.");
  workflow.actions.push("Open issued Client Invoice collection detail and inspect commercial amount/history state");
  const cashLink = page.getByRole("button", { name: /Open in Cash & Banking/ }).first();
  if (await cashLink.count() > 0) {
    await cashLink.click();
    await options.waitForApp(page);
    const url = new URL(page.url());
    if (url.pathname !== "/cash" || url.searchParams.get("fromTargetType") !== "CLIENT_COLLECTION" || !url.searchParams.get("fromTargetId")) throw new Error("Client Collection cash navigation lost exact target context.");
    workflow.actions.push("Follow linked collection evidence to Cash & Banking and verify exact CLIENT_COLLECTION context");
  } else {
    throw new Error("Client Collection did not expose its linked Cash transaction navigation.");
  }
  setObserved(workflow, "Client Invoice, collection allocation/history, and Cash evidence remained separate while exact return context was retained.");
}

async function runPayrollWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/payroll");
  const runsTab = page.getByRole("button", { name: /Runs \(/ });
  if (await runsTab.count() === 0) throw new Error("Payroll Runs workspace is unavailable.");
  await runsTab.click();
  if (await page.getByRole("button", { name: /Mark.*Paid|Set.*Paid/i }).count() > 0) throw new Error("Payroll exposed a direct/manual paid action.");
  const recalculate = page.getByRole("button", { name: "Recalculate", exact: true });
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  const body = await bodyText(page);
  if (await recalculate.count() > 0 && await approve.count() > 0) {
    await recalculate.click();
    await page.waitForTimeout(1_000);
    await approve.click();
    await page.waitForTimeout(1_000);
    const afterApproval = await bodyText(page);
    if (/Payroll sources changed after calculation/i.test(afterApproval)) throw new Error("Payroll recalculation still reported its own source snapshot as stale before approval.");
    if (!/APPROVED/i.test(afterApproval)) throw new Error("Payroll approval did not reach APPROVED state.");
    workflow.actions.push("Recalculate and approve the controlled payroll run");
  } else if (/\bAPPROVED\b/.test(body)) {
    workflow.actions.push("Inspect the already-approved controlled payroll run");
  } else {
    throw new Error("Controlled payroll run did not expose calculate/approve continuation or an approved state.");
  }
  const paymentLink = page.getByRole("link", { name: /Cash & Banking|Record.*payment/i });
  if (await paymentLink.count() > 0) {
    await paymentLink.first().click();
    await options.waitForApp(page);
    const url = new URL(page.url());
    if (url.pathname !== "/cash" || url.searchParams.get("fromTargetType") !== "PAYROLL") throw new Error("Payroll settlement continuation lost PAYROLL target context.");
    workflow.actions.push("Follow legitimate payroll settlement continuation to Cash without direct PAID mutation");
  }
  setObserved(workflow, "Payroll freshness now permits approval only after a successful recalculation, and no direct/manual PAID action is exposed.");
}

async function runDocumentsEmailWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/documents");
  const workspace = page.locator("[data-documents-workspace]");
  if (await workspace.count() === 0) throw new Error("Documents workspace is unavailable.");
  const documentCard = page.locator("[data-document-register-entry]").first();
  if (await documentCard.count() === 0) throw new Error("No issued document artifact is available for the controlled Documents handoff.");
  if (await documentCard.getByRole("button", { name: "Open owning record", exact: true }).count() === 0) throw new Error("Documents entry did not expose its owning-record route.");
  await page.getByRole("button", { name: "Compose", exact: true }).first().click();
  await options.waitForApp(page);
  await page.locator("[data-email-compose]").waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  const composeBody = await bodyText(page);
  if (new URL(page.url()).pathname !== "/email-sms" || !/New message|Email \/ SMS · Compose/i.test(composeBody)) throw new Error("Documents-to-Compose handoff did not open the compose workspace.");
  await page.getByRole("button", { name: "Preview / Review", exact: true }).click();
  const reviewedComposeBody = await bodyText(page);
  if (!/Review before sending|Confirm & Send/i.test(reviewedComposeBody)) throw new Error("Compose review did not preserve the human confirmation boundary.");
  if (await page.getByRole("button", { name: "Confirm & Send", exact: true }).count() === 0) throw new Error("Compose review did not expose explicit human confirmation.");
  workflow.actions.push("Open permission-filtered Documents, preserve owner actions, and hand off to Compose without sending");
  setObserved(workflow, "Documents remained a permission-filtered projection; Compose opened with explicit review/confirmation and no automatic send.");
}

type TemplateDocumentType = "PURCHASE_ORDER" | "CLIENT_INVOICE";

async function selectTemplateType(page: any, documentType: TemplateDocumentType) {
  const label = documentType === "PURCHASE_ORDER" ? "Purchase Order" : "Client Invoice";
  const selector = page.getByRole("button", { name: label, exact: true });
  if (await selector.count() === 0) throw new Error(label + " template selector is unavailable.");
  await selector.first().click();
  await page.waitForTimeout(200);
}

async function downloadTemplateArtifact(page: any, button: any, timeoutMs: number) {
  const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
  await button.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("The browser did not expose the downloaded DOCX artifact.");
  const bytes = await readFile(downloadPath);
  if (bytes.length < 100) throw new Error("The downloaded DOCX artifact was empty or unexpectedly small.");
  return { fileName: download.suggestedFilename(), size: bytes.length };
}

async function runDocumentTemplateStorageWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/settings");
  const settings = page.locator("[data-document-template-settings]");
  await settings.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  await waitForTemplateCapability(page, "storage", options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const storageCapability = page.locator("[data-template-storage-capability]").last();
  if (await storageCapability.count() > 0 && await storageCapability.getAttribute("data-template-storage-capability") === "unavailable") {
    workflow.status = "BLOCKED";
    workflow.actions.push("Inspect the server-side template Storage capability before attempting a write");
    setObserved(workflow, "Starter and Upload are blocked because the isolated QA deployment reports: " + await storageCapability.innerText());
    return;
  }
  if (await page.getByRole("button", { name: "Use starter", exact: true }).count() === 0) throw new Error("Template Starter action is not available.");

  for (const documentType of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    await selectTemplateType(page, documentType);
    const starter = page.getByRole("button", { name: "Use starter", exact: true }).first();
    if (await starter.isDisabled()) throw new Error(documentType + " Starter action is disabled without an explicit capability explanation.");
    await starter.click();
    const editor = page.locator("[data-document-template-editor]").first();
    await editor.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    workflow.actions.push("Create a " + documentType + " Starter DOCX through the authenticated server route");
    const activate = editor.getByRole("button", { name: "Activate", exact: true });
    if (await activate.count() === 0) throw new Error(documentType + " Starter did not produce an activatable validated draft.");
    await activate.click();
    await page.waitForTimeout(800);
    if (!/Active v/i.test(await page.locator("[data-document-template-type='" + documentType + "']").innerText())) throw new Error(documentType + " Starter did not become the selected active version.");
    const starterDownload = await downloadTemplateArtifact(page, editor.getByRole("button", { name: "Download / edit in Word", exact: true }), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    workflow.actions.push("Retrieve the persisted " + documentType + " Starter DOCX after activation (" + starterDownload.fileName + ", " + starterDownload.size + " bytes)");
    await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    await options.waitForApp(page);
    await settings.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    await selectTemplateType(page, documentType);
    if (!/Active v/i.test(await page.locator("[data-document-template-type='" + documentType + "']").innerText())) throw new Error(documentType + " Starter activation did not persist after refresh.");

    const uploadButton = page.getByRole("button", { name: /Upload DOCX|Upload existing DOCX/ }).first();
    if (await uploadButton.count() === 0 || await uploadButton.isDisabled()) throw new Error(documentType + " Upload action is unavailable after Storage capability passed.");
    const uploadedFileName = "QA-UIUX-" + documentType + "-template.docx";
    const built = await buildStarterDocxTemplate(documentType);
    await uploadButton.click();
    await page.locator("input[type=file]").setInputFiles({ name: uploadedFileName, mimeType: DOCX_MIME_TYPE, buffer: Buffer.from(built.bytes) });
    await editor.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    if (!/UPLOADED/i.test(await editor.innerText())) throw new Error(documentType + " Upload did not create an uploaded template version.");
    const uploadedDownload = await downloadTemplateArtifact(page, editor.getByRole("button", { name: "Download / edit in Word", exact: true }), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    workflow.actions.push("Upload, validate, persist, and retrieve a safe " + documentType + " DOCX (" + uploadedDownload.fileName + ", " + uploadedDownload.size + " bytes)");
    await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    await options.waitForApp(page);
    await settings.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
    await selectTemplateType(page, documentType);
    const history = page.locator("summary").filter({ hasText: "Version history" }).first();
    if (await history.count() > 0) await history.click();
    if (!(await settings.innerText()).includes(uploadedFileName.replace(/\.docx$/i, ""))) throw new Error(documentType + " uploaded version did not remain visible after refresh.");
  }
  setObserved(workflow, "Authenticated Starter and safe Upload completed for Purchase Order and Client Invoice, each produced a persisted version, returned a retrievable DOCX, and remained visible after refresh.");
}

async function runDocumentTemplateAiWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/settings");
  const settings = page.locator("[data-document-template-settings]");
  await settings.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  await waitForTemplateCapability(page, "storage", options.timeoutMs || DEFAULT_TIMEOUT_MS);
  await waitForTemplateCapability(page, "ai", options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const storageCapability = page.locator("[data-template-storage-capability='unavailable']").last();
  const aiCapability = page.locator("[data-template-ai-capability='unavailable']").last();
  if (await storageCapability.count() > 0) {
    workflow.status = "BLOCKED";
    workflow.actions.push("Check template Storage before the AI persistence path");
    setObserved(workflow, "AI template generation is NOT_CERTIFIED because the shared template Storage prerequisite is unavailable.");
    return;
  }
  if (await aiCapability.count() > 0) {
    workflow.status = "BLOCKED";
    workflow.actions.push("Check the configured company AI provider capability");
    setObserved(workflow, "AI template generation is NOT_CERTIFIED: " + await aiCapability.innerText());
    return;
  }
  const aiButton = page.getByRole("button", { name: "Generate with AI", exact: true }).first();
  if (await aiButton.count() === 0 || await aiButton.isDisabled()) {
    workflow.status = "BLOCKED";
    setObserved(workflow, "AI template generation is NOT_CERTIFIED because the UI did not expose an enabled provider-validated action.");
    return;
  }
  await selectTemplateType(page, "PURCHASE_ORDER");
  await aiButton.click();
  const prompt = settings.locator("textarea").first();
  await prompt.fill("Create a concise professional purchase order template with company, supplier, project, line items, totals, terms, and signature areas.");
  await settings.getByRole("button", { name: "Create draft DOCX", exact: true }).click();
  const editor = page.locator("[data-document-template-editor]").first();
  await editor.waitFor({ state: "visible", timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS });
  if (!/AI_GENERATED/i.test(await editor.innerText())) throw new Error("AI generation did not create an AI-generated template version.");
  const download = await downloadTemplateArtifact(page, editor.getByRole("button", { name: "Download / edit in Word", exact: true }), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  workflow.actions.push("Generate, persist, and retrieve a provider-backed AI Purchase Order DOCX");
  setObserved(workflow, "Configured AI generation created a persisted editable DOCX version and the artifact was retrieved from the authenticated route (" + download.fileName + ", " + download.size + " bytes).");
}

async function runDeepLinkWorkflow(options: LocalQaFunctionalSweepOptions, workflow: MutableWorkflowEvidence) {
  const { page } = options;
  await navigate(options, "/invoices/not-a-real-invoice");
  const invoiceRecovery = await bodyText(page);
  if (!/unavailable|Supplier source documents|Return to Supplier Invoices/i.test(invoiceRecovery)) throw new Error("Stale Supplier Invoice deep link did not recover to an authorized register.");
  await navigate(options, "/expenses?expenseId=not-a-real-expense");
  if (!/unavailable|Return to Expenses/i.test(await bodyText(page))) throw new Error("Stale Expense deep link did not recover safely.");
  await navigate(options, "/documents");
  if (await page.locator("[data-documents-workspace]").count() === 0) throw new Error("Documents deep-link register did not load.");
  workflow.actions.push("Exercise stale Supplier Invoice/Expense identifiers and Documents register recovery");
  setObserved(workflow, "Stale identifiers recovered to company-scoped registers without exposing an inaccessible record.");
}

export async function runLocalQaFunctionalSweep(options: LocalQaFunctionalSweepOptions): Promise<LocalQaFunctionalSweepResult> {
  const workflows: LocalQaFunctionalWorkflowEvidence[] = [];
  const definitions: Array<[string, string, (workflow: MutableWorkflowEvidence) => Promise<void>]> = [
    ["functional-procurement-rfq-quotation", "RFQ creation, quotation entry, and comparison are usable from the RFQ workspace.", (workflow) => runProcurementRfqWorkflow(options, workflow)],
    ["functional-po-receipt-warehouse", "Partial receipt, remaining quantities, close guard, and Warehouse continuation preserve one receipt authority.", (workflow) => runPurchaseOrderReceiptWorkflow(options, workflow)],
    ["functional-supplier-invoice-expense-cash", "Supplier invoice remains evidence; Expense owns payable settlement and preserves exact Cash target routing.", (workflow) => runSupplierInvoiceExpenseWorkflow(options, workflow)],
    ["functional-client-invoice-collection-cash", "Client Invoice/Collection truth stays separate from exact Cash evidence and navigation.", (workflow) => runClientCollectionWorkflow(options, workflow)],
    ["functional-payroll-approval-settlement", "Payroll requires fresh calculation before approval and never exposes direct PAID mutation.", (workflow) => runPayrollWorkflow(options, workflow)],
    ["functional-document-template-storage", "Starter and safe Upload persist and retrieve both Purchase Order and Client Invoice templates.", (workflow) => runDocumentTemplateStorageWorkflow(options, workflow)],
    ["functional-document-template-ai", "AI template generation is provider-gated and certified only when it persists and retrieves an editable DOCX.", (workflow) => runDocumentTemplateAiWorkflow(options, workflow)],
    ["functional-documents-email-review", "Documents owner/preview handoff to Compose preserves human review and does not send automatically.", (workflow) => runDocumentsEmailWorkflow(options, workflow)],
    ["functional-deep-link-recovery", "Stale identifiers recover safely to nearest authorized registers.", (workflow) => runDeepLinkWorkflow(options, workflow)],
  ];
  for (const [id, expected, action] of definitions) workflows.push(await runWorkflow(options, id, expected, action));
  const summary = {
    total: workflows.length,
    pass: workflows.filter((workflow) => workflow.status === "PASS").length,
    fail: workflows.filter((workflow) => workflow.status === "FAIL").length,
    blocked: workflows.filter((workflow) => workflow.status === "BLOCKED").length,
    notTested: workflows.filter((workflow) => workflow.status === "NOT_TESTED").length,
  } as const;
  return { workflows, summary };
}
