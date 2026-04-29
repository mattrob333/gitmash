import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { getWorkspacePaths } from "../lib/workspace.ts";

describe("getWorkspacePaths", () => {
  it("generates project-scoped workspace, analysis, and output paths", () => {
    const root = path.join(path.sep, "tmp", "gitmash");
    const paths = getWorkspacePaths("proj-12345678", root);

    assert.deepEqual(paths, {
      projectRoot: path.join(root, "workspaces", "proj-12345678"),
      reposRoot: path.join(root, "workspaces", "proj-12345678", "repositories"),
      analysisRoot: path.join(root, "analysis", "proj-12345678"),
      outputRoot: path.join(root, "output", "proj-12345678"),
    });
  });

  it("rejects unsafe project ids", () => {
    assert.throws(() => getWorkspacePaths("../outside"), /Invalid project id/);
    assert.throws(() => getWorkspacePaths("proj/abc12345"), /Invalid project id/);
  });
});
