import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MergeDecision } from "./merge-planner.ts";

export type CopyOutcome = {
  copiedFiles: string[];
  adaptedFiles: string[];
  scaffoldedFiles: string[];
  errors: string[];
};

export type ScaffoldFile = {
  path: string;
  contents: string;
};

const COPY_EXCLUDES = new Set([
  ".git",
  ".next",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".env",
  ".env.local",
  ".env.production",
  ".DS_Store",
]);

const TEXT_FILE_RE = /\.(cjs|css|html|js|jsx|json|md|mjs|py|toml|ts|tsx|txt|yml|yaml)$/;

export async function copyDirectoryPreservingStructure(
  sourceDir: string,
  targetDir: string,
): Promise<CopyOutcome> {
  const outcome = emptyOutcome();
  await copyDirectoryRecursive(sourceDir, sourceDir, targetDir, outcome);
  return outcome;
}

export async function copyFilesForDecisions(
  decisions: MergeDecision[],
  repoPathsById: Map<string, string>,
  outputDir: string,
): Promise<CopyOutcome> {
  const outcome = emptyOutcome();
  const pathMap = sourceToTargetMap(decisions);

  for (const decision of decisions) {
    if (decision.decision !== "keep" && decision.decision !== "adapt") {
      continue;
    }

    const repoPath = repoPathsById.get(decision.sourceRepo);
    if (!repoPath) {
      outcome.errors.push(`No repository path found for ${decision.sourceRepo}.`);
      continue;
    }

    if (!decision.sourcePaths.length) {
      outcome.errors.push(`Decision "${decision.featureName}" has no source files to ${decision.decision}.`);
      continue;
    }

    for (const [index, sourcePath] of decision.sourcePaths.entries()) {
      const targetPath = resolveTargetPath(decision, sourcePath, index);
      await copyOneFile({
        sourceFile: path.join(repoPath, sourcePath),
        sourcePath,
        targetFile: path.join(outputDir, targetPath),
        targetPath,
        adapt: decision.decision === "adapt",
        pathMap,
        outcome,
      });
    }
  }

  return outcome;
}

export async function scaffoldFreshFiles(files: ScaffoldFile[], outputDir: string): Promise<CopyOutcome> {
  const outcome = emptyOutcome();

  for (const file of files) {
    const targetFile = path.join(outputDir, file.path);
    if (!isSafeRelativePath(file.path)) {
      outcome.errors.push(`Refusing to scaffold unsafe path ${file.path}.`);
      continue;
    }
    await mkdir(path.dirname(targetFile), { recursive: true });
    await writeFile(targetFile, file.contents);
    outcome.scaffoldedFiles.push(normalizePath(file.path));
  }

  return outcome;
}

export function resolveTargetPath(decision: MergeDecision, sourcePath: string, sourceIndex = 0): string {
  return normalizePath(decision.targetPaths[sourceIndex] ?? decision.targetPaths[0] ?? sourcePath);
}

export function adaptFileContent(
  contents: string,
  currentSourcePath: string,
  currentTargetPath: string,
  pathMap: Map<string, string>,
): string {
  let adapted = contents;

  for (const [sourcePath, targetPath] of pathMap) {
    if (sourcePath === currentSourcePath || sourcePath === targetPath) {
      continue;
    }

    const sourceImport = importSpecifier(path.relative(path.dirname(currentSourcePath), withoutExtension(sourcePath)));
    const targetImport = importSpecifier(path.relative(path.dirname(currentTargetPath), withoutExtension(targetPath)));
    adapted = replaceQuotedSpecifier(adapted, sourceImport, targetImport);
  }

  return adapted
    .replaceAll("@/pages/", "@/app/")
    .replaceAll("from \"../pages/", "from \"../app/")
    .replaceAll("from '../pages/", "from '../app/");
}

function sourceToTargetMap(decisions: MergeDecision[]): Map<string, string> {
  const pathMap = new Map<string, string>();
  for (const decision of decisions) {
    for (const [index, sourcePath] of decision.sourcePaths.entries()) {
      pathMap.set(normalizePath(sourcePath), resolveTargetPath(decision, sourcePath, index));
    }
  }
  return pathMap;
}

async function copyDirectoryRecursive(
  rootDir: string,
  currentDir: string,
  outputDir: string,
  outcome: CopyOutcome,
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (COPY_EXCLUDES.has(entry.name)) {
      continue;
    }

    const sourceFile = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(rootDir, sourceFile));
    const targetFile = path.join(outputDir, relativePath);

    if (!isSafeRelativePath(relativePath)) {
      outcome.errors.push(`Refusing to copy unsafe path ${relativePath}.`);
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(rootDir, sourceFile, outputDir, outcome);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(targetFile), { recursive: true });
      await copyFile(sourceFile, targetFile);
      outcome.copiedFiles.push(relativePath);
    }
  }
}

async function copyOneFile(input: {
  sourceFile: string;
  sourcePath: string;
  targetFile: string;
  targetPath: string;
  adapt: boolean;
  pathMap: Map<string, string>;
  outcome: CopyOutcome;
}): Promise<void> {
  const sourcePath = normalizePath(input.sourcePath);
  const targetPath = normalizePath(input.targetPath);
  if (!isSafeRelativePath(sourcePath) || !isSafeRelativePath(targetPath)) {
    input.outcome.errors.push(`Refusing to copy unsafe source or target path ${sourcePath} -> ${targetPath}.`);
    return;
  }

  try {
    const sourceStat = await stat(input.sourceFile);
    if (!sourceStat.isFile()) {
      input.outcome.errors.push(`Source path is not a file: ${sourcePath}.`);
      return;
    }
  } catch {
    input.outcome.errors.push(`Source file not found: ${sourcePath}.`);
    return;
  }

  await mkdir(path.dirname(input.targetFile), { recursive: true });
  if (input.adapt && TEXT_FILE_RE.test(sourcePath)) {
    const contents = await readFile(input.sourceFile, "utf8");
    await writeFile(input.targetFile, adaptFileContent(contents, sourcePath, targetPath, input.pathMap));
    input.outcome.adaptedFiles.push(targetPath);
    return;
  }

  await copyFile(input.sourceFile, input.targetFile);
  input.outcome.copiedFiles.push(targetPath);
}

function replaceQuotedSpecifier(contents: string, fromSpecifier: string, toSpecifier: string): string {
  return contents
    .replaceAll(`"${fromSpecifier}"`, `"${toSpecifier}"`)
    .replaceAll(`'${fromSpecifier}'`, `'${toSpecifier}'`);
}

function importSpecifier(relativePath: string): string {
  const normalized = normalizePath(relativePath);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function withoutExtension(filePath: string): string {
  return normalizePath(filePath).replace(/\.(cjs|js|jsx|mjs|ts|tsx)$/, "");
}

function isSafeRelativePath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return Boolean(normalized) && !normalized.startsWith("../") && !path.isAbsolute(normalized);
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function emptyOutcome(): CopyOutcome {
  return {
    copiedFiles: [],
    adaptedFiles: [],
    scaffoldedFiles: [],
    errors: [],
  };
}
