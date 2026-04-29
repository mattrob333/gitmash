import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { builtinModules } from "node:module";
import { pathExists, readJsonIfExists } from "./analysis-utils.ts";
import { REQUIRED_DOC_FILES } from "./doc-generator.ts";
import type { AIProvider } from "./ai-provider.ts";
import type { BuildResult } from "./build-engine.ts";
import type { MergePlan } from "./merge-planner.ts";

export type ReviewCategory = "architecture" | "code_quality" | "test_quality" | "documentation" | "security" | "build_output";
export type ReviewSeverity = "info" | "warning" | "error";

export type ReviewFinding = {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  message: string;
  file?: string;
};

export type ReviewReport = {
  findings: ReviewFinding[];
  overallVerdict: "approved" | "needs_changes" | "failed";
  summary: string;
  reviewedAt: string;
};

export type CodeReviewInput = {
  projectDir: string;
  mergePlan?: MergePlan | null;
  buildResult?: BuildResult | null;
  aiProvider?: AIProvider;
};

type PackageJson = {
  name?: unknown;
  version?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  [key: string]: unknown;
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".json", ".md", ".env", ".txt", ".yml", ".yaml"]);
const SKIPPED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", ".venv"]);
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((item) => `node:${item}`)]);

export async function reviewGeneratedProject(input: CodeReviewInput): Promise<ReviewReport> {
  const heuristicReport = await runHeuristicCodeReview(input);
  if (!input.aiProvider) {
    return heuristicReport;
  }

  const aiReport = await input.aiProvider.generateJson<ReviewReport>({
    systemPrompt: [
      "You are GitMash's final code review agent.",
      "Return only JSON matching this shape:",
      "{ findings: [{ id, category, severity, message, file? }], overallVerdict, summary, reviewedAt }.",
      "Categories: architecture, code_quality, test_quality, documentation, security, build_output.",
      "Severities: info, warning, error. Verdicts: approved, needs_changes, failed.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      projectDir: input.projectDir,
      mergePlan: input.mergePlan ?? null,
      buildResult: summarizeBuild(input.buildResult ?? null),
      heuristicReport,
    }, null, 2),
  });

  return normalizeReviewReport(aiReport, heuristicReport.reviewedAt);
}

export async function runHeuristicCodeReview(input: Omit<CodeReviewInput, "aiProvider">): Promise<ReviewReport> {
  const findings: ReviewFinding[] = [];
  const files = await collectProjectFiles(input.projectDir);

  findings.push(...await checkRequiredDocs(input.projectDir));
  findings.push(...await checkPackageJson(input.projectDir));
  findings.push(...checkEnvLeak(files));
  findings.push(...await checkImports(input.projectDir, files));
  findings.push(...checkTestRatio(files));
  findings.push(...checkMergePlanAlignment(files, input.mergePlan ?? null));
  findings.push(...checkBuildOutput(input.buildResult ?? null));

  const overallVerdict = verdictFor(findings);
  return {
    findings,
    overallVerdict,
    summary: summaryFor(findings, overallVerdict),
    reviewedAt: new Date().toISOString(),
  };
}

export function renderReviewMarkdown(report: ReviewReport): string {
  const bySeverity = (severity: ReviewSeverity) => report.findings.filter((finding) => finding.severity === severity);
  return [
    "# Code Review",
    "## Review Stage",
    "Final Review",
    "## Summary",
    report.summary,
    "## Issues Found",
    "### Critical",
    list(bySeverity("error")),
    "### High",
    "No separate high-severity findings were produced by the MVP reviewer.",
    "### Medium",
    list(bySeverity("warning")),
    "### Low",
    list(bySeverity("info")),
    "## Required Fixes",
    list(report.findings.filter((finding) => finding.severity === "error")),
    "## Recommended Improvements",
    list(report.findings.filter((finding) => finding.severity === "warning")),
    "## Approved for Export",
    report.overallVerdict === "approved" ? "Yes" : "No",
    "",
  ].join("\n\n");
}

export async function writeReviewReport(projectDir: string, report: ReviewReport): Promise<string> {
  await mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, "CODE_REVIEW.md");
  await writeFile(filePath, renderReviewMarkdown(report));
  return filePath;
}

async function checkRequiredDocs(projectDir: string): Promise<ReviewFinding[]> {
  const findings: ReviewFinding[] = [];
  for (const doc of REQUIRED_DOC_FILES) {
    if (!await pathExists(path.join(projectDir, doc))) {
      findings.push(finding("documentation", "error", `Required documentation file ${doc} is missing.`, doc));
    }
  }
  if (!findings.length) {
    findings.push(finding("documentation", "info", "All 8 required documentation files are present."));
  }
  return findings;
}

