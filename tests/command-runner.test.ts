import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { DetectedCommand } from "../lib/command-detector.ts";
import {
  executeCommand,
  parseLintOutput,
  parseTestOutput,
  runValidationCommands,
} from "../lib/command-runner.ts";

describe("command runner", () => {
  it("executes commands with execFile and captures output", async () => {
    const root = await tempDir();
    const script = await fakeCommand(root, "ok", "echo stdout-line\necho stderr-line >&2\nexit 0\n");

    const result = await executeCommand(root, script);

    assert.equal(result.success, true);
    assert.match(result.stdout, /stdout-line/);
    assert.match(result.stderr, /stderr-line/);
  });

  it("runs install, parallel checks, test, and build in order", async () => {
    const root = await tempDir();
    const calls: string[] = [];
    const result = await runValidationCommands(root, detected(), {}, async (_projectDir, runCommand, commandType) => {
      calls.push(`${commandType}:${runCommand}`);
      return {
        stdout: commandType === "test" ? "Tests: 2 passed, 0 failed, 2 total\n" : "",
        stderr: commandType === "lint" ? "0 errors\n" : "",
        exitCode: 0,
        success: true,
      };
    });

    assert.equal(result.success, true);
    assert.equal(calls[0], "install:npm install");
    assert.deepEqual(new Set(calls.slice(1, 3).map((call) => call.split(":")[0])), new Set(["lint", "typecheck"]));
    assert.equal(calls[3], "test:npm run test");
    assert.equal(calls[4], "build:npm run build");
    assert.equal(result.commands.find((command) => command.command === "test")?.testSummary?.passed, 2);
  });

  it("saves failed command output", async () => {
    const root = await tempDir();
    const result = await runValidationCommands(
      root,
      [{ command: "test", detected: true, runCommand: "npm run test" }],
      { saveFailuresDir: path.join(root, ".gitmash-validation") },
      async () => ({ stdout: "1 failed\n", stderr: "boom\n", exitCode: 1, success: false }),
    );

    assert.equal(result.success, false);
    const outputPath = result.failures[0].outputPath;
    assert.ok(outputPath);
    assert.match(await readFile(outputPath, "utf8"), /boom/);
  });

  it("parses generic test and lint summaries", () => {
    assert.deepEqual(parseTestOutput("Tests: 1 failed, 4 passed, 5 total"), {
      passed: 4,
      failed: 1,
      total: 5,
    });
    assert.deepEqual(parseTestOutput("==== 2 failed, 7 passed in 0.30s ===="), {
      passed: 7,
      failed: 2,
      total: 9,
    });
    assert.deepEqual(parseLintOutput("src/a.ts\n  1:1 error bad thing\n\n1 problem (1 error, 0 warnings)"), {
      errorCount: 1,
      messages: ["1:1 error bad thing", "1 problem (1 error, 0 warnings)"],
    });
  });
});

function detected(): DetectedCommand[] {
  return [
    { command: "install", detected: true, runCommand: "npm install" },
    { command: "lint", detected: true, runCommand: "npm run lint" },
    { command: "typecheck", detected: true, runCommand: "npm run typecheck" },
    { command: "test", detected: true, runCommand: "npm run test" },
    { command: "build", detected: true, runCommand: "npm run build" },
  ];
}

async function fakeCommand(root: string, name: string, body: string): Promise<string> {
  const scriptPath = path.join(root, name);
  await writeFile(scriptPath, `#!/bin/sh\n${body}`);
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "gitmash-command-runner-"));
}
