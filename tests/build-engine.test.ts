import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createBuildTasks } from "../lib/build-planner.ts";
import { runBuildEngine } from "../lib/build-engine.ts";
import type { MergePlan } from "../lib/merge-planner.ts";
import type { Project, RepoAnalysis } from "../types/project.ts";

describe("build engine", () => {
  it("creates a fresh final project, applies decisions, merges dependencies, and generates docs/tests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gitmash-build-"));
    const repo1 = path.join(root, "repo-1");
    const repo2 = path.join(root, "repo-2");
    const outputDir = path.join(root, "output", "final-project");
    await write(outputDir, "stale.txt", "remove me\n");
    await write(repo1, "lib/auth.ts", "export const auth = 'repo-1';\n");
    await write(repo1, "requirements.txt", "fastapi==0.115.0\n");
    await write(repo1, "package.json", JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.0.0" } }));
    await write(repo2, "app/page.tsx", "export default function Page() { return null; }\n");
    await write(repo2, "package.json", JSON.stringify({
      name: "repo-two",
      scripts: { test: "node --test" },
      dependencies: { react: "^19.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    }));

    const plan = mergePlan();
    const result = await runBuildEngine({
      outputDir,
      workspaceDir: root,
      baseRepoPath: repo2,
      repoAnalyses: [analysis("repo-1", repo1), analysis("repo-2", repo2)],
      mergePlan: plan,
      buildPlan: createBuildTasks(plan),
      project: project(root),
      validation: {
        executor: async (_projectDir, runCommand) => ({
          stdout: `ran ${runCommand}\n`,
          stderr: "",
          exitCode: 0,
          success: true,
        }),
      },
    });

    assert.equal(result.success, true);
    assert.ok(!result.generatedFiles.includes("stale.txt"));
    assert.ok(result.generatedFiles.includes("app/page.tsx"));
    assert.ok(result.generatedFiles.includes("lib/auth.ts"));
    assert.deepEqual(result.docsGenerated, [
      "README.md",
      "PROJECT_SPEC.md",
      "ARCHITECTURE.md",
      "MERGE_PLAN.md",
      "DECISIONS.md",
      "TESTING.md",
      "DEVLOG.md",
      "AGENT_HANDOFF.md",
    ]);
    assert.ok(result.testsGenerated.includes("tests/gitmash-build.test.ts"));

    const packageJson = JSON.parse(await readFile(path.join(outputDir, "package.json"), "utf8"));
    assert.equal(packageJson.dependencies.react, "^19.0.0");
    assert.equal(packageJson.dependencies["@supabase/supabase-js"], "^2.0.0");
    assert.equal(packageJson.devDependencies.typescript, "^5.0.0");
    assert.equal(await readFile(path.join(outputDir, "requirements.txt"), "utf8"), "fastapi==0.115.0\n");
    assert.match(await readFile(path.join(outputDir, "AGENT_HANDOFF.md"), "utf8"), /## Next Recommended Tasks/);
    assert.match(await readFile(path.join(outputDir, "src\/features\/workflow.ts"), "utf8"), /aiWorkflow/);
    assert.match(await readFile(path.join(outputDir, "build-task-log.json"), "utf8"), /"status": "completed"/);
    assert.equal(result.validation?.success, true);
    assert.ok(result.validationCommands.some((command) => command.command === "install" && command.detected));
  });
});

function mergePlan(): MergePlan {
  return {
    projectId: "proj-build-test",
    selectedBaseRepo: "repo-2",
    baseRepoReason: "Repo 2 is the best base.",
    decisions: [
      {
        featureName: "Dashboard",
        decision: "keep",
        sourceRepo: "repo-2",
        sourcePaths: ["app/page.tsx"],
        targetPaths: ["app/page.tsx"],
        reason: "Keep the dashboard.",
        confidence: 0.9,
      },
      {
        featureName: "Auth",
        decision: "adapt",
        sourceRepo: "repo-1",
        sourcePaths: ["lib/auth.ts"],
        targetPaths: ["lib/auth.ts"],
        reason: "Adapt auth.",
        confidence: 0.8,
      },
      {
        featureName: "AI Workflow",
        decision: "create_new",
        sourceRepo: "repo-2",
        sourcePaths: [],
        targetPaths: ["src/features/workflow.ts"],
        reason: "Missing workflow.",
        confidence: 0.7,
      },
    ],
    conflicts: [],
    risks: [],
    buildMilestones: [],
  };
}

function project(root: string): Project {
  return {
    id: "proj-build-test",
    brief: "Merge auth and dashboard.",
    status: "cloned",
    sourceRepos: [
      sourceRepo("repo-1", "owner/auth"),
      sourceRepo("repo-2", "owner/ui"),
    ],
    workspacePath: root,
    analysisPath: path.join(root, "analysis"),
    outputPath: path.join(root, "output"),
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

function analysis(repoId: string, repoPath: string): RepoAnalysis {
  return {
    repoId,
    repoPath,
    generatedAt: "2026-04-29T00:00:00.000Z",
    stack: { primary: "Next.js", secondary: ["React"], confidence: 0.9 },
    packageManager: "npm",
    testFrameworks: ["node:test"],
    fileTree: { name: repoId, type: "dir", path: "." },
    dependencies: {
      dependencies: [],
      riskyPackages: [],
      countsByCategory: {},
    },
    routes: [],
    components: [],
    risks: { risks: [], metrics: { testFileCount: 0, jsFileCount: 0, tsFileCount: 1, largeFileCount: 0 } },
    artifacts: {},
  };
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
