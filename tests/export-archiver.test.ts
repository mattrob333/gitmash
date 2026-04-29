import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createProjectZip, exportFinalProject } from "../lib/export-archiver.ts";

describe("export archiver", () => {
  it("creates a zip and excludes .git and node_modules", async () => {
    const root = await tempDir();
    await write(root, "README.md", "# Fixture\n");
    await write(root, "src/index.ts", "export const ok = true;\n");
    await write(root, ".git/config", "private\n");
    await write(root, "node_modules/pkg/index.js", "large\n");

    const archivePath = path.join(root, "..", "fixture.zip");
    const result = await createProjectZip(root, archivePath);
    const archive = await readFile(result.outputPath);
    const entries = readZipEntries(archive);

    assert.equal(result.fileCount, 2);
    assert.ok(result.fileSize > 22);
    assert.deepEqual(entries.map((entry) => entry.name).sort(), ["README.md", "src/index.ts"]);
    assert.equal(entries.find((entry) => entry.name === "README.md")?.contents, "# Fixture\n");
  });

  it("writes known issues during full export only when issues exist", async () => {
    const root = await tempDir();
    await write(root, "README.md", "# Fixture\n");
    const result = await exportFinalProject({
      projectDir: root,
      outputPath: path.join(root, "..", "final.zip"),
      buildResult: {
        success: false,
        outputDir: root,
        generatedFiles: ["README.md"],
        docsGenerated: ["README.md"],
        testsGenerated: [],
        errors: ["build failed"],
        validationCommands: [],
        validation: { success: true, commands: [], failures: [] },
        repair: null,
      },
    });

    const entries = readZipEntries(await readFile(result.outputPath));
    assert.ok(entries.some((entry) => entry.name === "KNOWN_ISSUES.md"));
    assert.match(entries.find((entry) => entry.name === "KNOWN_ISSUES.md")?.contents ?? "", /build failed/);
  });
});

type ZipEntry = { name: string; contents: string };

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const contents = method === 8 ? inflateRawSync(compressed).toString("utf8") : compressed.toString("utf8");
    entries.push({ name, contents });
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "gitmash-export-"));
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
