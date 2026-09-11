import type { Project } from "../types.ts";

function projectDraftId() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a valid draft identity before an authenticated project save. */
export function createProjectDraft(now = new Date().toISOString()): Project {
  return {
    id: projectDraftId(),
    projectCode: "",
    projectName: "",
    clientName: "",
    billingContactName: "",
    billingEmail: "",
    billingAddress: "",
    location: "",
    siteAddress: "",
    projectManager: "",
    status: "ACTIVE",
    contractValue: 0,
    projectBudget: 0,
    currency: "PHP",
    taxTreatment: undefined,
    description: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}
