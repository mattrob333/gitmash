import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJsonIfExists } from "./analysis-utils.ts";
import { walkFiles } from "./file-filter.ts";
import type { ComponentInfo, FileTreeNode, RepoAnalysis, SourceRepo } from "../types/project.ts";

type RepoDigestMetadata = Pick<SourceRepo, "id" | "name" | "slug" | "url" | "branch" | "commitSha" | "primaryLanguage"> | {
  id?: string;
  name?: string;
  slug?: string;
  url?: string;
  branch?: string;
  commitSha?: string;
  primaryLanguage?: string;
};

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
};

const MAX_DIGEST_LINES = 500;
const MAX_TREE_DEPTH = 5;
const MAX_TREE_ITEMS = 60;
const MAX_LIST_ITEMS = 20;

export async function generateRepoDigest(
  analysis: RepoAnalysis,
  repoMetadata: RepoDigestMetadata,
  analysisDir: string,
  importantFileArtifacts: string[] = [],
): Promise<string> {
  await mkdir(analysisDir, { recursive: true });
  const digestPath = path.join(analysisDir, "repo-digest.md");
  const packageJson = await readJsonIfExists<PackageJson>(path.join(analysis.repoPath, "package.json"));
  const packageScripts = packageJson?.scripts ?? {};
  const docs = await collectMatchingFiles(analysis.repoPath, /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE|ARCHITECTURE|docs\/).*/i);
  const tests = await collectMatchingFiles(analysis.repoPath, /(\.(test|spec)\.(js|jsx|ts|tsx|py)$|^tests\/|^__tests__\/)/);
  const keyFiles = await resolveChunkSourcePaths(importantFileArtifacts);

  const lines = [
    "# Repo Digest",
    "",
    "## Repo Metadata",
    ...bulletList([
      `Repo ID: ${analysis.repoId}`,
      repoMetadata.name ? `Name: ${repoMetadata.name}` : null,
      repoMetadata.slug ? `Slug: ${repoMetadata.slug}` : null,
      repoMetadata.url ? `URL: ${repoMetadata.url}` : null,
      repoMetadata.branch ? `Branch: ${repoMetadata.branch}` : null,
      repoMetadata.commitSha ? `Commit: ${repoMetadata.commitSha}` : null,
      repoMetadata.primaryLanguage ? `Primary language: ${repoMetadata.primaryLanguage}` : null,
      `Generated at: ${analysis.generatedAt}`,
    ]),
    "",
    "## Detected Stack",
    ...bulletList([
      `Primary: ${analysis.stack.primary}`,
      `Secondary: ${analysis.stack.secondary.length ? analysis.stack.secondary.join(", ") : "none"}`,
      `Confidence: ${analysis.stack.confidence}`,
      `Test frameworks: ${analysis.testFrameworks.length ? analysis.testFrameworks.join(", ") : "none detected"}`,
    ]),
    "",
    "## Package Manager",
    ...bulletList([
      `Package manager: ${analysis.packageManager}`,
      ...Object.entries(packageScripts).slice(0, 10).map(([name, command]) => `Script ${name}: ${command}`),
    ]),
    "",
    "## Dependency Summary",
    ...dependencySummary(analysis),
    "",
    "## File Tree",
    ...renderFileTree(analysis.fileTree),
    "",
    "## Key Source Files",
    ...renderKeyFiles(keyFiles, importantFileArtifacts, analysis),
    "",
    "## Routes/API Endpoints",
    ...limitedList(
      analysis.routes.map((route) => {
        const method = route.method ? `${route.method} ` : "";
        return `${method}${route.path} (${route.type}) - ${route.file}`;
      }),
      "No routes detected.",
    ),
    "",
    "## Components/Services",
    ...componentSection(analysis.components),
    "",
    "## Data Models",
    ...componentsByType(analysis.components, ["model", "schema"], "No data models or schemas detected."),
    "",
    "## Auth",
    ...dependencyFeatureSection(analysis, "auth", "No auth dependencies detected."),
    "",
    "## AI Features",
    ...dependencyFeatureSection(analysis, "ai", "No AI dependencies detected."),
    "",
    "## Tests",
    ...limitedList(
      [
        `Detected test files: ${analysis.risks.metrics.testFileCount}`,
        ...analysis.testFrameworks.map((framework) => `Framework: ${framework}`),
        ...tests,
      ],
      "No tests detected.",
    ),
    "",
    "## Docs",
    ...limitedList(docs, "No documentation files detected."),
    "",
    "## Risks",
    ...limitedList(
      analysis.risks.risks.map((risk) => {
        const file = risk.path ? ` (${risk.path})` : "";
        return `${risk.severity.toUpperCase()}: ${risk.message}${file}`;
      }),
      "No static risks detected.",
    ),
    "",
  ];

  const cappedLines = capLines(lines, MAX_DIGEST_LINES);
  await writeFile(digestPath, `${cappedLines.join("\n").trimEnd()}\n`);
  return digestPath;
}

