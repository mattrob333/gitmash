import { mkdir } from "node:fs/promises";
import path from "node:path";
import { validateRepoExists, type CommandRunner } from "@/lib/github-api";
import { generateProjectId, getWorkspacePaths } from "@/lib/workspace";
import type { ParsedGitHubRepo } from "@/lib/github";
import { cloneRepo } from "@/lib/repo-cloner";
import type { MergePlan } from "@/lib/merge-planner";
import type { BuildResult } from "@/lib/build-engine";
import type { ReviewReport } from "@/lib/code-review";
import type { Project, SourceRepo } from "@/types/project";

const projects = new Map<string, Project>();
const mergePlans = new Map<string, { plan: MergePlan; approved: boolean; approvedAt: string | null }>();
const builds = new Map<string, ProjectBuild>();
const reviews = new Map<string, ProjectReview>();

export type ProjectBuild = {
  projectId: string;
  status: "idle" | "running" | "completed" | "failed";
  logs: string[];
  startedAt: string | null;
  completedAt: string | null;
  result: BuildResult | null;
};

export type ProjectReview = {
  projectId: string;
  status: "idle" | "running" | "completed" | "failed";
  report: ReviewReport | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
};

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

export function getProjectMergePlan(projectId: string): { plan: MergePlan; approved: boolean; approvedAt: string | null } | null {
  return mergePlans.get(projectId) ?? null;
}

export function saveProjectMergePlan(projectId: string, plan: MergePlan) {
  const existing = mergePlans.get(projectId);
  const record = {
    plan,
    approved: existing?.approved ?? false,
    approvedAt: existing?.approvedAt ?? null,
  };
  mergePlans.set(projectId, record);
  return record;
}

export function approveProjectMergePlan(projectId: string) {
  const existing = mergePlans.get(projectId);
  if (!existing) {
    return null;
  }

  const record = {
    ...existing,
    approved: true,
    approvedAt: new Date().toISOString(),
  };
  mergePlans.set(projectId, record);
  return record;
}

export function getProjectBuild(projectId: string): ProjectBuild | null {
  return builds.get(projectId) ?? null;
}

export function saveProjectBuild(projectId: string, build: ProjectBuild): ProjectBuild {
  builds.set(projectId, build);
  return build;
}

export function updateBuildStatus(
  projectId: string,
  update: Partial<Omit<ProjectBuild, "projectId">> & { log?: string },
): ProjectBuild | null {
  const existing = builds.get(projectId);
  if (!existing) {
    return null;
  }

  const logs = update.log ? [...existing.logs, update.log] : existing.logs;
  const next: ProjectBuild = {
    ...existing,
    ...update,
    logs,
    projectId,
  };
  delete (next as Partial<ProjectBuild> & { log?: string }).log;
  builds.set(projectId, next);
  return next;
}

export function getProjectReview(projectId: string): ProjectReview | null {
  return reviews.get(projectId) ?? null;
}

export function saveProjectReview(projectId: string, review: ProjectReview): ProjectReview {
  reviews.set(projectId, review);
  return review;
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