async function checkPackageJson(projectDir: string): Promise<ReviewFinding[]> {
  const packageJson = await readJsonIfExists<PackageJson>(path.join(projectDir, "package.json"));
  if (!packageJson) {
    return [finding("code_quality", "warning", "package.json is missing or is not valid JSON.", "package.json")];
  }

  const findings: ReviewFinding[] = [];
  if (packageJson.name !== undefined && typeof packageJson.name !== "string") {
    findings.push(finding("code_quality", "error", "package.json name must be a string.", "package.json"));
  }
  if (packageJson.scripts !== undefined && !isStringRecord(packageJson.scripts)) {
    findings.push(finding("code_quality", "error", "package.json scripts must be an object of string commands.", "package.json"));
  }
  if (packageJson.dependencies !== undefined && !isStringRecord(packageJson.dependencies)) {
    findings.push(finding("code_quality", "error", "package.json dependencies must be an object of string versions.", "package.json"));
  }
  if (packageJson.devDependencies !== undefined && !isStringRecord(packageJson.devDependencies)) {
    findings.push(finding("code_quality", "error", "package.json devDependencies must be an object of string versions.", "package.json"));
  }
  if (!findings.length) {
    findings.push(finding("code_quality", "info", "package.json has a valid top-level structure.", "package.json"));
  }
  return findings;
}

function checkEnvLeak(files: string[]): ReviewFinding[] {
  return files
    .filter((file) => /(^|\/)\.env(\.|$)/.test(file))
    .map((file) => finding("security", "error", "Environment file leaked into final output and should be removed.", file));
}

async function checkImports(projectDir: string, files: string[]): Promise<ReviewFinding[]> {
  const findings: ReviewFinding[] = [];
  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)));
  for (const file of sourceFiles) {
    const text = await readFile(path.join(projectDir, file), "utf8").catch(() => "");
    for (const specifier of importSpecifiers(text)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
        continue;
      }
      if (!await resolvesImport(projectDir, file, specifier)) {
        findings.push(finding("architecture", "error", `Import path ${specifier} does not resolve within the final project.`, file));
      }
    }
  }
  if (!findings.length && sourceFiles.length) {
    findings.push(finding("architecture", "info", "Relative and @/ import paths resolve within the final project."));
  }
  return findings;
}

function checkTestRatio(files: string[]): ReviewFinding[] {
  const sourceFiles = files.filter((file) => isSourceFile(file) && !isTestFile(file));
  const testFiles = files.filter(isTestFile);
  if (!sourceFiles.length) {
    return [finding("test_quality", "info", "No source files were found for test coverage ratio analysis.")];
  }
  if (!testFiles.length) {
    return [finding("test_quality", sourceFiles.length >= 3 ? "warning" : "info", `No test files were found for ${sourceFiles.length} source file(s).`)];
  }
  const ratio = sourceFiles.length / testFiles.length;
  if (ratio > 5) {
    return [finding("test_quality", "warning", `Test coverage may be thin: ${sourceFiles.length} source file(s) for ${testFiles.length} test file(s).`)];
  }
  return [finding("test_quality", "info", `Detected ${testFiles.length} test file(s) for ${sourceFiles.length} source file(s).`)];
}

function checkMergePlanAlignment(files: string[], mergePlan: MergePlan | null): ReviewFinding[] {
  if (!mergePlan) {
    return [finding("architecture", "info", "No merge plan was supplied for architecture alignment checks.")];
  }

  const fileSet = new Set(files);
  return mergePlan.decisions
    .filter((decision) => decision.decision !== "discard")
    .flatMap((decision) => decision.targetPaths.map((targetPath) => ({ decision, targetPath })))
    .filter(({ targetPath }) => targetPath && !fileSet.has(targetPath))
    .map(({ decision, targetPath }) =>
      finding("architecture", "warning", `Merge-plan target for ${decision.featureName} was not found in final output.`, targetPath),
    );
}

function checkBuildOutput(buildResult: BuildResult | null): ReviewFinding[] {
  if (!buildResult) {
    return [finding("build_output", "info", "No build result was supplied for validation review.")];
  }
  const findings: ReviewFinding[] = [];
  for (const error of buildResult.errors) {
    findings.push(finding("build_output", "error", error));
  }
  for (const failure of buildResult.validation?.failures ?? []) {
    findings.push(finding("build_output", "error", `${failure.command} validation failed: ${failure.runCommand}`));
  }
  if (!findings.length) {
    findings.push(finding("build_output", "info", buildResult.validation?.success === false ? "Validation failed without detailed failures." : "Build validation passed or no validation failures were reported."));
  }
  return findings;
}

