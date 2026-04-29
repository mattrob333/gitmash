import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { detectComponents } from "../lib/component-map.ts";

describe("detectComponents", () => {
  it("classifies components, services, models, schemas, hooks, and utils", async () => {
    const repoPath = await createFixture({
      "components/Button.tsx": "export function Button() { return null; }\n",
      "services/user-service.ts": "export const users = {};\n",
      "models/user.ts": "export type User = {};\n",
      "schemas/user-schema.ts": "export const schema = {};\n",
      "hooks/useUser.ts": "export function useUser() {}\n",
      "lib/format.ts": "export function format() {}\n",
      "components/Button.test.tsx": "ignored\n",
    });

    const map = await detectComponents(repoPath);
    const byPath = new Map(map.map((item) => [item.path, item.type]));

    assert.equal(byPath.get("components/Button.tsx"), "component");
    assert.equal(byPath.get("services/user-service.ts"), "service");
    assert.equal(byPath.get("models/user.ts"), "model");
    assert.equal(byPath.get("schemas/user-schema.ts"), "schema");
    assert.equal(byPath.get("hooks/useUser.ts"), "hook");
    assert.equal(byPath.get("lib/format.ts"), "util");
    assert.equal(byPath.has("components/Button.test.tsx"), false);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "gitmash-components-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return repoPath;
}
