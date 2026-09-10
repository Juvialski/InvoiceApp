import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
const assistant = readFileSync(new URL("../src/assistant/AssistantPanel.tsx", import.meta.url), "utf8");
const dialogFocus = readFileSync(new URL("../src/components/ui/useDialogFocus.ts", import.meta.url), "utf8");
const operationsUi = readFileSync(new URL("../src/components/ui/OperationsUI.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/components/engineering/EngineeringCostOperationsDashboard.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");
const settlements = readFileSync(new URL("../src/components/InvoiceSettlementDirectoryPanel.tsx", import.meta.url), "utf8");
const settlementCard = readFileSync(new URL("../src/components/FinancialSettlementCard.tsx", import.meta.url), "utf8");
const correctionDialog = readFileSync(new URL("../src/components/financial/FinancialCorrectionDialog.tsx", import.meta.url), "utf8");
const demoTour = readFileSync(new URL("../src/demo/DemoTour.tsx", import.meta.url), "utf8");
const demoWorkspace = readFileSync(new URL("../src/demo/DemoWorkspace.tsx", import.meta.url), "utf8");

test("mobile navigation has an accessible dialog boundary and disclosure state", () => {
  assert.match(header, /useDialogFocus/);
  assert.match(header, /id="workspace-navigation-drawer"/);
  assert.match(header, /role=\{mobileOpen \? "dialog" : undefined\}/);
  assert.match(header, /aria-modal=\{mobileOpen \? "true" : undefined\}/);
  assert.match(header, /aria-controls="workspace-navigation-drawer"/);
  assert.match(header, /aria-expanded=\{module\.id === "invoices" \? expanded : undefined\}/);
  assert.doesNotMatch(header, /role=\{menuItem \? "menuitem"/);
});

test("dialog focus utility restores the opener, closes on Escape, and wraps Tab", () => {
  assert.match(dialogFocus, /previousFocus/);
  assert.match(dialogFocus, /event\.key === "Escape"/);
  assert.match(dialogFocus, /event\.key !== "Tab"/);
  assert.match(dialogFocus, /event\.shiftKey/);
  assert.match(dialogFocus, /focusable\[focusable\.length - 1\]/);
});

test("Assistant is labelled as a modal and its backdrop is not a competing tab stop", () => {
  assert.match(assistant, /role="dialog" aria-modal="true" aria-labelledby="assistant-panel-title"/);
  assert.match(assistant, /<h2 id="assistant-panel-title"/);
  assert.match(assistant, /<div aria-hidden="true" className="fixed inset-0/);
  assert.match(assistant, /useDialogFocus/);
});

test("financial metric values wrap instead of creating nested horizontal scrollers", () => {
  assert.doesNotMatch(operationsUi, /overflow-x-auto whitespace-nowrap text-lg font-black/);
  assert.doesNotMatch(dashboard, /overflow-x-auto whitespace-nowrap text-sm font-black/);
  assert.doesNotMatch(dashboard, /overflow-x-auto whitespace-nowrap text-xs font-black/);
});

test("project tabs expose the active workspace section and missing settlement evidence is explicit", () => {
  assert.match(projectWorkspace, /aria-current=\{tab === id \? "page" : undefined\}/);
  assert.match(settlementCard, /No settlement evidence recorded/);
  assert.match(settlementCard, /cashNavigationPath\(item\.transactionId/);
  assert.match(settlements, /invoiceNavigationPath\(invoice\.id/);
});

test("demo tour does not cover mobile content and remains keyboard-dismissible when open", () => {
  assert.match(demoTour, /hidden items-center gap-2[\s\S]*sm:inline-flex/);
  assert.match(demoTour, /role="dialog" aria-modal="true"/);
  assert.match(demoTour, /useDialogFocus/);
});

test("demo unavailable entity links render the shared recovery state", () => {
  assert.match(demoWorkspace, /const routeNotFound = Boolean\(appLocation/);
  assert.match(demoWorkspace, /routeNotFound=\{routeNotFound\}/);
  assert.match(demoWorkspace, /onReturnToDashboard=\{\(\) => onNavigate\(demoPathForTab\("dashboard"\)\)\}/);
});

test("financial correction actions cannot close while a server correction is pending", () => {
  assert.match(correctionDialog, /disabled=\{loading\}/);
  assert.match(correctionDialog, /aria-busy=\{loading\}/);
});
