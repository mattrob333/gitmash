import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGitHubRepoUrl, validateRepoUrls } from "../lib/github.ts";

describe("parseGitHubRepoUrl", () => {
  it("parses canonical https URLs", () => {
    assert.deepEqual(parseGitHubRepoUrl("https://github.com/vercel/next.js"), {
      owner: "vercel",
      name: "next.js",
      slug: "vercel/next.js",
      normalizedUrl: "https://github.com/vercel/next.js",
    });
  });

  it("parses ssh clone URLs", () => {
    assert.deepEqual(parseGitHubRepoUrl("git@github.com:mattrob333/gitmash.git"), {
      owner: "mattrob333",
      name: "gitmash",
      slug: "mattrob333/gitmash",
      normalizedUrl: "https://github.com/mattrob333/gitmash",
    });
  });

  it("rejects non-repo GitHub paths and non-GitHub hosts", () => {
    assert.equal(parseGitHubRepoUrl("https://github.com/vercel"), null);
    assert.equal(parseGitHubRepoUrl("https://example.com/vercel/next.js"), null);
  });
});

describe("validateRepoUrls", () => {
  it("requires two or three unique repository URLs", () => {
    assert.throws(
      () => validateRepoUrls(["https://github.com/a/one"]),
      "Provide two or three",
    );
    assert.throws(
      () => validateRepoUrls(["https://github.com/a/one", "https://github.com/a/one.git"]),
      /unique/,
    );
  });

  it("returns parsed repositories for valid inputs", () => {
    const repos = validateRepoUrls([
      "https://github.com/a/one",
      "https://github.com/b/two",
      "",
    ]);

    assert.deepEqual(
      repos.map((repo) => repo.slug),
      ["a/one", "b/two"],
    );
  });
});
