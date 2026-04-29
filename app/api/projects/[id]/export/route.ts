import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { exportFinalProject } from "@/lib/export-archiver";
import {
  getProject,
  getProjectBuild,
  getProjectReview,
} from "@/server/projects";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const build = getProjectBuild(id);
  if (!build?.result) {
    return NextResponse.json({ error: "Export requires a completed build result." }, { status: 409 });
  }

  const projectDir = path.join(project.outputPath, "final-project");
  const archive = await exportFinalProject({
    projectDir,
    outputPath: path.join(project.outputPath, "final-project.zip"),
    buildResult: build.result,
    reviewReport: getProjectReview(id)?.report ?? null,
  });
  const data = await readFile(archive.outputPath);

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${id}-final-project.zip"`,
      "Content-Length": String(archive.fileSize),
      "X-GitMash-File-Count": String(archive.fileCount),
    },
  });
}
