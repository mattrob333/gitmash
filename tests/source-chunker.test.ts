import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { chunkSourceFiles } from "../lib/source-chunker.ts";

describe("chunkSourceFiles", () => {
  it("writes ranked important files as markdown chunks", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-chunks-"));
    const repoPath = path.join(tempRoot, "repo");
    const analysisDir = path.join(tempRoot, "analysis");
    await writeFixture(repoPath, {
      "package.json": JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "^15.0.0" } }),
      "app/page.tsx": "export default function Page() { return null; }\n",
      "app/api/users/route.ts": "export async function GET() { return Response.json([]); }\n",
      "components/UserCard.tsx": "export function UserCard() { return null; }\n",
      "README.md": "# Fixture\n",
    });

    const chunkPaths = await chunkSourceFiles(
      repoPath,
      analysisDir,
      {
        routes: [{ path: "/api/users", type: "api", method: "GET", file: "app/api/users/route.ts" }],
        components: [{ name: "UserCard", type: "component", path: "components/UserCard.tsx" }],
      },
      { maxFiles: 4 },
    );

    assert.ok(chunkPaths.length >= 3);
    assert.equal(path.basename(chunkPaths[0]), "file-001.md");

    const files = await readdir(path.join(analysisDir, "important-files"));
    assert.ok(files.includes("file-001.md"));

    const combined = await Promise.all(chunkPaths.map((chunkPath) => readFile(chunkPath, "utf8")));
    assert.ok(combined.some((text) => text.includes("Source path: `app/page.tsx`")));
    assert.ok(combined.some((text) => text.includes("Source path: `app/api/users/route.ts`")));
    assert.ok(combined.some((text) => text.includes("Source path: `components/UserCard.tsx`")));
  });

  it("excludes secret files and redacts obvious secret lines", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-chunks-"));
    const repoPath = path.join(tempRoot, "repo");
    const analysisDir = path.join(tempRoot, "analysis");
    await writeFixture(repoPath, {
      ".env": "API_KEY=should-not-appear\n",
      "app/page.tsx": "const apiKey = 'abcdefghijklmnopqrstuvwxyz123456';\nexport default function Page() { return null; }\n",
    });

    const chunkPaths = await chunkSourceFiles(repoPath, analysisDir, {}, { maxFiles: 2 });
    const combined = (await Promise.all(chunkPaths.map((chunkPath) => readFile(chunkPath, "utf8")))).join("\n");

    assert.doesNotMatch(combined, /should-not-appear/);
    assert.doesNotMatch(combined, /abcdefghijklmnopqrstuvwxyz123456/);
    assert.match(combined, /\[REDACTED SENSITIVE LINE\]/);
  });
});

async function writeFixture(repoPath: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}
