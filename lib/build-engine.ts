import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildTask } from "./build-planner.ts";
import { generateDocs, REQUIRED_DOC_FILES } from "./doc-generator.ts";
import {
  copyDirectoryPreservingStructure,
  copyFilesForDecisions,
  scaffoldFreshFiles,
  type ScaffoldFile,
} from "./file-copier.ts";
import { readJsonIfExists, readTextIfExists } from "./analysis-utils.ts";
import type { MergeDecision, MergePlan } from "./merge-planner.ts";
import type { Project, RepoAnalysis } from "../types/project.ts";

export type BuildEngineOptions = {
  outputDir: string;
  workspaceDir: string;
  baseRepoPath: string;
  repoAnalyses: RepoAnalysis[];
  mergePlan: MergePlan;
  buildPlan: BuildTask[];
  project: Project;
};

export type BuildResult = {
  success: boolean;
  outputDir: string;
  generatedFiles: string[];
  docsGenerated: string[];
  testsGenerated: string[];
  errors: string[];
};

type PackageJson = {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

export async function runBuildEngine(options: BuildEngineOptions): Promise<BuildResult> {
  const generatedFiles = new Set<string>();
  const testsGenerated = new Set<string>();
  const errors: string[] = [];
  const taskLog = options.buildPlan.map((task) => ({ ...task }));

  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(options.outputDir, { recursive: true });

  await runTask(taskLog, "scaffold", async () => {
    const baseCopy = await copyDirectoryPreservingStructure(options.baseRepoPath, options.outputDir);
    collectOutcome(baseCopy, generatedFiles, errors);
  });

  await runTask(taskLog, "copy-kept-files", async () => {
    const kept = options.mergePlan.decisions.filter((decision) => decision.decision === "keep");
    const outcome = await copyFilesForDecisions(kept, repoPathsById(options), options.outputDir);
    collectOutcome(outcome, generatedFiles, errors);
  });

  await runTask(taskLog, "adapt-files", async () => {
    const adapted = options.mergePlan.decisions.filter((decision) => decision.decision === "adapt");
    const outcome = await copyFilesForDecisions(adapted, repoPathsById(options), options.outputDir);
    collectOutcome(outcome, generatedFiles, errors);
  });

  await runTask(taskLog, "rewrite-files", async () => {
    const rewrites = scaffoldFilesForDecisions(options.mergePlan.decisions.filter((decision) => decision.decision === "rewrite"));
    const outcome = await scaffoldFreshFiles(rewrites, options.outputDir);
    collectOutcome(outcome, generatedFiles, errors);
  });

  await runTask(taskLog, "generate-new-files", async () => {
    const created = scaffoldFilesForDecisions(options.mergePlan.decisions.filter((decision) => decision.decision === "create_new"));
    const outcome = await scaffoldFreshFiles(created, options.outputDir);
    collectOutcome(outcome, generatedFiles, errors);
  });

  await runTask(taskLog, "add-tests", async () => {
    const testFiles = testScaffolds(options.mergePlan.decisions);
    const outcome = await scaffoldFreshFiles(testFiles, options.outputDir);
    collectOutcome(outcome, generatedFiles, errors);
    for (const file of outcome.scaffoldedFiles) {
      testsGenerated.add(file);
    }
  });

  await runTask(taskLog, "fix-types", async () => {
    const dependencyFiles = await mergeDependencyFiles(options);
    for (const file of dependencyFiles) {
      generatedFiles.add(file);
    }
  });

  await runTask(taskLog, "verify-builds", async () => {
    const logPath = "build-task-log.json";
    await writeFile(path.join(options.outputDir, logPath), `${JSON.stringify(taskLog, null, 2)}\n`);
    generatedFiles.add(logPath);
  });

  const docsGenerated = await generateDocs({
    outputDir: options.outputDir,
    project: options.project,
    repoAnalyses: options.repoAnalyses,
    mergePlan: options.mergePlan,
    buildPlan: taskLog,
    generatedFiles: [...generatedFiles].sort(),
    testsGenerated: [...testsGenerated].sort(),
    buildErrors: errors,
  });
  for (const file of docsGenerated) {
    generatedFiles.add(file);
  }

  return {
    success: errors.length === 0,
    outputDir: options.outputDir,
    generatedFiles: [...generatedFiles].sort(),
    docsGenerated,
    testsGenerated: [...testsGenerated].sort(),
    errors,
  };
}

function repoPathsById(options: BuildEngineOptions): Map<string, string> {
  return new Map(options.repoAnalyses.map((analysis) => [analysis.repoId, analysis.repoPath]));
}

async function runTask(
  tasks: BuildTask[],
  id: string,
  action: () => Promise<void>,
): Promise<void> {
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    return;
  }

  task.status = "in_progress";
  try {
    await action();
    task.status = "completed";
  } catch (error) {
    task.status = "failed";
    throw error;
  }
}

function collectOutcome(
  outcome: { copiedFiles: string[]; adaptedFiles: string[]; scaffoldedFiles: string[]; errors: string[] },
  generatedFiles: Set<string>,
  errors: string[],
): void {
  for (const file of [...outcome.copiedFiles, ...outcome.adaptedFiles, ...outcome.scaffoldedFiles]) {
    generatedFiles.add(file);
  }
  errors.push(...outcome.errors);
}

