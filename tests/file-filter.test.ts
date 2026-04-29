import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  generateFileTree,
  shouldIncludeFile,
  toWorkspaceRelativePath,
  walkFiles,
} from "../lib/file-filter.ts";

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

describe("walkFiles and generateFileTree", () => {
  it("walks included files and omits generated directories", async () => {
    const repoPath = await createFixture({
      "src/index.ts": "export const value = 1;\n",
      "node_modules/pkg/index.js": "ignored\n",
      "dist/bundle.js": "ignored\n",
      ".env": "SECRET=value\n",
      "README.md": "# Fixture\n",
    });

    const files: string[] = [];
    for await (const filePath of walkFiles(repoPath)) {
      files.push(filePath);
    }

    assert.deepEqual(files, ["README.md", "src/index.ts"]);
  });

  it("generates a nested JSON file tree", async () => {
    const repoPath = await createFixture({
      "app/page.tsx": "export default function Page() { return null; }\n",
      "public/logo.png": "ignored",
    });

    const tree = await generateFileTree(repoPath);

    assert.equal(tree.type, "dir");
    assert.deepEqual(tree.children?.map((child) => child.path), ["app"]);
    assert.deepEqual(tree.children?.[0]?.children?.map((child) => child.path), ["app/page.tsx"]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "gitmash-filter-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return repoPath;
}
