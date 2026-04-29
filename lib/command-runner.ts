import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommandType, DetectedCommand } from "./command-detector.ts";

export type CommandExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

export type TestSummary = {
  passed: number | null;
  failed: number | null;
  total: number | null;
};

export type LintSummary = {
  errorCount: number | null;
  messages: string[];
};

export type ValidationCommandResult = CommandExecutionResult & {
  command: CommandType;
  runCommand: string;
  testSummary?: TestSummary;
  lintSummary?: LintSummary;
  outputPath?: string;
};

export type ValidationRunResult = {
  success: boolean;
  commands: ValidationCommandResult[];
  failures: ValidationCommandResult[];
};

export type CommandExecutor = (
  projectDir: string,
  runCommand: string,
  commandType: CommandType,
) => Promise<CommandExecutionResult>;

export type ValidationRunOptions = {
  commandsToRun?: Array<CommandType | string>;
  saveFailuresDir?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

const VALIDATION_ORDER: CommandType[] = ["install", "lint", "typecheck", "test", "build"];

export async function executeCommand(
  projectDir: string,
  runCommand: string,
  _commandType?: CommandType,
  options: Pick<ValidationRunOptions, "env" | "timeoutMs"> = {},
): Promise<CommandExecutionResult> {
  const [file, ...args] = splitCommand(runCommand);
  if (!file) {
    return { stdout: "", stderr: "No command provided.", exitCode: 1, success: false };
  }

  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: projectDir,
        env: { ...process.env, ...options.env },
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        const exitCode = typeof (error as NodeJS.ErrnoException | null)?.code === "number"
          ? Number((error as NodeJS.ErrnoException).code)
          : error
            ? 1
            : 0;
        resolve({
          stdout,
          stderr,
          exitCode,
          success: exitCode === 0,
        });
      },
    );
  });
}

export async function runValidationCommands(
  projectDir: string,
  detectedCommands: DetectedCommand[],
  options: ValidationRunOptions = {},
  executor: CommandExecutor = (dir, command, type) => executeCommand(dir, command, type, options),
): Promise<ValidationRunResult> {
  const selected = new Set(options.commandsToRun?.map(String) ?? VALIDATION_ORDER);
  const byType = new Map(detectedCommands.map((command) => [command.command, command]));
  const commandResults: ValidationCommandResult[] = [];

  const install = byType.get("install");
  if (shouldRun(install, selected)) {
    commandResults.push(await runOne(projectDir, install, options, executor));
    if (!last(commandResults).success) {
      return finish(commandResults);
    }
  }

  const lintAndTypes = await Promise.all(
    (["lint", "typecheck"] as const)
      .map((commandType) => byType.get(commandType))
      .filter((command): command is DetectedCommand => shouldRun(command, selected))
      .map((command) => runOne(projectDir, command, options, executor)),
  );
  commandResults.push(...lintAndTypes);

  const test = byType.get("test");
  if (shouldRun(test, selected)) {
    commandResults.push(await runOne(projectDir, test, options, executor));
  }

  const build = byType.get("build");
  if (shouldRun(build, selected)) {
    commandResults.push(await runOne(projectDir, build, options, executor));
  }

  return finish(commandResults);
}

export function parseTestOutput(output: string): TestSummary {
  const lines = output.split(/\r?\n/);
  const summary: TestSummary = { passed: null, failed: null, total: null };
  for (const line of lines) {
    const normalized = line.toLowerCase();
    const testsMatch = normalized.match(/tests?\s+(\d+)\s+passed(?:.*?)(\d+)\s+failed/)
      ?? normalized.match(/(\d+)\s+passed(?:.*?)(\d+)\s+failed/);
    if (testsMatch) {
      summary.passed = Number(testsMatch[1]);
      summary.failed = Number(testsMatch[2]);
    }

    const failedFirst = normalized.match(/(\d+)\s+failed(?:.*?)(\d+)\s+passed/);
    if (failedFirst) {
      summary.failed = Number(failedFirst[1]);
      summary.passed = Number(failedFirst[2]);
    }

    const pytest = normalized.match(/=+\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed)(?:,\s*(\d+)\s+skipped)?\s+in\s+/);
    if (pytest) {
      summary.failed = Number(pytest[1] ?? 0);
      summary.passed = Number(pytest[2] ?? 0);
    }

    const jestTests = normalized.match(/tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/);
    if (jestTests) {
      summary.failed = Number(jestTests[1] ?? 0);
      summary.passed = Number(jestTests[2] ?? 0);
      summary.total = Number(jestTests[3]);
    }
  }
  if (summary.total === null && (summary.passed !== null || summary.failed !== null)) {
    summary.total = (summary.passed ?? 0) + (summary.failed ?? 0);
  }
  return summary;
}

export function parseLintOutput(output: string): LintSummary {
  const messages = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /error|warning|\d+:\d+/.test(line.toLowerCase()))
    .slice(0, 20);
  const summaryMatch = output.match(/(\d+)\s+(?:problems?|errors?|failures?)/i)
    ?? output.match(/found\s+(\d+)\s+errors?/i);
  const explicitErrors = output.match(/(\d+)\s+errors?/i);
  return {
    errorCount: explicitErrors ? Number(explicitErrors[1]) : summaryMatch ? Number(summaryMatch[1]) : null,
    messages,
  };
}

function shouldRun(command: DetectedCommand | undefined, selected: Set<string>): command is DetectedCommand {
  return Boolean(command?.detected && command.runCommand && selected.has(command.command));
}

async function runOne(
  projectDir: string,
  command: DetectedCommand,
  options: ValidationRunOptions,
  executor: CommandExecutor,
): Promise<ValidationCommandResult> {
  const result = await executor(projectDir, command.runCommand ?? "", command.command);
  const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();
  const validationResult: ValidationCommandResult = {
    ...result,
    command: command.command,
    runCommand: command.runCommand ?? "",
  };
  if (command.command === "test") {
    validationResult.testSummary = parseTestOutput(combinedOutput);
  }
  if (command.command === "lint") {
    validationResult.lintSummary = parseLintOutput(combinedOutput);
  }
  if (!validationResult.success && options.saveFailuresDir) {
    validationResult.outputPath = await saveFailureOutput(options.saveFailuresDir, validationResult);
  }
  return validationResult;
}

async function saveFailureOutput(outputDir: string, result: ValidationCommandResult): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const fileName = `${result.command}-failure.txt`;
  const outputPath = path.join(outputDir, fileName);
  const body = [
    `command: ${result.runCommand}`,
    `exitCode: ${result.exitCode}`,
    "",
    "stdout:",
    result.stdout,
    "",
    "stderr:",
    result.stderr,
  ].join("\n");
  await writeFile(outputPath, body.endsWith("\n") ? body : `${body}\n`);
  return outputPath;
}

function finish(commands: ValidationCommandResult[]): ValidationRunResult {
  const failures = commands.filter((command) => !command.success);
  return {
    success: failures.length === 0,
    commands,
    failures,
  };
}

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  for (const match of command.matchAll(regex)) {
    parts.push(match[1] ?? match[2] ?? match[0]);
  }
  return parts;
}

function last<T>(values: T[]): T {
  return values[values.length - 1];
}
