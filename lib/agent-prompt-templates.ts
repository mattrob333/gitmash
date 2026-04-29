export type RuntimeSchema =
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "enum"; values: readonly string[] }
  | { type: "array"; items: RuntimeSchema }
  | { type: "record"; values: RuntimeSchema }
  | { type: "object"; fields: Record<string, RuntimeSchema> };

export type BestPart = {
  name: string;
  type: "component" | "service" | "route" | "schema" | "workflow" | "design" | "documentation" | "test";
  path: string;
  whyItIsGood: string;
  confidence: number;
};

export type WeakPart = {
  name: string;
  path: string;
  problem: string;
  recommendation: "keep" | "rewrite" | "discard";
  confidence: number;
};

export type RepoSummaryOutput = {
  repoName: string;
  primaryPurpose: string;
  detectedStack: string[];
  mainFeatures: string[];
  bestParts: BestPart[];
  weakParts: WeakPart[];
  technicalDebt: string[];
  securityConcerns: string[];
  testingGaps: string[];
  documentationGaps: string[];
  recommendedRole: "base_repo" | "feature_source" | "concept_source" | "discard_most" | "unclear";
};

export type UserIntentOutput = {
  finalProjectGoal: string;
  preferredStack: string[];
  sourcePreferences: Array<{
    repoId: string;
    itemsToPreserve: string[];
    itemsToAvoid: string[];
    notes: string;
  }>;
  qualityBar: {
    testingRequired: boolean;
    documentationRequired: boolean;
    devLogsRequired: boolean;
    codeReviewsRequired: boolean;
    futureAgentHandoffRequired: boolean;
  };
  explicitConstraints: string[];
  implicitConstraints: string[];
  unknownsToResolve: string[];
};

export type FeatureInventoryOutput = {
  features: Array<{
    featureName: string;
    presentIn: Array<"repo_a" | "repo_b" | "repo_c">;
    quality: "strong" | "weak" | "missing";
    notes: string;
    suggestedDecision: "keep" | "adapt" | "rewrite" | "discard" | "create_new";
  }>;
};

export type ComparisonOutput = {
  repoRoles: Array<{
    repoId: string;
    role: string;
    reason: string;
  }>;
  overlaps: string[];
  conflicts: string[];
  strengthsByRepo: Record<string, string[]>;
  recommendedBaseRepo: string;
  recommendedBaseReason: string;
};

export type AuditOutput = {
  findings: Array<{
    category: string;
    severity: "low" | "medium" | "high";
    message: string;
    recommendation: string;
  }>;
  overallScore: "good" | "fair" | "poor";
  criticalIssues: string[];
};

export type AgentPromptTemplate = {
  systemPrompt: string;
  outputSchema: RuntimeSchema;
  userPromptBuilder: (analysisData: unknown) => string;
};

const stringSchema = { type: "string" } as const;
const numberSchema = { type: "number" } as const;
const booleanSchema = { type: "boolean" } as const;
const stringArraySchema = { type: "array", items: stringSchema } as const;
const repoIdEnumSchema = { type: "enum", values: ["repo_a", "repo_b", "repo_c"] } as const;
const decisionReason =
  "Every keep, adapt, rewrite, discard, or create_new decision must include a concrete reason in the relevant text field.";
const sourceCitation =
  "Cite source files by path whenever possible. If a source file is unavailable, state that uncertainty explicitly.";

export const REPO_SUMMARY_OUTPUT_SCHEMA: RuntimeSchema = {
  type: "object",
  fields: {
    repoName: stringSchema,
    primaryPurpose: stringSchema,
    detectedStack: stringArraySchema,
    mainFeatures: stringArraySchema,
    bestParts: {
      type: "array",
      items: {
        type: "object",
        fields: {
          name: stringSchema,
          type: { type: "enum", values: ["component", "service", "route", "schema", "workflow", "design", "documentation", "test"] },
          path: stringSchema,
          whyItIsGood: stringSchema,
          confidence: numberSchema,
        },
      },
    },
    weakParts: {
      type: "array",
      items: {
        type: "object",
        fields: {
          name: stringSchema,
          path: stringSchema,
          problem: stringSchema,
          recommendation: { type: "enum", values: ["keep", "rewrite", "discard"] },
          confidence: numberSchema,
        },
      },
    },
    technicalDebt: stringArraySchema,
    securityConcerns: stringArraySchema,
    testingGaps: stringArraySchema,
    documentationGaps: stringArraySchema,
    recommendedRole: { type: "enum", values: ["base_repo", "feature_source", "concept_source", "discard_most", "unclear"] },
  },
};

export const USER_INTENT_OUTPUT_SCHEMA: RuntimeSchema = {
  type: "object",
  fields: {
    finalProjectGoal: stringSchema,
    preferredStack: stringArraySchema,
    sourcePreferences: {
      type: "array",
      items: {
        type: "object",
        fields: {
          repoId: stringSchema,
          itemsToPreserve: stringArraySchema,
          itemsToAvoid: stringArraySchema,
          notes: stringSchema,
        },
      },
    },
    qualityBar: {
      type: "object",
      fields: {
        testingRequired: booleanSchema,
        documentationRequired: booleanSchema,
        devLogsRequired: booleanSchema,
        codeReviewsRequired: booleanSchema,
        futureAgentHandoffRequired: booleanSchema,
      },
    },
    explicitConstraints: stringArraySchema,
    implicitConstraints: stringArraySchema,
    unknownsToResolve: stringArraySchema,
  },
};

