import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const payrollRun = source("src/components/payroll/PayrollRunView.tsx");
const payrollPage = source("src/components/payroll/PayrollPageV2.tsx");
const cash = source("src/components/CashBankingPage.tsx");
const settlement = source("src/components/FinancialSettlementCard.tsx");
const claimEditor = source("src/components/procurement/SubcontractClaimEditorModal.tsx");
const claimDrawer = source("src/components/procurement/SubcontractClaimsDrawer.tsx");
const app = source("src/App.tsx");

test("payroll UI keeps approval separate from Cash & Banking settlement", () => {
  assert.doesNotMatch(payrollRun, /Mark paid manually/);
  assert.match(payrollRun, /record employee net-pay disbursement through Cash/);
  assert.match(payrollPage, /record payment through Cash/);
  assert.match(settlement, /Expected employee net pay/);
});

test("zero-account payment onboarding remains permission-gated and target-aware", () => {
  assert.match(cash, /Payment account required/);
  assert.match(cash, /Add payment account/);
  assert.match(cash, /no payment or paid state will be created without settlement evidence/);
  assert.match(cash, /canManageAccounts/);
});

test("subcontract claims expose net certified payable and the shared settlement route", () => {
  assert.match(claimEditor, /targetType="SUBCONTRACT_CLAIM"/);
  assert.match(claimEditor, /Net Certified Payable/);
  assert.match(claimEditor, /appPathForCashTarget\("SUBCONTRACT_CLAIM"/);
  assert.match(claimDrawer, /Responsive subcontract claim cards/);
  assert.match(app, /targetType: "SUBCONTRACT_CLAIM"/);
});
