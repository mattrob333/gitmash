import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  const contents = await readTextIfExists(filePath);
  if (!contents) {
    return null;
  }

  try {
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

export async function writeJsonArtifact(
  analysisDir: string,
  fileName: string,
  data: unknown,
): Promise<string> {
  await mkdir(analysisDir, { recursive: true });
  const artifactPath = path.join(analysisDir, fileName);
  await writeFile(artifactPath, `${JSON.stringify(data, null, 2)}\n`);
  return artifactPath;
}

export function mergeDependencies(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null): Record<string, string> {
  return {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };
}

export function parseRequirementName(line: string): string | null {
  const cleaned = line.replace(/#.*/, "").trim();
  if (!cleaned || cleaned.startsWith("-")) {
    return null;
  }

  return cleaned.split(/[<>=~!;\[\s]/)[0]?.toLowerCase() || null;
}
