import path from "node:path";
import { parseRequirementName, readJsonIfExists, readTextIfExists } from "./analysis-utils.ts";
import type { DependencyAnalysis, DependencyInfo } from "../types/project.ts";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const CATEGORY_PATTERNS: Array<[DependencyInfo["category"], RegExp]> = [
  ["ui", /^(react|vue|svelte|@radix-ui|lucide|tailwind|bootstrap|mui|antd)/i],
  ["auth", /(auth|passport|next-auth|clerk|supabase|firebase)/i],
  ["database", /(prisma|drizzle|mongoose|sequelize|typeorm|pg|mysql|sqlite|redis)/i],
  ["ai", /(openai|anthropic|langchain|ai$|cohere|replicate)/i],
  ["testing", /(jest|vitest|mocha|chai|playwright|cypress|pytest|testing-library)/i],
  ["build", /(vite|webpack|rollup|esbuild|typescript|next|babel|eslint|prettier|tailwindcss)/i],
];

const RISKY_PACKAGES = new Map<string, string>([
  ["request", "deprecated npm package"],
  ["left-pad", "deprecated npm package"],
  ["node-sass", "deprecated npm package"],
  ["babel-eslint", "deprecated npm package"],
  ["crypto", "deprecated npm package; use Node built-in crypto"],
  ["pycrypto", "unmaintained Python crypto package"],
]);

export async function analyzeDependencies(repoPath: string): Promise<DependencyAnalysis> {
  const dependencies = [
    ...(await packageJsonDependencies(repoPath)),
    ...(await pyprojectDependencies(repoPath)),
    ...(await requirementsDependencies(repoPath)),
  ];

  const countsByCategory: Record<string, number> = {};
  for (const dependency of dependencies) {
    countsByCategory[dependency.category] = (countsByCategory[dependency.category] ?? 0) + 1;
  }

  return {
    dependencies,
    riskyPackages: dependencies.filter((dependency) => dependency.risk),
    countsByCategory,
  };
}

async function packageJsonDependencies(repoPath: string): Promise<DependencyInfo[]> {
  const packageJson = await readJsonIfExists<PackageJson>(path.join(repoPath, "package.json"));
  if (!packageJson) {
    return [];
  }

  return [
    ...Object.entries(packageJson.dependencies ?? {}),
    ...Object.entries(packageJson.devDependencies ?? {}),
  ].map(([name, version]) => toDependency(name, version, "package.json"));
}

async function requirementsDependencies(repoPath: string): Promise<DependencyInfo[]> {
  const text = await readTextIfExists(path.join(repoPath, "requirements.txt"));
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .map((line) => parseRequirementName(line))
    .filter((name): name is string => Boolean(name))
    .map((name) => toDependency(name, "*", "requirements.txt"));
}

async function pyprojectDependencies(repoPath: string): Promise<DependencyInfo[]> {
  const text = await readTextIfExists(path.join(repoPath, "pyproject.toml"));
  if (!text) {
    return [];
  }

  const names = new Set<string>();
  let inDependencyArray = false;
  let inPoetryDeps = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inPoetryDeps =
        trimmed === "[tool.poetry.dependencies]" ||
        trimmed.startsWith("[tool.poetry.group.") && trimmed.endsWith(".dependencies]");
      inDependencyArray = false;
      continue;
    }

    if (/^(dependencies|optional-dependencies)\s*=/.test(trimmed)) {
      inDependencyArray = true;
    }
    if (inDependencyArray) {
      for (const match of trimmed.matchAll(/["']([^"']+)["']/g)) {
        const name = parseRequirementName(match[1]);
        if (name) {
          names.add(name);
        }
      }
      if (trimmed.includes("]")) {
        inDependencyArray = false;
      }
    }

    if (inPoetryDeps) {
      const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=/);
      const name = match?.[1]?.toLowerCase();
      if (name && name !== "python") {
        names.add(name);
      }
    }
  }

  return [...names].map((name) => toDependency(name, "*", "pyproject.toml"));
}

function toDependency(
  name: string,
  version: string,
  source: DependencyInfo["source"],
): DependencyInfo {
  const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(name))?.[0] ?? "other";
  const risk = RISKY_PACKAGES.get(name.toLowerCase());
  return risk ? { name, version, source, category, risk } : { name, version, source, category };
}
