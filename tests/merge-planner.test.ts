import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMergePlan, selectBaseRepo, type MergePlanInput } from "../lib/merge-planner.ts";

describe("merge planner", () => {
  it("selects the comparison recommended base repo when it maps to a known source repo", () => {
    const input = mergePlanInput();

    assert.equal(selectBaseRepo(input), "repo-2");

    const plan = generateMergePlan(input);
    assert.equal(plan.selectedBaseRepo, "repo-2");
    assert.match(plan.baseRepoReason, /cleaner routing/);
  });

  it("falls back to the strongest repo summary when comparison recommendation is unavailable", () => {
    const input = mergePlanInput();
    input.comparison.recommendedBaseRepo = "missing";

    assert.equal(selectBaseRepo(input), "repo-2");
  });

  it("resolves keep, adapt, rewrite, discard, and create-new decisions with paths and reasons", () => {
    const plan = generateMergePlan(mergePlanInput());
    const decisions = new Map(plan.decisions.map((decision) => [decision.featureName, decision]));

    assert.equal(decisions.get("Dashboard")?.decision, "keep");
    assert.deepEqual(decisions.get("Dashboard")?.targetPaths, ["app/page.tsx"]);

    const auth = decisions.get("Authentication");
    assert.equal(auth?.decision, "adapt");
    assert.equal(auth?.sourceRepo, "repo-1");
    assert.deepEqual(auth?.sourcePaths, ["lib/auth.ts"]);
    assert.match(auth?.reason ?? "", /Adapt from repo-1 into the repo-2 architecture/);

    assert.equal(decisions.get("Legacy upload")?.decision, "rewrite");
    assert.equal(decisions.get("Marketing site")?.decision, "discard");

    const tests = decisions.get("API tests");
    assert.equal(tests?.decision, "create_new");
    assert.deepEqual(tests?.targetPaths, ["tests/api-tests.test.ts"]);
  });

  it("includes conflicts, risks, and build milestones from AI analysis", () => {
    const plan = generateMergePlan(mergePlanInput());

    assert.deepEqual(plan.conflicts, ["Auth session models differ."]);
    assert.ok(plan.risks.some((risk) => risk.includes("API tests are missing")));
    assert.ok(plan.buildMilestones.some((milestone) => milestone.title === "Verify final build"));
  });
});

function mergePlanInput(): MergePlanInput {
  return {
    projectId: "project-1",
    sourceRepos: [
      sourceRepo("repo-1", "auth-app"),
      sourceRepo("repo-2", "dashboard-app"),
    ],
    repoSummaries: {
      "repo-1": {
        repoName: "auth-app",
        primaryPurpose: "Authentication starter",
        detectedStack: ["Next.js"],
        mainFeatures: ["Authentication"],
        bestParts: [{
          name: "Authentication",
          type: "service",
          path: "lib/auth.ts",
          whyItIsGood: "Focused session helpers.",
          confidence: 0.9,
        }],
        weakParts: [{
          name: "Legacy upload",
          path: "lib/upload.ts",
          problem: "Untyped callbacks.",
          recommendation: "rewrite",
          confidence: 0.6,
        }],
        technicalDebt: [],
        securityConcerns: [],
        testingGaps: ["Missing API tests"],
        documentationGaps: [],
        recommendedRole: "feature_source",
      },
      "repo-2": {
        repoName: "dashboard-app",
        primaryPurpose: "Dashboard application",
        detectedStack: ["Next.js"],
        mainFeatures: ["Dashboard", "Marketing site"],
        bestParts: [{
          name: "Dashboard",
          type: "route",
          path: "app/page.tsx",
          whyItIsGood: "Clean dashboard route.",
          confidence: 0.93,
        }],
        weakParts: [{
          name: "Marketing site",
          path: "app/marketing/page.tsx",
          problem: "Not needed for the final app.",
          recommendation: "discard",
          confidence: 0.8,
        }],
        technicalDebt: [],
        securityConcerns: [],
        testingGaps: [],
        documentationGaps: [],
        recommendedRole: "base_repo",
      },
    },
    userIntent: {
      finalProjectGoal: "Unified dashboard with auth",
      preferredStack: ["Next.js"],
      sourcePreferences: [{
        repoId: "repo_a",
        itemsToPreserve: ["Authentication"],
        itemsToAvoid: [],
        notes: "Keep auth behavior.",
      }],
      qualityBar: {
        testingRequired: true,
        documentationRequired: true,
        devLogsRequired: true,
        codeReviewsRequired: true,
        futureAgentHandoffRequired: true,
      },
      explicitConstraints: ["Preserve auth"],
      implicitConstraints: [],
      unknownsToResolve: ["Deployment target"],
    },
    featureInventory: {
      features: [
        {
          featureName: "Dashboard",
          presentIn: ["repo_b"],
          quality: "strong",
          notes: "Dashboard is strongest in repo_b.",
          suggestedDecision: "keep",
        },
        {
          featureName: "Authentication",
          presentIn: ["repo_a"],
          quality: "strong",
          notes: "Auth is best in repo_a.",
          suggestedDecision: "keep",
        },
        {
          featureName: "Legacy upload",
          presentIn: ["repo_a"],
          quality: "weak",
          notes: "Upload needs stronger typing.",
          suggestedDecision: "rewrite",
        },
        {
          featureName: "Marketing site",
          presentIn: ["repo_b"],
          quality: "weak",
          notes: "Marketing pages are outside the requested app.",
          suggestedDecision: "discard",
        },
        {
          featureName: "API tests",
          presentIn: [],
          quality: "missing",
          notes: "No API tests exist.",
          suggestedDecision: "create_new",
        },
      ],
    },
    comparison: {
      repoRoles: [
        { repoId: "repo_a", role: "feature_source", reason: "Best auth." },
        { repoId: "repo_b", role: "base_repo", reason: "Best dashboard." },
      ],
      overlaps: ["Both include app shells."],
      conflicts: ["Auth session models differ."],
      strengthsByRepo: {
        repo_a: ["Authentication"],
        repo_b: ["Dashboard"],
      },
      recommendedBaseRepo: "repo_b",
      recommendedBaseReason: "repo_b has cleaner routing and dashboard structure.",
    },
    audit: {
      findings: [{
        category: "testing",
        severity: "medium",
        message: "API tests are missing.",
        recommendation: "Add route tests.",
      }],
      overallScore: "fair",
      criticalIssues: ["Resolve auth/session conflict."],
    },
  };
}

function sourceRepo(id: string, name: string) {
  return {
    id,
    url: `https://github.com/example/${name}`,
    owner: "example",
    name,
    slug: `example/${name}`,
    description: null,
    topics: [],
    branch: "main",
    commitSha: "abc123",
    sizeBytes: 1,
    primaryLanguage: "TypeScript",
    cloneError: null,
    cloneStatus: "cloned" as const,
  };
}
