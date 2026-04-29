import assert from "node:assert/strict";
import { exec } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { cloneRepo, detectPrimaryLanguage } from "../lib/repo-cloner.ts";
import type { ParsedGitHubRepo } from "../lib/github.ts";

describe("cloneRepo", () => {
  it("shallow clones a local git fixture and returns repo metadata", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-clone-"));
    const origin = await createGitFixture(tempRoot, {
      "package.json": JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "src/index.ts": "export const value: string = 'ok';\n",
    });
    const workspace = path.join(tempRoot, "workspace");

    const info = await cloneRepo(toParsedRepo(origin), workspace);

    assert.equal(info.cloneStatus, "cloned");
    assert.equal(info.cloneError, null);
    assert.equal(info.primaryLanguage, "TypeScript");
    assert.match(info.commitSha, /^[a-f0-9]{40}$/);
    assert.ok(info.sizeBytes > 0);
    assert.ok(info.branch.length > 0);
  });

  it("rejects an already-existing clone target", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-exists-"));
    const origin = await createGitFixture(tempRoot, {
      "go.mod": "module example.com/app\n",
      "main.go": "package main\n",
    });
    const workspace = path.join(tempRoot, "workspace");
    const parsedRepo = toParsedRepo(origin);

    await cloneRepo(parsedRepo, workspace);
    await assert.rejects(() => cloneRepo(parsedRepo, workspace), /already exists/);
  });

  it("classifies private repository clone failures", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-private-"));

    await assert.rejects(
      () =>
        cloneRepo(toParsedRepo("https://github.com/owner/private-repo"), tempRoot, async () => {
          throw new Error("fatal: repository 'https://github.com/owner/private-repo/' not found");
        }),
      /private or does not exist/,
    );
  });
});

describe("detectPrimaryLanguage", () => {
  it("detects common language marker files", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitmash-language-"));
    const repoPath = path.join(tempRoot, "python-app");
    await mkdir(repoPath, { recursive: true });
    await writeFile(path.join(repoPath, "pyproject.toml"), "[project]\nname = 'fixture'\n");

    assert.equal(await detectPrimaryLanguage(repoPath), "Python");
  });
});

async function createGitFixture(
  tempRoot: string,
  files: Record<string, string>,
): Promise<string> {
  const repoPath = path.join(tempRoot, "origin");
  await mkdir(repoPath, { recursive: true });
  await execCommand(`git init ${shellEscape(repoPath)}`);
  await execCommand(`git -C ${shellEscape(repoPath)} config user.email test@example.com`);
  await execCommand(`git -C ${shellEscape(repoPath)} config user.name "GitMash Test"`);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }

  await execCommand(`git -C ${shellEscape(repoPath)} add .`);
  await execCommand(`git -C ${shellEscape(repoPath)} commit -m fixture`);
  return repoPath;
}

function toParsedRepo(normalizedUrl: string): ParsedGitHubRepo {
  return {
    owner: "fixture",
    name: "app",
    slug: "fixture/app",
    normalizedUrl,
  };
}

function execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
