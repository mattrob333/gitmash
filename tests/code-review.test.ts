import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runHeuristicCodeReview } from "../lib/code-review.ts";
import { REQUIRED_DOC_FILES } from "../lib/doc-generator.ts";
import type { MergePlan } from "../lib/merge-planner.ts";

describe("code review", () => {
  it("approves a clean project with docs, valid package json, imports, and tests", async () => {
    const root = await tempDir();
    await writeDocs(root);
    await write(root, "package.json", JSON.stringify({
      name: "fixture",
      scripts: { test: "node --test" },
      dependencies: { react: "^19.0.0" },
    }));
    await write(root, "src/util.ts", "export const value = 1;\n");
    await write(root, "src/index.ts", "import { value } from './util';\nexport { value };\n");
    await write(root, "tests/index.test.ts", "import '../src/index';\n");

    const report = await runHeuristicCodeReview({
      projectDir: root,
      mergePlan: mergePlan(["src/index.ts"]),
      buildResult: cleanBuild(root),
    });

    assert.equal(report.overallVerdict, "approved");
    assert.equal(report.findings.some((finding) => finding.severity === "error"), false);
  });

  it("flags missing docs, leaked env files, invalid imports, and thin tests", async () => {
    const root = await tempDir();
    await write(root, "package.json", JSON.stringify({ scripts: { test: 123 } }));
    await write(root, ".env", "SECRET=leaked\n");
    await write(root, "src/index.ts", "import './missing';\n");
    await write(root, "src/a.ts", "export const a = 1;\n");
    await write(root, "src/b.ts", "export const b = 1;\n");

    const report = await runHeuristicCodeReview({
      projectDir: root,
      mergePlan: mergePlan(["src/index.ts", "src/expected.ts"]),
      buildResult: {
        ...cleanBuild(root),
        success: false,
        errors: ["build failed"],
        validation: {
          success: false,
          commands: [],
          failures: [{
            command: "build",
            runCommand: "npm run build",
            stdout: "",
            stderr: "boom",
            exitCode: 1,
            success: false,
          }],
        },
      },
    });

    assert.equal(report.overallVerdict, "failed");
    assert.ok(report.findings.some((finding) => finding.category === "documentation" && finding.severity === "error"));
    assert.ok(report.findings.some((finding) => finding.category === "security" && finding.file === ".env"));
    assert.ok(report.findings.some((finding) => finding.message.includes("./missing")));
    assert.ok(report.findings.some((finding) => finding.category === "test_quality" && finding.severity === "warning"));
    assert.ok(report.findings.some((finding) => finding.file === "src/expected.ts"));
  });
});

async function writeDocs(root: string): Promise<void> {
  await Promise.all(REQUIRED_DOC_FILES.map((doc) => write(root, doc, `# ${doc}\n`)));
}

function mergePlan(targetPaths: string[]): MergePlan {
  return {
    projectId: "proj-review-test",
    selectedBaseRepo: "repo-1",
    baseRepoReason: "Fixture",
    decisions: [{
      featureName: "Core",
      decision: "keep",
      sourceRepo: "repo-1",
      sourcePaths: targetPaths,
      targetPaths,
      reason: "Keep core.",
      confidence: 0.9,
    }],
    conflicts: [],
    risks: [],
    buildMilestones: [],
  };
}

function cleanBuild(root: string) {
  return {
    success: true,
    outputDir: root,
    generatedFiles: [],
    docsGenerated: [...REQUIRED_DOC_FILES],
    testsGenerated: ["tests/index.test.ts"],
    errors: [],
    validationCommands: [],
    validation: { success: true, commands: [], failures: [] },
    repair: null,
  };
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "gitmash-review-"));
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
