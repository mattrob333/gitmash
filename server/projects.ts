import { mkdir } from "node:fs/promises";
import path from "node:path";
import { validateRepoExists, type CommandRunner } from "@/lib/github-api";
import { generateProjectId, getWorkspacePaths } from "@/lib/workspace";
import type { ParsedGitHubRepo } from "@/lib/github";
import { cloneRepo } from "@/lib/repo-cloner";
import type { Project, SourceRepo } from "@/types/project";

const projects = new Map<string, Project>();

export async function createProject(brief: string, repos: ParsedGitHubRepo[]): Promise<Project> {
  const projectId = generateProjectId();
  const paths = getWorkspacePaths(projectId);
  const now = new Date().toISOString();

  await Promise.all([
    mkdir(paths.reposRoot, { recursive: true }),
    mkdir(paths.analysisRoot, { recursive: true }),
    mkdir(paths.outputRoot, { recursive: true }),
  ]);

  const project: Project = {
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

  projects.set(project.id, project);
  return project;
}

export function getProject(projectId: string): Project | null {
  return projects.get(projectId) ?? null;
}

export async function validateRepos(
  project: Project,
  runCommand?: CommandRunner,
): Promise<Project> {
  project.status = "validating";
  project.updatedAt = new Date().toISOString();

  const validations = await Promise.all(
    project.sourceRepos.map((repo) => validateRepoExists(repo.owner, repo.name, runCommand)),
  );
  const invalidIndex = validations.findIndex((validation) => !validation.exists || !validation.isPublic);

  project.sourceRepos = project.sourceRepos.map((repo, index) => {
    const validation = validations[index];

    return {
      ...repo,
      branch: validation.defaultBranch ?? repo.branch,
      description: validation.description,
      topics: validation.topics,
      cloneError: validation.error,
    };
  });

  if (invalidIndex >= 0) {
    const invalidRepo = project.sourceRepos[invalidIndex];
    project.status = "failed";
    project.updatedAt = new Date().toISOString();
    projects.set(project.id, project);
    throw new Error(
      invalidRepo.cloneError ??
        `Repository ${invalidRepo.slug} does not exist, is private, or is unavailable.`,
    );
  }

  project.status = "created";
  project.updatedAt = new Date().toISOString();
  projects.set(project.id, project);
  return project;
}

export async function cloneProjectRepos(
  project: Project,
  runCommand?: CommandRunner,
): Promise<Project> {
  project.status = "cloning";
  project.updatedAt = new Date().toISOString();
  projects.set(project.id, project);

  const reposRoot = path.join(project.workspacePath, "repositories");

  for (const sourceRepo of project.sourceRepos) {
    sourceRepo.cloneStatus = "cloning";
    sourceRepo.cloneError = null;
    project.updatedAt = new Date().toISOString();
    projects.set(project.id, project);

    try {
      const cloneInfo = await cloneRepo(
        {
          owner: sourceRepo.owner,
          name: sourceRepo.name,
          slug: sourceRepo.slug,
          normalizedUrl: sourceRepo.url,
        },
        reposRoot,
        runCommand,
      );

      sourceRepo.branch = cloneInfo.branch;
      sourceRepo.commitSha = cloneInfo.commitSha;
      sourceRepo.sizeBytes = cloneInfo.sizeBytes;
      sourceRepo.primaryLanguage = cloneInfo.primaryLanguage;
      sourceRepo.cloneStatus = "cloned";
      sourceRepo.cloneError = null;
    } catch (error) {
      sourceRepo.cloneStatus = "failed";
      sourceRepo.cloneError = error instanceof Error ? error.message : "Unable to clone repository.";
      project.status = "failed";
    }
  }

  if (project.sourceRepos.every((repo) => repo.cloneStatus === "cloned")) {
    project.status = "cloned";
  }

  project.updatedAt = new Date().toISOString();
  projects.set(project.id, project);
  return project;
}

function toSourceRepo(repo: ParsedGitHubRepo, index: number): SourceRepo {
  return {
    id: `repo-${index + 1}`,
    url: repo.normalizedUrl,
    owner: repo.owner,
    name: repo.name,
    slug: repo.slug,
    description: null,
    topics: [],
    branch: "",
    commitSha: "",
    sizeBytes: 0,
    primaryLanguage: "Unknown",
    cloneError: null,
    cloneStatus: "pending",
  };
}
