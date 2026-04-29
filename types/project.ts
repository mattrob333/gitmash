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

export type FileTreeNode = {
  name: string;
  type: "dir" | "file";
  path: string;
  children?: FileTreeNode[];
};

export type StackDetection = {
  primary: string;
  secondary: string[];
  confidence: number;
};

export type DependencyInfo = {
  name: string;
  version: string;
  category: "ui" | "auth" | "database" | "ai" | "testing" | "build" | "other";
  source: "package.json" | "pyproject.toml" | "requirements.txt";
  risk?: string;
};

export type DependencyAnalysis = {
  dependencies: DependencyInfo[];
  riskyPackages: DependencyInfo[];
  countsByCategory: Record<string, number>;
};

export type RouteInfo = {
  path: string;
  type: "page" | "api" | "server";
  method?: string;
  file: string;
};

export type ComponentInfo = {
  name: string;
  type: "component" | "service" | "model" | "schema" | "hook" | "util";
  path: string;
};

export type RiskReport = {
  risks: Array<{ id: string; severity: "low" | "medium" | "high"; message: string; path?: string }>;
  metrics: {
    testFileCount: number;
    jsFileCount: number;
    tsFileCount: number;
    largeFileCount: number;
  };
};

export type RepoAnalysis = {
  repoId: string;
  repoPath: string;
  generatedAt: string;
  stack: StackDetection;
  packageManager: string;
  testFrameworks: string[];
  fileTree: FileTreeNode;
  dependencies: DependencyAnalysis;
  routes: RouteInfo[];
  components: ComponentInfo[];
  risks: RiskReport;
  artifacts: Record<string, string>;
};
