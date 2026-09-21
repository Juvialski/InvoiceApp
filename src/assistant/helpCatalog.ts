import { appPathForTab } from "../utils/appRouting.ts";
import type { RouteId } from "../utils/routes.ts";
import type { AssistantReference } from "./assistantTypes.ts";
import { BRAND } from "../config/brand.ts";
import {
  HELP_TOPICS,
  getHelpTopic as getCanonicalHelpTopic,
  helpTopicPath,
  searchHelpTopics,
  type HelpCategoryId,
  type HelpArticle,
  type HelpTopicId,
} from "../help/helpCatalog.ts";

export type HelpEntryId = HelpTopicId;

export interface HelpCatalogEntry {
  readonly id: HelpEntryId;
  readonly categoryId: HelpCategoryId;
  readonly title: string;
  readonly summary: string;
  readonly details: string;
  readonly article: HelpArticle;
  readonly routeId: RouteId;
  readonly keywords: readonly string[];
}

export const HELP_CATALOG: readonly HelpCatalogEntry[] = Object.freeze(HELP_TOPICS.map((entry) => ({
  id: entry.id,
  categoryId: entry.categoryId,
  title: entry.title,
  summary: entry.summary,
  details: entry.assistantDetails,
  article: entry.article,
  routeId: entry.routeId,
  keywords: entry.keywords,
})));

const HELP_BY_ID = new Map<HelpEntryId, HelpCatalogEntry>(HELP_CATALOG.map((entry) => [entry.id, entry]));

export function searchHelpCatalog(query: string, options: { limit?: number } = {}): HelpCatalogEntry[] {
  return searchHelpTopics(query, options)
    .map((entry) => HELP_BY_ID.get(entry.id))
    .filter((entry): entry is HelpCatalogEntry => Boolean(entry));
}

export const searchHelp = searchHelpCatalog;

export function getHelpEntry(value: unknown): HelpCatalogEntry | undefined {
  const canonical = getCanonicalHelpTopic(value);
  return canonical ? HELP_BY_ID.get(canonical.id) : undefined;
}

export function helpEntryReference(entry: HelpCatalogEntry): AssistantReference {
  return { type: "help", id: entry.id, label: entry.title };
}

export function helpEntryPath(entry: HelpCatalogEntry) {
  return appPathForTab(entry.routeId === "extract" ? "extractor" : entry.routeId === "inbox" ? "inbox" : entry.routeId);
}

export function helpTopicArticlePath(entry: HelpCatalogEntry) {
  return helpTopicPath(entry.id);
}

export function unknownHelpResponse(query: string) {
  const label = query.trim() ? ` for “${query.trim().slice(0, 80)}”` : "";
  return `I don’t have a verified ${BRAND.productName} help answer${label} yet. I can help with Documents, Email / SMS communications, Engineering Documents and blueprints, Daily Site Logs, Cash & Banking, invoice extraction and review, project costing, expenses, attendance and overtime, payroll readiness and runs/imports, reports, or settings.`;
}

export type HelpResponse =
  | { kind: "matches"; matches: HelpCatalogEntry[]; references: AssistantReference[] }
  | { kind: "unknown"; message: string; matches: [] };

export function getHelpResponse(query: string, options: { limit?: number } = {}): HelpResponse {
  const matches = searchHelpCatalog(query, options);
  return matches.length
    ? { kind: "matches", matches, references: matches.map(helpEntryReference) }
    : { kind: "unknown", message: unknownHelpResponse(query), matches: [] };
}
