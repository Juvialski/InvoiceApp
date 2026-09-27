import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { applyThemePreferenceForVisualQa, compositeCssColor, contrastRatio, waitForHeading, waitForVisible } from "./shared.ts";

export const verifyPayrollNormalCycleOverview: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Next step");
  const nextStep = await page.getByRole("heading", { name: "Next step", exact: true }).count();
  const nextStepActionCount = await page.locator('[data-payroll-next-step="true"] button:not([disabled]), [data-payroll-next-step="true"] a[href]').count();
  const calculateFromOverview = await page.getByRole("button", { name: "Calculate payroll", exact: true }).count();
  const stageBoundary = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-payroll-next-step="true"]');
    const text = panel?.innerText || "";
    return {
      approvalAndPaymentSeparated: text.includes("Approval and payment stay separate"),
      paymentRoutedToCash: text.includes("record payment through Cash & Banking"),
    };
  });
  return [
    { id: "payroll-normal-cycle-next-step-visible", passed: nextStep === 1, details: `next-step panels: ${nextStep}` },
    { id: "payroll-normal-cycle-primary-action-visible", passed: nextStepActionCount >= 1, details: `enabled next-step actions: ${nextStepActionCount}` },
    { id: "payroll-overview-does-not-calculate-directly", passed: calculateFromOverview === 0, details: `overview Calculate payroll buttons: ${calculateFromOverview}` },
    { id: "payroll-normal-cycle-stage-boundary-visible", passed: stageBoundary.approvalAndPaymentSeparated && stageBoundary.paymentRoutedToCash, details: `approval/payment separated: ${stageBoundary.approvalAndPaymentSeparated}; Cash & Banking handoff: ${stageBoundary.paymentRoutedToCash}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyPayrollApprovedSettlementHandoff: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[aria-label="payroll settlement"]');
  const settlement = await page.locator('[aria-label="payroll settlement"]').count();
  const netPay = await page.locator("text=Expected employee net pay").count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  const manualPaid = await page.locator("text=Mark paid manually").count();
  const cashBoundary = await page.locator("text=Cash evidence only").count();
  return [
    { id: "payroll-approved-settlement-card-visible", passed: settlement === 1, details: `payroll settlement cards: ${settlement}` },
    { id: "payroll-approved-net-pay-basis-visible", passed: netPay === 1, details: `employee net-pay basis labels: ${netPay}` },
    { id: "payroll-approved-record-payment-visible", passed: recordPayment === 1, details: `Record Payment links: ${recordPayment}` },
    { id: "payroll-no-manual-paid-toggle", passed: manualPaid === 0, details: `manual paid controls: ${manualPaid}` },
    { id: "payroll-cash-authority-copy-visible", passed: cashBoundary >= 1, details: `cash authority copy: ${cashBoundary}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyR4eLegacySurfaceContrast: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const colors = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('[data-app-shell="true"]');
    if (!app) return null;
    const surface = Array.from(app.querySelectorAll<HTMLElement>(".hqs-surface, .hqs-surface-raised, section.bg-white, article.bg-white, div.bg-white")).find((candidate) => getComputedStyle(candidate).display !== "none" && candidate.getClientRects().length > 0);
    const main = app.querySelector<HTMLElement>('[data-app-shell-main="true"]');
    const control = app.querySelector<HTMLElement>("input, select, textarea");
    if (!surface || !main || !control) return null;
    const semanticProbe = document.createElement("span");
    semanticProbe.className = "hqs-primary-text";
    semanticProbe.textContent = "temporary theme contrast probe";
    surface.prepend(semanticProbe);
    const swatchSurface = document.createElement("div");
    swatchSurface.className = "bg-white";
    const successFill = document.createElement("div");
    successFill.className = "bg-emerald-50";
    const successText = document.createElement("span");
    successText.className = "text-emerald-950";
    successText.textContent = "status";
    successFill.append(successText);
    const accentFill = document.createElement("div");
    accentFill.className = "bg-indigo-50";
    const accentText = document.createElement("span");
    accentText.className = "text-indigo-950";
    accentText.textContent = "selected";
    accentFill.append(accentText);
    swatchSurface.append(successFill, accentFill);
    main.append(swatchSurface);
    const swatchBackground = getComputedStyle(swatchSurface).backgroundColor;
    const successBackground = getComputedStyle(successFill).backgroundColor;
    const accentBackground = getComputedStyle(accentFill).backgroundColor;
    const colors = {
      surface: getComputedStyle(surface).backgroundColor,
      foreground: getComputedStyle(semanticProbe).color,
      controlBackground: getComputedStyle(control).backgroundColor,
      controlBorder: getComputedStyle(control).borderTopColor,
      successForeground: getComputedStyle(successText).color,
      successBackground,
      successBackdrop: swatchBackground,
      accentForeground: getComputedStyle(accentText).color,
      accentBackground,
    };
    swatchSurface.remove();
    semanticProbe.remove();
    return colors;
  });
  const headingContrast = colors ? contrastRatio(colors.foreground, colors.surface) : 0;
  const controlContrast = colors ? contrastRatio(colors.controlBorder, colors.controlBackground) : 0;
  const successComposite = colors ? compositeCssColor(colors.successBackground, colors.successBackdrop) : "missing";
  const successContrast = colors ? contrastRatio(colors.successForeground, successComposite) : 0;
  const accentContrast = colors ? contrastRatio(colors.accentForeground, colors.accentBackground) : 0;
  return [...themeAssertions,
    { id: "r4e-dark-legacy-surface-uses-theme", passed: colors?.surface === "rgb(30, 41, 59)", details: `legacy white surface: ${colors?.surface || "missing"}` },
    { id: "r4e-dark-semantic-heading-aa", passed: headingContrast >= 4.5, details: `semantic heading contrast: ${headingContrast.toFixed(2)}:1 (${colors?.foreground || "missing"} on ${colors?.surface || "missing"})` },
    { id: "r4e-dark-success-status-aa", passed: successContrast >= 4.5, details: `success status contrast: ${successContrast.toFixed(2)}:1 (${colors?.successForeground || "missing"} on ${colors?.successBackground || "missing"})` },
    { id: "r4e-dark-selected-accent-aa", passed: accentContrast >= 4.5, details: `selected accent contrast: ${accentContrast.toFixed(2)}:1 (${colors?.accentForeground || "missing"} on ${colors?.accentBackground || "missing"})` },
    { id: "r4e-dark-input-boundary-nontext", passed: controlContrast >= 3, details: `input boundary contrast: ${controlContrast.toFixed(2)}:1 (${colors?.controlBorder || "missing"} on ${colors?.controlBackground || "missing"})` },
  ] satisfies readonly QaAssertion[];
};
export const verifyPayrollFirstView: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const nextStep = document.querySelector<HTMLElement>('[data-payroll-next-step="true"]')
      || Array.from(document.querySelectorAll<HTMLElement>("section,div")).find((element) => element.querySelector("h1,h2,h3,h4")?.textContent?.trim() === "Next step");
    const heading = nextStep?.querySelector<HTMLElement>("h1,h2,h3,h4")
      || Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4")).find((element) => element.textContent?.trim() === "Next step");
    const primaryAction = nextStep?.querySelector<HTMLElement>("button:not([disabled]),a[href]");
    const actionRect = primaryAction?.getBoundingClientRect();
    const summary = document.querySelector<HTMLElement>("[data-payroll-period-summary]");
    return {
      nextStepTop: heading?.getBoundingClientRect().top ?? null,
      primaryActionInFirstView: Boolean(actionRect && actionRect.top >= 0 && actionRect.bottom <= window.innerHeight),
      primaryActionLabel: primaryAction?.textContent?.trim() || "",
      navigationButtons: document.querySelectorAll('[data-payroll-navigation="true"] button').length,
      periodSummaryCollapsed: summary?.querySelector("button")?.getAttribute("aria-expanded") === "false",
    };
  });
  return [
    { id: "payroll-next-step-first-view", passed: layout.nextStepTop !== null && layout.nextStepTop < 800, details: `Next step top: ${layout.nextStepTop ?? "missing"}px in 390×844 view` },
    { id: "payroll-primary-next-step-visible", passed: layout.primaryActionInFirstView, details: `Primary next-step action "${layout.primaryActionLabel || "missing"}" fits first view: ${layout.primaryActionInFirstView}` },
    { id: "payroll-compact-navigation-preserved", passed: layout.navigationButtons === 7, details: `Payroll navigation buttons: ${layout.navigationButtons}` },
    { id: "payroll-period-summary-progressively-disclosed", passed: layout.periodSummaryCollapsed, details: `Period summary collapsed: ${layout.periodSummaryCollapsed}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyPayrollSummaryDisclosure: QaScenarioAction = async (page) => {
  const trigger = page.getByRole("button", { name: /Payroll period summary/ }).first();
  const triggerCount = await trigger.count();
  const initialState = await page.evaluate(() => document.querySelector<HTMLElement>("[data-payroll-period-summary] [data-ui=disclosure-section] > button")?.getAttribute("aria-expanded") || "missing");
  await trigger.click();
  const expanded = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>("[data-payroll-period-summary] [data-ui=disclosure-section]");
    return {
      state: section?.querySelector("button")?.getAttribute("aria-expanded") || "missing",
      text: section?.innerText || "",
    };
  });
  await trigger.click();
  const restoredState = await page.evaluate(() => document.querySelector<HTMLElement>("[data-payroll-period-summary] [data-ui=disclosure-section] > button")?.getAttribute("aria-expanded") || "missing");
  return [
    { id: "r4e-payroll-summary-disclosure-present", passed: triggerCount === 1 && initialState === "false", details: `trigger count: ${triggerCount}; initial state: ${initialState}` },
    { id: "r4e-payroll-summary-details-retained", passed: expanded.state === "true" && ["Active workers", "Current period", "Estimated gross", "Project labor", "Admin / overhead"].every((label) => expanded.text.includes(label)), details: `expanded metrics: ${expanded.text.replaceAll("\n", " · ").slice(0, 240)}` },
    { id: "r4e-payroll-summary-collapses", passed: restoredState === "false", details: `restored disclosure state: ${restoredState}` },
  ] satisfies readonly QaAssertion[];
};

export const payrollScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyPayrollApprovedSettlementHandoff,
  verifyPayrollFirstView,
  verifyPayrollNormalCycleOverview,
  verifyPayrollSummaryDisclosure,
  verifyR4eLegacySurfaceContrast,
};
