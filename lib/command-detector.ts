import { existsSync } from "node:fs";
import path from "node:path";
import { pathExists, readJsonIfExists, readTextIfExists } from "./analysis-utils.ts";

export type CommandType = "install" | "lint" | "typecheck" | "test" | "build";

export type DetectedCommand = {
  command: CommandType;
  detected: boolean;
  runCommand: string | null;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const COMMAND_ORDER: CommandType[] = ["install", "lint", "typecheck", "test", "build"];

export async function detectProjectCommands(projectDir: string): Promise<DetectedCommand[]> {
  const packageJson = await readJsonIfExists<PackageJson>(path.join(projectDir, "package.json"));
  const dependencies = mergeDependencies(packageJson);
  const [requirementsText, pyprojectText] = await Promise.all([
    readTextIfExists(path.join(projectDir, "requirements.txt")),
    readTextIfExists(path.join(projectDir, "pyproject.toml")),
  ]);
  const pythonPackages = pythonDependencyNames(requirementsText, pyprojectText);

  const commands = new Map<CommandType, string | null>();
  commands.set("install", await detectInstall(projectDir, packageJson, pyprojectText));
  commands.set("lint", await detectLint(projectDir, packageJson, dependencies, pythonPackages));
  commands.set("typecheck", await detectTypecheck(projectDir, packageJson, dependencies, pythonPackages));
  commands.set("test", await detectTest(projectDir, packageJson, dependencies, pythonPackages));
  commands.set("build", await detectBuild(projectDir, packageJson, dependencies));

  return COMMAND_ORDER.map((command) => {
    const runCommand = commands.get(command) ?? null;
    return { command, detected: Boolean(runCommand), runCommand };
  });
}

async function detectInstall(projectDir: string, packageJson: PackageJson | null, pyprojectText: string | null): Promise<string | null> {
  if (packageJson || await pathExists(path.join(projectDir, "package-lock.json"))) {
    return "npm install";
  }
  if (pyprojectText && /(^|\n)\s*\[tool\.poetry\]/.test(pyprojectText)) {
    return "poetry install";
  }
  if (await pathExists(path.join(projectDir, "requirements.txt"))) {
    return "pip install -r requirements.txt";
  }
  return null;
}

async function detectLint(
  projectDir: string,
  packageJson: PackageJson | null,
  dependencies: Set<string>,
  pythonPackages: Set<string>,
): Promise<string | null> {
  const script = npmScript(packageJson, ["lint"]);
  if (script) {
    return script;
  }
  if (hasNodeTool(projectDir, dependencies, "eslint")) {
    return "npx --no-install eslint .";
  }
  if (hasNodeTool(projectDir, dependencies, "tslint")) {
    return "npx --no-install tslint -p tsconfig.json";
  }
  if (hasNodeTool(projectDir, dependencies, "next")) {
    return "npx --no-install next lint";
  }
  if (pythonPackages.has("ruff") || await hasExecutable(projectDir, "ruff")) {
    return "ruff check .";
  }
  return null;
}

async function detectTypecheck(
  projectDir: string,
  packageJson: PackageJson | null,
  dependencies: Set<string>,
  pythonPackages: Set<string>,
): Promise<string | null> {
  const script = npmScript(packageJson, ["typecheck", "type-check", "check-types"]);
  if (script) {
    return script;
  }
  if (hasNodeTool(projectDir, dependencies, "typescript", "tsc")) {
    return "npx --no-install tsc --noEmit";
  }
  if (pythonPackages.has("mypy") || await hasExecutable(projectDir, "mypy")) {
    return "python -m mypy .";
  }
  if (pythonPackages.has("pyright") || hasNodeTool(projectDir, dependencies, "pyright")) {
    return hasNodeTool(projectDir, dependencies, "pyright") ? "npx --no-install pyright" : "pyright";
  }
  return null;
}

async function detectTest(
  projectDir: string,
  packageJson: PackageJson | null,
  dependencies: Set<string>,
  pythonPackages: Set<string>,
): Promise<string | null> {
  const script = npmScript(packageJson, ["test"]);
  if (script) {
    return script;
  }
  if (hasNodeTool(projectDir, dependencies, "vitest")) {
    return "npx --no-install vitest run";
  }
  if (hasNodeTool(projectDir, dependencies, "jest")) {
    return "npx --no-install jest";
  }
  if (pythonPackages.has("pytest") || await hasExecutable(projectDir, "pytest")) {
    return "python -m pytest";
  }
  if (hasNodeTool(projectDir, dependencies, "mocha")) {
    return "npx --no-install mocha";
  }
  return null;
}

async function detectBuild(
  projectDir: string,
  packageJson: PackageJson | null,
  dependencies: Set<string>,
): Promise<string | null> {
  const script = npmScript(packageJson, ["build"]);
  if (script) {
    return script;
  }
  if (hasNodeTool(projectDir, dependencies, "next")) {
    return "npx --no-install next build";
  }
  if (hasNodeTool(projectDir, dependencies, "vite")) {
    return "npx --no-install vite build";
  }
  if (hasNodeTool(projectDir, dependencies, "typescript", "tsc")) {
    return "npx --no-install tsc";
  }
  return null;
}

function npmScript(packageJson: PackageJson | null, scriptNames: string[]): string | null {
  if (!packageJson?.scripts) {
    return null;
  }
  for (const scriptName of scriptNames) {
    if (packageJson.scripts[scriptName]) {
      return `npm run ${scriptName}`;
    }
  }
  return null;
}

function mergeDependencies(packageJson: PackageJson | null): Set<string> {
  return new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
  ]);
}

function hasNodeTool(projectDir: string, dependencies: Set<string>, packageName: string, binaryName = packageName): boolean {
  return dependencies.has(packageName) || pathExistsSync(path.join(projectDir, "node_modules", ".bin", binaryName));
}

async function hasExecutable(projectDir: string, binaryName: string): Promise<boolean> {
  return pathExists(path.join(projectDir, ".venv", "bin", binaryName));
}

function pythonDependencyNames(requirementsText: string | null, pyprojectText: string | null): Set<string> {
  const names = new Set<string>();
  for (const line of (requirementsText ?? "").split(/\r?\n/)) {
    const name = line.replace(/#.*/, "").trim().split(/[<>=~!;\[\s]/)[0]?.toLowerCase();
    if (name) {
      names.add(name);
    }
  }
  for (const match of (pyprojectText ?? "").matchAll(/["']?([A-Za-z0-9_.-]+)["']?\s*(?:=|[<>=~!])/g)) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

function pathExistsSync(filePath: string): boolean {
  return existsSync(filePath);
}
