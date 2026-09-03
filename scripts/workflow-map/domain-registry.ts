import type { WorkflowDomain } from "./types.ts";

export const WORKFLOW_DOMAIN_ORDER: readonly WorkflowDomain[] = [
  "platform-tenancy",
  "dashboard",
  "projects",
  "procurement",
  "commercial",
  "engineering",
  "finance",
  "workforce",
  "reporting",
  "assistant",
] as const;

export const WORKFLOW_DOMAIN_SET: ReadonlySet<WorkflowDomain> = new Set(WORKFLOW_DOMAIN_ORDER);

export function isWorkflowDomain(value: string): value is WorkflowDomain {
  return WORKFLOW_DOMAIN_SET.has(value as WorkflowDomain);
}
