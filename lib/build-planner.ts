import type { MergeDecision, MergePlan } from "./merge-planner.ts";

export type BuildTask = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  dependsOn: string[];
  relatedFiles: string[];
  testRequirements: string[];
};

const STAGE_IDS = {
  scaffold: "scaffold",
  keep: "copy-kept-files",
  adapt: "adapt-files",
  rewrite: "rewrite-files",
  createNew: "generate-new-files",
  tests: "add-tests",
  types: "fix-types",
  verify: "verify-builds",
} as const;

export function createBuildTasks(plan: MergePlan): BuildTask[] {
  const keep = decisionsByType(plan, "keep");
  const adapt = decisionsByType(plan, "adapt");
  const rewrite = decisionsByType(plan, "rewrite");
  const createNew = decisionsByType(plan, "create_new");
  const tasks: BuildTask[] = [
    {
      id: STAGE_IDS.scaffold,
      title: "Scaffold final workspace",
      description: `Create the final workspace using ${plan.selectedBaseRepo} as the base repository.`,
      status: "pending",
      dependsOn: [],
      relatedFiles: [],
      testRequirements: ["Confirm the workspace exists before file operations run."],
    },
  ];

  if (keep.length) {
    tasks.push(decisionTask(
      STAGE_IDS.keep,
      "Copy kept files",
      "Copy files that can be reused mostly as-is from their source repositories.",
      keep,
      [STAGE_IDS.scaffold],
      ["Verify copied files preserve paths and compile in the target workspace."],
    ));
  }

  if (adapt.length) {
    tasks.push(decisionTask(
      STAGE_IDS.adapt,
      "Adapt files",
      "Port reusable source files into the final architecture and update imports, styles, and interfaces.",
      adapt,
      dependenciesFor([STAGE_IDS.scaffold, keep.length ? STAGE_IDS.keep : ""]),
      ["Add focused tests for behavior changed during adaptation."],
    ));
  }

  if (rewrite.length) {
    tasks.push(decisionTask(
      STAGE_IDS.rewrite,
      "Rewrite files",
      "Rebuild weak or incompatible feature implementations while preserving the intended behavior.",
      rewrite,
      dependenciesFor([STAGE_IDS.scaffold, adapt.length ? STAGE_IDS.adapt : "", keep.length ? STAGE_IDS.keep : ""]),
      ["Cover rewritten features with unit or route tests before verification."],
    ));
  }

  if (createNew.length) {
    tasks.push(decisionTask(
      STAGE_IDS.createNew,
      "Generate new files",
      "Create missing features required by the final project goal.",
      createNew,
      dependenciesFor([
        STAGE_IDS.scaffold,
        rewrite.length ? STAGE_IDS.rewrite : "",
        adapt.length ? STAGE_IDS.adapt : "",
        keep.length ? STAGE_IDS.keep : "",
      ]),
      ["Add tests for generated features because there is no source implementation to inherit."],
    ));
  }

  const implementationTaskIds = tasks.map((task) => task.id).filter((id) => id !== STAGE_IDS.scaffold);
  tasks.push({
    id: STAGE_IDS.tests,
    title: "Add tests",
    description: "Add or update tests for copied, adapted, rewritten, and newly generated features.",
    status: "pending",
    dependsOn: implementationTaskIds.length ? implementationTaskIds : [STAGE_IDS.scaffold],
    relatedFiles: unique(plan.decisions.flatMap((decision) => decision.targetPaths)).filter(isTestPath),
    testRequirements: ["Tests must cover merge decisions with non-trivial behavior changes."],
  });
  tasks.push({
    id: STAGE_IDS.types,
    title: "Fix types",
    description: "Resolve TypeScript and interface issues introduced by merging code from multiple repositories.",
    status: "pending",
    dependsOn: [STAGE_IDS.tests],
    relatedFiles: unique(plan.decisions.flatMap((decision) => decision.targetPaths)).filter((filePath) => /\.(ts|tsx)$/.test(filePath)),
    testRequirements: ["Run the repository type-check command when available."],
  });
  tasks.push({
    id: STAGE_IDS.verify,
    title: "Verify builds",
    description: "Run install, lint, typecheck, test, and build commands that are available in the final workspace.",
    status: "pending",
    dependsOn: [STAGE_IDS.types],
    relatedFiles: [],
    testRequirements: ["Do not mark verification complete unless command output is captured."],
  });

  return orderBuildTasks(tasks);
}

export function orderBuildTasks(tasks: BuildTask[]): BuildTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ordered: BuildTask[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(task: BuildTask): void {
    if (visited.has(task.id)) {
      return;
    }
    if (visiting.has(task.id)) {
      throw new Error(`Build task dependency cycle detected at ${task.id}.`);
    }

    visiting.add(task.id);
    for (const dependencyId of task.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw new Error(`Build task ${task.id} depends on missing task ${dependencyId}.`);
      }
      visit(dependency);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    ordered.push(task);
  }

  for (const task of tasks) {
    visit(task);
  }

  return ordered;
}

function decisionTask(
  id: string,
  title: string,
  description: string,
  decisions: MergeDecision[],
  dependsOn: string[],
  testRequirements: string[],
): BuildTask {
  return {
    id,
    title,
    description,
    status: "pending",
    dependsOn,
    relatedFiles: unique(decisions.flatMap((decision) => decision.targetPaths)),
    testRequirements,
  };
}

function decisionsByType(plan: MergePlan, decision: MergeDecision["decision"]): MergeDecision[] {
  return plan.decisions.filter((item) => item.decision === decision);
}

function dependenciesFor(ids: string[]): string[] {
  return unique(ids.filter(Boolean));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isTestPath(filePath: string): boolean {
  return /(^tests\/|\.test\.|\.spec\.)/.test(filePath);
}
