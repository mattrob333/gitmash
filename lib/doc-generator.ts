import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildTask } from "./build-planner.ts";
import type { MergeDecision, MergePlan } from "./merge-planner.ts";
import type { Project, RepoAnalysis } from "../types/project.ts";

export const REQUIRED_DOC_FILES = [
  "README.md",
  "PROJECT_SPEC.md",
  "ARCHITECTURE.md",
  "MERGE_PLAN.md",
  "DECISIONS.md",
  "TESTING.md",
  "DEVLOG.md",
  "AGENT_HANDOFF.md",
] as const;

export type RequiredDocFile = (typeof REQUIRED_DOC_FILES)[number];

export type DocGeneratorInput = {
  outputDir: string;
  project: Project;
  repoAnalyses: RepoAnalysis[];
  mergePlan: MergePlan;
  buildPlan: BuildTask[];
  generatedFiles?: string[];
  testsGenerated?: string[];
  buildErrors?: string[];
};

export async function generateDocs(input: DocGeneratorInput): Promise<string[]> {
  await mkdir(input.outputDir, { recursive: true });
  const docs = renderDocs(input);

  await Promise.all(
    Object.entries(docs).map(([fileName, contents]) =>
      writeFile(path.join(input.outputDir, fileName), contents),
    ),
  );

  return [...REQUIRED_DOC_FILES];
}

export function renderDocs(input: DocGeneratorInput): Record<RequiredDocFile, string> {
  return {
    "README.md": readme(input),
    "PROJECT_SPEC.md": projectSpec(input),
    "ARCHITECTURE.md": architecture(input),
    "MERGE_PLAN.md": mergePlanDoc(input),
    "DECISIONS.md": decisions(input),
    "TESTING.md": testing(input),
    "DEVLOG.md": devlog(input),
    "AGENT_HANDOFF.md": agentHandoff(input),
  };
}

function readme(input: DocGeneratorInput): string {
  return markdown([
    "# GitMash Final Project",
    "## Project Overview",
    input.project.brief,
    "## Setup Instructions",
    "Install dependencies with the package manager used by the final project, then copy any required environment variables from the source repositories into a new local environment file.",
    "## Scripts",
    scriptSummary(input),
    "## Environment Variables",
    "Review source repository documentation before adding secrets. No secret values are copied by GitMash.",
    "## How To Run Tests",
    "Run the test command documented in `TESTING.md` after installing dependencies.",
    "## How To Continue Development",
    "Start with `AGENT_HANDOFF.md`, then review `MERGE_PLAN.md` and `DECISIONS.md` before changing copied or adapted files.",
    "## Source Repos Used",
    repoList(input),
  ]);
}

function projectSpec(input: DocGeneratorInput): string {
  return markdown([
    "# Project Spec",
    "## Final Product Goal",
    input.project.brief,
    "## User's Original Intent",
    input.project.brief,
    "## Main Features",
    decisionsList(input.mergePlan.decisions.filter((decision) => decision.decision !== "discard")),
    "## Non-Goals",
    decisionsList(input.mergePlan.decisions.filter((decision) => decision.decision === "discard")),
    "## Future Roadmap",
    roadmap(input),
  ]);
}

function architecture(input: DocGeneratorInput): string {
  return markdown([
    "# Architecture",
    "## Final Stack",
    stackSummary(input),
    "## Folder Structure",
    folderSummary(input),
    "## Key Modules",
    keyModules(input),
    "## Data Flow",
    "Data flow follows the selected base repository architecture. Adapted modules were copied into the target paths from the approved merge plan.",
    "## API Design",
    apiSummary(input),
    "## Auth Approach",
    authSummary(input),
    "## Dependency Decisions",
    dependencySummary(input),
  ]);
}

function mergePlanDoc(input: DocGeneratorInput): string {
  return markdown([
    "# Merge Plan",
    "## Source Repo Summaries",
    repoSummary(input),
    "## Base Repo Decision",
    `Selected base repo: \`${input.mergePlan.selectedBaseRepo}\`.\n\n${input.mergePlan.baseRepoReason}`,
    "## Keep Decisions",
    decisionsList(byDecision(input.mergePlan.decisions, "keep")),
    "## Adapt Decisions",
    decisionsList(byDecision(input.mergePlan.decisions, "adapt")),
    "## Rewrite Decisions",
    decisionsList(byDecision(input.mergePlan.decisions, "rewrite")),
    "## Discard Decisions",
    decisionsList(byDecision(input.mergePlan.decisions, "discard")),
    "## Create-New Decisions",
    decisionsList(byDecision(input.mergePlan.decisions, "create_new")),
    "## Rationale",
    rationale(input),
  ]);
}

