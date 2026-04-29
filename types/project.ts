export type ProjectStatus = "created" | "validating" | "cloning" | "cloned" | "failed";

export type SourceRepo = {
  id: string;
  url: string;
  owner: string;
  name: string;
  slug: string;
  description: string | null;
  topics: string[];
  branch: string;
  commitSha: string;
  sizeBytes: number;
  primaryLanguage: string;
  cloneError: string | null;
  cloneStatus: "pending" | "cloning" | "cloned" | "failed";
};

export type Project = {
  id: string;
  brief: string;
  status: ProjectStatus;
  sourceRepos: SourceRepo[];
  workspacePath: string;
  analysisPath: string;
  outputPath: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  repoUrls: string[];
  brief: string;
};
