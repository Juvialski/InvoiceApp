import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, waitForHeading } from "./shared.ts";

export const verifyHelpIndex: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Help Center");
  const helpCenter = await page.locator('[data-help-center="true"]').count();
  const search = await page.getByRole("textbox", { name: "Search Help", exact: true }).count();
  const categories = await page.locator('[data-help-category-list="true"]').count();
  const startHere = await page.getByRole("heading", { name: "Start here", exact: true }).count();
  const topics = await page.getByRole("region", { name: "Help topics", exact: true }).count();
  return [
    { id: "help-center-index-visible", passed: helpCenter === 1, details: `Help Center surfaces: ${helpCenter}` },
    { id: "help-center-search-visible", passed: search === 1, details: `Help search inputs: ${search}` },
    { id: "help-center-categories-visible", passed: categories === 1, details: `Help category lists: ${categories}` },
    { id: "help-center-start-here-visible", passed: startHere === 1, details: `Start here headings: ${startHere}` },
    { id: "help-center-topics-visible", passed: topics === 1, details: `Help topic regions: ${topics}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyHelpArticle: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Supplier Invoice review");
  const article = await page.locator('[data-help-article="true"]').count();
  const breadcrumbs = await page.locator('[data-help-breadcrumbs="true"]').count();
  const returnToWorkspace = await page.getByRole("link", { name: "Return to workspace", exact: true }).count();
  const articleText = await page.locator("text=Supplier Invoice evidence remains distinct from the authoritative linked Expense payable and cost record.").count();
  await page.reload({ waitUntil: "networkidle", timeout: READY_TIMEOUT_MS });
  await waitForHeading(page, "Supplier Invoice review");
  const refreshedArticle = await page.locator('[data-help-article="true"]').count();
  return [
    { id: "help-invoice-review-article-visible", passed: article === 1, details: `invoice-review article surfaces: ${article}` },
    { id: "help-invoice-review-breadcrumbs-visible", passed: breadcrumbs === 1, details: `Help breadcrumb regions: ${breadcrumbs}` },
    { id: "help-invoice-review-return-visible", passed: returnToWorkspace === 1, details: `return-to-workspace links: ${returnToWorkspace}` },
    { id: "help-invoice-review-boundary-visible", passed: articleText === 1, details: `invoice-review boundary statements: ${articleText}` },
    { id: "help-invoice-review-refresh-stable", passed: refreshedArticle === 1, details: `refreshed invoice-review articles: ${refreshedArticle}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyHelpNavigation: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Help Center");
  const search = page.getByRole("textbox", { name: "Search Help", exact: true });
  await search.fill("supplier invoice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await waitForHeading(page, "Search results");
  const searchResult = await page.getByRole("link", { name: /Supplier Invoice review/ }).count();
  const searchPath = page.url();

  const category = page.getByRole("button", { name: /Supplier Invoices and Expenses/ }).first();
  await category.click();
  const activeCategory = await page.locator('button[aria-pressed="true"]').count();
  const categoryResult = await page.getByRole("link", { name: /Supplier Invoice review/ }).count();

  await page.getByRole("link", { name: /Supplier Invoice review/ }).first().click();
  await waitForHeading(page, "Supplier Invoice review");
  const articlePath = page.url();
  await page.goBack();
  await waitForHeading(page, "Search results");
  const backPath = page.url();
  await page.goForward();
  await waitForHeading(page, "Supplier Invoice review");
  const forwardPath = page.url();

  return [
    { id: "help-search-matching-result", passed: searchResult > 0 && searchPath.includes("q=supplier+invoice"), details: `matching results: ${searchResult}; path: ${searchPath}` },
    { id: "help-category-selection", passed: activeCategory === 1 && categoryResult > 0, details: `active categories: ${activeCategory}; category results: ${categoryResult}` },
    { id: "help-article-deep-link", passed: articlePath.includes("topic=invoice-review"), details: `article path: ${articlePath}` },
    { id: "help-browser-back", passed: backPath.includes("/help") && !backPath.includes("topic=invoice-review"), details: `back path: ${backPath}` },
    { id: "help-browser-forward", passed: forwardPath.includes("topic=invoice-review"), details: `forward path: ${forwardPath}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyHelpUnknownTopicFallback: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Help Center");
  const invalidTopic = await page.locator('[data-help-invalid-topic="true"]').count();
  const article = await page.locator('[data-help-article="true"]').count();
  const index = await page.getByRole("heading", { name: "Start here", exact: true }).count();
  return [
    { id: "help-unknown-topic-fallback-visible", passed: invalidTopic === 1, details: `invalid-topic notices: ${invalidTopic}` },
    { id: "help-unknown-topic-does-not-select-article", passed: article === 0, details: `selected articles: ${article}` },
    { id: "help-unknown-topic-returns-to-index", passed: index === 1, details: `Start here headings: ${index}` },
  ] satisfies readonly QaAssertion[];
};

export const helpScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyHelpArticle,
  verifyHelpIndex,
  verifyHelpNavigation,
  verifyHelpUnknownTopicFallback,
};
