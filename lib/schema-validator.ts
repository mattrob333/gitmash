import {
  AUDIT_OUTPUT_SCHEMA,
  COMPARISON_OUTPUT_SCHEMA,
  FEATURE_INVENTORY_OUTPUT_SCHEMA,
  REPO_SUMMARY_OUTPUT_SCHEMA,
  USER_INTENT_OUTPUT_SCHEMA,
  type AuditOutput,
  type ComparisonOutput,
  type FeatureInventoryOutput,
  type RepoSummaryOutput,
  type RuntimeSchema,
  type UserIntentOutput,
} from "./agent-prompt-templates.ts";

export type SchemaName =
  | "repo_summary"
  | "user_intent"
  | "feature_inventory"
  | "cross_repo_comparison"
  | "best_practice_audit";

export type SchemaOutputMap = {
  repo_summary: RepoSummaryOutput;
  user_intent: UserIntentOutput;
  feature_inventory: FeatureInventoryOutput;
  cross_repo_comparison: ComparisonOutput;
  best_practice_audit: AuditOutput;
};

const SCHEMAS: Record<SchemaName, RuntimeSchema> = {
  repo_summary: REPO_SUMMARY_OUTPUT_SCHEMA,
  user_intent: USER_INTENT_OUTPUT_SCHEMA,
  feature_inventory: FEATURE_INVENTORY_OUTPUT_SCHEMA,
  cross_repo_comparison: COMPARISON_OUTPUT_SCHEMA,
  best_practice_audit: AUDIT_OUTPUT_SCHEMA,
};

export class SchemaValidationError extends Error {
  readonly issues: string[];

  constructor(schemaName: string, issues: string[]) {
    super(`Invalid ${schemaName} output: ${issues.join("; ")}`);
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

export function validateSchema<T>(schema: RuntimeSchema, data: unknown, schemaName = "AI"): T {
  const issues: string[] = [];
  validateNode(schema, data, "$", issues);
  if (issues.length) {
    throw new SchemaValidationError(schemaName, issues);
  }
  return data as T;
}

export function validateAgentOutput<Name extends SchemaName>(
  schemaName: Name,
  data: unknown,
): SchemaOutputMap[Name] {
  return validateSchema<SchemaOutputMap[Name]>(SCHEMAS[schemaName], data, schemaName);
}

function validateNode(schema: RuntimeSchema, data: unknown, path: string, issues: string[]): void {
  switch (schema.type) {
    case "string":
      if (typeof data !== "string") {
        issues.push(`${path} must be a string`);
      }
      return;
    case "number":
      if (typeof data !== "number" || Number.isNaN(data)) {
        issues.push(`${path} must be a number`);
      }
      return;
    case "boolean":
      if (typeof data !== "boolean") {
        issues.push(`${path} must be a boolean`);
      }
      return;
    case "enum":
      if (typeof data !== "string" || !schema.values.includes(data)) {
        issues.push(`${path} must be one of: ${schema.values.join(", ")}`);
      }
      return;
    case "array":
      if (!Array.isArray(data)) {
        issues.push(`${path} must be an array`);
        return;
      }
      data.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, issues));
      return;
    case "record":
      if (!isPlainObject(data)) {
        issues.push(`${path} must be an object`);
        return;
      }
      for (const [key, value] of Object.entries(data)) {
        validateNode(schema.values, value, `${path}.${key}`, issues);
      }
      return;
    case "object":
      if (!isPlainObject(data)) {
        issues.push(`${path} must be an object`);
        return;
      }
      for (const [field, fieldSchema] of Object.entries(schema.fields)) {
        if (!(field in data)) {
          issues.push(`${path}.${field} is required`);
          continue;
        }
        validateNode(fieldSchema, data[field], `${path}.${field}`, issues);
      }
      return;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