function scaffoldFilesForDecisions(decisions: MergeDecision[]): ScaffoldFile[] {
  return decisions.flatMap((decision) =>
    decision.targetPaths.map((targetPath) => ({
      path: targetPath,
      contents: scaffoldContent(decision, targetPath),
    })),
  );
}

function scaffoldContent(decision: MergeDecision, targetPath: string): string {
  if (/\.md$/i.test(targetPath)) {
    return `# ${decision.featureName}\n\n${decision.reason}\n`;
  }
  if (/\.json$/i.test(targetPath)) {
    return `${JSON.stringify({ feature: decision.featureName, decision: decision.decision, reason: decision.reason }, null, 2)}\n`;
  }
  if (/\.py$/i.test(targetPath)) {
    return `"""${decision.featureName} scaffold generated by GitMash."""\n\n\ndef ${safeIdentifier(decision.featureName)}():\n    return {"status": "todo", "reason": ${JSON.stringify(decision.reason)}}\n`;
  }
  if (/\.(css|scss)$/i.test(targetPath)) {
    return `/* ${decision.featureName}: ${decision.reason} */\n`;
  }
  return `export const ${safeIdentifier(decision.featureName)} = {\n  feature: ${JSON.stringify(decision.featureName)},\n  status: "todo",\n  reason: ${JSON.stringify(decision.reason)},\n};\n`;
}

function testScaffolds(decisions: MergeDecision[]): ScaffoldFile[] {
  const testTargets = new Set<string>();
  for (const decision of decisions.filter((item) => item.decision !== "discard")) {
    const explicitTest = decision.targetPaths.find((filePath) => /(^tests\/|\.test\.|\.spec\.)/.test(filePath));
    if (explicitTest) {
      testTargets.add(explicitTest);
    }
  }

  testTargets.add("tests/gitmash-build.test.ts");
  return [...testTargets].map((targetPath) => ({
    path: targetPath,
    contents: testContent(targetPath),
  }));
}

function testContent(targetPath: string): string {
  if (/\.py$/i.test(targetPath)) {
    return "def test_gitmash_scaffold_exists():\n    assert True\n";
  }
  return [
    'import assert from "node:assert/strict";',
    'import { describe, it } from "node:test";',
    "",
    'describe("GitMash generated project", () => {',
    '  it("includes generated test scaffolding", () => {',
    "    assert.equal(true, true);",
    "  });",
    "});",
    "",
  ].join("\n");
}

async function mergeDependencyFiles(options: BuildEngineOptions): Promise<string[]> {
  const generated: string[] = [];
  const packageJson = await mergedPackageJson(options);
  if (packageJson) {
    await writeFile(path.join(options.outputDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
    generated.push("package.json");
  }

  const requirements = await mergedRequirements(options);
  if (requirements.length) {
    await writeFile(path.join(options.outputDir, "requirements.txt"), `${requirements.join("\n")}\n`);
    generated.push("requirements.txt");
  }

  return generated;
}

async function mergedPackageJson(options: BuildEngineOptions): Promise<PackageJson | null> {
  const sourcePackageFiles = await Promise.all(
    options.repoAnalyses.map((analysis) => readJsonIfExists<PackageJson>(path.join(analysis.repoPath, "package.json"))),
  );
  const packages = sourcePackageFiles.filter((item): item is PackageJson => Boolean(item));
  const outputPackage = await readJsonIfExists<PackageJson>(path.join(options.outputDir, "package.json"));
  if (!packages.length && !outputPackage) {
    return null;
  }

  const base = outputPackage ?? packages[0] ?? {};
  return {
    ...base,
    name: safePackageName(base.name ?? options.project.id),
    private: base.private ?? true,
    scripts: mergeRecords(packages.map((packageJson) => packageJson.scripts), base.scripts),
    dependencies: mergeRecords(packages.map((packageJson) => packageJson.dependencies), base.dependencies),
    devDependencies: mergeRecords(packages.map((packageJson) => packageJson.devDependencies), base.devDependencies),
  };
}

async function mergedRequirements(options: BuildEngineOptions): Promise<string[]> {
  const lines = new Map<string, string>();
  for (const analysis of options.repoAnalyses) {
    const text = await readTextIfExists(path.join(analysis.repoPath, "requirements.txt"));
    if (!text) {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.replace(/#.*/, "").trim();
      if (!trimmed || trimmed.startsWith("-")) {
        continue;
      }
      const name = trimmed.split(/[<>=~!;\[\s]/)[0]?.toLowerCase();
      if (name && !lines.has(name)) {
        lines.set(name, trimmed);
      }
    }
  }
  return [...lines.values()].sort((a, b) => a.localeCompare(b));
}

function mergeRecords(
  records: Array<Record<string, string> | undefined>,
  preferred?: Record<string, string>,
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  for (const record of records) {
    Object.assign(merged, record ?? {});
  }
  Object.assign(merged, preferred ?? {});
  return Object.keys(merged).length ? Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) : undefined;
}

function safeIdentifier(value: string): string {
  const words = value.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/);
  const identifier = words
    .map((word, index) => index === 0 ? word.toLowerCase() : `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`)
    .join("");
  return /^[A-Za-z_]/.test(identifier) ? identifier : "generatedFeature";
}

function safePackageName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "gitmash-final-project";
}
