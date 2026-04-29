import path from "node:path";

export type WorkspacePaths = {
  projectRoot: string;
  reposRoot: string;
  analysisRoot: string;
  outputRoot: string;
};

const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{7,80}$/;

export function generateProjectId(): string {
  return `proj-${crypto.randomUUID()}`;
}

export function getWorkspacePaths(projectId: string, rootDir = process.cwd()): WorkspacePaths {
  if (!PROJECT_ID_RE.test(projectId)) {
    throw new Error("Invalid project id.");
  }

  return {
    projectRoot: path.join(rootDir, "workspaces", projectId),
    reposRoot: path.join(rootDir, "workspaces", projectId, "repositories"),
    analysisRoot: path.join(rootDir, "analysis", projectId),
    outputRoot: path.join(rootDir, "output", projectId),
  };
}
