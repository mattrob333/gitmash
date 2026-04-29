import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { walkFiles } from "./file-filter.ts";
import type { ComponentInfo, RouteInfo } from "../types/project.ts";

type ChunkSourceAnalysis = {
  routes?: RouteInfo[];
  components?: ComponentInfo[];
};

export type SourceChunkOptions = {
  maxFiles?: number;
  maxChunkChars?: number;
};

const DEFAULT_MAX_FILES = 16;
const DEFAULT_MAX_CHUNK_CHARS = 12_000;
const SOURCE_EXT_RE = /\.(js|jsx|ts|tsx|py|prisma)$/;
const CONFIG_FILE_RE =
  /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|tsconfig\.json|next\.config\.[jt]s|vite\.config\.[jt]s|tailwind\.config\.[jt]s|postcss\.config\.[jt]s|drizzle\.config\.[jt]s|schema\.prisma)$/;
const ENTRY_FILE_RE =
  /(^|\/)(app\/(page|layout)\.(tsx|jsx|ts|js)|pages\/(index|_app|_document)\.(tsx|jsx|ts|js)|src\/(main|index|App)\.(tsx|jsx|ts|js)|main\.py|manage\.py|server\.(ts|js)|app\.py)$/;
const SECRET_LINE_RE = /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/i;

export async function chunkSourceFiles(
  repoPath: string,
  analysisDir: string,
  analysis: ChunkSourceAnalysis = {},
  options: SourceChunkOptions = {},
): Promise<string[]> {
  const outputDir = path.join(analysisDir, "important-files");
  await mkdir(outputDir, { recursive: true });

  const selectedFiles = await selectImportantFiles(repoPath, analysis, options.maxFiles ?? DEFAULT_MAX_FILES);
  const chunkPaths: string[] = [];
  let chunkNumber = 1;

  for (const filePath of selectedFiles) {
    const absolutePath = path.join(repoPath, filePath);
    const rawSource = await safeReadText(absolutePath);
    if (!rawSource || rawSource.includes("\0")) {
      continue;
    }

    const source = redactSensitiveLines(rawSource);
    const chunks = splitIntoChunks(source, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunkPath = path.join(outputDir, `file-${String(chunkNumber).padStart(3, "0")}.md`);
      await writeFile(
        chunkPath,
        renderChunk(filePath, index + 1, chunks.length, chunks[index]),
      );
      chunkPaths.push(chunkPath);
      chunkNumber += 1;
    }
  }

  return chunkPaths;
}

async function selectImportantFiles(
  repoPath: string,
  analysis: ChunkSourceAnalysis,
  maxFiles: number,
): Promise<string[]> {
  const routeFiles = new Set((analysis.routes ?? []).map((route) => route.file));
  const componentFiles = new Set(
    (analysis.components ?? [])
      .filter((component) => ["component", "service", "model", "schema"].includes(component.type))
      .map((component) => component.path),
  );

  const ranked: Array<{ path: string; score: number }> = [];
  for await (const filePath of walkFiles(repoPath)) {
    if (!isChunkableFile(filePath)) {
      continue;
    }

    const score = scoreFile(filePath, routeFiles, componentFiles);
    if (score > 0) {
      ranked.push({ path: filePath, score });
    }
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, maxFiles)
    .map((item) => item.path);
}

function scoreFile(
  filePath: string,
  routeFiles: Set<string>,
  componentFiles: Set<string>,
): number {
  let score = 0;
  if (ENTRY_FILE_RE.test(filePath)) {
    score += 100;
  }
  if (routeFiles.has(filePath) || filePath.startsWith("app/api/") || filePath.startsWith("pages/api/")) {
    score += 90;
  }
  if (CONFIG_FILE_RE.test(filePath)) {
    score += 80;
  }
  if (componentFiles.has(filePath)) {
    score += 70;
  }
  if (/(^|\/)(models|schemas|services|components|lib|hooks)\//.test(filePath)) {
    score += 40;
  }
  if (SOURCE_EXT_RE.test(filePath)) {
    score += 10;
  }
  return score;
}

function isChunkableFile(filePath: string): boolean {
  return SOURCE_EXT_RE.test(filePath) || CONFIG_FILE_RE.test(filePath);
}

async function safeReadText(filePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > 300_000) {
      return null;
    }
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function splitIntoChunks(source: string, maxChunkChars: number): string[] {
  if (source.length <= maxChunkChars) {
    return [source];
  }

  const chunks: string[] = [];
  let current = "";
  for (const line of source.split(/\r?\n/)) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChunkChars && current) {
      chunks.push(current);
      current = line;
      continue;
    }
    current = next;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function redactSensitiveLines(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => (SECRET_LINE_RE.test(line) ? "[REDACTED SENSITIVE LINE]" : line))
    .join("\n");
}

function renderChunk(filePath: string, part: number, totalParts: number, source: string): string {
  const extension = path.extname(filePath).replace(".", "") || "text";
  return [
    "# Important Source File",
    "",
    `- Source path: \`${filePath}\``,
    `- Part: ${part} of ${totalParts}`,
    "",
    `\`\`\`${extension}`,
    source.trimEnd(),
    "```",
    "",
  ].join("\n");
}
