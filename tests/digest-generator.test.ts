import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateRepoDigest } from "../lib/digest-generator.ts";
import { generateFileTree } from "../lib/file-filter.ts";
import type { RepoAnalysis } from "../types/project.ts";

describe("generateRepoDigest", () => {
  it("writes a capped repo digest with expected sections", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-digest-"));
    const repoPath = path.join(tempRoot, "repo");
    const analysisDir = path.join(tempRoot, "analysis");
    const files: Record<string, string> = {
      "package.json": JSON.stringify({
        scripts: { dev: "next dev", test: "node --test" },
        dependencies: { next: "^15.0.0", react: "^19.0.0", "next-auth": "^5.0.0", openai: "^4.0.0" },
      }),
      "README.md": "# Fixture\n",
      "app/page.tsx": "export default function Page() { return null; }\n",
      "app/api/ping/route.ts": "export async function GET() {}\n",
      "components/Button.tsx": "export function Button() { return null; }\n",
      "models/user.ts": "export type User = { id: string };\n",
      "tests/app.test.ts": "import { test } from 'node:test';\n",
    };
    for (let index = 0; index < 80; index += 1) {
      files[`src/generated/file-${index}.ts`] = `export const value${index} = ${index};\n`;
    }
    await writeFixture(repoPath, files);

    const chunkPath = path.join(analysisDir, "important-files", "file-001.md");
    await mkdir(path.dirname(chunkPath), { recursive: true });
    await writeFile(chunkPath, "# Important Source File\n\n- Source path: `app/page.tsx`\n\n```tsx\nexport default function Page() {}\n```\n");

    const digestPath = await generateRepoDigest(
      await createAnalysis(repoPath),
      { id: "repo-one", name: "repo", slug: "owner/repo", branch: "main", commitSha: "abc123" },
      analysisDir,
      [chunkPath],
    );
    const digest = await readFile(digestPath, "utf8");

    for (const section of [
      "## Repo Metadata",
      "## Detected Stack",
      "## Package Manager",
      "## Dependency Summary",
      "## File Tree",
      "## Key Source Files",
      "## Routes/API Endpoints",
      "## Components/Services",
      "## Data Models",
      "## Auth",
      "## AI Features",
      "## Tests",
      "## Docs",
      "## Risks",
    ]) {
      assert.match(digest, new RegExp(section.replace("/", "\\/")));
    }

    assert.match(digest, /Package manager: npm/);
    assert.match(digest, /app\/page\.tsx/);
    assert.match(digest, /\.\.\. truncated after 60 items/);
    assert.ok(digest.split(/\r?\n/).length <= 500);
  });
});

async function createAnalysis(repoPath: string): Promise<RepoAnalysis> {
  return {
    repoId: "repo-one",
    repoPath,
    generatedAt: "2026-04-29T00:00:00.000Z",
    stack: { primary: "Next.js", secondary: ["React"], confidence: 0.9 },
    packageManager: "npm",
    testFrameworks: ["node:test"],
    fileTree: await generateFileTree(repoPath),
    dependencies: {
      dependencies: [
        { name: "next", version: "^15.0.0", category: "build", source: "package.json" },
        { name: "react", version: "^19.0.0", category: "ui", source: "package.json" },
        { name: "next-auth", version: "^5.0.0", category: "auth", source: "package.json" },
        { name: "openai", version: "^4.0.0", category: "ai", source: "package.json" },
      ],
      riskyPackages: [],
      countsByCategory: { build: 1, ui: 1, auth: 1, ai: 1 },
    },
    routes: [{ path: "/api/ping", type: "api", method: "GET", file: "app/api/ping/route.ts" }],
    components: [
      { name: "Button", type: "component", path: "components/Button.tsx" },
      { name: "user", type: "model", path: "models/user.ts" },
    ],
    risks: {
      risks: [{ id: "missing-tests", severity: "medium", message: "Example risk" }],
      metrics: { testFileCount: 1, jsFileCount: 0, tsFileCount: 82, largeFileCount: 0 },
    },
    artifacts: {},
  };
}

async function writeFixture(repoPath: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}
