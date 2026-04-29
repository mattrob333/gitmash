import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { analyzeRepo } from "../lib/repo-analyzer.ts";

describe("analyzeRepo", () => {
  it("runs all analyzers and writes JSON artifacts", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-analyzer-"));
    const repoPath = path.join(tempRoot, "repo");
    const analysisRoot = path.join(tempRoot, "analysis");
    await writeFixture(repoPath, {
      "package.json": JSON.stringify({
        scripts: { dev: "next dev" },
        dependencies: { next: "^15.0.0", react: "^19.0.0", request: "^2.0.0" },
        devDependencies: { vitest: "^2.0.0", typescript: "^5.0.0" },
      }),
      "next.config.ts": "export default {};\n",
      "app/page.tsx": "export default function Page() { return null; }\n",
      "app/api/ping/route.ts": "export async function GET() {}\n",
      "components/Button.tsx": "export function Button() { return null; }\n",
      "tests/app.test.ts": "import { test } from 'node:test';\n",
    });

    const analysis = await analyzeRepo(repoPath, { id: "repo-one", name: "repo", slug: "owner/repo" }, analysisRoot);

    assert.equal(analysis.stack.primary, "Next.js");
    assert.equal(analysis.packageManager, "unknown");
    assert.ok(analysis.routes.some((route) => route.path === "/api/ping"));
    assert.ok(analysis.components.some((component) => component.path === "components/Button.tsx"));
    assert.ok(analysis.dependencies.riskyPackages.some((dependency) => dependency.name === "request"));

    for (const artifactPath of Object.values(analysis.artifacts)) {
      const contents = await readFile(artifactPath, "utf8");
      assert.doesNotThrow(() => JSON.parse(contents));
    }
  });
});

async function writeFixture(repoPath: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}
