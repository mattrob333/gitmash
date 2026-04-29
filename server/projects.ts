import { mkdir } from "node:fs/promises";
import { generateProjectId, getWorkspacePaths } from "@/lib/workspace";
import type { ParsedGitHubRepo } from "@/lib/github";
import type { Project, SourceRepo } from "@/types/project";

export async function createProject(brief: string, repos: ParsedGitHubRepo[]): Promise<Project> {
  const projectId = generateProjectId();
  const paths = getWorkspacePaths(projectId);
  const now = new Date().toISOString();

  await Promise.all([
    mkdir(paths.reposRoot, { recursive: true }),
    mkdir(paths.analysisRoot, { recursive: true }),
    mkdir(paths.outputRoot, { recursive: true }),
  ]);

  return {
    id: projectId,
    brief,
    status: "created",
    sourceRepos: repos.map(toSourceRepo),
    workspacePath: paths.projectRoot,
    analysisPath: paths.analysisRoot,
    outputPath: paths.outputRoot,
    createdAt: now,
    updatedAt: now,
  };
}

function toSourceRepo(repo: ParsedGitHubRepo, index: number): SourceRepo {
  return {
    id: `repo-${index + 1}`,
    url: repo.normalizedUrl,
    owner: repo.owner,
    name: repo.name,
    slug: repo.slug,
    cloneStatus: "pending",
  };
}
