import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateAgentOutput, validateSchema, SchemaValidationError } from "../lib/schema-validator.ts";
import { REPO_SUMMARY_OUTPUT_SCHEMA } from "../lib/agent-prompt-templates.ts";

describe("validateSchema", () => {
  it("accepts valid repo summary output", () => {
    const output = validateAgentOutput("repo_summary", validRepoSummary());
    assert.equal(output.repoName, "repo-one");
    assert.equal(output.bestParts[0]?.type, "component");
  });

  it("reports missing required fields", () => {
    assert.throws(
      () => validateAgentOutput("repo_summary", { repoName: "repo-one" }),
      (error) => {
        assert.ok(error instanceof SchemaValidationError);
        assert.match(error.message, /\$\.primaryPurpose is required/);
        assert.match(error.message, /\$\.recommendedRole is required/);
        return true;
      },
    );
  });

  it("reports type and enum errors with paths", () => {
    const invalid = {
      ...validRepoSummary(),
      detectedStack: "Next.js",
      weakParts: [{ name: "Auth", path: "lib/auth.ts", problem: "Incomplete", recommendation: "adapt", confidence: "high" }],
      recommendedRole: "primary",
    };

    assert.throws(
      () => validateAgentOutput("repo_summary", invalid),
      (error) => {
        assert.ok(error instanceof SchemaValidationError);
        assert.match(error.message, /\$\.detectedStack must be an array/);
        assert.match(error.message, /\$\.weakParts\[0\]\.recommendation must be one of: keep, rewrite, discard/);
        assert.match(error.message, /\$\.weakParts\[0\]\.confidence must be a number/);
        assert.match(error.message, /\$\.recommendedRole must be one of/);
        return true;
      },
    );
  });

  it("validates feature inventory repo ids and decisions", () => {
    assert.throws(
      () => validateAgentOutput("feature_inventory", {
        features: [{
          featureName: "Auth",
          presentIn: ["repo_d"],
          quality: "strong",
          notes: "Found in lib/auth.ts.",
          suggestedDecision: "merge",
        }],
      }),
      /repo_a, repo_b, repo_c/,
    );
  });

  it("can validate directly against an exported runtime schema", () => {
    const output = validateSchema(REPO_SUMMARY_OUTPUT_SCHEMA, validRepoSummary(), "direct");
    assert.deepEqual(output, validRepoSummary());
  });
});

function validRepoSummary() {
  return {
    repoName: "repo-one",
    primaryPurpose: "Dashboard app.",
    detectedStack: ["Next.js", "React"],
    mainFeatures: ["Dashboard", "Auth"],
    bestParts: [{
      name: "Dashboard",
      type: "component",
      path: "app/page.tsx",
      whyItIsGood: "Clear route and component structure in app/page.tsx.",
      confidence: 0.8,
    }],
    weakParts: [{
      name: "Auth",
      path: "lib/auth.ts",
      problem: "No tests cover session handling.",
      recommendation: "rewrite",
      confidence: 0.7,
    }],
    technicalDebt: ["Missing integration tests."],
    securityConcerns: ["No input validation on app/api/session/route.ts."],
    testingGaps: ["No API route tests."],
    documentationGaps: ["README lacks setup details."],
    recommendedRole: "feature_source",
  };
}
