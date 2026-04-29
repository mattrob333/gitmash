import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { DetectedCommand } from "../lib/command-detector.ts";
import type { ValidationRunResult } from "../lib/command-runner.ts";
import { runRepairLoop } from "../lib/repair-loop.ts";

describe("repair loop", () => {
  it("adds safe typecheck repairs and reruns validation", async () => {
    const root = await tempDir();
    await write(root, "package.json", JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }));
    const commands: DetectedCommand[] = [
      { command: "typecheck", detected: true, runCommand: "npm run typecheck" },
    ];
    const initial = failedValidation("typecheck", "Cannot find module '@/lib/api'\nCould not find a declaration file for module 'legacy-sdk'.");

    const result = await runRepairLoop(root, commands, initial, {}, async (projectDir) => {
      const tsconfig = await readFile(path.join(projectDir, "tsconfig.json"), "utf8");
      const stubs = await readFile(path.join(projectDir, "types", "gitmash-stubs.d.ts"), "utf8");
      return {
        stdout: `${tsconfig}\n${stubs}`,
        stderr: "",
        exitCode: 0,
        success: true,
      };
    });

    assert.equal(result.success, true);
    assert.equal(result.attempts, 1);
    assert.match(await readFile(path.join(root, "tsconfig.json"), "utf8"), /"@\/\*"/);
    assert.match(await readFile(path.join(root, "types", "gitmash-stubs.d.ts"), "utf8"), /legacy-sdk/);
    assert.equal(result.repairLog[0].success, true);
  });

  it("retries npm install with legacy peer deps without editing lockfiles", async () => {
    const root = await tempDir();
    await write(root, "package.json", JSON.stringify({ dependencies: { react: "^19.0.0" } }));
    await write(root, "package-lock.json", "{\"lockfileVersion\":3}\n");
    const commands: DetectedCommand[] = [
      { command: "install", detected: true, runCommand: "npm install" },
    ];
    const calls: string[] = [];

    const result = await runRepairLoop(root, commands, failedValidation("install", "ERESOLVE unable to resolve dependency tree"), {}, async (_dir, runCommand) => {
      calls.push(runCommand);
      return {
        stdout: "",
        stderr: "",
        exitCode: runCommand.includes("--legacy-peer-deps") ? 0 : 1,
        success: runCommand.includes("--legacy-peer-deps"),
      };
    });

    assert.equal(result.success, true);
    assert.deepEqual(calls, ["npm install --legacy-peer-deps"]);
    assert.equal(await readFile(path.join(root, "package-lock.json"), "utf8"), "{\"lockfileVersion\":3}\n");
  });

  it("adds placeholder files for missing build imports", async () => {
    const root = await tempDir();
    const commands: DetectedCommand[] = [
      { command: "build", detected: true, runCommand: "npm run build" },
    ];

    const result = await runRepairLoop(
      root,
      commands,
      failedValidation("build", "Module not found: Can't resolve '@/lib/generated'"),
      {},
      async (projectDir) => ({
        stdout: "",
        stderr: "",
        exitCode: await exists(path.join(projectDir, "lib", "generated.ts")) ? 0 : 1,
        success: await exists(path.join(projectDir, "lib", "generated.ts")),
      }),
    );

    assert.equal(result.success, true);
    assert.equal(await readFile(path.join(root, "lib", "generated.ts"), "utf8"), "export {};\n");
  });
});

function failedValidation(command: "install" | "typecheck" | "build", stderr: string): ValidationRunResult {
  const failure = {
    command,
    runCommand: command === "install" ? "npm install" : `npm run ${command}`,
    stdout: "",
    stderr,
    exitCode: 1,
    success: false,
  };
  return {
    success: false,
    commands: [failure],
    failures: [failure],
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "gitmash-repair-loop-"));
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
