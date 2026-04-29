import path from "node:path";
import { NextResponse } from "next/server";
import { reviewGeneratedProject, writeReviewReport } from "@/lib/code-review";
import {
  getProject,
  getProjectBuild,
  getProjectMergePlan,
  getProjectReview,
  saveProjectReview,
} from "@/server/projects";
import { extractApiKey, createProviderFromKey } from "@/lib/api-key-helper";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json(getProjectReview(id) ?? {
    projectId: id,
    status: "idle",
    report: null,
    startedAt: null,
    completedAt: null,
    error: null,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const build = getProjectBuild(id);
  if (!build?.result) {
    return NextResponse.json({ error: "Review requires a completed build result." }, { status: 409 });
  }

  // Use user's API key from the request header if provided
  const apiKey = extractApiKey(request);
  const aiProvider = createProviderFromKey(apiKey);

  const startedAt = new Date().toISOString();
  saveProjectReview(id, {
    projectId: id,
    status: "running",
    report: null,
    startedAt,
    completedAt: null,
    error: null,
  });

  try {
    const report = await reviewGeneratedProject({
      projectDir: path.join(project.outputPath, "final-project"),
      mergePlan: getProjectMergePlan(id)?.plan ?? null,
      buildResult: build.result,
      aiProvider: aiProvider ?? undefined,
    });
    await writeReviewReport(path.join(project.outputPath, "final-project"), report);
    const review = saveProjectReview(id, {
      projectId: id,
      status: report.overallVerdict === "failed" ? "failed" : "completed",
      report,
      startedAt,
      completedAt: new Date().toISOString(),
      error: null,
    });
    return NextResponse.json(review, { status: report.overallVerdict === "failed" ? 500 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed.";
    const review = saveProjectReview(id, {
      projectId: id,
      status: "failed",
      report: null,
      startedAt,
      completedAt: new Date().toISOString(),
      error: message,
    });
    return NextResponse.json(review, { status: 500 });
  }
}
