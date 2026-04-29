import type { AIProvider } from "./ai-provider.ts";
import {
  BEST_PRACTICE_AUDIT_AGENT,
  CROSS_REPO_COMPARISON_AGENT,
  FEATURE_INVENTORY_AGENT,
  REPO_SUMMARY_AGENT,
  USER_INTENT_AGENT,
  type AgentPromptTemplate,
  type AuditOutput,
  type ComparisonOutput,
  type FeatureInventoryOutput,
  type RepoSummaryOutput,
  type UserIntentOutput,
} from "./agent-prompt-templates.ts";
import {
  SchemaValidationError,
  validateAgentOutput,
  validateSchema,
  type SchemaName,
  type SchemaOutputMap,
} from "./schema-validator.ts";

export type RunAgentOptions = {
  maxRetries?: number;
};

export async function runAgent<Name extends SchemaName>(
  provider: AIProvider,
  schemaName: Name,
  template: AgentPromptTemplate,
  analysisData: unknown,
  options: RunAgentOptions = {},
): Promise<SchemaOutputMap[Name]> {
  const maxRetries = options.maxRetries ?? 2;
  let attempt = 0;
  let validationHint = "";

  while (attempt <= maxRetries) {
    const userPrompt = `${template.userPromptBuilder(analysisData)}${validationHint}`;
    const output = await provider.generateJson<unknown>({
      systemPrompt: template.systemPrompt,
      userPrompt,
      schema: template.outputSchema,
    });

    try {
      const validated = validateSchema<SchemaOutputMap[Name]>(template.outputSchema, output, schemaName);
      return validateAgentOutput(schemaName, validated);
    } catch (error) {
      if (!(error instanceof SchemaValidationError) || attempt >= maxRetries) {
        throw error;
      }
      validationHint = [
        "",
        "",
        "Previous output failed schema validation.",
        `Validation error: ${error.message}`,
        "Return corrected JSON only.",
      ].join("\n");
      attempt += 1;
    }
  }

  throw new Error(`Agent ${schemaName} exhausted retries.`);
}

export function runRepoSummary(
  provider: AIProvider,
  analysisData: unknown,
  options?: RunAgentOptions,
): Promise<RepoSummaryOutput> {
  return runAgent(provider, "repo_summary", REPO_SUMMARY_AGENT, analysisData, options);
}

export function extractUserIntent(
  provider: AIProvider,
  analysisData: unknown,
  options?: RunAgentOptions,
): Promise<UserIntentOutput> {
  return runAgent(provider, "user_intent", USER_INTENT_AGENT, analysisData, options);
}

export function inventoryFeatures(
  provider: AIProvider,
  analysisData: unknown,
  options?: RunAgentOptions,
): Promise<FeatureInventoryOutput> {
  return runAgent(provider, "feature_inventory", FEATURE_INVENTORY_AGENT, analysisData, options);
}

export function compareRepos(
  provider: AIProvider,
  analysisData: unknown,
  options?: RunAgentOptions,
): Promise<ComparisonOutput> {
  return runAgent(provider, "cross_repo_comparison", CROSS_REPO_COMPARISON_AGENT, analysisData, options);
}

export function auditBestPractices(
  provider: AIProvider,
  analysisData: unknown,
  options?: RunAgentOptions,
): Promise<AuditOutput> {
  return runAgent(provider, "best_practice_audit", BEST_PRACTICE_AUDIT_AGENT, analysisData, options);
}
