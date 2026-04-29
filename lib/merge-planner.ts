import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJsonIfExists, writeJsonArtifact } from "./analysis-utils.ts";
import type {
  AuditOutput,
  ComparisonOutput,
  FeatureInventoryOutput,
  RepoSummaryOutput,
  UserIntentOutput,
} from "./agent-prompt-templates.ts";
import type { Project, RepoAnalysis, SourceRepo } from "../types/project.ts";

export type MergeDecision = {
  featureName: string;
  decision: "keep" | "adapt" | "rewrite" | "discard" | "create_new";
  sourceRepo: string;
  sourcePaths: string[];
  targetPaths: string[];
  reason: string;
  confidence: number;
};

export type MergePlan = {
  projectId: string;
  selectedBaseRepo: string;
  baseRepoReason: string;
  decisions: MergeDecision[];
  conflicts: string[];
  risks: string[];
  buildMilestones: Array<{ title: string; description: string; dependsOn: string[] }>;
};

export type MergePlanInput = {
  projectId: string;
  sourceRepos?: SourceRepo[];
  repoAnalyses?: RepoAnalysis[];
  repoSummaries: Record<string, RepoSummaryOutput>;
  userIntent: UserIntentOutput;
  featureInventory: FeatureInventoryOutput;
  comparison: ComparisonOutput;
  audit: AuditOutput;
};

const DECISION_ORDER: MergeDecision["decision"][] = ["keep", "adapt", "rewrite", "discard", "create_new"];
const REPO_ALIASES = ["repo_a", "repo_b", "repo_c"];

export async function loadMergePlanInput(project: Project): Promise<MergePlanInput | null> {
  const analysisDirEntries = await safeReadDir(project.analysisPath);
  const repoSummaries: Record<string, RepoSummaryOutput> = {};
  const repoAnalyses: RepoAnalysis[] = [];

  for (const entry of analysisDirEntries.filter((item) => item.isDirectory())) {
    const repoDir = path.join(project.analysisPath, entry.name);
    const summary = await readJsonIfExists<RepoSummaryOutput>(path.join(repoDir, "repo-summary.json"));
    if (summary) {
      repoSummaries[entry.name] = summary;
    }

    const analysis = await readJsonIfExists<RepoAnalysis>(path.join(repoDir, "repo-analysis.json"));
    if (analysis) {
      repoAnalyses.push(analysis);
    }
  }

  const [userIntent, featureInventory, comparison, audit] = await Promise.all([
    readJsonIfExists<UserIntentOutput>(path.join(project.analysisPath, "user-intent.json")),
    readJsonIfExists<FeatureInventoryOutput>(path.join(project.analysisPath, "feature-inventory.json")),
    readJsonIfExists<ComparisonOutput>(path.join(project.analysisPath, "cross-repo-comparison.json")),
    readJsonIfExists<AuditOutput>(path.join(project.analysisPath, "best-practice-audit.json")),
  ]);

  if (!userIntent || !featureInventory || !comparison || !audit || !Object.keys(repoSummaries).length) {
    return null;
  }

  return {
    projectId: project.id,
    sourceRepos: project.sourceRepos,
    repoAnalyses,
    repoSummaries,
    userIntent,
    featureInventory,
    comparison,
    audit,
  };
}

export async function generateAndSaveMergePlan(input: MergePlanInput, analysisPath: string): Promise<MergePlan> {
  const plan = generateMergePlan(input);
  await writeJsonArtifact(analysisPath, "merge-plan.json", plan);
  return plan;
}

export function generateMergePlan(input: MergePlanInput): MergePlan {
  const selectedBaseRepo = selectBaseRepo(input);
  const decisions = input.featureInventory.features
    .map((feature) => resolveFeatureDecision(input, selectedBaseRepo, feature))
    .sort((a, b) => DECISION_ORDER.indexOf(a.decision) - DECISION_ORDER.indexOf(b.decision));

  return {
    projectId: input.projectId,
    selectedBaseRepo,
    baseRepoReason: baseRepoReason(input, selectedBaseRepo),
    decisions,
    conflicts: [...input.comparison.conflicts],
    risks: collectRisks(input),
    buildMilestones: buildMilestones(decisions),
  };
}

export function selectBaseRepo(input: MergePlanInput): string {
  const knownIds = collectKnownRepoIds(input);
  const recommended = resolveRepoId(input.comparison.recommendedBaseRepo, input);
  if (knownIds.has(recommended)) {
    return recommended;
  }

  let bestRepo = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [repoId, summary] of Object.entries(input.repoSummaries)) {
    const analysis = input.repoAnalyses?.find((item) => item.repoId === repoId);
    const score = scoreBaseCandidate(summary, analysis);
    if (score > bestScore) {
      bestRepo = repoId;
      bestScore = score;
    }
  }

  return bestRepo || input.sourceRepos?.[0]?.id || recommended || "repo_a";
}

