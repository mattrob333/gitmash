import { NextResponse } from "next/server";
import {
  getProject,
  getProjectMergePlan,
  saveProjectMergePlan,
} from "@/server/projects";
import {
  generateAndSaveMergePlan,
  loadMergePlanInput,
  type MergePlan,
} from "@/lib/merge-planner";
import { readJsonIfExists } from "@/lib/analysis-utils";
import { extractApiKey } from "@/lib/api-key-helper";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Accept API key for future AI-powered planning
  const apiKey = extractApiKey(request);

  const existing = getProjectMergePlan(id);
  if (existing) {
    return NextResponse.json(existing);
  }

  const savedPlan = await readJsonIfExists<MergePlan>(`${project.analysisPath}/merge-plan.json`);
  if (savedPlan) {
    const record = saveProjectMergePlan(id, savedPlan);
    return NextResponse.json(record);
  }

  const input = await loadMergePlanInput(project);
  if (!input) {
    return NextResponse.json(
      { error: "Merge plan cannot be generated until all AI analysis artifacts are available." },
      { status: 409 },
    );
  }

  const plan = await generateAndSaveMergePlan(input, project.analysisPath);
  const record = saveProjectMergePlan(id, plan);
  return NextResponse.json(record);
}