async function collectProjectFiles(projectDir: string, dir = projectDir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    const relativePath = path.relative(projectDir, entryPath).split(path.sep).join("/");
    if (entry.isDirectory()) {
      files.push(...await collectProjectFiles(projectDir, entryPath));
    } else if (await isReadableReviewFile(entryPath)) {
      files.push(relativePath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function isReadableReviewFile(filePath: string): Promise<boolean> {
  const extension = path.extname(filePath);
  const basename = path.basename(filePath);
  if (!TEXT_EXTENSIONS.has(extension) && basename !== "package.json" && !basename.startsWith(".env")) {
    return false;
  }
  const stats = await stat(filePath).catch(() => null);
  return Boolean(stats && stats.size <= 1024 * 1024);
}

function importSpecifiers(text: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /export\s+[^'"]+\s+from\s+["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier && !BUILTINS.has(specifier)) {
        specifiers.add(specifier);
      }
    }
  }
  return [...specifiers];
}

async function resolvesImport(projectDir: string, fromFile: string, specifier: string): Promise<boolean> {
  const base = specifier.startsWith("@/")
    ? path.join(projectDir, specifier.slice(2))
    : path.resolve(path.join(projectDir, path.dirname(fromFile)), specifier);
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"].map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"].map((file) => path.join(base, file)),
  ];
  for (const candidate of candidates) {
    if (candidate.startsWith(projectDir) && await pathExists(candidate)) {
      return true;
    }
  }
  return false;
}

function normalizeReviewReport(report: ReviewReport, fallbackReviewedAt: string): ReviewReport {
  const findings = Array.isArray(report.findings) ? report.findings.filter(isFinding) : [];
  const overallVerdict = ["approved", "needs_changes", "failed"].includes(report.overallVerdict)
    ? report.overallVerdict
    : verdictFor(findings);
  return {
    findings,
    overallVerdict,
    summary: typeof report.summary === "string" && report.summary.trim() ? report.summary : summaryFor(findings, overallVerdict),
    reviewedAt: typeof report.reviewedAt === "string" ? report.reviewedAt : fallbackReviewedAt,
  };
}

function isFinding(value: unknown): value is ReviewFinding {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ReviewFinding>;
  return typeof candidate.id === "string"
    && ["architecture", "code_quality", "test_quality", "documentation", "security", "build_output"].includes(candidate.category ?? "")
    && ["info", "warning", "error"].includes(candidate.severity ?? "")
    && typeof candidate.message === "string"
    && (candidate.file === undefined || typeof candidate.file === "string");
}

function verdictFor(findings: ReviewFinding[]): ReviewReport["overallVerdict"] {
  if (findings.some((finding) => finding.severity === "error")) {
    return "failed";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "needs_changes";
  }
  return "approved";
}

function summaryFor(findings: ReviewFinding[], verdict: ReviewReport["overallVerdict"]): string {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  if (verdict === "approved") {
    return "Final heuristic review approved the project for export.";
  }
  return `Final review found ${errors} error finding(s) and ${warnings} warning finding(s).`;
}

function finding(category: ReviewCategory, severity: ReviewSeverity, message: string, file?: string): ReviewFinding {
  return {
    id: `${category}-${severity}-${stableId(`${message}:${file ?? ""}`)}`,
    category,
    severity,
    message,
    ...(file ? { file } : {}),
  };
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && Object.values(value as Record<string, unknown>).every((item) => typeof item === "string");
}

function isSourceFile(file: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(file)) && !/(^|\/)(next-env\.d\.ts|.*\.config\.[cm]?[jt]s)$/.test(file);
}

function isTestFile(file: string): boolean {
  return /(^|\/)(__tests__|tests?)\/|(\.test|\.spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$|(^|\/)test_.*\.py$/.test(file);
}

function list(findings: ReviewFinding[]): string {
  if (!findings.length) {
    return "None.";
  }
  return findings.map((finding) => `- [${finding.category}] ${finding.message}${finding.file ? ` (${finding.file})` : ""}`).join("\n");
}

function summarizeBuild(buildResult: BuildResult | null): unknown {
  if (!buildResult) {
    return null;
  }
  return {
    success: buildResult.success,
    generatedFiles: buildResult.generatedFiles.length,
    docsGenerated: buildResult.docsGenerated,
    testsGenerated: buildResult.testsGenerated,
    errors: buildResult.errors,
    validation: buildResult.validation
      ? {
          success: buildResult.validation.success,
          commands: buildResult.validation.commands.map((command) => ({
            command: command.command,
            success: command.success,
            runCommand: command.runCommand,
          })),
        }
      : null,
  };
}
