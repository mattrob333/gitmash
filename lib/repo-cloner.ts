import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ParsedGitHubRepo } from "./github.ts";
import type { CommandRunner } from "./github-api.ts";

export type ClonedRepoInfo = {
  branch: string;
  commitSha: string;
  sizeBytes: number;
  primaryLanguage: string;
  cloneStatus: "cloned";
  cloneError: null;
  clonePath: string;
  clonedAt: string;
};

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

const LANGUAGE_MARKERS: Array<{ file: string; language: string }> = [
  { file: "package.json", language: "JavaScript" },
  { file: "tsconfig.json", language: "TypeScript" },
  { file: "pyproject.toml", language: "Python" },
  { file: "requirements.txt", language: "Python" },
  { file: "Cargo.toml", language: "Rust" },
  { file: "go.mod", language: "Go" },
  { file: "pom.xml", language: "Java" },
  { file: "build.gradle", language: "Java" },
  { file: "Gemfile", language: "Ruby" },
  { file: "composer.json", language: "PHP" },
  { file: "mix.exs", language: "Elixir" },
  { file: "Package.swift", language: "Swift" },
];

export async function cloneRepo(
  parsedRepo: ParsedGitHubRepo,
  workspacePath: string,
  runCommand: CommandRunner = execCommand,
): Promise<ClonedRepoInfo> {
  validateParsedRepo(parsedRepo);

  await mkdir(workspacePath, { recursive: true });

  const clonePath = path.join(workspacePath, toRepoDirectoryName(parsedRepo));
  if (await pathExists(clonePath)) {
    throw new Error(`Repository workspace already exists: ${clonePath}`);
  }

  try {
    await runCommand(
      `git clone --depth 1 ${shellEscape(parsedRepo.normalizedUrl)} ${shellEscape(clonePath)}`,
    );
  } catch (error) {
    throw new Error(classifyCloneError(error));
  }

  const [branch, commitSha, sizeBytes, primaryLanguage] = await Promise.all([
    gitOutput(clonePath, "rev-parse --abbrev-ref HEAD", runCommand),
    gitOutput(clonePath, "rev-parse HEAD", runCommand),
    getDirectorySizeBytes(clonePath, runCommand),
    detectPrimaryLanguage(clonePath),
  ]);

  return {
    branch: branch || "HEAD",
    commitSha,
    sizeBytes,
    primaryLanguage,
    cloneStatus: "cloned",
    cloneError: null,
    clonePath,
    clonedAt: new Date().toISOString(),
  };
}

export async function detectPrimaryLanguage(repoPath: string): Promise<string> {
  const rootFiles = new Set(await readdir(repoPath));

  if (rootFiles.has("tsconfig.json")) {
    return "TypeScript";
  }

  if (rootFiles.has("package.json")) {
    const packageJsonLanguage = await detectPackageJsonLanguage(path.join(repoPath, "package.json"));
    if (packageJsonLanguage) {
      return packageJsonLanguage;
    }
  }

  for (const marker of LANGUAGE_MARKERS) {
    if (rootFiles.has(marker.file)) {
      return marker.language;
    }
  }

  return detectByExtension(repoPath);
}

async function detectPackageJsonLanguage(packageJsonPath: string): Promise<string | null> {
  try {
    const data = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const deps = { ...data.dependencies, ...data.devDependencies };
    return deps.typescript || deps["@types/node"] ? "TypeScript" : "JavaScript";
  } catch {
    return "JavaScript";
  }
}

async function detectByExtension(repoPath: string): Promise<string> {
  const counts = new Map<string, number>();
  const entries = await readdir(repoPath, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    const language = extensionToLanguage(extension);
    if (!language) {
      continue;
    }

    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
}

function extensionToLanguage(extension: string): string | null {
  switch (extension) {
    case ".ts":
    case ".tsx":
      return "TypeScript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "JavaScript";
    case ".py":
      return "Python";
    case ".rs":
      return "Rust";
    case ".go":
      return "Go";
    case ".java":
      return "Java";
    case ".rb":
      return "Ruby";
    case ".php":
      return "PHP";
    default:
      return null;
  }
}

async function gitOutput(
  repoPath: string,
  gitArgs: string,
  runCommand: CommandRunner,
): Promise<string> {
  const result = await runCommand(`git -C ${shellEscape(repoPath)} ${gitArgs}`);
  return result.stdout.trim();
}

async function getDirectorySizeBytes(repoPath: string, runCommand: CommandRunner): Promise<number> {
  try {
    const result = await runCommand(`du -sk ${shellEscape(repoPath)}`);
    const blocks = Number(result.stdout.trim().split(/\s+/)[0]);
    if (Number.isFinite(blocks)) {
      return blocks * 1024;
    }
  } catch {
    // Fall back to a Node walker if du is unavailable.
  }

  return getDirectorySizeByWalking(repoPath);
}

async function getDirectorySizeByWalking(repoPath: string): Promise<number> {
  let total = 0;
  const entries = await readdir(repoPath, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(entry.parentPath, entry.name);
    total += (await stat(filePath)).size;
  }

  return total;
}

function validateParsedRepo(parsedRepo: ParsedGitHubRepo): void {
  if (
    !OWNER_RE.test(parsedRepo.owner) ||
    !REPO_RE.test(parsedRepo.name) ||
    parsedRepo.name === "." ||
    parsedRepo.name === ".." ||
    !parsedRepo.normalizedUrl
  ) {
    throw new Error("Invalid repository metadata.");
  }
}

function classifyCloneError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("repository not found") ||
    lower.includes("not found") ||
    lower.includes("authentication failed") ||
    lower.includes("could not read username")
  ) {
    return "Repository is private or does not exist.";
  }

  if (
    lower.includes("could not resolve host") ||
    lower.includes("failed to connect") ||
    lower.includes("network is unreachable") ||
    lower.includes("operation timed out")
  ) {
    return "Network failure while cloning repository.";
  }

  if (lower.includes("already exists and is not an empty directory")) {
    return "Repository workspace already exists.";
  }

  return `Unable to clone repository: ${message}`;
}

function toRepoDirectoryName(repo: ParsedGitHubRepo): string {
  return `${repo.owner}-${repo.name}`.replace(/[^A-Za-z0-9._-]/g, "-");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const parts = command.match(/(?:'[^']*'|"[^"]*"|\S)+/g) ?? [command];
    const cmd = parts[0];
    const args = parts.slice(1).map((p) => p.replace(/^['"]|['"]$/g, ""));
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const maxBuffer = 10 * 1024 * 1024;
    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > maxBuffer) stdout = stdout.slice(-maxBuffer);
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > maxBuffer) stderr = stderr.slice(-maxBuffer);
    });
    child.on("error", (error: Error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Command exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
