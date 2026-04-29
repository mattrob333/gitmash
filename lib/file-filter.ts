import path from "node:path";

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

function isSecretEnvFile(fileName: string): boolean {
  return fileName.startsWith(".env.") && !fileName.endsWith(".example");
}
