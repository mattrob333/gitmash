import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRepoExists, type CommandRunner } from "../lib/github-api.ts";

describe("validateRepoExists", () => {
  it("returns public repo metadata from mocked GitHub API responses", async () => {
    const commands: string[] = [];
    const runner = sequenceRunner([
      {
        stdout: [
          "HTTP/2 200",
          "x-ratelimit-remaining: 59",
          "content-type: application/json",
          "",
        ].join("\n"),
        stderr: "",
      },
      {
        stdout: JSON.stringify({
          default_branch: "main",
          description: "A test repo",
          topics: ["nextjs", "typescript"],
        }),
        stderr: "",
      },
    ], commands);

    const result = await validateRepoExists("owner", "repo", runner);

    assert.equal(result.exists, true);
    assert.equal(result.isPublic, true);
    assert.equal(result.defaultBranch, "main");
    assert.equal(result.description, "A test repo");
    assert.deepEqual(result.topics, ["nextjs", "typescript"]);
    assert.match(commands[0], /^curl -sI /);
    assert.match(commands[1], /^curl -s /);
  });

  it("reports private or missing repositories without a real network call", async () => {
    const result = await validateRepoExists(
      "owner",
      "private-repo",
      sequenceRunner([
        {
          stdout: "HTTP/2 404\nx-ratelimit-remaining: 58\n",
          stderr: "",
        },
      ]),
    );

    assert.equal(result.exists, false);
    assert.equal(result.isPublic, false);
    assert.match(result.error ?? "", /does not exist or is private/);
  });

  it("handles GitHub API rate limits gracefully", async () => {
    const result = await validateRepoExists(
      "owner",
      "repo",
      sequenceRunner([
        {
          stdout: "HTTP/2 403\nx-ratelimit-remaining: 0\n",
          stderr: "",
        },
      ]),
    );

    assert.equal(result.exists, false);
    assert.match(result.error ?? "", /rate limit/i);
  });

  it("rejects invalid owner and repository names before curl", async () => {
    await assert.rejects(
      () => validateRepoExists("bad owner", "repo", sequenceRunner([])),
      /invalid/i,
    );
  });
});

function sequenceRunner(
  results: Array<{ stdout: string; stderr: string }>,
  commands: string[] = [],
): CommandRunner {
  return async (command: string) => {
    commands.push(command);
    const result = results.shift();
    if (!result) {
      throw new Error(`Unexpected command: ${command}`);
    }

    return result;
  };
}
