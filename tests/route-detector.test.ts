import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { detectRoutes } from "../lib/route-detector.ts";

describe("detectRoutes", () => {
  it("detects Next.js pages and API routes", async () => {
    const repoPath = await createFixture({
      "app/page.tsx": "export default function Page() { return null; }\n",
      "app/dashboard/page.tsx": "export default function Dashboard() { return null; }\n",
      "app/api/users/route.ts": "export async function GET() {}\nexport async function POST() {}\n",
      "pages/api/health.ts": "export default function handler() {}\n",
    });

    const routes = await detectRoutes(repoPath);

    assert.ok(routes.some((route) => route.path === "/" && route.type === "page"));
    assert.ok(routes.some((route) => route.path === "/dashboard" && route.type === "page"));
    assert.ok(routes.some((route) => route.path === "/api/users" && route.method === "GET"));
    assert.ok(routes.some((route) => route.path === "/api/users" && route.method === "POST"));
    assert.ok(routes.some((route) => route.path === "/api/health" && route.method === "GET"));
  });

  it("detects Express and FastAPI route definitions", async () => {
    const repoPath = await createFixture({
      "server/index.ts": "app.get('/api/items', handler);\nrouter.post('/api/items', handler);\n",
      "api/main.py": "@app.get('/health')\ndef health(): pass\n@router.post('/users')\ndef users(): pass\n",
    });

    const routes = await detectRoutes(repoPath);

    assert.ok(routes.some((route) => route.path === "/api/items" && route.method === "GET"));
    assert.ok(routes.some((route) => route.path === "/api/items" && route.method === "POST"));
    assert.ok(routes.some((route) => route.path === "/health" && route.method === "GET"));
    assert.ok(routes.some((route) => route.path === "/users" && route.method === "POST"));
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "gitmash-routes-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return repoPath;
}
