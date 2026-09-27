import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, waitForHeading, waitForVisible } from "./shared.ts";

export const verifyEmailSmsWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Email / SMS");
  const workspace = await page.locator('[data-email-sms-workspace]').count();
  const tabs = await page.locator('[data-email-sms-tabs] button').count();
  const compose = await page.getByRole("button", { name: "Compose", exact: true }).count();
  const history = await page.getByRole("button", { name: "Sent / Delivery History", exact: true }).count();
  const provider = await page.getByRole("button", { name: "Email Provider Status", exact: true }).count();
  const sms = await page.getByRole("button", { name: "SMS status", exact: true }).count();
  return [
    { id: "email-sms-workspace-visible", passed: workspace === 1, details: `Email / SMS workspace surfaces: ${workspace}` },
    { id: "email-sms-section-tabs-visible", passed: tabs === 4, details: `Email / SMS section tabs: ${tabs}` },
    { id: "email-sms-compose-visible", passed: compose === 1, details: `Compose tabs: ${compose}` },
    { id: "email-sms-history-visible", passed: history === 1, details: `Sent / Delivery History tabs: ${history}` },
    { id: "email-sms-provider-status-visible", passed: provider === 1, details: `Email Provider Status tabs: ${provider}` },
    { id: "email-sms-sms-visible", passed: sms === 1, details: `SMS tabs: ${sms}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyEmailComposeWorkspace: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-email-compose]');
  const compose = await page.locator('[data-email-compose]').count();
  const to = await page.getByRole("textbox", { name: "To" }).count();
  const subject = await page.getByRole("textbox", { name: "Subject" }).count();
  const body = await page.getByRole("textbox", { name: "Message" }).count();
  const review = await page.getByRole("button", { name: "Preview / Review", exact: true }).count();
  const send = await page.getByRole("button", { name: "Confirm & Send", exact: true }).count();
  return [
    { id: "email-compose-visible", passed: compose === 1, details: `compose panels: ${compose}` },
    { id: "email-compose-fields-visible", passed: to === 1 && subject === 1 && body === 1, details: `To/Subject/Message fields: ${to}/${subject}/${body}` },
    { id: "email-compose-review-visible", passed: review === 1, details: `review controls: ${review}` },
    { id: "email-compose-confirm-visible", passed: send === 1, details: `confirm controls: ${send}` },
  ] satisfies readonly QaAssertion[];
};
export const verifySmsComposeWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "New SMS");
  const compose = await page.locator('[data-sms-compose]').count();
  const recipient = await page.locator('[data-sms-compose] input[type="tel"]').count();
  const message = await page.locator('[data-sms-compose] textarea').count();
  const review = await page.getByRole("button", { name: "Preview / Review", exact: true }).count();
  if (recipient === 1 && message === 1) {
    await page.locator('[data-sms-compose] input[type="tel"]').fill("09171234567");
    await page.locator('[data-sms-compose] textarea').fill("Synthetic SMS draft prepared for review only.");
    if (review === 1) await page.getByRole("button", { name: "Preview / Review", exact: true }).click();
  }
  const reviewSurface = await page.locator('[data-sms-compose-review="true"]').count();
  const confirm = await page.getByRole("button", { name: "Confirm & Send SMS", exact: true }).count();
  return [
    { id: "sms-compose-visible", passed: compose === 1, details: `SMS compose panels: ${compose}` },
    { id: "sms-compose-fields-visible", passed: recipient === 1 && message === 1, details: `recipient/message fields: ${recipient}/${message}` },
    { id: "sms-compose-review-visible", passed: reviewSurface === 1, details: `SMS review surfaces: ${reviewSurface}` },
    { id: "sms-compose-confirm-visible", passed: confirm === 1, details: `SMS confirm controls: ${confirm}` },
  ] satisfies readonly QaAssertion[];
};
export const verifySmsNotConfigured: QaScenarioAction = async (page) => {
  await waitForHeading(page, "SMS setup");
  const status = await page.locator('[data-sms-provider-status="NOT_CONFIGURED"]').count();
  const notConfigured = await page.locator("text=SMS · Not configured").count();
  return [
    { id: "sms-not-configured-visible", passed: status === 1 && notConfigured === 1, details: `SMS not-configured panels/text: ${status}/${notConfigured}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyAttachmentContextualHelp: QaScenarioAction = async (page) => {
  const trigger = page.getByRole("button", { name: "Attachment eligibility help", exact: true });
  const triggerCount = await trigger.count();
  await trigger.first().press("Enter");
  const dialog = page.getByRole("dialog", { name: "Eligible document attachments", exact: true });
  await dialog.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const dialogCount = await dialog.count();
  const ariaModal = await page.evaluate(() => document.querySelector('[role="dialog"][aria-labelledby^="contextual-help-"]')?.getAttribute("aria-modal") || "");
  const focusedOnOpen = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  const articleLink = await page.getByRole("link", { name: "Read more in Help Center", exact: true }).count();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  return [
    { id: "contextual-help-trigger-visible", passed: triggerCount === 1, details: `attachment-help triggers: ${triggerCount}` },
    { id: "contextual-help-dialog-visible", passed: dialogCount === 1, details: `attachment-help dialogs: ${dialogCount}` },
    { id: "contextual-help-keyboard-opened", passed: focusedOnOpen === "Attachment eligibility help" && ariaModal === "false", details: `keyboard focus: ${focusedOnOpen || "none"}; aria-modal: ${ariaModal || "missing"}` },
    { id: "contextual-help-article-link-visible", passed: articleLink === 1, details: `configured Help Center article links: ${articleLink}` },
    { id: "contextual-help-escape-closes", passed: true, details: "Escape detached the contextual-help dialog" },
    { id: "contextual-help-focus-restored", passed: focusedLabel === "Attachment eligibility help", details: `focused aria-label: ${focusedLabel || "none"}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyEmailComposeFirstView: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const compose = document.querySelector<HTMLElement>('[data-email-compose="true"]');
    const toolbar = compose?.querySelector<HTMLElement>("[data-email-compose-toolbar]");
    const to = compose?.querySelector<HTMLElement>('input[placeholder^="recipient"]');
    const provider = compose?.querySelector<HTMLElement>('[aria-label="Brevo email provider status"]');
    const buttons = compose ? Array.from(compose.querySelectorAll<HTMLButtonElement>("button")).map((button) => button.textContent?.trim() || "") : [];
    const send = buttons.find((label) => label.includes("Confirm & Send"));
    const sendButton = send && compose ? Array.from(compose.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === send) : undefined;
    return {
      toTop: to?.getBoundingClientRect().top ?? null,
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? null,
      providerVisible: Boolean(provider && getComputedStyle(provider).display !== "none"),
      providerText: provider?.innerText || "",
      emailSetupInCompose: buttons.filter((label) => label === "Email setup").length,
      browseDocuments: buttons.filter((label) => label.includes("Browse Documents")).length,
      composeSms: buttons.filter((label) => label.includes("Compose SMS")).length,
      sendDisabledUntilReview: sendButton?.disabled ?? false,
      providerStatusTab: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-email-sms-tabs] button")).some((button) => button.getAttribute("aria-label") === "Email Provider Status"),
    };
  });
  const composeTools = page.locator('[data-email-compose-tools] summary');
  const composeToolsCount = await composeTools.count();
  let composeToolLabels = "";
  if (composeToolsCount === 1) {
    await composeTools.click();
    composeToolLabels = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-email-compose-tools] button"))
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => button.innerText.trim())
      .join(" | "));
    await composeTools.click();
  }
  return [
    { id: "email-compose-fields-appear-first-view", passed: layout.toTop !== null && layout.toTop < 800, details: `To field top: ${layout.toTop ?? "missing"}px in 390×844 view` },
    { id: "email-compose-toolbar-compact", passed: layout.toolbarHeight !== null && layout.toolbarHeight <= 72, details: `compose toolbar height: ${layout.toolbarHeight ?? "missing"}px` },
    { id: "email-compose-provider-error-remains-visible", passed: layout.providerVisible && /Connection problem|Ready|Sender setup required|Not configured/.test(layout.providerText), details: `provider state: ${layout.providerText.trim() || "missing"}` },
    { id: "email-compose-status-navigation-remains-reachable", passed: layout.providerStatusTab && layout.emailSetupInCompose === 0, details: `provider tab: ${layout.providerStatusTab}; duplicate setup buttons in compose: ${layout.emailSetupInCompose}` },
    { id: "email-compose-document-and-sms-actions-remain", passed: layout.browseDocuments === 1 && layout.composeSms === 1, details: `Browse Documents / Compose SMS: ${layout.browseDocuments}/${layout.composeSms}` },
    { id: "email-compose-secondary-actions-touch-reachable", passed: composeToolsCount === 1 && /Browse Documents/.test(composeToolLabels) && /Compose SMS/.test(composeToolLabels), details: `More actions options: ${composeToolLabels || "missing"}` },
    { id: "email-send-remains-review-gated", passed: layout.sendDisabledUntilReview, details: `Confirm & Send disabled until review: ${layout.sendDisabledUntilReview}` },
  ] satisfies readonly QaAssertion[];
};

export const messagingScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyAttachmentContextualHelp,
  verifyEmailComposeFirstView,
  verifyEmailComposeWorkspace,
  verifyEmailSmsWorkspace,
  verifySmsComposeWorkspace,
  verifySmsNotConfigured,
};
