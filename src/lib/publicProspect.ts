export const PUBLIC_PROSPECT_MODULE_KEYS = [
  "projects",
  "finance",
  "procurement",
  "warehouse",
  "equipment",
  "workforce",
  "engineering-documents",
  "field-operations",
  "integrations",
] as const;

export type PublicProspectModuleKey = (typeof PUBLIC_PROSPECT_MODULE_KEYS)[number];

export const PUBLIC_PROSPECT_MODULES = [
  { value: "projects", label: "Projects & cost controls", detail: "Project context, budgets, and cost visibility." },
  { value: "finance", label: "Finance & cash", detail: "Expenses, client billing, collections, and reconciliation." },
  { value: "procurement", label: "Procurement", detail: "Purchase orders, vendors, receipts, and commitments." },
  { value: "warehouse", label: "Warehouse inventory", detail: "Movement-based stock and project allocation." },
  { value: "equipment", label: "Equipment", detail: "Canonical equipment and assignment history." },
  { value: "workforce", label: "Workforce & payroll", detail: "Workforce operations and payroll foundations." },
  { value: "engineering-documents", label: "Engineering documents", detail: "Document, revision, and drawing history." },
  { value: "field-operations", label: "Field operations", detail: "Site logs, observations, and project coordination." },
  { value: "integrations", label: "Integrations", detail: "Approved provider and data-flow requirements." },
] as const satisfies ReadonlyArray<{ value: PublicProspectModuleKey; label: string; detail: string }>;

export const PUBLIC_PROSPECT_WORKFORCE_SCALES = [
  { value: "1-25", label: "1–25 people" },
  { value: "26-100", label: "26–100 people" },
  { value: "101-500", label: "101–500 people" },
  { value: "501+", label: "501+ people" },
  { value: "unknown", label: "Prefer not to say yet" },
] as const;

export const PUBLIC_PROSPECT_PROJECT_SCALES = [
  { value: "1-5", label: "1–5 active projects" },
  { value: "6-20", label: "6–20 active projects" },
  { value: "21-50", label: "21–50 active projects" },
  { value: "51+", label: "51+ active projects" },
  { value: "unknown", label: "Prefer not to say yet" },
] as const;

export const PUBLIC_PROSPECT_TIMELINES = [
  { value: "exploring", label: "Exploring options" },
  { value: "within-3-months", label: "Within 3 months" },
  { value: "within-6-months", label: "Within 6 months" },
  { value: "later", label: "Later this year" },
  { value: "unknown", label: "Not decided yet" },
] as const;

export const PUBLIC_PROSPECT_REQUEST_TYPES = [
  { value: "DEMO", label: "Request a product demo" },
  { value: "REQUIREMENTS", label: "Discuss requirements" },
  { value: "DEMO_AND_REQUIREMENTS", label: "Demo and requirements discussion" },
] as const;

export type PublicProspectWorkforceScale = (typeof PUBLIC_PROSPECT_WORKFORCE_SCALES)[number]["value"];
export type PublicProspectProjectScale = (typeof PUBLIC_PROSPECT_PROJECT_SCALES)[number]["value"];
export type PublicProspectTimeline = (typeof PUBLIC_PROSPECT_TIMELINES)[number]["value"];
export type PublicProspectRequestType = (typeof PUBLIC_PROSPECT_REQUEST_TYPES)[number]["value"];

export interface PublicProspectSubmission {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  modules: PublicProspectModuleKey[];
  workforceScale: PublicProspectWorkforceScale;
  projectScale: PublicProspectProjectScale;
  painPoints: string | null;
  integrationNeeds: string | null;
  desiredTimeline: PublicProspectTimeline;
  requestType: PublicProspectRequestType;
}

export interface PublicProspectValidationFailure {
  ok: false;
  fields: Record<string, string>;
}

export interface PublicProspectValidationSuccess {
  ok: true;
  value: PublicProspectSubmission;
}

export type PublicProspectValidationResult = PublicProspectValidationFailure | PublicProspectValidationSuccess;

const MODULE_SET = new Set<string>(PUBLIC_PROSPECT_MODULE_KEYS);
const WORKFORCE_SCALE_SET = new Set<string>(PUBLIC_PROSPECT_WORKFORCE_SCALES.map((item) => item.value));
const PROJECT_SCALE_SET = new Set<string>(PUBLIC_PROSPECT_PROJECT_SCALES.map((item) => item.value));
const TIMELINE_SET = new Set<string>(PUBLIC_PROSPECT_TIMELINES.map((item) => item.value));
const REQUEST_TYPE_SET = new Set<string>(PUBLIC_PROSPECT_REQUEST_TYPES.map((item) => item.value));

