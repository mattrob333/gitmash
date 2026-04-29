import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createBuildTasks } from "@/lib/build-planner";
import { runBuildEngine } from "@/lib/build-engine";
import { readJsonIfExists } from "@/lib/analysis-utils";
import {
  getProject,
  getProjectBuild,
  getProjectMergePlan,
  saveProjectBuild,
  updateBuildStatus,
} from "@/server/projects";
import type { RepoAnalysis } from "@/types/project";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json(
    getProjectBuild(id) ?? {
      projectId: id,
      status: "idle",
      logs: [],
      startedAt: null,
      completedAt: null,
      result: null,
    },
  );
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const mergePlanRecord = getProjectMergePlan(id);
  if (!mergePlanRecord?.approved) {
    return NextResponse.json({ error: "Build requires an approved merge plan." }, { status: 409 });
  }

  const existing = getProjectBuild(id);
  if (existing?.status === "running") {
    return NextResponse.json(existing, { status: 409 });
  }

  const startedAt = new Date().toISOString();
  saveProjectBuild(id, {
    projectId: id,
    status: "running",
    logs: ["Build started."],
    startedAt,
    completedAt: null,
    result: null,
  });

  try {
    const repoAnalyses = await loadRepoAnalyses(project.analysisPath);
    const baseAnalysis = repoAnalyses.find((analysis) => analysis.repoId === mergePlanRecord.plan.selectedBaseRepo);
    if (!baseAnalysis) {
      throw new Error(`Base repo analysis not found for ${mergePlanRecord.plan.selectedBaseRepo}.`);
    }

    updateBuildStatus(id, { log: `Loaded ${repoAnalyses.length} repo analyses.` });
    const buildPlan = createBuildTasks(mergePlanRecord.plan);
    const result = await runBuildEngine({
      outputDir: path.join(project.outputPath, "final-project"),
      workspaceDir: project.workspacePath,
      baseRepoPath: baseAnalysis.repoPath,
      repoAnalyses,
      mergePlan: mergePlanRecord.plan,
      buildPlan,
      project,
    });

    const status = result.success ? "completed" : "failed";
    const build = updateBuildStatus(id, {
      status,
      result,
      completedAt: new Date().toISOString(),
      log: result.success ? "Build completed." : "Build completed with errors.",
    });
    return NextResponse.json(build, { status: result.success ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Build failed.";
    const build = updateBuildStatus(id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      log: message,
      result: {
        success: false,
        outputDir: path.join(project.outputPath, "final-project"),
        generatedFiles: [],
        docsGenerated: [],
        testsGenerated: [],
        errors: [message],
      },
    });
    return NextResponse.json(build, { status: 500 });
  }
}

async function loadRepoAnalyses(analysisPath: string): Promise<RepoAnalysis[]> {
  const entries = await readdir(analysisPath, { withFileTypes: true });
  const analyses = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJsonIfExists<RepoAnalysis>(path.join(analysisPath, entry.name, "repo-analysis.json"))),
  );
  return analyses.filter((analysis): analysis is RepoAnalysis => Boolean(analysis));
}
