import { buildPurchaseOrderDocumentSnapshot, type FinancialDocumentSnapshot } from "../../lib/documentGeneration.ts";
import { companyDocumentProfileFromRow } from "../../lib/companyDocumentProfile.ts";
import { purchaseOrderFromRow } from "../../lib/purchaseOrders.ts";
import type { DocumentTemplateTypeDefinition, DocumentTemplateCustomFieldDefinition } from "../../lib/documentTemplateTypes.ts";
import {
  getDocumentTemplateFields,
  resolveDocumentTemplateFieldValue,
  type DocumentTemplateBinding,
  type DocumentTemplateType,
} from "../../lib/documentTemplateRegistry.ts";

export interface DocumentTemplateRenderContext {
  readonly typeKey: string;
  readonly scalarValues: Readonly<Record<string, string>>;
  readonly collections: Readonly<Record<string, readonly Readonly<Record<string, string>>[]>>;
}

export function buildFinancialTemplateRenderContext(snapshot: FinancialDocumentSnapshot): DocumentTemplateRenderContext {
  const scalarValues: Record<string, string> = {};
  const lineValues: Array<Record<string, string>> = [];
  for (const field of getDocumentTemplateFields(snapshot.documentType as DocumentTemplateType)) {
    if (field.collection) continue;
    scalarValues[field.key] = resolveDocumentTemplateFieldValue(snapshot, snapshot.documentType, field.key);
  }
  for (const line of snapshot.lines) {
    const values: Record<string, string> = {};
    for (const field of getDocumentTemplateFields(snapshot.documentType)) {
      if (!field.collection) continue;
      values[field.key] = resolveDocumentTemplateFieldValue(snapshot, snapshot.documentType, field.key, line);
    }
    lineValues.push(values);
  }
  return { typeKey: snapshot.documentType, scalarValues, collections: { lines: lineValues } };
}

export function bindingMap(bindings: readonly DocumentTemplateBinding[]): ReadonlyMap<string, string> {
  return new Map(bindings.map((binding) => [binding.tag.trim(), binding.fieldKey.trim()]));
}

export interface ManagedDocumentInputs {
  readonly fields: Readonly<Record<string, string | number | boolean>>;
  readonly repeats: Readonly<Record<string, readonly Readonly<Record<string, string | number | boolean>>[]>>;
}

function boundedInputValue(field: DocumentTemplateCustomFieldDefinition, value: unknown): string | number | boolean | undefined {
  if (field.type === "TEXT") return typeof value === "string" && value.trim().length <= 4000 ? value.trim() : undefined;
  if (field.type === "DATE") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  if (field.type === "NUMBER") return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  if (field.type === "BOOLEAN") return typeof value === "boolean" ? value : undefined;
  if (field.type === "SELECT") return typeof value === "string" && field.options?.includes(value) ? value : undefined;
  return undefined;
}

