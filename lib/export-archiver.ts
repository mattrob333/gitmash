import { deflateRawSync } from "node:zlib";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeKnownIssuesFileIfNeeded } from "./known-issues.ts";
import type { BuildResult } from "./build-engine.ts";
import type { ReviewReport } from "./code-review.ts";

export type ExportArchiveResult = {
  outputPath: string;
  fileSize: number;
  fileCount: number;
};

export type ExportFinalProjectOptions = {
  projectDir: string;
  outputPath?: string;
  buildResult?: BuildResult | null;
  reviewReport?: ReviewReport | null;
};

type ZipEntry = {
  relativePath: string;
  compressed: Buffer;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  modDate: number;
  modTime: number;
  localHeaderOffset: number;
};

const EXCLUDED_DIRS = new Set([".git", "node_modules"]);

export async function exportFinalProject(options: ExportFinalProjectOptions): Promise<ExportArchiveResult> {
  await writeKnownIssuesFileIfNeeded(options.projectDir, {
    buildResult: options.buildResult ?? null,
    reviewReport: options.reviewReport ?? null,
  });
  const outputPath = options.outputPath ?? path.join(path.dirname(options.projectDir), "final-project.zip");
  return createProjectZip(options.projectDir, outputPath);
}

export async function createProjectZip(projectDir: string, outputPath: string): Promise<ExportArchiveResult> {
  const files = await collectArchiveFiles(projectDir);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const localParts: Buffer[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  for (const relativePath of files) {
    const absolutePath = path.join(projectDir, relativePath);
    const data = await readFile(absolutePath);
    const stats = await stat(absolutePath);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const { modDate, modTime } = dosDateTime(stats.mtime);
    const name = Buffer.from(relativePath, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(modTime, 10);
    localHeader.writeUInt16LE(modDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);
    entries.push({
      relativePath,
      compressed,
      crc32: crc,
      compressedSize: compressed.length,
      uncompressedSize: data.length,
      modDate,
      modTime,
      localHeaderOffset: offset,
    });
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralParts: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.relativePath, "utf8");
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(entry.modTime, 12);
    centralHeader.writeUInt16LE(entry.modDate, 14);
    centralHeader.writeUInt32LE(entry.crc32, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);
    centralParts.push(centralHeader, name);
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  const archive = Buffer.concat([...localParts, centralDirectory, end]);
  await rm(outputPath, { force: true });
  await writeFile(outputPath, archive);
  return {
    outputPath,
    fileSize: archive.length,
    fileCount: entries.length,
  };
}

async function collectArchiveFiles(projectDir: string, dir = projectDir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    const relativePath = path.relative(projectDir, entryPath).split(path.sep).join("/");
    if (entry.isDirectory()) {
      files.push(...await collectArchiveFiles(projectDir, entryPath));
    } else {
      files.push(relativePath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function dosDateTime(date: Date): { modDate: number; modTime: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    modDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    modTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