function resolveFeatureDecision(
  input: MergePlanInput,
  selectedBaseRepo: string,
  feature: FeatureInventoryOutput["features"][number],
): MergeDecision {
  const sourceRepo = selectFeatureSource(input, selectedBaseRepo, feature);
  const sourcePaths = findFeaturePaths(input, sourceRepo, feature.featureName);
  const explicitPreference = findSourcePreference(input, sourceRepo, feature.featureName);
  const decision = normalizeDecision(feature.suggestedDecision, feature.quality, sourceRepo, selectedBaseRepo, explicitPreference);
  const targetPaths = targetPathsForDecision(decision, sourcePaths, feature.featureName);

  return {
    featureName: feature.featureName,
    decision,
    sourceRepo,
    sourcePaths,
    targetPaths,
    reason: decisionReason(decision, feature, sourceRepo, selectedBaseRepo, explicitPreference),
    confidence: decisionConfidence(feature.quality, feature.suggestedDecision, sourcePaths, explicitPreference),
  };
}

function selectFeatureSource(
  input: MergePlanInput,
  selectedBaseRepo: string,
  feature: FeatureInventoryOutput["features"][number],
): string {
  const presentIn = feature.presentIn.map((repoId) => resolveRepoId(repoId, input));
  if (presentIn.includes(selectedBaseRepo)) {
    return selectedBaseRepo;
  }

  const preferred = input.userIntent.sourcePreferences
    .map((preference) => resolveRepoId(preference.repoId, input))
    .find((repoId) => presentIn.includes(repoId));
  if (preferred) {
    return preferred;
  }

  return presentIn[0] ?? selectedBaseRepo;
}

function normalizeDecision(
  suggested: MergeDecision["decision"],
  quality: FeatureInventoryOutput["features"][number]["quality"],
  sourceRepo: string,
  selectedBaseRepo: string,
  explicitPreference: string | null,
): MergeDecision["decision"] {
  if (quality === "missing") {
    return "create_new";
  }

  if (explicitPreference && suggested === "discard") {
    return quality === "strong" ? "adapt" : "rewrite";
  }

  if (suggested === "keep" && sourceRepo !== selectedBaseRepo) {
    return "adapt";
  }

  return suggested;
}

function findFeaturePaths(input: MergePlanInput, sourceRepo: string, featureName: string): string[] {
  const summary = input.repoSummaries[sourceRepo];
  const tokens = tokenize(featureName);
  const summaryPaths = [
    ...(summary?.bestParts ?? []).map((part) => ({ label: part.name, path: part.path })),
    ...(summary?.weakParts ?? []).map((part) => ({ label: part.name, path: part.path })),
  ];
  const analysis = input.repoAnalyses?.find((item) => item.repoId === sourceRepo);
  const analysisPaths = [
    ...(analysis?.routes ?? []).map((route) => ({ label: `${route.path} ${route.type}`, path: route.file })),
    ...(analysis?.components ?? []).map((component) => ({ label: `${component.name} ${component.type}`, path: component.path })),
  ];

  return unique(
    [...summaryPaths, ...analysisPaths]
      .filter((item) => tokens.some((token) => item.label.toLowerCase().includes(token)))
      .map((item) => item.path)
      .filter(Boolean),
  ).slice(0, 6);
}

function targetPathsForDecision(
  decision: MergeDecision["decision"],
  sourcePaths: string[],
  featureName: string,
): string[] {
  if (decision !== "create_new" && sourcePaths.length) {
    return sourcePaths.map((filePath) => normalizeTargetPath(filePath));
  }

  const slug = slugify(featureName);
  if (/test|spec/i.test(featureName)) {
    return [`tests/${slug}.test.ts`];
  }
  if (/doc|readme|handoff/i.test(featureName)) {
    return ["README.md"];
  }
  return [`src/features/${slug}.ts`];
}

