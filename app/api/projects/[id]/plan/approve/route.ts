import { NextResponse } from "next/server";
import {
  approveProjectMergePlan,
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!getProjectMergePlan(id)) {
    const savedPlan = await readJsonIfExists<MergePlan>(`${project.analysisPath}/merge-plan.json`);
    if (savedPlan) {
      saveProjectMergePlan(id, savedPlan);
    } else {
      const input = await loadMergePlanInput(project);
      if (!input) {
        return NextResponse.json(
          { error: "Merge plan cannot be approved until all AI analysis artifacts are available." },
          { status: 409 },
        );
      }
      const plan = await generateAndSaveMergePlan(input, project.analysisPath);
      saveProjectMergePlan(id, plan);
    }
  }

  const record = approveProjectMergePlan(id);
  return NextResponse.json(record);
}