export function validateManagedDocumentInputs(definition: DocumentTemplateTypeDefinition, value: unknown): { ok: true; input: ManagedDocumentInputs } | { ok: false; errors: readonly string[] } {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const rawFields = source.fields && typeof source.fields === "object" && !Array.isArray(source.fields) ? source.fields as Record<string, unknown> : {};
  const rawRepeats = source.repeats && typeof source.repeats === "object" && !Array.isArray(source.repeats) ? source.repeats as Record<string, unknown> : {};
  const fields: Record<string, string | number | boolean> = {};
  const repeatValues: Record<string, readonly Readonly<Record<string, string | number | boolean>>[]> = {};
  const allowedFieldKeys = new Set(definition.customFields.map((field) => field.key));
  for (const key of Object.keys(rawFields)) if (!allowedFieldKeys.has(key)) errors.push(`The structured field ${key} is not declared by this document type.`);
  for (const field of definition.customFields) {
    const valueForField = rawFields[field.key];
    if (valueForField === undefined || valueForField === null || valueForField === "") {
      if (field.required) errors.push(`The required structured field ${field.label} is missing.`);
      continue;
    }
    const normalized = boundedInputValue(field, valueForField);
    if (normalized === undefined) errors.push(`The structured field ${field.label} has an invalid value.`);
    else fields[field.key] = normalized;
  }
  const allowedSections = new Set(definition.repeatSections.map((section) => section.key));
  for (const key of Object.keys(rawRepeats)) if (!allowedSections.has(key)) errors.push(`The repeating section ${key} is not declared by this document type.`);
  for (const section of definition.repeatSections) {
    const rawRows = rawRepeats[section.key];
    if (rawRows === undefined) {
      if (section.fields.some((field) => field.required && field.source === "INPUT")) errors.push(`The repeating section ${section.label} is required.`);
      continue;
    }
    if (!Array.isArray(rawRows) || rawRows.length > 100) {
      errors.push(`The repeating section ${section.label} is invalid or exceeds 100 rows.`);
      continue;
    }
    const rows: Array<Record<string, string | number | boolean>> = [];
    for (const [rowIndex, rawRow] of rawRows.entries()) {
      if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
        errors.push(`The ${section.label} row ${rowIndex + 1} is invalid.`);
        continue;
      }
      const rowSource = rawRow as Record<string, unknown>;
      const allowedKeys = new Set(section.fields.filter((field) => field.source === "INPUT").map((field) => field.key));
      for (const key of Object.keys(rowSource)) if (key !== "sourceId" && !allowedKeys.has(key)) errors.push(`The ${section.label} row ${rowIndex + 1} contains an undeclared field.`);
      const row: Record<string, string | number | boolean> = {};
      for (const field of section.fields.filter((candidate) => candidate.source === "INPUT")) {
        const fieldValue = rowSource[field.key];
        if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
          if (field.required) errors.push(`The required ${section.label} field ${field.label} is missing from row ${rowIndex + 1}.`);
          continue;
        }
        const normalized = boundedInputValue(field, fieldValue);
        if (normalized === undefined) errors.push(`The ${section.label} field ${field.label} is invalid in row ${rowIndex + 1}.`);
        else row[field.key] = normalized;
      }
      if (typeof rowSource.sourceId === "string" && rowSource.sourceId.trim()) row.sourceId = rowSource.sourceId.trim();
      rows.push(row);
    }
    repeatValues[section.key] = rows;
  }
  return errors.length ? { ok: false, errors } : { ok: true, input: { fields, repeats: repeatValues } };
}

type ManagedAuth = { readonly companyId: string; readonly user: { readonly id: string; readonly email?: string | null; readonly user_metadata?: Record<string, unknown> }; readonly supabase: any };
type ManagedOptions = { readonly serverSupabaseSupplier?: () => any };

