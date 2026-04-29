import { readdir } from "node:fs/promises";
import path from "node:path";
import { mergeDependencies, pathExists, readJsonIfExists, readTextIfExists } from "./analysis-utils.ts";
import type { StackDetection } from "../types/project.ts";

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export async function detectStack(repoPath: string): Promise<StackDetection> {
  const packageJson = await readJsonIfExists<PackageJson>(path.join(repoPath, "package.json"));
  const deps = mergeDependencies(packageJson);
  const rootFiles = new Set(await safeReadDir(repoPath));
  const detected: string[] = [];

  if (hasAnyPrefix(rootFiles, "next.config.") || rootFiles.has("next-env.d.ts") || deps.next) {
    detected.push("Next.js");
  }
  if (hasAnyPrefix(rootFiles, "vite.config.") || deps.vite) {
    detected.push("Vite");
  }
  if (
    !detected.includes("Next.js") &&
    !detected.includes("Vite") &&
    (deps.react ||
      (await pathExists(path.join(repoPath, "src", "App.tsx"))) ||
      packageJson?.dependencies?.["react-scripts"])
  ) {
    detected.push("React");
  }
  if (deps.express) {
    detected.push("Express");
  }
  if (await hasPythonDep(repoPath, "fastapi")) {
    detected.push("FastAPI");
  }
  if (await hasPythonDep(repoPath, "flask")) {
    detected.push("Flask");
  }
  if ((await pathExists(path.join(repoPath, "manage.py"))) || (await hasPythonDep(repoPath, "django"))) {
    detected.push("Django");
  }

  const primary = detected[0] ?? "Unknown";
  return {
    primary,
    secondary: detected.slice(1),
    confidence: primary === "Unknown" ? 0 : primary === "React" ? 0.75 : 0.9,
  };
}

export async function detectPackageManager(repoPath: string): Promise<string> {
  const markers: Array<[string, string]> = [
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lockb", "bun"],
    ["Gemfile.lock", "bundler"],
    ["Cargo.toml", "cargo"],
  ];

  for (const [fileName, manager] of markers) {
    if (await pathExists(path.join(repoPath, fileName))) {
      return manager;
    }
  }

  const pyproject = await readTextIfExists(path.join(repoPath, "pyproject.toml"));
  if (pyproject) {
    return pyproject.includes("[tool.poetry]") ? "poetry" : "pip";
  }

  if (await pathExists(path.join(repoPath, "requirements.txt"))) {
    return "pip";
  }

  return "unknown";
}

export async function detectTestFramework(repoPath: string): Promise<string[]> {
  const packageJson = await readJsonIfExists<PackageJson>(path.join(repoPath, "package.json"));
  const deps = mergeDependencies(packageJson);
  const rootFiles = new Set(await safeReadDir(repoPath));
  const frameworks = new Set<string>();

  if (deps.jest || rootFiles.has("jest.config.js") || rootFiles.has("jest.config.ts")) {
    frameworks.add("jest");
  }
  if (deps.vitest || rootFiles.has("vitest.config.js") || rootFiles.has("vitest.config.ts")) {
    frameworks.add("vitest");
  }
  if (deps.mocha || rootFiles.has(".mocharc.json")) {
    frameworks.add("mocha");
  }
  if (await hasPythonDep(repoPath, "pytest")) {
    frameworks.add("pytest");
  }

  return [...frameworks].sort();
}

async function hasPythonDep(repoPath: string, depName: string): Promise<boolean> {
  const requirementText = await readTextIfExists(path.join(repoPath, "requirements.txt"));
  const pyprojectText = await readTextIfExists(path.join(repoPath, "pyproject.toml"));
  const depPattern = new RegExp(`(^|["'\\s])${depName}([<>=~!\\[;"'\\s]|$)`, "im");
  return depPattern.test(requirementText ?? "") || depPattern.test(pyprojectText ?? "");
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

function hasAnyPrefix(files: Set<string>, prefix: string): boolean {
  return [...files].some((file) => file.startsWith(prefix));
}
