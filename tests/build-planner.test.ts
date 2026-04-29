import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBuildTasks, orderBuildTasks, type BuildTask } from "../lib/build-planner.ts";
import type { MergePlan } from "../lib/merge-planner.ts";

describe("build planner", () => {
  it("creates ordered build tasks for merge decisions", () => {
    const tasks = createBuildTasks(mergePlan());
    const ids = tasks.map((task) => task.id);

    assert.deepEqual(ids, [
      "scaffold",
      "copy-kept-files",
      "adapt-files",
      "rewrite-files",
      "generate-new-files",
      "add-tests",
      "fix-types",
      "verify-builds",
    ]);

    assert.deepEqual(task(tasks, "copy-kept-files").relatedFiles, ["app/page.tsx"]);
    assert.deepEqual(task(tasks, "adapt-files").dependsOn, ["scaffold", "copy-kept-files"]);
    assert.ok(task(tasks, "verify-builds").testRequirements[0]?.includes("command output"));
  });

  it("orders a dependency DAG topologically even when input order is shuffled", () => {
    const ordered = orderBuildTasks([
      buildTask("verify", ["test"]),
      buildTask("scaffold", []),
      buildTask("test", ["scaffold"]),
    ]);

    assert.deepEqual(ordered.map((item) => item.id), ["scaffold", "test", "verify"]);
  });

  it("rejects missing dependencies and cycles", () => {
    assert.throws(() => orderBuildTasks([buildTask("verify", ["missing"])]), /missing task/);
    assert.throws(
      () => orderBuildTasks([buildTask("a", ["b"]), buildTask("b", ["a"])]),
      /dependency cycle/,
    );
  });
});

function mergePlan(): MergePlan {
  return {
    projectId: "project-1",
    selectedBaseRepo: "repo-2",
    baseRepoReason: "repo-2 has the best structure.",
    decisions: [
      {
        featureName: "Dashboard",
        decision: "keep",
        sourceRepo: "repo-2",
        sourcePaths: ["app/page.tsx"],
        targetPaths: ["app/page.tsx"],
        reason: "Strong dashboard.",
        confidence: 0.9,
      },
      {
        featureName: "Authentication",
        decision: "adapt",
        sourceRepo: "repo-1",
        sourcePaths: ["lib/auth.ts"],
        targetPaths: ["lib/auth.ts"],
        reason: "Adapt auth.",
        confidence: 0.86,
      },
      {
        featureName: "Upload",
        decision: "rewrite",
        sourceRepo: "repo-1",
        sourcePaths: ["lib/upload.ts"],
        targetPaths: ["lib/upload.ts"],
        reason: "Weak implementation.",
        confidence: 0.62,
      },
      {
        featureName: "API tests",
        decision: "create_new",
        sourceRepo: "repo-2",
        sourcePaths: [],
        targetPaths: ["tests/api-tests.test.ts"],
        reason: "Missing tests.",
        confidence: 0.74,
      },
    ],
    conflicts: [],
    risks: [],
    buildMilestones: [],
  };
}

function buildTask(id: string, dependsOn: string[]): BuildTask {
  return {
    id,
    title: id,
    description: id,
    status: "pending",
    dependsOn,
    relatedFiles: [],
    testRequirements: [],
  };
}

function task(tasks: BuildTask[], id: string): BuildTask {
  const found = tasks.find((item) => item.id === id);
  assert.ok(found);
  return found;
}