function sourceClient(auth: ManagedAuth, options: ManagedOptions) {
  return options.serverSupabaseSupplier ? options.serverSupabaseSupplier() : auth.supabase;
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function projectValues(row: Record<string, unknown> | undefined): Record<string, string> {
  return {
    "project.projectCode": stringValue(row?.project_code),
    "project.projectName": stringValue(row?.project_name),
    "project.location": stringValue(row?.location),
    "project.siteAddress": stringValue(row?.site_address),
    "project.clientName": stringValue(row?.client_name),
    "project.clientReference": stringValue(row?.client_reference),
    "project.billingContactName": stringValue(row?.billing_contact_name),
    "project.billingEmail": stringValue(row?.billing_email),
    "project.billingAddress": stringValue(row?.billing_address),
  };
}

export async function buildManagedTemplateRenderContext(
  auth: ManagedAuth,
  options: ManagedOptions,
  definition: DocumentTemplateTypeDefinition,
  sourceId: unknown,
  input: ManagedDocumentInputs,
): Promise<DocumentTemplateRenderContext> {
  const client = sourceClient(auth, options);
  const profileResult = await client.from("company_document_profiles").select("*").eq("company_id", auth.companyId).maybeSingle();
  const profile = companyDocumentProfileFromRow(profileResult?.data || null);
  const scalarValues: Record<string, string> = {
    "company.legalName": profile.legalName,
    "company.address": stringValue(profile.address),
    "company.contactNumber": stringValue(profile.contactNumber),
    "company.email": stringValue(profile.email),
    "company.vatTin": stringValue(profile.vatTin),
    "currentUser.name": stringValue(auth.user.user_metadata?.full_name || auth.user.email),
    "currentUser.title": stringValue(auth.user.user_metadata?.job_title),
  };

  if (definition.sourceContext === "PURCHASE_ORDER") {
    const source = String(sourceId || "").trim();
    if (!source) throw new Error("A Purchase Order source is required for this document type.");
    const poResult = await client.from("purchase_orders").select("*, purchase_order_lines(*)").eq("company_id", auth.companyId).eq("id", source).maybeSingle();
    if (poResult?.error || !poResult?.data) throw new Error("The selected Purchase Order is not available in this company workspace.");
    const po = purchaseOrderFromRow(poResult.data as Record<string, unknown>, Array.isArray(poResult.data.purchase_order_lines) ? poResult.data.purchase_order_lines as Record<string, unknown>[] : []);
    const [vendorResult, projectResult] = await Promise.all([
      client.from("vendors").select("*").eq("company_id", auth.companyId).eq("id", po.vendorId).maybeSingle(),
      client.from("projects").select("*").eq("company_id", auth.companyId).eq("id", po.projectId).maybeSingle(),
    ]);
    const snapshot = buildPurchaseOrderDocumentSnapshot(po, vendorResult?.data as any, projectResult?.data as any, profile);
    return buildFinancialTemplateRenderContext(snapshot);
  }

  if (definition.sourceContext === "PROJECT") {
    const projectId = String(sourceId || "").trim();
    if (!projectId) throw new Error("A project source is required for this document type.");
    const projectResult = await client.from("projects").select("*").eq("company_id", auth.companyId).eq("id", projectId).maybeSingle();
    if (projectResult?.error || !projectResult?.data) throw new Error("The selected project is not available in this company workspace.");
    Object.assign(scalarValues, projectValues(projectResult.data as Record<string, unknown>));
  }

  for (const [key, value] of Object.entries(input.fields)) scalarValues[key] = stringValue(value);
  const collections: Record<string, readonly Readonly<Record<string, string>>[]> = {};
  for (const section of definition.repeatSections) {
    const rows: Array<Record<string, string>> = [];
    if (section.source === "INPUT") {
      for (const row of input.repeats[section.key] || []) rows.push(Object.fromEntries(Object.entries(row).map(([key, value]) => [section.key + "." + key, stringValue(value)])));
    } else {
      const projectId = String(sourceId || "").trim();
      const [materials, equipment] = await Promise.all([
        client.from("engineering_project_materials").select("id,material_name,unit,required_quantity,notes").eq("company_id", auth.companyId).eq("project_id", projectId).order("updated_at", { ascending: true }),
        client.from("engineering_project_equipment").select("id,equipment_name,equipment_type,equipment_source,provider_name,notes").eq("company_id", auth.companyId).eq("project_id", projectId).order("updated_at", { ascending: true }),
      ]);
      const assets = [
        ...(materials?.data || []).map((row: Record<string, unknown>) => ({ sourceId: stringValue(row.id), item: stringValue(row.material_name), notes: stringValue(row.notes), sourceType: "Material", quantity: stringValue(row.required_quantity), unit: stringValue(row.unit) })),
        ...(equipment?.data || []).map((row: Record<string, unknown>) => ({ sourceId: stringValue(row.id), item: stringValue(row.equipment_name), notes: stringValue(row.notes), sourceType: stringValue(row.equipment_source), quantity: "", unit: stringValue(row.equipment_type || row.provider_name) })),
      ];
      const overrides = new Map((input.repeats[section.key] || []).map((row) => [String(row.sourceId || ""), row]));
      for (const asset of assets) {
        const override = overrides.get(asset.sourceId);
        const row: Record<string, string> = {};
        for (const field of section.fields) {
          if (field.source === "PROJECT_ASSET" && field.sourceKey) row[section.key + "." + field.key] = asset[field.sourceKey];
          else if (field.source === "INPUT" && override?.[field.key] !== undefined) row[section.key + "." + field.key] = stringValue(override[field.key]);
        }
        rows.push(row);
      }
    }
    collections[section.key] = rows;
  }
  return { typeKey: definition.key, scalarValues, collections };
}
