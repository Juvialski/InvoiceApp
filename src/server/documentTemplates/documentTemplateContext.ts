import type { FinancialDocumentSnapshot } from "../../lib/documentGeneration.ts";
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
