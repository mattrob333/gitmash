import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { REQUIRED_DOC_FILES } from "@/lib/doc-generator";
import { getProject } from "@/server/projects";

type RouteContext = {
  params: Promise<{ id: string; doc: string }>;
};

const VIEWABLE_DOCS = new Set<string>([...REQUIRED_DOC_FILES, "CODE_REVIEW.md", "KNOWN_ISSUES.md"]);

export async function GET(_request: Request, context: RouteContext) {
  const { id, doc } = await context.params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!VIEWABLE_DOCS.has(doc)) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const contents = await readFile(path.join(project.outputPath, "final-project", doc), "utf8");
    return new NextResponse(contents, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
