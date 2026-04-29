import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateKnownIssuesMarkdown, writeKnownIssuesFileIfNeeded } from "../lib/known-issues.ts";

describe("known issues", () => {
  it("returns null and removes stale file when no issues exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gitmash-known-clean-"));
    await writeFile(path.join(root, "KNOWN_ISSUES.md"), "# stale\n");

    const outputPath = await writeKnownIssuesFileIfNeeded(root, {
      buildResult: cleanBuild(root),
      reviewReport: {
        findings: [{ id: "info", category: "documentation", severity: "info", message: "ok" }],
        overallVerdict: "approved",
        summary: "ok",
        reviewedAt: "2026-04-29T00:00:00.000Z",
      },
    });

    assert.equal(outputPath, null);
    await assert.rejects(readFile(path.join(root, "KNOWN_ISSUES.md"), "utf8"));
    assert.equal(generateKnownIssuesMarkdown({ buildResult: cleanBuild(root) }), null);
  });

  it("documents build errors, validation failures, review findings, and manual steps", () => {
    const markdown = generateKnownIssuesMarkdown({
      buildResult: {
        ...cleanBuild("/tmp/final-project"),
        success: false,
        errors: ["copy failed"],
        validation: {
          success: false,
          commands: [],
          failures: [{
            command: "test",
            runCommand: "npm test",
            stdout: "1 failed",
            stderr: "",
            exitCode: 1,
            success: false,
          }],
        },
      },
      reviewReport: {
        findings: [{ id: "sec", category: "security", severity: "warning", message: "Review secrets", file: "src/config.ts" }],
        overallVerdict: "needs_changes",
        summary: "needs work",
        reviewedAt: "2026-04-29T00:00:00.000Z",
      },
      manualSteps: ["Provision production secrets."],
    });

    assert.ok(markdown);
    assert.match(markdown, /copy failed/);
    assert.match(markdown, /npm test/);
    assert.match(markdown, /Review secrets/);
    assert.match(markdown, /Provision production secrets/);
  });
});

function cleanBuild(root: string) {
  return {
    success: true,
    outputDir: root,
    generatedFiles: [],
    docsGenerated: [],
    testsGenerated: [],
    errors: [],
    validationCommands: [],
    validation: { success: true, commands: [], failures: [] },
    repair: null,
  };
}