function decisions(input: DocGeneratorInput): string {
  const sections = [
    "# Decisions",
    "## Decision 001: Use Approved Base Repository",
    "## Decision",
    `Use \`${input.mergePlan.selectedBaseRepo}\` as the starting structure for the final project.`,
    "## Why",
    input.mergePlan.baseRepoReason,
    "## Alternatives Considered",
    repoList(input),
    "## Tradeoffs",
    "Starting from one base reduces integration churn, but copied and adapted modules still need validation in Phase 8.",
  ];

  for (const [index, decision] of input.mergePlan.decisions.entries()) {
    sections.push(
      `## Decision ${String(index + 2).padStart(3, "0")}: ${decision.featureName}`,
      "## Decision",
      `${decision.decision.replace("_", " ")} from \`${decision.sourceRepo}\` into ${formatPaths(decision.targetPaths)}.`,
      "## Why",
      decision.reason,
      "## Alternatives Considered",
      "Keep, adapt, rewrite, discard, or create new according to the approved merge-plan options.",
      "## Tradeoffs",
      `Confidence: ${Math.round(decision.confidence * 100)}%. Source files: ${formatPaths(decision.sourcePaths)}.`,
    );
  }

  return markdown(sections);
}

function testing(input: DocGeneratorInput): string {
  return markdown([
    "# Testing",
    "## Test Stack",
    testStack(input),
    "## How To Run Tests",
    "Install dependencies first, then run the test command supported by the final stack.",
    "## What Is Covered",
    list(input.testsGenerated ?? [], "Generated test scaffolds are listed after the build completes."),
    "## What Is Not Covered",
    "Phase 7 creates scaffolds only. Phase 8 validation and repair must run the actual project commands.",
    "## Mocking Strategy",
    "Generated tests should mock external services and avoid network calls by default.",
    "## Known Testing Gaps",
    gaps(input),
  ]);
}

function devlog(input: DocGeneratorInput): string {
  return markdown([
    "# Dev Log",
    "## Build Run",
    `Date: ${new Date().toISOString()}\nSource repos: ${input.project.sourceRepos.map((repo) => repo.slug).join(", ")}\nFinal project name: ${input.project.id}`,
    "## Step 1: Repo Analysis",
    repoSummary(input),
    "## Step 2: Architecture Decision",
    `Decision: Use \`${input.mergePlan.selectedBaseRepo}\` as base.\n\nReason: ${input.mergePlan.baseRepoReason}`,
    "## Step 3: Implementation",
    implementationSummary(input),
    "## Step 4: Testing",
    list(input.testsGenerated ?? [], "No test scaffolds were generated."),
    "## Step 5: Final Review",
    input.buildErrors?.length ? `Status: Build completed with recorded errors.\n\n${list(input.buildErrors)}` : "Status: Ready for Phase 8 validation.",
  ]);
}

function agentHandoff(input: DocGeneratorInput): string {
  return markdown([
    "# Agent Handoff",
    "## Current Status",
    input.buildErrors?.length
      ? "Phase 7 produced a final project workspace, but errors were recorded and must be resolved before validation."
      : "Phase 7 produced a final project workspace and documentation pack. Phase 8 validation has not run yet.",
    "## What Was Built",
    implementationSummary(input),
    "## What Was Preserved From Each Repo",
    preservedByRepo(input),
    "## What Was Rewritten",
    decisionsList(byDecision(input.mergePlan.decisions, "rewrite")),
    "## What Was Discarded",
    decisionsList(byDecision(input.mergePlan.decisions, "discard")),
    "## Known Issues",
    input.buildErrors?.length ? list(input.buildErrors) : "No Phase 7 build errors were recorded. Validation may still find runtime, type, lint, or test failures.",
    "## Next Recommended Tasks",
    nextTasks(input),
    "## Important Files",
    importantFiles(input),
    "## How To Safely Continue",
    "Do not run source repository scripts until you have inspected the generated project. Start by reading `MERGE_PLAN.md`, then run install, lint, typecheck, tests, and build in Phase 8. Keep new decisions in `DECISIONS.md` and append implementation notes to `DEVLOG.md`.",
  ]);
}

function scriptSummary(input: DocGeneratorInput): string {
  const base = input.repoAnalyses.find((analysis) => analysis.repoId === input.mergePlan.selectedBaseRepo);
  return base?.packageManager ? `Detected package manager: ${base.packageManager}.` : "No package manager was detected during analysis.";
}

function repoList(input: DocGeneratorInput): string {
  return list(input.project.sourceRepos.map((repo) => `\`${repo.id}\` ${repo.slug}`));
}

function stackSummary(input: DocGeneratorInput): string {
  return list(input.repoAnalyses.map((analysis) => `\`${analysis.repoId}\`: ${analysis.stack.primary} (${Math.round(analysis.stack.confidence * 100)}% confidence)`));
}

function folderSummary(input: DocGeneratorInput): string {
  const folders = new Set(
    (input.generatedFiles ?? [])
      .map((filePath) => filePath.split("/")[0])
      .filter((value) => value && value.includes(".") === false),
  );
  return list([...folders].sort(), "Folder structure will be finalized during Phase 8 validation.");
}

