import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditBestPractices,
  compareRepos,
  extractUserIntent,
  inventoryFeatures,
  runAgent,
  runRepoSummary,
} from "../lib/agent-runner.ts";
import { REPO_SUMMARY_AGENT } from "../lib/agent-prompt-templates.ts";
import type { AIJsonRequest, AIProvider } from "../lib/ai-provider.ts";

class QueueProvider implements AIProvider {
  readonly requests: AIJsonRequest[] = [];
  private readonly outputs: unknown[];

  constructor(outputs: unknown[]) {
    this.outputs = outputs;
  }

  async generateJson<T>(request: AIJsonRequest): Promise<T> {
    this.requests.push(request);
    if (!this.outputs.length) {
      throw new Error("No fixture output queued.");
    }
    return this.outputs.shift() as T;
  }
}

describe("agent runner", () => {
  it("runs an agent and validates typed output", async () => {
    const provider = new QueueProvider([repoSummary()]);
    const output = await runRepoSummary(provider, { repoId: "repo_a", digest: "## Repo Digest" });

    assert.equal(output.repoName, "repo-a");
    assert.equal(provider.requests.length, 1);
    assert.ok(provider.requests[0]?.schema);
    assert.match(provider.requests[0]?.systemPrompt ?? "", /Repo Summary Agent/);
  });

  it("retries validation failures and sends the validation error back", async () => {
    const provider = new QueueProvider([{ repoName: "bad" }, repoSummary()]);
    const output = await runAgent(provider, "repo_summary", REPO_SUMMARY_AGENT, { repoId: "repo_a" });

    assert.equal(output.recommendedRole, "base_repo");
    assert.equal(provider.requests.length, 2);
    assert.match(provider.requests[1]?.userPrompt ?? "", /Previous output failed schema validation/);
    assert.match(provider.requests[1]?.userPrompt ?? "", /primaryPurpose is required/);
  });

  it("throws after retry budget is exhausted", async () => {
    const provider = new QueueProvider([{ repoName: "bad" }, { repoName: "still-bad" }]);
    await assert.rejects(
      () => runAgent(provider, "repo_summary", REPO_SUMMARY_AGENT, { repoId: "repo_a" }, { maxRetries: 1 }),
      /Invalid repo_summary output/,
    );
    assert.equal(provider.requests.length, 2);
  });

  it("runs all phase 5 agent helpers with fixture JSON", async () => {
    assert.equal((await extractUserIntent(new QueueProvider([userIntent()]), { brief: "Keep auth." })).finalProjectGoal, "Unified app");
    assert.equal((await inventoryFeatures(new QueueProvider([featureInventory()]), { repos: [] })).features[0]?.suggestedDecision, "adapt");
    assert.equal((await compareRepos(new QueueProvider([comparison()]), { repos: [] })).recommendedBaseRepo, "repo_a");
    assert.equal((await auditBestPractices(new QueueProvider([audit()]), { repos: [] })).overallScore, "fair");
  });
});

function repoSummary() {
  return {
    repoName: "repo-a",
    primaryPurpose: "A dashboard app.",
    detectedStack: ["Next.js"],
    mainFeatures: ["Dashboard"],
    bestParts: [{
      name: "Dashboard route",
      type: "route",
      path: "app/page.tsx",
      whyItIsGood: "The app/page.tsx route is small and focused.",
      confidence: 0.9,
    }],
    weakParts: [{
      name: "Test coverage",
      path: "tests/",
      problem: "No route tests are present.",
      recommendation: "rewrite",
      confidence: 0.7,
    }],
    technicalDebt: ["Missing lint script."],
    securityConcerns: [],
    testingGaps: ["No API tests."],
    documentationGaps: ["README lacks setup."],
    recommendedRole: "base_repo",
  };
}

function userIntent() {
  return {
    finalProjectGoal: "Unified app",
    preferredStack: ["Next.js"],
    sourcePreferences: [{
      repoId: "repo_a",
      itemsToPreserve: ["auth"],
      itemsToAvoid: [],
      notes: "User explicitly asked to keep auth.",
    }],
    qualityBar: {
      testingRequired: true,
      documentationRequired: true,
      devLogsRequired: true,
      codeReviewsRequired: true,
      futureAgentHandoffRequired: true,
    },
    explicitConstraints: ["Keep auth."],
    implicitConstraints: ["Preserve source citations."],
    unknownsToResolve: [],
  };
}

function featureInventory() {
  return {
    features: [{
      featureName: "Authentication",
      presentIn: ["repo_a"],
      quality: "strong",
      notes: "Auth is implemented in lib/auth.ts with clear session helpers.",
      suggestedDecision: "adapt",
    }],
  };
}

function comparison() {
  return {
    repoRoles: [{ repoId: "repo_a", role: "base", reason: "Best route structure in app/." }],
    overlaps: ["Both repos implement dashboards."],
    conflicts: ["Different auth approaches."],
    strengthsByRepo: { repo_a: ["Routing"], repo_b: ["UI"] },
    recommendedBaseRepo: "repo_a",
    recommendedBaseReason: "It has the cleanest app structure and fewer risks.",
  };
}

function audit() {
  return {
    findings: [{
      category: "testing",
      severity: "medium",
      message: "API tests are missing.",
      recommendation: "Add route tests before build.",
    }],
    overallScore: "fair",
    criticalIssues: [],
  };
}
