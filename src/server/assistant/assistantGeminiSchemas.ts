import { Type, type FunctionDeclaration, type Schema } from "@google/genai";

type JsonSchemaRecord = Record<string, unknown>;

export interface AssistantFunctionDefinitionShape {
  name: string;
  description: string;
  parametersJsonSchema: JsonSchemaRecord;
}

export interface AssistantToolSchemaIssue {
  code: string;
  toolName: string;
  declarationIndex: number;
  path: string;
  field?: string;
}

export class AssistantToolSchemaError extends Error {
  readonly issue: AssistantToolSchemaIssue;

  constructor(message: string, issue: AssistantToolSchemaIssue) {
    super(message);
    this.name = "AssistantToolSchemaError";
    this.issue = issue;
  }
}

const TYPE_BY_JSON_TYPE = {
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
  object: Type.OBJECT,
  array: Type.ARRAY,
} as const;

const SUPPORTED_SCHEMA_FIELDS = new Set([
  "type",
  "description",
  "enum",
  "format",
  "items",
  "maxItems",
  "maximum",
  "minItems",
  "minimum",
  "properties",
  "required",
]);

const PARAMETER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FUNCTION_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;

function isRecord(value: unknown): value is JsonSchemaRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function issue(
  message: string,
  definition: AssistantFunctionDefinitionShape,
  declarationIndex: number,
  path: string,
  code: string,
  field?: string,
): AssistantToolSchemaError {
  return new AssistantToolSchemaError(message, {
    code,
    toolName: definition.name,
    declarationIndex,
    path,
    ...(field ? { field } : {}),
  });
}

function schemaRecord(
  value: unknown,
  definition: AssistantFunctionDefinitionShape,
  declarationIndex: number,
  path: string,
): JsonSchemaRecord {
  if (!isRecord(value)) throw issue("Gemini tool schema nodes must be JSON objects.", definition, declarationIndex, path, "SCHEMA_NODE_INVALID");
  return value;
}

function finiteNumber(
  value: unknown,
  definition: AssistantFunctionDefinitionShape,
  declarationIndex: number,
  path: string,
  field: string,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw issue(`Gemini tool schema field ${field} must be a finite number.`, definition, declarationIndex, path, "SCHEMA_NUMBER_INVALID", field);
  return value;
}

function integerBound(
  value: unknown,
  definition: AssistantFunctionDefinitionShape,
  declarationIndex: number,
  path: string,
  field: string,
) {
  const result = finiteNumber(value, definition, declarationIndex, path, field);
  if (!Number.isInteger(result) || result < 0) throw issue(`Gemini tool schema field ${field} must be a non-negative integer.`, definition, declarationIndex, path, "SCHEMA_INTEGER_INVALID", field);
  return result;
}

