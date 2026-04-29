import { readdir } from "node:fs/promises";
import path from "node:path";
import type { FileTreeNode } from "../types/project.ts";

const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "vendor",
  "__pycache__",
]);

const EXCLUDED_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".DS_Store",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".7z",
  ".bmp",
  ".class",
  ".dll",
  ".exe",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".min.js",
  ".pdf",
  ".png",
  ".pyc",
  ".so",
  ".webp",
  ".zip",
]);

export function shouldIncludeFile(filePath: string): boolean {
  const normalizedParts = filePath.split(/[\\/]+/).filter(Boolean);

  if (normalizedParts.some((part) => EXCLUDED_DIRS.has(part))) {
    return false;
  }

  const fileName = normalizedParts.at(-1) ?? "";
  if (EXCLUDED_FILE_NAMES.has(fileName) || isSecretEnvFile(fileName)) {
    return false;
  }

  const lowerPath = filePath.toLowerCase();
  if ([...EXCLUDED_EXTENSIONS].some((extension) => lowerPath.endsWith(extension))) {
    return false;
  }

  return true;
}

export function toWorkspaceRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

export async function* walkFiles(
  rootDir: string,
  currentDir = rootDir,
): AsyncGenerator<string> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = toWorkspaceRelativePath(rootDir, absolutePath);

    if (entry.isDirectory()) {
      if (shouldIncludeFile(relativePath)) {
        yield* walkFiles(rootDir, absolutePath);
      }
      continue;
    }

    if (entry.isFile() && shouldIncludeFile(relativePath)) {
      yield relativePath;
    }
  }
}

export async function generateFileTree(rootDir: string): Promise<FileTreeNode> {
  return buildTreeNode(rootDir, rootDir);
}

function isSecretEnvFile(fileName: string): boolean {
  return fileName.startsWith(".env.") && !fileName.endsWith(".example");
}

async function buildTreeNode(rootDir: string, currentPath: string): Promise<FileTreeNode> {
  const relativePath = toWorkspaceRelativePath(rootDir, currentPath);
  const node: FileTreeNode = {
    name: relativePath ? path.basename(currentPath) : path.basename(rootDir),
    type: "dir",
    path: relativePath,
    children: [],
  };
  const entries = await readdir(currentPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const childRelativePath = toWorkspaceRelativePath(rootDir, absolutePath);

    if (!shouldIncludeFile(childRelativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const childNode = await buildTreeNode(rootDir, absolutePath);
      if (childNode.children?.length) {
        node.children?.push(childNode);
      }
    } else if (entry.isFile()) {
      node.children?.push({
        name: entry.name,
        type: "file",
        path: childRelativePath,
      });
    }
  }

  return node;
}
