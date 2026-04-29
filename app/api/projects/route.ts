import { NextResponse } from "next/server";
import { validateRepoUrls } from "@/lib/github";
import { createProject } from "@/server/projects";
import type { CreateProjectInput } from "@/types/project";

export async function POST(request: Request) {
  let body: Partial<CreateProjectInput>;

  try {
    body = (await request.json()) as Partial<CreateProjectInput>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (!brief) {
    return NextResponse.json({ error: "Build brief is required." }, { status: 400 });
  }

  if (!Array.isArray(body.repoUrls)) {
    return NextResponse.json({ error: "repoUrls must be an array." }, { status: 400 });
  }

  try {
    const repos = validateRepoUrls(body.repoUrls);
    const project = await createProject(brief, repos);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create project.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
