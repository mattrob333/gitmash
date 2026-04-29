import { NextResponse } from "next/server";
import { getProject } from "@/server/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    projectId: project.id,
    status: project.status,
    repos: project.sourceRepos,
    updatedAt: project.updatedAt,
  });
}
