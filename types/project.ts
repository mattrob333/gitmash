export type ProjectStatus = "created" | "validating" | "failed";

export type SourceRepo = {
  id: string;
  url: string;
  owner: string;
  name: string;
  slug: string;
  cloneStatus: "pending";
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
