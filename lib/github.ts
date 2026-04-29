export type ParsedGitHubRepo = {
  owner: string;
  name: string;
  slug: string;
  normalizedUrl: string;
};

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

export function parseGitHubRepoUrl(input: string): ParsedGitHubRepo | null {
  const value = input.trim();

  if (!value) {
    return null;
  }

  const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return buildParsedRepo(sshMatch[1], sshMatch[2]);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }

  return buildParsedRepo(parts[0], parts[1]);
}

export function validateRepoUrls(repoUrls: string[]): ParsedGitHubRepo[] {
  const usableUrls = repoUrls.map((url) => url.trim()).filter(Boolean);

  if (usableUrls.length < 2 || usableUrls.length > 3) {
    throw new Error("Provide two or three GitHub repository URLs.");
  }

  const parsed = usableUrls.map((url) => parseGitHubRepoUrl(url));
  const invalidIndex = parsed.findIndex((repo) => repo === null);

  if (invalidIndex >= 0) {
    throw new Error(`Repository URL ${invalidIndex + 1} is not a valid GitHub repo URL.`);
  }

  const repos = parsed as ParsedGitHubRepo[];
  const uniqueSlugs = new Set(repos.map((repo) => repo.slug.toLowerCase()));

  if (uniqueSlugs.size !== repos.length) {
    throw new Error("Repository URLs must point to unique GitHub repositories.");
  }

  return repos;
}

function buildParsedRepo(owner: string, repoName: string): ParsedGitHubRepo | null {
  const name = repoName.replace(/\.git$/, "");

  if (!OWNER_RE.test(owner) || !REPO_RE.test(name) || name === "." || name === "..") {
    return null;
  }

  const slug = `${owner}/${name}`;

  return {
    owner,
    name,
    slug,
    normalizedUrl: `https://github.com/${slug}`,
  };
}
