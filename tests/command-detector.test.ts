import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { detectProjectCommands } from "../lib/command-detector.ts";

describe("command detector", () => {
  it("detects npm scripts before binary fallbacks", async () => {
    const root = await tempDir();
    await write(root, "package.json", JSON.stringify({
      scripts: {
        lint: "eslint .",
        typecheck: "tsc --noEmit",
        test: "vitest run",
        build: "next build",
      },
      devDependencies: {
        eslint: "^9.0.0",
        typescript: "^5.0.0",
        vitest: "^2.0.0",
        next: "^15.0.0",
      },
    }));

    const commands = await detectProjectCommands(root);

    assert.deepEqual(commandMap(commands), {
      install: "npm install",
      lint: "npm run lint",
      typecheck: "npm run typecheck",
      test: "npm run test",
      build: "npm run build",
    });
  });

  it("detects known node binaries when scripts are absent", async () => {
    const root = await tempDir();
    await write(root, "package.json", JSON.stringify({
      devDependencies: {
        eslint: "^9.0.0",
        typescript: "^5.0.0",
        jest: "^29.0.0",
        vite: "^6.0.0",
      },
    }));

    const commands = await detectProjectCommands(root);

    assert.equal(commandMap(commands).lint, "npx --no-install eslint .");
    assert.equal(commandMap(commands).typecheck, "npx --no-install tsc --noEmit");
    assert.equal(commandMap(commands).test, "npx --no-install jest");
    assert.equal(commandMap(commands).build, "npx --no-install vite build");
  });

  it("detects python install, lint, typecheck, and test commands", async () => {
    const root = await tempDir();
    await write(root, "requirements.txt", "ruff==0.6.0\nmypy==1.0.0\npytest==8.0.0\n");

    const commands = await detectProjectCommands(root);

    assert.deepEqual(commandMap(commands), {
      install: "pip install -r requirements.txt",
      lint: "ruff check .",
      typecheck: "python -m mypy .",
      test: "python -m pytest",
      build: null,
    });
  });

  it("checks local binary fixtures", async () => {
    const root = await tempDir();
    await write(root, "package.json", JSON.stringify({}));
    const eslint = path.join(root, "node_modules", ".bin", "eslint");
    await mkdir(path.dirname(eslint), { recursive: true });
    await writeFile(eslint, "#!/bin/sh\nexit 0\n");
    await chmod(eslint, 0o755);

    const commands = await detectProjectCommands(root);

    assert.equal(commandMap(commands).lint, "npx --no-install eslint .");
  });
});

function commandMap(commands: Awaited<ReturnType<typeof detectProjectCommands>>) {
  return Object.fromEntries(commands.map((command) => [command.command, command.runCommand]));
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "gitmash-command-detector-"));
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
