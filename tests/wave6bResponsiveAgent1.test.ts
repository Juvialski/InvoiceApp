import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const cash = source("src/components/CashBankingPage.tsx");
const settlements = source("src/components/InvoiceSettlementDirectoryPanel.tsx");
const documents = source("src/components/engineering/ProjectDocuments.tsx");
const rfis = source("src/components/engineering/ProjectRfis.tsx");
const submittals = source("src/components/engineering/ProjectSubmittals.tsx");
const siteLogs = source("src/components/engineering/ProjectSiteLogs.tsx");
const invoices = source("src/components/InvoiceDirectory.tsx");
const verification = source("src/components/VerificationWorkspace.tsx");

test("Wave 6B Agent 1 keeps assigned directories safe at mobile and tablet widths", () => {
  assert.match(cash, /import \{ useDialogFocus \} from "\.\/ui\/useDialogFocus\.ts";/);
  assert.match(cash, /CashModalBusyContext\.Provider value=\{busy !== null\}/);
  assert.match(cash, /if \(!modalBusy\) onClose\(\)/);
  assert.match(cash, /disabled=\{modalBusy\}/);
  assert.match(cash, /ref=\{dialogRef\}/);
  assert.match(cash, /max-h-\[min\(92vh,54rem\)\] min-h-0/);
  assert.match(cash, /overflow-y-auto overscroll-contain/);

  assert.match(documents, /min-w-0 overflow-x-auto/);
  assert.match(documents, /min-w-\[960px\] w-full/);
  assert.match(documents, /aria-label="Search engineering documents"/);
  assert.match(documents, /max-h-\[min\(92vh,54rem\)\] min-h-0/);

  assert.match(rfis, /aria-label="Search RFIs"/);
  assert.match(rfis, /lg:grid-cols-\[120px_minmax\(240px,1fr\)_140px_110px_130px_30px\]/);
  assert.match(rfis, /min-w-0 break-words leading-5/);

  assert.match(submittals, /aria-label="Search submittals"/);
  assert.match(submittals, /lg:grid-cols-\[130px_minmax\(250px,1fr\)_155px_115px_95px_125px_28px\]/);
  assert.match(submittals, /min-w-0 break-words leading-5/);

  assert.match(siteLogs, /max-h-\[min\(94vh,60rem\)\] min-h-0/);
  assert.match(siteLogs, /min-w-0 break-words leading-5/);

  assert.match(invoices, /ops-scrollbar overflow-auto/);
  assert.match(invoices, /min-w-\[1080px\] w-full/);
});

test("Wave 6B Agent 1 preserves retry and long-content recovery affordances", () => {
  assert.match(settlements, /const \[refreshAttempt, setRefreshAttempt\]/);
  assert.match(settlements, /role="alert"/);
  assert.match(settlements, /setRefreshAttempt\(\(attempt\) => attempt \+ 1\)/);
  assert.match(settlements, /flex-wrap items-center justify-between gap-2/);

  assert.match(rfis, /role="alert" className="break-words/);
  assert.match(rfis, /break-words whitespace-pre-wrap text-sm leading-6/);
  assert.match(submittals, /role="alert" className="break-words/);
  assert.match(siteLogs, /break-words text-sm font-semibold/);
  assert.match(verification, /flex min-w-0 flex-wrap items-center justify-between gap-2/);
  assert.match(verification, /role="status" aria-live="polite"/);
});

test("Wave 6B Agent 1 preserves settlement demo namespace and directory focus routing", () => {
  assert.match(settlements, /invoice\.id\.startsWith\("demo-"\)/);
  assert.match(settlements, /demoSettlementSummaryForTarget\("INVOICE", invoice\.id\)/);
  assert.match(settlements, /!invoice\.id\.startsWith\("demo-"\) && !invoice\.id\.startsWith\("local-"\)/);
  assert.match(settlements, /appPathForInvoice\(invoice\.id\)/);
  assert.match(settlements, /focus-visible:ring-2 focus-visible:ring-indigo-500/);
});

test("Wave 6B Agent 1 gives compact controls accessible names", () => {
  assert.match(documents, /aria-label="Grid view"/);
  assert.match(documents, /aria-label="Table view"/);
  assert.match(documents, /aria-label=\{`Open revision history for \$\{doc\.documentNumber\}`\}/);
  assert.match(verification, /aria-label=\{`Allocation \$\{index \+ 1\} project`\}/);
  assert.match(verification, /aria-label=\{`Allocation \$\{index \+ 1\} value`\}/);
  assert.match(verification, /aria-label=\{`Allocation \$\{index \+ 1\} type`\}/);
  assert.match(verification, /aria-pressed=\{mobilePane === "details"\}/);
  assert.match(verification, /aria-pressed=\{mobilePane === "source"\}/);
});
