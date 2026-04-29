import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists, readJsonIfExists, readTextIfExists } from "./analysis-utils.ts";
import type { DetectedCommand, CommandType } from "./command-detector.ts";
import {
  runValidationCommands,
  type CommandExecutor,
  type ValidationCommandResult,
  type ValidationRunResult,
} from "./command-runner.ts";

export type RepairConfig = {
  maxAttempts?: number;
  commandsToRun?: string[];
};

export type RepairLogEntry = {
  attempt: number;
  command: CommandType;
  issue: string;
  fix: string;
  success: boolean;
};

export type RepairResult = {
  success: boolean;
  attempts: number;
  failures: ValidationCommandResult[];
  repairLog: RepairLogEntry[];
  validation?: ValidationRunResult;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

const DEFAULT_MAX_ATTEMPTS = 3;

export async function runRepairLoop(
  projectDir: string,
  detectedCommands: DetectedCommand[],
  initialValidation: ValidationRunResult,
  config: RepairConfig = {},
  executor?: CommandExecutor,
): Promise<RepairResult> {
  const maxAttempts = Math.max(0, Math.min(config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS));
  let validation = initialValidation;
  const repairLog: RepairLogEntry[] = [];
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts && !validation.success; attempt += 1) {
    attempts = attempt;
    const beforeFailures = validation.failures;
    for (const failure of beforeFailures) {
      const entry = await repairFailure(projectDir, attempt, failure);
      if (failure.command === "install" && entry.fix.includes("--legacy-peer-deps")) {
        const installCommand = detectedCommands.find((command) => command.command === "install");
        if (installCommand) {
          installCommand.runCommand = "npm install --legacy-peer-deps";
        }
      }
      repairLog.push(entry);
    }

    validation = await runValidationCommands(
      projectDir,
      detectedCommands,
      {
        commandsToRun: config.commandsToRun,
        saveFailuresDir: path.join(projectDir, ".gitmash-validation"),
      },
      executor,
    );

    markHelpedRepairs(repairLog, attempt, beforeFailures, validation.failures);
  }

  return {
    success: validation.success,
    attempts,
    failures: validation.failures,
    repairLog,
    validation,
  };
}

async function repairFailure(projectDir: string, attempt: number, failure: ValidationCommandResult): Promise<RepairLogEntry> {
  const issue = firstIssue(failure);
  if (failure.command === "install") {
    return {
      attempt,
      command: failure.command,
      issue,
      fix: await repairInstall(projectDir, failure),
      success: false,
    };
  }
  if (failure.command === "typecheck") {
    return {
      attempt,
      command: failure.command,
      issue,
      fix: await repairTypecheck(projectDir, failure),
      success: false,
    };
  }
  if (failure.command === "test") {
    return {
      attempt,
      command: failure.command,
      issue,
      fix: await repairTest(projectDir, failure),
      success: false,
    };
  }
  if (failure.command === "build") {
    return {
      attempt,
      command: failure.command,
      issue,
      fix: await repairBuild(projectDir, failure),
      success: false,
    };
  }
  return {
    attempt,
    command: failure.command,
    issue,
    fix: "No safe automatic lint repair is available.",
    success: false,
  };
}

