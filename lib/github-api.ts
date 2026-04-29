import { exec } from "node:child_process";

export type RepoValidation = {
  exists: boolean;
  isPublic: boolean;
  defaultBranch: string | null;
  description: string | null;
  topics: string[];
  statusCode: number;
  error: string | null;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string) => Promise<CommandResult>;

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

export async function validateRepoExists(
  owner: string,
  name: string,
  runCommand: CommandRunner = execCommand,
): Promise<RepoValidation> {
  if (!OWNER_RE.test(owner) || !REPO_RE.test(name) || name === "." || name === "..") {
    throw new Error("Repository owner or name is invalid.");
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${name}`;
  const head = await runCommand(`curl -sI ${shellEscape(apiUrl)}`);
  const statusCode = parseHttpStatus(head.stdout);
  const headers = parseHeaders(head.stdout);

  if (statusCode === 403 && headers.get("x-ratelimit-remaining") === "0") {
    return {
      exists: false,
      isPublic: false,
      defaultBranch: null,
      description: null,
      topics: [],
      statusCode,
      error: "GitHub API rate limit exceeded. Try again later.",
    };
  }

  if (statusCode === 404) {
    return {
      exists: false,
      isPublic: false,
      defaultBranch: null,
      description: null,
      topics: [],
      statusCode,
      error: `Repository ${owner}/${name} does not exist or is private.`,
    };
  }

  if (statusCode < 200 || statusCode >= 300) {
    return {
      exists: false,
      isPublic: false,
      defaultBranch: null,
      description: null,
      topics: [],
      statusCode,
      error: `GitHub API returned HTTP ${statusCode || "unknown"} for ${owner}/${name}.`,
    };
  }

  const metadata = await fetchRepoMetadata(apiUrl, runCommand);

  return {
    exists: true,
    isPublic: true,
    defaultBranch: metadata.defaultBranch,
    description: metadata.description,
    topics: metadata.topics,
    statusCode,
    error: null,
  };
}

async function fetchRepoMetadata(
  apiUrl: string,
  runCommand: CommandRunner,
): Promise<Pick<RepoValidation, "defaultBranch" | "description" | "topics">> {
  try {
    const response = await runCommand(
      `curl -s -H ${shellEscape("Accept: application/vnd.github+json")} ${shellEscape(apiUrl)}`,
    );
    const body = JSON.parse(response.stdout) as {
      default_branch?: unknown;
      description?: unknown;
      topics?: unknown;
    };

    return {
      defaultBranch: typeof body.default_branch === "string" ? body.default_branch : null,
      description: typeof body.description === "string" ? body.description : null,
      topics: Array.isArray(body.topics)
        ? body.topics.filter((topic): topic is string => typeof topic === "string")
        : [],
    };
  } catch {
    return {
      defaultBranch: null,
      description: null,
      topics: [],
    };
  }
}

function execCommand(command: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function parseHttpStatus(rawHeaders: string): number {
  const statuses = [...rawHeaders.matchAll(/^HTTP\/\S+\s+(\d{3})/gim)];
  const last = statuses.at(-1);
  return last ? Number(last[1]) : 0;
}

function parseHeaders(rawHeaders: string): Map<string, string> {
  const headers = new Map<string, string>();

  for (const line of rawHeaders.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    headers.set(
      line.slice(0, separatorIndex).trim().toLowerCase(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return headers;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
