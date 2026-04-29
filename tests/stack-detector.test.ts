import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  detectPackageManager,
  detectStack,
  detectTestFramework,
} from "../lib/stack-detector.ts";

describe("detectStack", () => {
  it("detects Next.js from config markers", async () => {
    const repoPath = await createFixture({
      "next.config.ts": "export default {};\n",
      "package.json": JSON.stringify({ dependencies: { next: "^15.0.0", react: "^19.0.0" } }),
    });

    assert.deepEqual(await detectStack(repoPath), {
      primary: "Next.js",
      secondary: [],
      confidence: 0.9,
    });
  });

  it("detects Vite and React markers", async () => {
    const viteRepo = await createFixture({ "vite.config.ts": "export default {};\n" });
    const reactRepo = await createFixture({
      "src/App.tsx": "export default function App() { return null; }\n",
      "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    });

    assert.equal((await detectStack(viteRepo)).primary, "Vite");
    assert.equal((await detectStack(reactRepo)).primary, "React");
  });

  it("detects backend frameworks and returns secondary matches", async () => {
    const repoPath = await createFixture({
      "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }),
      "requirements.txt": "fastapi==0.100.0\nflask==3.0.0\ndjango==5.0.0\n",
      "manage.py": "",
    });

    const stack = await detectStack(repoPath);

    assert.equal(stack.primary, "Express");
    assert.deepEqual(stack.secondary, ["FastAPI", "Flask", "Django"]);
  });

  it("returns Unknown with zero confidence when no markers exist", async () => {
    const repoPath = await createFixture({ "README.md": "# Empty\n" });
    assert.deepEqual(await detectStack(repoPath), {
      primary: "Unknown",
      secondary: [],
      confidence: 0,
    });
  });
});

describe("detectPackageManager", () => {
  it("detects common package manager markers", async () => {
    assert.equal(await detectPackageManager(await createFixture({ "package-lock.json": "{}" })), "npm");
    assert.equal(await detectPackageManager(await createFixture({ "yarn.lock": "" })), "yarn");
    assert.equal(await detectPackageManager(await createFixture({ "pnpm-lock.yaml": "" })), "pnpm");
    assert.equal(await detectPackageManager(await createFixture({ "bun.lockb": "" })), "bun");
    assert.equal(await detectPackageManager(await createFixture({ "pyproject.toml": "[tool.poetry]\n" })), "poetry");
    assert.equal(await detectPackageManager(await createFixture({ "requirements.txt": "flask\n" })), "pip");
    assert.equal(await detectPackageManager(await createFixture({ "Gemfile.lock": "" })), "bundler");
    assert.equal(await detectPackageManager(await createFixture({ "Cargo.toml": "[package]\n" })), "cargo");
  });
});

describe("detectTestFramework", () => {
  it("detects JS and Python test frameworks", async () => {
    const repoPath = await createFixture({
      "vitest.config.ts": "export default {};\n",
      "package.json": JSON.stringify({ devDependencies: { jest: "^29.0.0", mocha: "^10.0.0" } }),
      "requirements.txt": "pytest==8.0.0\n",
    });

    assert.deepEqual(await detectTestFramework(repoPath), ["jest", "mocha", "pytest", "vitest"]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "gitmash-stack-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return repoPath;
}