async function repairInstall(projectDir: string, failure: ValidationCommandResult): Promise<string> {
  const packageJsonPath = path.join(projectDir, "package.json");
  const packageJsonText = await readTextIfExists(packageJsonPath);
  if (packageJsonText) {
    try {
      JSON.parse(packageJsonText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid JSON";
      return `Checked package.json syntax; JSON is invalid (${message}) and was left unchanged.`;
    }
  }
  if (failure.runCommand === "npm install") {
    failure.runCommand = "npm install --legacy-peer-deps";
    return "Will retry npm install with --legacy-peer-deps.";
  }
  return "Checked install inputs; no safe manifest edit was available.";
}

async function repairTypecheck(projectDir: string, failure: ValidationCommandResult): Promise<string> {
  const output = combinedOutput(failure);
  const fixes: string[] = [];
  if (/Cannot find module ['"]@\//.test(output)) {
    await ensureTsconfigPaths(projectDir);
    fixes.push("added tsconfig @/* path mapping");
  }

  const missingTypes = [...output.matchAll(/Could not find a declaration file for module ['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
  if (missingTypes.length) {
    await addTypeStubs(projectDir, missingTypes);
    fixes.push(`added type stubs for ${missingTypes.join(", ")}`);
  }

  return fixes.length ? fixes.join("; ") : "No safe typecheck repair matched the failure output.";
}

async function repairTest(projectDir: string, failure: ValidationCommandResult): Promise<string> {
  const output = combinedOutput(failure);
  const importMatches = [...output.matchAll(/Cannot find module ['"]([^'"]+)['"]/g)].map((match) => match[1]);
  if (importMatches.length) {
    const fixed = await addMissingRelativeImportExtensions(projectDir, importMatches);
    if (fixed) {
      return "Updated test imports to include existing file extensions.";
    }
  }
  if (/SyntaxError|Unexpected token|unterminated/i.test(output)) {
    return "Detected syntax error in tests; no safe automatic syntax rewrite was applied.";
  }
  return "No safe test repair matched the failure output.";
}

async function repairBuild(projectDir: string, failure: ValidationCommandResult): Promise<string> {
  const output = combinedOutput(failure);
  const missingImports = [
    ...output.matchAll(/(?:Cannot find module|Can't resolve)\s+['"]([^'"]+)['"]/g),
    ...output.matchAll(/Module not found:[^\n]*?resolve\s+['"]([^'"]+)['"]/g),
  ]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith(".") || specifier.startsWith("@/"));
  if (missingImports.length) {
    const created = await addMissingFilesForImports(projectDir, missingImports);
    if (created.length) {
      return `Added placeholder files for missing imports: ${created.join(", ")}.`;
    }
  }
  const fixedImports = await addMissingRelativeImportExtensions(projectDir, missingImports);
  return fixedImports ? "Updated build imports to include existing file extensions." : "No safe build repair matched the failure output.";
}

async function ensureTsconfigPaths(projectDir: string): Promise<void> {
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  const tsconfig = await readJsonIfExists<Record<string, unknown>>(tsconfigPath) ?? {};
  const compilerOptions = isRecord(tsconfig.compilerOptions) ? tsconfig.compilerOptions : {};
  const paths = isRecord(compilerOptions.paths) ? compilerOptions.paths : {};
  compilerOptions.baseUrl = typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : ".";
  paths["@/*"] = Array.isArray(paths["@/*"]) ? paths["@/*"] : ["./*"];
  compilerOptions.paths = paths;
  tsconfig.compilerOptions = compilerOptions;
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

async function addTypeStubs(projectDir: string, moduleNames: string[]): Promise<void> {
  const typesDir = path.join(projectDir, "types");
  await mkdir(typesDir, { recursive: true });
  const uniqueNames = [...new Set(moduleNames)];
  const declarations = uniqueNames.map((moduleName) => `declare module ${JSON.stringify(moduleName)};`).join("\n");
  await writeFile(path.join(typesDir, "gitmash-stubs.d.ts"), `${declarations}\n`);
}

async function addMissingRelativeImportExtensions(projectDir: string, specifiers: string[]): Promise<boolean> {
  const files = await collectSourceFiles(projectDir);
  let changed = false;
  for (const filePath of files) {
    let text = await readFile(filePath, "utf8");
    const original = text;
    for (const specifier of specifiers.filter((item) => item.startsWith("."))) {
      for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
        const candidate = path.resolve(path.dirname(filePath), `${specifier}${extension}`);
        if (await pathExists(candidate)) {
          text = text.replaceAll(`"${specifier}"`, `"${specifier}${extension}"`);
          text = text.replaceAll(`'${specifier}'`, `'${specifier}${extension}'`);
        }
      }
    }
    if (text !== original) {
      await writeFile(filePath, text);
      changed = true;
    }
  }
  return changed;
}

async function addMissingFilesForImports(projectDir: string, specifiers: string[]): Promise<string[]> {
  const created: string[] = [];
  for (const specifier of [...new Set(specifiers)]) {
    const relativePath = specifier.startsWith("@/")
      ? specifier.slice(2)
      : specifier.replace(/^\.\.?\//, "");
    if (!relativePath || relativePath.includes("..")) {
      continue;
    }
    const target = path.join(projectDir, withSourceExtension(relativePath));
    if (await pathExists(target)) {
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "export {};\n");
    created.push(path.relative(projectDir, target).split(path.sep).join("/"));
  }
  return created;
}

async function collectSourceFiles(projectDir: string, dir = projectDir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (["node_modules", ".git", ".next", "dist", "build"].includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(projectDir, entryPath));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function markHelpedRepairs(
  log: RepairLogEntry[],
  attempt: number,
  beforeFailures: ValidationCommandResult[],
  afterFailures: ValidationCommandResult[],
): void {
  const after = new Set(afterFailures.map((failure) => failure.command));
  for (const entry of log.filter((item) => item.attempt === attempt)) {
    entry.success = beforeFailures.some((failure) => failure.command === entry.command) && !after.has(entry.command);
  }
}

function firstIssue(failure: ValidationCommandResult): string {
  return combinedOutput(failure).split(/\r?\n/).find(Boolean)?.slice(0, 240) ?? `${failure.command} failed`;
}

function combinedOutput(failure: ValidationCommandResult): string {
  return `${failure.stdout}\n${failure.stderr}`.trim();
}

function withSourceExtension(relativePath: string): string {
  return /\.[A-Za-z0-9]+$/.test(relativePath) ? relativePath : `${relativePath}.ts`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