function keyModules(input: DocGeneratorInput): string {
  return list(input.mergePlan.decisions.flatMap((decision) => decision.targetPaths).slice(0, 20), "No key modules were identified.");
}

function apiSummary(input: DocGeneratorInput): string {
  const routes = input.repoAnalyses.flatMap((analysis) => analysis.routes.map((route) => `\`${analysis.repoId}\` ${route.type} ${route.method ?? ""} ${route.path} -> ${route.file}`));
  return list(routes, "No API routes were detected during analysis.");
}

function authSummary(input: DocGeneratorInput): string {
  const authDecisions = input.mergePlan.decisions.filter((decision) => /auth|login|session|user/i.test(decision.featureName));
  return decisionsList(authDecisions, "No explicit auth decision was identified in the merge plan.");
}

function dependencySummary(input: DocGeneratorInput): string {
  const dependencies = input.repoAnalyses.flatMap((analysis) =>
    analysis.dependencies.dependencies.map((dependency) => `\`${dependency.name}\` from ${analysis.repoId}/${dependency.source}`),
  );
  return list([...new Set(dependencies)].slice(0, 40), "No dependencies were detected.");
}

function repoSummary(input: DocGeneratorInput): string {
  return list(input.repoAnalyses.map((analysis) => `\`${analysis.repoId}\`: ${analysis.stack.primary}, ${analysis.packageManager}, ${analysis.components.length} components/services, ${analysis.routes.length} routes.`));
}

function decisionsList(decisions: MergeDecision[], fallback = "None."): string {
  return list(
    decisions.map((decision) => {
      const source = decision.sourcePaths.length ? ` Source: ${formatPaths(decision.sourcePaths)}.` : "";
      return `**${decision.featureName}**: ${decision.decision.replace("_", " ")} from \`${decision.sourceRepo}\` to ${formatPaths(decision.targetPaths)}. ${decision.reason}${source}`;
    }),
    fallback,
  );
}

function rationale(input: DocGeneratorInput): string {
  return list([
    ...input.mergePlan.conflicts.map((conflict) => `Conflict: ${conflict}`),
    ...input.mergePlan.risks.map((risk) => `Risk: ${risk}`),
  ], "No conflicts or risks were recorded in the approved merge plan.");
}

function roadmap(input: DocGeneratorInput): string {
  return list(input.mergePlan.buildMilestones.map((milestone) => `${milestone.title}: ${milestone.description}`), "Run validation, repair failures, complete code review, and package the final export.");
}

function testStack(input: DocGeneratorInput): string {
  const frameworks = input.repoAnalyses.flatMap((analysis) => analysis.testFrameworks);
  return list([...new Set(frameworks)], "No test framework was detected. GitMash generated Node-compatible test scaffolds when possible.");
}

function gaps(input: DocGeneratorInput): string {
  return list([
    ...input.mergePlan.risks,
    "Phase 7 does not execute lint, typecheck, unit tests, or production builds.",
  ]);
}

function implementationSummary(input: DocGeneratorInput): string {
  return list([
    `Created fresh output workspace at \`${input.outputDir}\`.`,
    `Copied and adapted files for ${input.mergePlan.decisions.filter((decision) => decision.decision !== "discard").length} merge decisions.`,
    `Generated documentation files: ${REQUIRED_DOC_FILES.join(", ")}.`,
    `Generated test scaffolds: ${(input.testsGenerated ?? []).join(", ") || "none"}.`,
  ]);
}

function preservedByRepo(input: DocGeneratorInput): string {
  const lines = input.project.sourceRepos.map((repo) => {
    const decisions = input.mergePlan.decisions.filter((decision) => decision.sourceRepo === repo.id && decision.decision !== "discard");
    return `\`${repo.id}\` ${repo.slug}: ${decisions.map((decision) => decision.featureName).join(", ") || "No preserved features."}`;
  });
  return list(lines);
}

function nextTasks(input: DocGeneratorInput): string {
  return list([
    "Run dependency installation in the final workspace.",
    "Run lint, typecheck, unit tests, and build commands.",
    "Repair any failures and document repairs in `DEVLOG.md`.",
    ...input.buildPlan.map((task) => `${task.title}: ${task.description}`),
  ]);
}

function importantFiles(input: DocGeneratorInput): string {
  return list([
    ...REQUIRED_DOC_FILES,
    ...(input.generatedFiles ?? []).filter((filePath) => !REQUIRED_DOC_FILES.includes(filePath as RequiredDocFile)).slice(0, 30),
  ]);
}

function byDecision(decisions: MergeDecision[], decision: MergeDecision["decision"]): MergeDecision[] {
  return decisions.filter((item) => item.decision === decision);
}

function formatPaths(paths: string[]): string {
  return paths.length ? paths.map((filePath) => `\`${filePath}\``).join(", ") : "no specific paths";
}

function list(items: string[], fallback = "None."): string {
  if (!items.length) {
    return fallback;
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function markdown(sections: string[]): string {
  return `${sections.map((section) => section.trim()).join("\n\n")}\n`;
}