export const FEATURE_INVENTORY_OUTPUT_SCHEMA: RuntimeSchema = {
  type: "object",
  fields: {
    features: {
      type: "array",
      items: {
        type: "object",
        fields: {
          featureName: stringSchema,
          presentIn: { type: "array", items: repoIdEnumSchema },
          quality: { type: "enum", values: ["strong", "weak", "missing"] },
          notes: stringSchema,
          suggestedDecision: { type: "enum", values: ["keep", "adapt", "rewrite", "discard", "create_new"] },
        },
      },
    },
  },
};

export const COMPARISON_OUTPUT_SCHEMA: RuntimeSchema = {
  type: "object",
  fields: {
    repoRoles: {
      type: "array",
      items: {
        type: "object",
        fields: {
          repoId: stringSchema,
          role: stringSchema,
          reason: stringSchema,
        },
      },
    },
    overlaps: stringArraySchema,
    conflicts: stringArraySchema,
    strengthsByRepo: { type: "record", values: stringArraySchema },
    recommendedBaseRepo: stringSchema,
    recommendedBaseReason: stringSchema,
  },
};

export const AUDIT_OUTPUT_SCHEMA: RuntimeSchema = {
  type: "object",
  fields: {
    findings: {
      type: "array",
      items: {
        type: "object",
        fields: {
          category: stringSchema,
          severity: { type: "enum", values: ["low", "medium", "high"] },
          message: stringSchema,
          recommendation: stringSchema,
        },
      },
    },
    overallScore: { type: "enum", values: ["good", "fair", "poor"] },
    criticalIssues: stringArraySchema,
  },
};

export const REPO_SUMMARY_AGENT: AgentPromptTemplate = {
  systemPrompt: [
    "You are the GitMash Repo Summary Agent.",
    "Analyze one repository independently using only the provided static analysis data and digest.",
    "Return only structured JSON matching the requested schema.",
    sourceCitation,
    "Give every recommendation a reason and a confidence score where the schema asks for one.",
  ].join("\n"),
  outputSchema: REPO_SUMMARY_OUTPUT_SCHEMA,
  userPromptBuilder: (analysisData) => buildPrompt(
    "Summarize this repository for a future multi-repo synthesis plan.",
    analysisData,
    REPO_SUMMARY_OUTPUT_SCHEMA,
  ),
};

export const USER_INTENT_AGENT: AgentPromptTemplate = {
  systemPrompt: [
    "You are the GitMash User Intent Extraction Agent.",
    "Convert the user's natural language brief and repo context into structured build guidance.",
    "Return only structured JSON matching the requested schema.",
    "Separate explicit constraints from reasonable implicit constraints. Put unclear requirements in unknownsToResolve.",
    decisionReason,
  ].join("\n"),
  outputSchema: USER_INTENT_OUTPUT_SCHEMA,
  userPromptBuilder: (analysisData) => buildPrompt(
    "Extract the user's intended final project goal and source preferences.",
    analysisData,
    USER_INTENT_OUTPUT_SCHEMA,
  ),
};

export const FEATURE_INVENTORY_AGENT: AgentPromptTemplate = {
  systemPrompt: [
    "You are the GitMash Feature Inventory Agent.",
    "Create a normalized feature inventory across repo_a, repo_b, and optional repo_c.",
    "Return only structured JSON matching the requested schema.",
    sourceCitation,
    decisionReason,
  ].join("\n"),
  outputSchema: FEATURE_INVENTORY_OUTPUT_SCHEMA,
  userPromptBuilder: (analysisData) => buildPrompt(
    "Inventory comparable features across the repositories, including auth, routing, dashboard, UI, data models, API layer, AI workflows, state, upload, database, payments, admin tools, tests, docs, and deployment where detectable.",
    analysisData,
    FEATURE_INVENTORY_OUTPUT_SCHEMA,
  ),
};

export const CROSS_REPO_COMPARISON_AGENT: AgentPromptTemplate = {
  systemPrompt: [
    "You are the GitMash Cross-Repo Comparison Agent.",
    "Compare repositories and assign practical roles for the final build.",
    "Return only structured JSON matching the requested schema.",
    "Explain overlaps, conflicts, strengths, and base-repo recommendation with reasons.",
    sourceCitation,
    decisionReason,
  ].join("\n"),
  outputSchema: COMPARISON_OUTPUT_SCHEMA,
  userPromptBuilder: (analysisData) => buildPrompt(
    "Compare the repositories and recommend the base repo plus supporting roles.",
    analysisData,
    COMPARISON_OUTPUT_SCHEMA,
  ),
};

export const BEST_PRACTICE_AUDIT_AGENT: AgentPromptTemplate = {
  systemPrompt: [
    "You are the GitMash Best Practice Audit Agent.",
    "Audit architecture, security, testing, performance, accessibility, developer experience, and future AI-agent compatibility.",
    "Return only structured JSON matching the requested schema.",
    sourceCitation,
    "Do not claim tests passed unless test execution results are included in the input.",
  ].join("\n"),
  outputSchema: AUDIT_OUTPUT_SCHEMA,
  userPromptBuilder: (analysisData) => buildPrompt(
    "Audit these repository analyses and proposed direction for best-practice risks.",
    analysisData,
    AUDIT_OUTPUT_SCHEMA,
  ),
};

function buildPrompt(task: string, analysisData: unknown, schema: RuntimeSchema): string {
  return [
    task,
    "",
    "Output requirements:",
    "- Return a single JSON object.",
    "- Use exactly the camelCase keys shown in the schema.",
    "- Include source file paths in free-text reason fields whenever possible.",
    "- Include uncertainty explicitly when evidence is incomplete.",
    "",
    "Schema:",
    JSON.stringify(schema, null, 2),
    "",
    "Analysis data:",
    JSON.stringify(analysisData, null, 2),
  ].join("\n");
}
