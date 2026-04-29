import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { shouldIncludeFile, toWorkspaceRelativePath } from "../lib/file-filter.ts";

describe("shouldIncludeFile", () => {
  it("excludes dependency, build, git, binary, and secret files", () => {
    assert.equal(shouldIncludeFile("src/app.ts"), true);
    assert.equal(shouldIncludeFile("node_modules/react/index.js"), false);
    assert.equal(shouldIncludeFile(".git/config"), false);
    assert.equal(shouldIncludeFile("dist/bundle.js"), false);
    assert.equal(shouldIncludeFile("public/logo.png"), false);
    assert.equal(shouldIncludeFile(".env.production"), false);
  });

  it("allows environment examples and normal source files", () => {
    assert.equal(shouldIncludeFile(".env.example"), true);
    assert.equal(shouldIncludeFile("docs/README.md"), true);
  });
});

describe("toWorkspaceRelativePath", () => {
  it("normalizes platform-specific separators to slash separators", () => {
    const root = path.join(path.sep, "tmp", "repo");
    const file = path.join(root, "src", "index.ts");

    assert.equal(toWorkspaceRelativePath(root, file), "src/index.ts");
  });
});
