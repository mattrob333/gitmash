import path from "node:path";
import { walkFiles } from "./file-filter.ts";
import type { ComponentInfo } from "../types/project.ts";

const SOURCE_EXT_RE = /\.(js|jsx|ts|tsx|py)$/;

export async function detectComponents(repoPath: string): Promise<ComponentInfo[]> {
  const components: ComponentInfo[] = [];

  for await (const filePath of walkFiles(repoPath)) {
    if (!SOURCE_EXT_RE.test(filePath) || filePath.includes(".test.") || filePath.includes(".spec.")) {
      continue;
    }

    const type = classifyFile(filePath);
    if (!type) {
      continue;
    }

    components.push({
      name: toDisplayName(filePath),
      type,
      path: filePath,
    });
  }

  return components.sort((a, b) => a.path.localeCompare(b.path));
}

function classifyFile(filePath: string): ComponentInfo["type"] | null {
  const lowerPath = filePath.toLowerCase();
  const baseName = path.basename(filePath, path.extname(filePath));

  if (/^use[A-Z0-9]/.test(baseName) || lowerPath.includes("/hooks/")) {
    return "hook";
  }
  if (lowerPath.startsWith("services/") || lowerPath.includes("/services/") || lowerPath.includes("service.")) {
    return "service";
  }
  if (lowerPath.startsWith("models/") || lowerPath.includes("/models/") || lowerPath.includes("model.")) {
    return "model";
  }
  if (lowerPath.startsWith("schemas/") || lowerPath.includes("/schemas/") || lowerPath.includes("schema.")) {
    return "schema";
  }
  if (/\.(tsx|jsx)$/.test(filePath) && /^[A-Z]/.test(baseName)) {
    return "component";
  }
  if (
    lowerPath.startsWith("utils/") ||
    lowerPath.includes("/utils/") ||
    lowerPath.startsWith("lib/") ||
    lowerPath.includes("/lib/") ||
    lowerPath.includes("util.") ||
    lowerPath.includes("helper.")
  ) {
    return "util";
  }

  return null;
}

function toDisplayName(filePath: string): string {
  const baseName = path.basename(filePath, path.extname(filePath));
  return baseName === "index" ? path.basename(path.dirname(filePath)) : baseName;
}