function dependencySummary(analysis: RepoAnalysis): string[] {
  const counts = Object.entries(analysis.dependencies.countsByCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => `${category}: ${count}`);
  const risky = analysis.dependencies.riskyPackages.map(
    (dependency) => `Risky dependency: ${dependency.name}@${dependency.version} - ${dependency.risk}`,
  );

  return limitedList(
    [
      `Total dependencies: ${analysis.dependencies.dependencies.length}`,
      ...counts,
      ...risky,
    ],
    "No dependencies detected.",
  );
}

function renderFileTree(tree: FileTreeNode): string[] {
  const lines: string[] = [];
  let count = 0;

  function visit(node: FileTreeNode, depth: number): void {
    if (count >= MAX_TREE_ITEMS || depth > MAX_TREE_DEPTH) {
      return;
    }
    if (node.path) {
      const marker = node.type === "dir" ? "/" : "";
      lines.push(`${"  ".repeat(Math.max(0, depth - 1))}- ${node.name}${marker}`);
      count += 1;
    }
    for (const child of node.children ?? []) {
      visit(child, depth + 1);
      if (count >= MAX_TREE_ITEMS) {
        break;
      }
    }
  }

  visit(tree, 0);
  if (count >= MAX_TREE_ITEMS) {
    lines.push(`- ... truncated after ${MAX_TREE_ITEMS} items`);
  }
  return lines.length ? lines : ["- No files detected."];
}

function renderKeyFiles(
  keyFiles: string[],
  importantFileArtifacts: string[],
  analysis: RepoAnalysis,
): string[] {
  const fallback = [
    ...analysis.routes.map((route) => route.file),
    ...analysis.components.map((component) => component.path),
  ];
  const files = keyFiles.length ? keyFiles : [...new Set(fallback)].slice(0, MAX_LIST_ITEMS);

  if (!files.length) {
    return ["- No key source files identified."];
  }

  const fileLines = files.slice(0, MAX_LIST_ITEMS).map((filePath) => `- ${filePath}`);
  if (importantFileArtifacts.length) {
    fileLines.push(`- Chunk artifacts: ${importantFileArtifacts.length} files under important-files/`);
  }
  return fileLines;
}

function componentSection(components: ComponentInfo[]): string[] {
  const relevant = components.filter((component) => ["component", "service", "hook", "util"].includes(component.type));
  return limitedList(
    relevant.map((component) => `${component.type}: ${component.name} - ${component.path}`),
    "No components or services detected.",
  );
}

function componentsByType(
  components: ComponentInfo[],
  types: ComponentInfo["type"][],
  emptyMessage: string,
): string[] {
  return limitedList(
    components
      .filter((component) => types.includes(component.type))
      .map((component) => `${component.type}: ${component.name} - ${component.path}`),
    emptyMessage,
  );
}

function dependencyFeatureSection(
  analysis: RepoAnalysis,
  category: string,
  emptyMessage: string,
): string[] {
  return limitedList(
    analysis.dependencies.dependencies
      .filter((dependency) => dependency.category === category)
      .map((dependency) => `${dependency.name}@${dependency.version} (${dependency.source})`),
    emptyMessage,
  );
}

function limitedList(items: string[], emptyMessage: string): string[] {
  if (!items.length) {
    return [`- ${emptyMessage}`];
  }

  const lines = items.slice(0, MAX_LIST_ITEMS).map((item) => `- ${item}`);
  if (items.length > MAX_LIST_ITEMS) {
    lines.push(`- ... ${items.length - MAX_LIST_ITEMS} more`);
  }
  return lines;
}

function bulletList(items: Array<string | null>): string[] {
  return items.filter((item): item is string => Boolean(item)).map((item) => `- ${item}`);
}

async function collectMatchingFiles(repoPath: string, pattern: RegExp): Promise<string[]> {
  const matches: string[] = [];
  for await (const filePath of walkFiles(repoPath)) {
    if (pattern.test(filePath)) {
      matches.push(filePath);
    }
  }
  return matches.slice(0, MAX_LIST_ITEMS);
}

async function resolveChunkSourcePaths(artifactPaths: string[]): Promise<string[]> {
  const sourcePaths = new Set<string>();
  for (const artifactPath of artifactPaths) {
    try {
      const text = await readFile(artifactPath, "utf8");
      const match = text.match(/^- Source path: `([^`]+)`/m);
      if (match?.[1]) {
        sourcePaths.add(match[1]);
      }
    } catch {
      continue;
    }
  }
  return [...sourcePaths];
}

function capLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }
  return [...lines.slice(0, maxLines - 1), "- ... digest truncated"];
}