export const PUBLIC_PROSPECT_MAX_MODULES = 8;
export const PUBLIC_PROSPECT_FIELD_LIMITS = Object.freeze({
  companyName: 160,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 50,
  painPoints: 2_000,
  integrationNeeds: 1_500,
});

function inputRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function textValue(input: Record<string, unknown>, key: string, maxLength: number, required: boolean, label: string, errors: Record<string, string>) {
  const value = input[key];
  if (value === undefined || value === null) {
    if (required) errors[key] = `${label} is required.`;
    return required ? "" : null;
  }
  if (typeof value !== "string") {
    errors[key] = `${label} is invalid.`;
    return required ? "" : null;
  }
  const normalized = value.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim();
  if (normalized.length > maxLength) errors[key] = `${label} must be ${maxLength} characters or fewer.`;
  if (required && !normalized) errors[key] = `${label} is required.`;
  return normalized || (required ? "" : null);
}

function enumValue<T extends string>(input: Record<string, unknown>, key: string, values: ReadonlySet<string>, label: string, errors: Record<string, string>): T {
  const value = input[key];
  if (typeof value !== "string" || !values.has(value)) {
    errors[key] = `Choose a valid ${label}.`;
    return "" as T;
  }
  return value as T;
}

/**
 * Validates the intentionally narrow public intake payload. This function is
 * shared by the browser and server; the database RPC repeats the important
 * checks so the public write contract does not depend on JavaScript callers.
 */
export function validatePublicProspectSubmission(input: unknown): PublicProspectValidationResult {
  const record = inputRecord(input);
  if (!record) return { ok: false, fields: { form: "The request payload is invalid." } };

  const fields: Record<string, string> = {};
  const companyName = textValue(record, "companyName", PUBLIC_PROSPECT_FIELD_LIMITS.companyName, true, "Company name", fields);
  const contactName = textValue(record, "contactName", PUBLIC_PROSPECT_FIELD_LIMITS.contactName, true, "Contact name", fields);
  const contactEmail = textValue(record, "contactEmail", PUBLIC_PROSPECT_FIELD_LIMITS.contactEmail, true, "Business email", fields).toLowerCase();
  const contactPhone = textValue(record, "contactPhone", PUBLIC_PROSPECT_FIELD_LIMITS.contactPhone, false, "Phone", fields);
  const painPoints = textValue(record, "painPoints", PUBLIC_PROSPECT_FIELD_LIMITS.painPoints, false, "Current pain points", fields);
  const integrationNeeds = textValue(record, "integrationNeeds", PUBLIC_PROSPECT_FIELD_LIMITS.integrationNeeds, false, "Integration needs", fields);

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(contactEmail)) {
    fields.contactEmail = "Enter a valid business email address.";
  }
  if (contactPhone && (!/[0-9]/.test(contactPhone) || !/^[+0-9() .xX-]+$/.test(contactPhone))) {
    fields.contactPhone = "Enter a phone number using digits and normal phone punctuation.";
  }

  const modulesInput = record.modules;
  let modules: PublicProspectModuleKey[] = [];
  if (!Array.isArray(modulesInput) || modulesInput.some((item) => typeof item !== "string" || !MODULE_SET.has(item))) {
    fields.modules = "Choose capabilities from the available list.";
  } else {
    modules = [...new Set(modulesInput)] as PublicProspectModuleKey[];
    if (modules.length > PUBLIC_PROSPECT_MAX_MODULES) fields.modules = `Choose no more than ${PUBLIC_PROSPECT_MAX_MODULES} capabilities.`;
  }

  const workforceScale = enumValue<PublicProspectWorkforceScale>(record, "workforceScale", WORKFORCE_SCALE_SET, "workforce scale", fields);
  const projectScale = enumValue<PublicProspectProjectScale>(record, "projectScale", PROJECT_SCALE_SET, "project scale", fields);
  const desiredTimeline = enumValue<PublicProspectTimeline>(record, "desiredTimeline", TIMELINE_SET, "deployment timeline", fields);
  const requestType = enumValue<PublicProspectRequestType>(record, "requestType", REQUEST_TYPE_SET, "request type", fields);

  if (record.consentConfirmed !== true) fields.consentConfirmed = "Confirm that HydroQualiSense may use these details to respond to your request.";

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      modules,
      workforceScale,
      projectScale,
      painPoints,
      integrationNeeds,
      desiredTimeline,
      requestType,
    },
  };
}
