import path from "node:path";
import { writeJsonArtifact } from "./analysis-utils.ts";
import { detectComponents } from "./component-map.ts";
import { analyzeDependencies } from "./dependency-analyzer.ts";
import { generateFileTree } from "./file-filter.ts";
import { detectRoutes } from "./route-detector.ts";
import { generateRiskReport } from "./risk-report.ts";
import { detectPackageManager, detectStack, detectTestFramework } from "./stack-detector.ts";
import type { RepoAnalysis, SourceRepo } from "../types/project.ts";

export type RepoAnalysisMetadata = Pick<SourceRepo, "id" | "name" | "slug"> | { id?: string; name?: string; slug?: string };

export async function analyzeRepo(
  repoPath: string,
  repoMetadata: RepoAnalysisMetadata,
  analysisRoot = path.join(process.cwd(), "analysis"),
): Promise<RepoAnalysis> {
  const repoId = safeRepoId(repoMetadata.id ?? repoMetadata.slug ?? repoMetadata.name ?? path.basename(repoPath));
  const analysisDir = path.join(analysisRoot, repoId);

  const [
    stack,
    packageManager,
    testFrameworks,
    fileTree,
    dependencies,
    routes,
    components,
    risks,
  ] = await Promise.all([
    detectStack(repoPath),
    detectPackageManager(repoPath),
    detectTestFramework(repoPath),
    generateFileTree(repoPath),
    analyzeDependencies(repoPath),
    detectRoutes(repoPath),
    detectComponents(repoPath),
    generateRiskReport(repoPath),
  ]);

  const artifacts = {
    "file-tree.json": await writeJsonArtifact(analysisDir, "file-tree.json", fileTree),
    "dependency-analysis.json": await writeJsonArtifact(
      analysisDir,
      "dependency-analysis.json",
      dependencies,
    ),
    "route-map.json": await writeJsonArtifact(analysisDir, "route-map.json", routes),
    "component-map.json": await writeJsonArtifact(analysisDir, "component-map.json", components),
    "risk-report.json": await writeJsonArtifact(analysisDir, "risk-report.json", risks),
  };

  return {
    repoId,
    repoPath,
    generatedAt: new Date().toISOString(),
    stack,
    packageManager,
    testFrameworks,
    fileTree,
    dependencies,
    routes,
    components,
    risks,
    artifacts,
  };
}

function safeRepoId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "repo";
}
