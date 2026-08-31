import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const workers = read("src/components/payroll/WorkersTable.tsx");
const assignments = read("src/components/payroll/ProjectAssignments.tsx");
const payrollV2 = read("src/components/payroll/PayrollPageV2.tsx");
const documents = read("src/components/engineering/ProjectDocuments.tsx");
const lifecycle = read("src/components/engineering/EngineeringLifecycleDialog.tsx");
const companyProfile = read("src/components/access/CompanyProfileSettings.tsx");
const access = read("src/components/access/DeploymentAccessManagement.tsx");
const settings = read("src/components/Settings.tsx");
const assistantPanel = read("src/assistant/AssistantPanel.tsx");
const assistantAction = read("src/assistant/AssistantActionCard.tsx");
const assistantComposer = read("src/assistant/AssistantComposer.tsx");

test("workforce platform UI keeps dialogs, filters, access states, and Assistant actions deterministic and accessible", () => {
  for (const source of [workers, assignments, documents]) {
    assert.match(source, /useDialogFocus/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
  }

  assert.match(workers, /aria-label="Workforce directory"/);
  assert.match(workers, /<caption className="sr-only">/);
  assert.match(workers, /History retained · offboard instead/);
  assert.match(assignments, /aria-describedby="assignment-form-description"/);
  assert.match(assignments, /Multiple concurrent projects do not split or duplicate payroll cost/);
  assert.match(payrollV2, /aria-label="Payroll workspace sections"/);
  assert.match(payrollV2, /aria-current=\{tab === value \? "page" : undefined\}/);

  assert.match(documents, /aria-label="Filter engineering documents by type"/);
  assert.match(documents, /aria-pressed=\{selectedDiscipline === d\.id\}/);
  assert.match(documents, /Clear filters/);
  assert.match(documents, /Showing \{projectDocs\.length\} of \{projectDocuments\.length\}/);
  assert.match(documents, /newDocumentDialogRef/);
  assert.match(documents, /uploadRevisionDialogRef/);
  assert.match(documents, /historyDialogRef/);
  assert.match(lifecycle, /Nothing changes until you confirm and the server rechecks/);
  assert.match(lifecycle, /aria-pressed=\{active\}/);

  assert.match(companyProfile, /aria-busy=\{busy\}/);
  assert.match(companyProfile, /Unsaved changes/);
  assert.match(companyProfile, /id="company-profile-timezone"/);
  assert.match(access, /activeMemberCount/);
  assert.match(access, /aria-live=\{notice\.kind === "error" \? "assertive" : "polite"\}/);
  assert.match(access, /Loading access records/);
  assert.match(settings, /one client company/);

  assert.match(assistantPanel, /aria-controls="assistant-panel"/);
  assert.match(assistantPanel, /role="log" aria-label=\{`\$\{BRAND\.assistantName\} conversation`\}/);
  assert.match(assistantPanel, /disabled=\{isLoading \|\| !canUseAssistant\}/);
  assert.match(assistantAction, /Nothing changes until you explicitly confirm/);
  assert.match(assistantAction, /role="group" aria-label=\{`\$\{confirmationLabel\(preparedAction\.riskTier\)\} requiring confirmation`\}/);
  assert.match(assistantComposer, /maxLength=\{8000\}/);
  assert.match(assistantComposer, /role="list" aria-label="Attached files"/);
  assert.match(assistantComposer, /\{draft\.length\}\/8000/);
});
