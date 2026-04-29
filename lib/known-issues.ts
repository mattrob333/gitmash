import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildResult } from "./build-engine.ts";
import type { ValidationCommandResult } from "./command-runner.ts";
import type { ReviewReport } from "./code-review.ts";

export type KnownIssuesInput = {
  buildResult?: BuildResult | null;
  reviewReport?: ReviewReport | null;
  manualSteps?: string[];
};

export function generateKnownIssuesMarkdown(input: KnownIssuesInput): string | null {
  const buildErrors = input.buildResult?.errors ?? [];
  const validationFailures = input.buildResult?.validation?.failures ?? [];
  const reviewFindings = (input.reviewReport?.findings ?? []).filter((finding) => finding.severity !== "info");
  const manualSteps = input.manualSteps ?? [];

  if (!buildErrors.length && !validationFailures.length && !reviewFindings.length && !manualSteps.length) {
    return null;
  }

  return [
    "# Known Issues",
    "## Build Errors",
    list(buildErrors),
    "## Validation Failures",
    validationList(validationFailures),
    "## Code Review Findings Not Auto-Fixed",
    reviewFindings.length
      ? reviewFindings.map((finding) => `- ${finding.severity.toUpperCase()}: ${finding.message}${finding.file ? ` (${finding.file})` : ""}`).join("\n")
      : "None.",
    "## Manual Steps Before Production Use",
    manualSteps.length
      ? manualSteps.map((step) => `- ${step}`).join("\n")
      : "- Review environment variables and add production secrets outside the repository.\n- Run install, lint, typecheck, tests, and build in the deployment environment.\n- Replace generated scaffolds or placeholder logic before exposing the app to users.",
    "",
  ].join("\n\n");
}

export async function writeKnownIssuesFileIfNeeded(projectDir: string, input: KnownIssuesInput): Promise<string | null> {
  const markdown = generateKnownIssuesMarkdown(input);
  const filePath = path.join(projectDir, "KNOWN_ISSUES.md");
  if (!markdown) {
    await rm(filePath, { force: true });
    return null;
  }
  await writeFile(filePath, markdown);
  return filePath;
}

function validationList(failures: ValidationCommandResult[]): string {
  if (!failures.length) {
    return "None.";
  }
  return failures.map((failure) => [
    `- ${failure.command}: \`${failure.runCommand}\` exited with code ${failure.exitCode}.`,
    firstOutputLine(failure) ? `  First output: ${firstOutputLine(failure)}` : "",
    failure.outputPath ? `  Saved output: ${failure.outputPath}` : "",
  ].filter(Boolean).join("\n")).join("\n");
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "None.";
}

function firstOutputLine(failure: ValidationCommandResult): string {
  return `${failure.stdout}\n${failure.stderr}`.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 240) ?? "";
}
