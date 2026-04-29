import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateDocs, REQUIRED_DOC_FILES, renderDocs } from "../lib/doc-generator.ts";
import type { BuildTask } from "../lib/build-planner.ts";
import type { MergePlan } from "../lib/merge-planner.ts";
import type { Project, RepoAnalysis } from "../types/project.ts";

describe("doc generator", () => {
  it("generates all required markdown docs with expected sections", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "gitmash-docs-"));
    const input = fixtureInput(outputDir);

    const docs = await generateDocs(input);

    assert.deepEqual(docs, [...REQUIRED_DOC_FILES]);
    for (const fileName of REQUIRED_DOC_FILES) {
      const contents = await readFile(path.join(outputDir, fileName), "utf8");
      assert.match(contents, /^# /);
    }

    const handoff = await readFile(path.join(outputDir, "AGENT_HANDOFF.md"), "utf8");
    assert.match(handoff, /## Current Status/);
    assert.match(handoff, /## What Was Built/);
    assert.match(handoff, /## What Was Preserved From Each Repo/);
    assert.match(handoff, /## How To Safely Continue/);

    const projectSpec = await readFile(path.join(outputDir, "PROJECT_SPEC.md"), "utf8");
    assert.match(projectSpec, /## Final Product Goal/);
    assert.match(projectSpec, /## Future Roadmap/);
  });

  it("renders merge plan and testing sections deterministically", () => {
    const docs = renderDocs(fixtureInput("/tmp/final-project"));

    assert.match(docs["MERGE_PLAN.md"], /## Base Repo Decision/);
    assert.match(docs["MERGE_PLAN.md"], /## Keep Decisions/);
    assert.match(docs["TESTING.md"], /## Mocking Strategy/);
    assert.match(docs["DECISIONS.md"], /## Decision 001: Use Approved Base Repository/);
  });
});

function fixtureInput(outputDir: string) {
  return {
    outputDir,
    project: project(),
    repoAnalyses: [analysis("repo-1"), analysis("repo-2")],
    mergePlan: mergePlan(),
    buildPlan: [buildTask()],
    generatedFiles: ["app/page.tsx", "lib/auth.ts"],
    testsGenerated: ["tests/gitmash-build.test.ts"],
    buildErrors: [],
  };
}

function project(): Project {
  return {
    id: "proj-test-docs",
    brief: "Create one clean dashboard.",
    status: "cloned",
    sourceRepos: [
      sourceRepo("repo-1", "owner/auth"),
      sourceRepo("repo-2", "owner/ui"),
    ],
    workspacePath: "/tmp/workspace",
    analysisPath: "/tmp/analysis",
    outputPath: "/tmp/output",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
  };
}

function sourceRepo(id: string, slug: string) {
  return {
    id,
    url: `https://github.com/${slug}`,
    owner: slug.split("/")[0] ?? "owner",
    name: slug.split("/")[1] ?? "repo",
    slug,
    description: null,
    topics: [],
    branch: "main",
    commitSha: "abc123",
    sizeBytes: 1,
    primaryLanguage: "TypeScript",
    cloneError: null,
    cloneStatus: "cloned" as const,
  };
}

function mergePlan(): MergePlan {
  return {
    projectId: "proj-test-docs",
    selectedBaseRepo: "repo-2",
    baseRepoReason: "Repo 2 has the cleanest UI.",
    decisions: [
      {
        featureName: "Dashboard",
        decision: "keep",
        sourceRepo: "repo-2",
        sourcePaths: ["app/page.tsx"],
        targetPaths: ["app/page.tsx"],
        reason: "Strong UI.",
        confidence: 0.9,
      },
      {
        featureName: "Auth",
        decision: "adapt",
        sourceRepo: "repo-1",
        sourcePaths: ["lib/auth.ts"],
        targetPaths: ["lib/auth.ts"],
        reason: "Best login flow.",
        confidence: 0.8,
      },
    ],
    conflicts: ["Auth providers differ."],
    risks: ["Needs validation."],
    buildMilestones: [{ title: "Validate", description: "Run tests.", dependsOn: [] }],
  };
}

function buildTask(): BuildTask {
  return {
    id: "scaffold",
    title: "Scaffold final workspace",
    description: "Create output.",
    status: "completed",
    dependsOn: [],
    relatedFiles: [],
    testRequirements: [],
  };
}

function analysis(repoId: string): RepoAnalysis {
  return {
    repoId,
    repoPath: `/tmp/${repoId}`,
    generatedAt: "2026-04-29T00:00:00.000Z",
    stack: { primary: "Next.js", secondary: ["React"], confidence: 0.9 },
    packageManager: "npm",
    testFrameworks: ["node:test"],
    fileTree: { name: repoId, type: "dir", path: "." },
    dependencies: {
      dependencies: [{ name: "react", version: "^19.0.0", category: "ui", source: "package.json" }],
      riskyPackages: [],
      countsByCategory: { ui: 1 },
    },
    routes: [{ path: "/", type: "page", file: "app/page.tsx" }],
    components: [{ name: "Dashboard", type: "component", path: "app/page.tsx" }],
    risks: { risks: [], metrics: { testFileCount: 1, jsFileCount: 0, tsFileCount: 1, largeFileCount: 0 } },
    artifacts: {},
  };
}
