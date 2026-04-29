import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  adaptFileContent,
  copyDirectoryPreservingStructure,
  copyFilesForDecisions,
  resolveTargetPath,
  scaffoldFreshFiles,
} from "../lib/file-copier.ts";
import type { MergeDecision } from "../lib/merge-planner.ts";

describe("file copier", () => {
  it("copies directories while excluding dependency and secret files", async () => {
    const source = await tempDir("gitmash-copy-source-");
    const target = await tempDir("gitmash-copy-target-");
    await write(source, "src/index.ts", "export const value = 1;\n");
    await write(source, "node_modules/pkg/index.js", "ignored\n");
    await write(source, ".env", "SECRET=value\n");

    const outcome = await copyDirectoryPreservingStructure(source, target);

    assert.deepEqual(outcome.errors, []);
    assert.ok(outcome.copiedFiles.includes("src/index.ts"));
    assert.equal(await readFile(path.join(target, "src/index.ts"), "utf8"), "export const value = 1;\n");
  });

  it("copies and adapts merge decision files into resolved target paths", async () => {
    const source = await tempDir("gitmash-decision-source-");
    const output = await tempDir("gitmash-decision-output-");
    await write(source, "lib/helper.ts", "export const helper = 1;\n");
    await write(source, "src/feature.ts", "import { helper } from '../lib/helper';\nexport const feature = helper;\n");
    const decisions: MergeDecision[] = [
      decision("Helper", "adapt", ["lib/helper.ts"], ["core/helper.ts"]),
      decision("Feature", "adapt", ["src/feature.ts"], ["features/feature.ts"]),
    ];

    const outcome = await copyFilesForDecisions(decisions, new Map([["repo-1", source]]), output);

    assert.deepEqual(outcome.errors, []);
    assert.ok(outcome.adaptedFiles.includes("features/feature.ts"));
    const adapted = await readFile(path.join(output, "features/feature.ts"), "utf8");
    assert.match(adapted, /'\.\.\/core\/helper'/);
  });

  it("scaffolds fresh files and resolves fallback target paths", async () => {
    const output = await tempDir("gitmash-scaffold-output-");
    const mergeDecision = decision("Generated API", "create_new", ["src/api.ts"], []);

    const outcome = await scaffoldFreshFiles([{ path: "src/generated.ts", contents: "export {};\n" }], output);

    assert.deepEqual(outcome.scaffoldedFiles, ["src/generated.ts"]);
    assert.equal(resolveTargetPath(mergeDecision, "src/api.ts"), "src/api.ts");
    assert.equal(await readFile(path.join(output, "src/generated.ts"), "utf8"), "export {};\n");
  });

  it("updates import specifiers for adapted files", () => {
    const pathMap = new Map([
      ["lib/a.ts", "core/a.ts"],
      ["src/b.ts", "features/b.ts"],
    ]);

    const adapted = adaptFileContent("import { a } from '../lib/a';\n", "src/b.ts", "features/b.ts", pathMap);

    assert.equal(adapted, "import { a } from '../core/a';\n");
  });
});

function decision(
  featureName: string,
  mergeDecision: MergeDecision["decision"],
  sourcePaths: string[],
  targetPaths: string[],
): MergeDecision {
  return {
    featureName,
    decision: mergeDecision,
    sourceRepo: "repo-1",
    sourcePaths,
    targetPaths,
    reason: "Test decision.",
    confidence: 0.9,
  };
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