function normalizeTargetPath(filePath: string): string {
  if (filePath.startsWith("src/") || filePath.startsWith("app/") || filePath.startsWith("components/") || filePath.startsWith("lib/")) {
    return filePath;
  }
  return filePath.replace(/^pages\//, "app/");
}

function decisionReason(
  decision: MergeDecision["decision"],
  feature: FeatureInventoryOutput["features"][number],
  sourceRepo: string,
  selectedBaseRepo: string,
  explicitPreference: string | null,
): string {
  const parts = [feature.notes || `AI inventory suggested ${feature.suggestedDecision} for this feature.`];
  if (decision === "adapt" && sourceRepo !== selectedBaseRepo) {
    parts.push(`Adapt from ${sourceRepo} into the ${selectedBaseRepo} architecture.`);
  }
  if (decision === "create_new") {
    parts.push("Create this because the inventory marked it missing from the source repos.");
  }
  if (explicitPreference) {
    parts.push(`User preference: ${explicitPreference}`);
  }
  return parts.join(" ");
}

function decisionConfidence(
  quality: FeatureInventoryOutput["features"][number]["quality"],
  suggested: MergeDecision["decision"],
  sourcePaths: string[],
  explicitPreference: string | null,
): number {
  let confidence = quality === "strong" ? 0.82 : quality === "weak" ? 0.62 : 0.7;
  if (sourcePaths.length) {
    confidence += 0.08;
  }
  if (suggested === "create_new") {
    confidence += 0.04;
  }
  if (explicitPreference) {
    confidence += 0.05;
  }
  return Math.min(0.95, Number(confidence.toFixed(2)));
}

function baseRepoReason(input: MergePlanInput, selectedBaseRepo: string): string {
  if (resolveRepoId(input.comparison.recommendedBaseRepo, input) === selectedBaseRepo) {
    return input.comparison.recommendedBaseReason;
  }

  const summary = input.repoSummaries[selectedBaseRepo];
  if (summary) {
    return `${selectedBaseRepo} has the strongest base score from repo summaries: ${summary.primaryPurpose}`;
  }
  return `${selectedBaseRepo} is the first available repository with enough analysis data for planning.`;
}

function collectRisks(input: MergePlanInput): string[] {
  return unique([
    ...input.audit.criticalIssues,
    ...input.audit.findings
      .filter((finding) => finding.severity === "high" || finding.severity === "medium")
      .map((finding) => `${finding.severity.toUpperCase()}: ${finding.message}`),
    ...input.userIntent.unknownsToResolve.map((unknown) => `Unknown requirement: ${unknown}`),
  ]);
}

function buildMilestones(decisions: MergeDecision[]): MergePlan["buildMilestones"] {
  const milestones: MergePlan["buildMilestones"] = [
    {
      title: "Scaffold final workspace",
      description: "Create the final project workspace from the selected base repository.",
      dependsOn: [],
    },
  ];

  for (const decision of DECISION_ORDER) {
    const count = decisions.filter((item) => item.decision === decision).length;
    if (!count) {
      continue;
    }
    milestones.push({
      title: milestoneTitle(decision),
      description: `${count} feature${count === 1 ? "" : "s"} marked ${decision.replace("_", " ")}.`,
      dependsOn: ["Scaffold final workspace"],
    });
  }

  milestones.push({
    title: "Verify final build",
    description: "Run type checks, tests, and build verification after all planned changes are applied.",
    dependsOn: milestones.slice(1).map((milestone) => milestone.title),
  });

  return milestones;
}

function milestoneTitle(decision: MergeDecision["decision"]): string {
  switch (decision) {
    case "keep":
      return "Copy kept files";
    case "adapt":
      return "Adapt selected features";
    case "rewrite":
      return "Rewrite selected features";
    case "discard":
      return "Exclude discarded features";
    case "create_new":
      return "Create missing features";
  }
}

function scoreBaseCandidate(summary: RepoSummaryOutput, analysis?: RepoAnalysis): number {
  const roleScore = summary.recommendedRole === "base_repo" ? 40 : summary.recommendedRole === "feature_source" ? 15 : 0;
  const bestPartScore = summary.bestParts.length * 4;
  const weakPartPenalty = summary.weakParts.filter((part) => part.recommendation !== "keep").length * 3;
  const riskPenalty = analysis?.risks.risks.filter((risk) => risk.severity === "high").length ?? 0;
  const stackScore = (analysis?.stack.confidence ?? 0) * 10;
  return roleScore + bestPartScore + stackScore - weakPartPenalty - riskPenalty * 8;
}

function findSourcePreference(input: MergePlanInput, sourceRepo: string, featureName: string): string | null {
  const featureTokens = tokenize(featureName);
  const preference = input.userIntent.sourcePreferences.find((item) => resolveRepoId(item.repoId, input) === sourceRepo);
  if (!preference) {
    return null;
  }

  const preserve = preference.itemsToPreserve.find((item) =>
    featureTokens.some((token) => item.toLowerCase().includes(token)),
  );
  return preserve ? preserve : null;
}

function resolveRepoId(repoId: string, input: MergePlanInput): string {
  const aliasIndex = REPO_ALIASES.indexOf(repoId);
  if (aliasIndex >= 0) {
    return input.sourceRepos?.[aliasIndex]?.id ?? repoId;
  }
  return repoId;
}

function collectKnownRepoIds(input: MergePlanInput): Set<string> {
  return new Set([
    ...Object.keys(input.repoSummaries),
    ...(input.repoAnalyses ?? []).map((analysis) => analysis.repoId),
    ...(input.sourceRepos ?? []).map((repo) => repo.id),
  ]);
}

async function safeReadDir(dirPath: string) {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "feature";
}
