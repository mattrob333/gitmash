import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathExists, readJsonIfExists, readTextIfExists } from "./analysis-utils.ts";
import { analyzeDependencies } from "./dependency-analyzer.ts";
import { walkFiles } from "./file-filter.ts";
import type { RiskReport } from "../types/project.ts";

type PackageJson = {
  main?: string;
  scripts?: Record<string, string>;
};

const SECRET_RE = /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{20,}/i;

export async function generateRiskReport(repoPath: string): Promise<RiskReport> {
  const risks: RiskReport["risks"] = [];
  let testFileCount = 0;
  let jsFileCount = 0;
  let tsFileCount = 0;
  let largeFileCount = 0;

  for await (const filePath of walkFiles(repoPath)) {
    if (/\.(test|spec)\.(js|jsx|ts|tsx|py)$/.test(filePath) || filePath.includes("__tests__/")) {
      testFileCount += 1;
    }
    if (/\.(js|jsx)$/.test(filePath)) {
      jsFileCount += 1;
    }
    if (/\.(ts|tsx)$/.test(filePath)) {
      tsFileCount += 1;
    }

    if (/\.(js|jsx|ts|tsx|py)$/.test(filePath)) {
      const source = await readFile(path.join(repoPath, filePath), "utf8");
      const lineCount = source.split(/\r?\n/).length;
      if (lineCount > 500 || (await stat(path.join(repoPath, filePath))).size > 200_000) {
        largeFileCount += 1;
        risks.push({ id: "large-file", severity: "medium", message: "Large or complex file", path: filePath });
      }
      if (SECRET_RE.test(source)) {
        risks.push({ id: "hardcoded-secret", severity: "high", message: "Possible hardcoded secret", path: filePath });
      }
    }
  }

  if (testFileCount === 0) {
    risks.push({ id: "missing-tests", severity: "medium", message: "No test files detected" });
  }
  if (tsFileCount > 0 && jsFileCount > tsFileCount) {
    risks.push({ id: "untyped-files", severity: "low", message: "JavaScript files outnumber TypeScript files" });
  }
  if (!(await hasEntryPoint(repoPath))) {
    risks.push({ id: "missing-entry-point", severity: "medium", message: "No clear application entry point detected" });
  }
  if (await hasUnignoredEnvFile(repoPath)) {
    risks.push({ id: "env-not-ignored", severity: "high", message: ".env file is present and not ignored by .gitignore" });
  }

  const dependencyAnalysis = await analyzeDependencies(repoPath);
  for (const dependency of dependencyAnalysis.riskyPackages) {
    risks.push({
      id: "risky-dependency",
      severity: "medium",
      message: `${dependency.name}: ${dependency.risk}`,
      path: dependency.source,
    });
  }

  return {
    risks,
    metrics: { testFileCount, jsFileCount, tsFileCount, largeFileCount },
  };
}

async function hasEntryPoint(repoPath: string): Promise<boolean> {
  const packageJson = await readJsonIfExists<PackageJson>(path.join(repoPath, "package.json"));
  if (packageJson?.main || packageJson?.scripts?.start || packageJson?.scripts?.dev) {
    return true;
  }

  const markers = ["app/page.tsx", "pages/index.tsx", "src/index.tsx", "src/main.tsx", "main.py", "manage.py"];
  for (const marker of markers) {
    if (await pathExists(path.join(repoPath, marker))) {
      return true;
    }
  }

  return false;
}

async function hasUnignoredEnvFile(repoPath: string): Promise<boolean> {
  const entries = await safeReadDir(repoPath);
  const hasEnv = entries.some((entry) => entry === ".env" || entry.startsWith(".env."));
  if (!hasEnv) {
    return false;
  }

  const gitignore = await readTextIfExists(path.join(repoPath, ".gitignore"));
  return !gitignore?.split(/\r?\n/).some((line) => line.trim() === ".env" || line.trim() === ".env*");
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}
