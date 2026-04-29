import { readFile } from "node:fs/promises";
import path from "node:path";
import { walkFiles } from "./file-filter.ts";
import type { RouteInfo } from "../types/project.ts";

const ROUTE_EXT_RE = /\.(js|jsx|ts|tsx|py)$/;
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export async function detectRoutes(repoPath: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  for await (const filePath of walkFiles(repoPath)) {
    if (!ROUTE_EXT_RE.test(filePath)) {
      continue;
    }

    if (isNextAppPage(filePath)) {
      routes.push({ path: toAppPageRoute(filePath), type: "page", file: filePath });
      continue;
    }

    if (isNextApiRoute(filePath)) {
      routes.push(...(await nextApiRoutes(repoPath, filePath)));
      continue;
    }

    routes.push(...(await serverRoutes(repoPath, filePath)));
  }

  return routes.sort((a, b) => `${a.path}:${a.method ?? ""}`.localeCompare(`${b.path}:${b.method ?? ""}`));
}

function isNextAppPage(filePath: string): boolean {
  return filePath.startsWith("app/") && /\/page\.(tsx|jsx|ts|js)$/.test(filePath);
}

function isNextApiRoute(filePath: string): boolean {
  return (
    (filePath.startsWith("app/api/") && /\/route\.(ts|js)$/.test(filePath)) ||
    (filePath.startsWith("pages/api/") && /\.(ts|js)$/.test(filePath))
  );
}

async function nextApiRoutes(repoPath: string, filePath: string): Promise<RouteInfo[]> {
  const source = await readFile(path.join(repoPath, filePath), "utf8");
  const routePath = filePath.startsWith("app/api/")
    ? `/${path.dirname(filePath).replace(/^app\//, "")}`
    : `/${filePath.replace(/^pages\//, "").replace(/\.(ts|js)$/, "").replace(/\/index$/, "")}`;
  const methods = HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(
      source,
    ),
  );

  return (methods.length ? methods : ["GET"]).map((method) => ({
    path: routePath,
    type: "api",
    method,
    file: filePath,
  }));
}

async function serverRoutes(repoPath: string, filePath: string): Promise<RouteInfo[]> {
  const source = await readFile(path.join(repoPath, filePath), "utf8");
  const routes: RouteInfo[] = [];
  const expressPattern = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi;
  const pythonPattern = /@(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi;

  for (const match of source.matchAll(expressPattern)) {
    routes.push({ path: match[2], type: "server", method: match[1].toUpperCase(), file: filePath });
  }
  for (const match of source.matchAll(pythonPattern)) {
    routes.push({ path: match[2], type: "server", method: match[1].toUpperCase(), file: filePath });
  }

  return routes;
}

function toAppPageRoute(filePath: string): string {
  const routePath = path.dirname(filePath).replace(/^app/, "").replace(/\/page$/, "");
  return routePath ? routePath.replace(/\([^)]*\)\//g, "").replace(/\/$/, "") || "/" : "/";
}