function normalizeSchema(
  value: unknown,
  definition: AssistantFunctionDefinitionShape,
  declarationIndex: number,
  path: string,
): Schema {
  const source = schemaRecord(value, definition, declarationIndex, path);
  for (const field of Object.keys(source)) {
    if (field === "additionalProperties") {
      // The Gemini function-calling Schema contract does not reliably accept
      // this JSON Schema keyword. Fixed-record schemas remain safe because the
      // server validates and normalizes every tool argument independently.
      if (source[field] !== false) throw issue("Dynamic additionalProperties are not supported by assistant tool schemas.", definition, declarationIndex, path, "SCHEMA_ADDITIONAL_PROPERTIES_UNSUPPORTED", field);
      continue;
    }
    if (!SUPPORTED_SCHEMA_FIELDS.has(field)) throw issue(`Gemini tool schema field ${field} is not supported by the function-calling contract.`, definition, declarationIndex, path, "SCHEMA_FIELD_UNSUPPORTED", field);
  }

  const rawType = source.type;
  if (typeof rawType !== "string" || !(rawType.toLowerCase() in TYPE_BY_JSON_TYPE)) throw issue("Gemini tool schemas must declare a supported type.", definition, declarationIndex, path, "SCHEMA_TYPE_INVALID", "type");
  const jsonType = rawType.toLowerCase() as keyof typeof TYPE_BY_JSON_TYPE;
  const result: Schema = { type: TYPE_BY_JSON_TYPE[jsonType] };

  if (source.description !== undefined) {
    if (typeof source.description !== "string") throw issue("Gemini tool schema descriptions must be text.", definition, declarationIndex, path, "SCHEMA_DESCRIPTION_INVALID", "description");
    result.description = source.description;
  }
  if (source.format !== undefined) {
    if (typeof source.format !== "string") throw issue("Gemini tool schema formats must be text.", definition, declarationIndex, path, "SCHEMA_FORMAT_INVALID", "format");
    result.format = source.format;
  }
  if (source.enum !== undefined) {
    if (jsonType !== "string") throw issue("Gemini function enums are supported only for string parameters.", definition, declarationIndex, path, "SCHEMA_ENUM_TYPE_INVALID", "enum");
    if (!Array.isArray(source.enum) || source.enum.length === 0 || source.enum.some((item) => typeof item !== "string")) throw issue("Gemini function enums must contain one or more string values.", definition, declarationIndex, path, "SCHEMA_ENUM_INVALID", "enum");
    result.enum = [...new Set(source.enum as string[])];
  }
  if (source.minimum !== undefined) result.minimum = finiteNumber(source.minimum, definition, declarationIndex, path, "minimum");
  if (source.maximum !== undefined) result.maximum = finiteNumber(source.maximum, definition, declarationIndex, path, "maximum");
  if (result.minimum !== undefined && result.maximum !== undefined && result.minimum > result.maximum) throw issue("Gemini tool schema minimum cannot exceed maximum.", definition, declarationIndex, path, "SCHEMA_RANGE_INVALID");

  if (source.minItems !== undefined || source.maxItems !== undefined) {
    if (jsonType !== "array") throw issue("Gemini tool schema item bounds are only valid for arrays.", definition, declarationIndex, path, "SCHEMA_ITEM_BOUND_TYPE_INVALID");
    const minItems = source.minItems === undefined ? undefined : integerBound(source.minItems, definition, declarationIndex, path, "minItems");
    const maxItems = source.maxItems === undefined ? undefined : integerBound(source.maxItems, definition, declarationIndex, path, "maxItems");
    if (minItems !== undefined) result.minItems = String(minItems);
    if (maxItems !== undefined) result.maxItems = String(maxItems);
    if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) throw issue("Gemini tool schema minItems cannot exceed maxItems.", definition, declarationIndex, path, "SCHEMA_ITEM_RANGE_INVALID");
  }

  if (source.items !== undefined) {
    if (jsonType !== "array") throw issue("Gemini tool schema items are only valid for arrays.", definition, declarationIndex, path, "SCHEMA_ITEMS_TYPE_INVALID", "items");
    result.items = normalizeSchema(source.items, definition, declarationIndex, `${path}.items`);
  } else if (jsonType === "array") {
    throw issue("Gemini array tool schemas must declare items.", definition, declarationIndex, path, "SCHEMA_ITEMS_REQUIRED", "items");
  }

  if (source.properties !== undefined) {
    if (jsonType !== "object" || !isRecord(source.properties)) throw issue("Gemini object tool schemas must declare properties as an object.", definition, declarationIndex, path, "SCHEMA_PROPERTIES_INVALID", "properties");
    const properties: Record<string, Schema> = {};
    for (const [propertyName, propertySchema] of Object.entries(source.properties)) {
      if (!PARAMETER_NAME_PATTERN.test(propertyName)) throw issue(`Gemini tool parameter name ${propertyName} is invalid.`, definition, declarationIndex, `${path}.properties.${propertyName}`, "SCHEMA_PARAMETER_NAME_INVALID", "properties");
      properties[propertyName] = normalizeSchema(propertySchema, definition, declarationIndex, `${path}.properties.${propertyName}`);
    }
    result.properties = properties;
  } else if (jsonType === "object") {
    result.properties = {};
  }

  if (source.required !== undefined) {
    if (jsonType !== "object" || !Array.isArray(source.required) || source.required.some((item) => typeof item !== "string")) throw issue("Gemini required fields must be a string array on object schemas.", definition, declarationIndex, path, "SCHEMA_REQUIRED_INVALID", "required");
    const required = [...new Set(source.required as string[])];
    const propertyNames = new Set(Object.keys(result.properties || {}));
    if (required.some((name) => !propertyNames.has(name))) throw issue("Gemini required fields must refer to declared properties.", definition, declarationIndex, path, "SCHEMA_REQUIRED_UNKNOWN", "required");
    // Empty required arrays are omitted because the Gemini function contract
    // treats required as optional and some model versions reject [] values.
    if (required.length > 0) result.required = required;
  }

  if (jsonType !== "object" && (source.properties !== undefined || source.required !== undefined)) throw issue("Gemini properties and required are only valid for object schemas.", definition, declarationIndex, path, "SCHEMA_OBJECT_FIELD_TYPE_INVALID");
  if (!(jsonType === "number" || jsonType === "integer") && (source.minimum !== undefined || source.maximum !== undefined)) throw issue("Gemini numeric bounds are only valid for number and integer schemas.", definition, declarationIndex, path, "SCHEMA_NUMERIC_BOUND_TYPE_INVALID");
  if (jsonType !== "array" && (source.minItems !== undefined || source.maxItems !== undefined)) throw issue("Gemini item bounds are only valid for arrays.", definition, declarationIndex, path, "SCHEMA_ITEM_BOUND_TYPE_INVALID");

  return result;
}

export function normalizeAssistantFunctionDeclaration(definition: AssistantFunctionDefinitionShape, declarationIndex = 0): FunctionDeclaration {
  if (typeof definition.name !== "string" || !FUNCTION_NAME_PATTERN.test(definition.name)) throw issue("Gemini function names must use the provider-safe identifier format.", definition, declarationIndex, definition.name || "<name>", "FUNCTION_NAME_INVALID", "name");
  if (typeof definition.description !== "string" || !definition.description.trim()) throw issue("Gemini function descriptions are required.", definition, declarationIndex, definition.name, "FUNCTION_DESCRIPTION_INVALID", "description");
  const parameters = normalizeSchema(definition.parametersJsonSchema, definition, declarationIndex, `${definition.name}.parameters`);
  if (parameters.type !== Type.OBJECT) throw issue("Gemini function parameters must be an object schema.", definition, declarationIndex, `${definition.name}.parameters`, "FUNCTION_PARAMETERS_NOT_OBJECT", "parameters");
  return { name: definition.name, description: definition.description, parameters };
}

export function normalizeAssistantFunctionDeclarations(definitions: readonly AssistantFunctionDefinitionShape[]): FunctionDeclaration[] {
  return definitions.map((definition, index) => normalizeAssistantFunctionDeclaration(definition, index));
}

export function assistantToolSchemaAudit(definitions: readonly AssistantFunctionDefinitionShape[]) {
  const declarations = normalizeAssistantFunctionDeclarations(definitions);
  return {
    declarationCount: declarations.length,
    declarations,
  } as const;
}
