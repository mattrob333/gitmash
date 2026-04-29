import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { analyzeDependencies } from "../lib/dependency-analyzer.ts";

describe("analyzeDependencies", () => {
  it("parses package.json and categorizes dependencies", async () => {
    const repoPath = await createFixture({
      "package.json": JSON.stringify({
        dependencies: { react: "^19.0.0", prisma: "^6.0.0", openai: "^4.0.0", request: "^2.0.0" },
        devDependencies: { vitest: "^2.0.0", typescript: "^5.0.0" },
      }),
    });

    const analysis = await analyzeDependencies(repoPath);

    assert.equal(analysis.countsByCategory.ui, 1);
    assert.equal(analysis.countsByCategory.database, 1);
    assert.equal(analysis.countsByCategory.ai, 1);
    assert.equal(analysis.countsByCategory.testing, 1);
    assert.equal(analysis.countsByCategory.build, 1);
    assert.equal(analysis.riskyPackages[0]?.name, "request");
  });

  it("parses pyproject.toml and requirements.txt", async () => {
    const repoPath = await createFixture({
      "pyproject.toml": "[project]\ndependencies = ['fastapi>=0.100', 'pytest>=8']\n",
      "requirements.txt": "flask==3.0.0\npycrypto==2.6\n",
    });

    const analysis = await analyzeDependencies(repoPath);
    const names = analysis.dependencies.map((dependency) => dependency.name).sort();

    assert.ok(names.includes("fastapi"));
    assert.ok(names.includes("pytest"));
    assert.ok(names.includes("flask"));
    assert.ok(analysis.riskyPackages.some((dependency) => dependency.name === "pycrypto"));
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "gitmash-deps-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return repoPath;
}
