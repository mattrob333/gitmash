# DEVLOG

## 2026-04-28

- Started Phase 1 App Scaffold from `BUILD.md`.
- Created a manual Next.js App Router scaffold with TypeScript, Tailwind CSS, and shadcn-style component folders because the environment has restricted network access and the interactive CLIs are not reliable here.
- Added baseline project documentation and local storage placeholder folders: `workspaces/`, `analysis/`, and `output/`.
- Added core Phase 1 domain modules for GitHub URL parsing, repo URL validation, workspace path generation, and default file filtering.
- Built the homepage project creation form with two required repo URL inputs, one optional repo URL input, and a required natural language build brief.
- Added `POST /api/projects` to validate inputs, create a project model, and initialize project-specific local workspace directories.
- Added Node test coverage for GitHub URL parsing, repository validation, workspace path generation, and file filtering.
- Ran `npm test`; all Phase 1 utility tests passed.
- Attempted dependency installation and full Next build verification. `npm install` did not complete under the restricted network sandbox, and `npm run build` could not run because `next` is not installed locally.
- Attempted to stage changes for a Phase 1 commit, but git could not create `.git/index.lock` because the sandbox exposes `.git` as read-only. Commit and push remain blocked by the environment.

## 2026-04-29

- Started Phase 2 Repo Validation & Cloning from `BUILD.md` and the PRD sections for FR-003, FR-004, and repo cloning.
- Expanded `SourceRepo` metadata to track validation and clone state: branch, commit SHA, size, primary language, clone error, description, and topics.
- Added `lib/github-api.ts` for public GitHub repo validation using `curl -sI` header checks plus a metadata fetch for default branch, description, and topics.
- Added `lib/repo-cloner.ts` for shallow `git clone --depth 1`, clone metadata extraction, repo size calculation, primary language detection, and clone error classification.
- Added a minimal in-process project registry plus `validateRepos`, `cloneProjectRepos`, and `GET /api/projects/[id]/repos` so clone progress can be queried during the MVP.
- Updated `POST /api/projects` to create a workspace, validate all repositories before accepting the project, and begin repository cloning after validation succeeds.
- Added offline tests for GitHub API validation with mocked curl responses and repo cloning with local git fixture repositories.
- Started Phase 3 File Filtering & Static Analysis from `BUILD.md` and PRD sections 8.3 and 8.4.
- Expanded `lib/file-filter.ts` with `walkFiles` and `generateFileTree` so cloned repositories can be scanned through the same exclusion rules used before AI analysis.
- Added stack, package manager, and test framework detection in `lib/stack-detector.ts` for Next.js, Vite, React, Express, FastAPI, Flask, Django, and common lockfile markers.
- Added `lib/dependency-analyzer.ts` to parse `package.json`, `pyproject.toml`, and `requirements.txt`, categorize dependencies, and flag known risky or deprecated packages.
- Added route, component, and risk scanners for Next.js pages/API routes, Express/FastAPI routes, React components, services, models, schemas, hooks, utilities, test gaps, possible secrets, untyped ratios, entry points, and large files.
- Added `lib/repo-analyzer.ts` to run all Phase 3 detectors and save `file-tree.json`, `dependency-analysis.json`, `route-map.json`, `component-map.json`, and `risk-report.json` under `analysis/<repo-id>/`.
- Added local temp-directory tests for all Phase 3 analyzers and artifact generation.
- Ran `npm test`; all Phase 1, Phase 2, and Phase 3 utility tests passed.
- Started Phase 4 Repo Digest Generation from `BUILD.md` and PRD section 8.5.
- Added `lib/source-chunker.ts` to rank entry points, route handlers, components, services, models, schemas, and config files, then save markdown chunks under `analysis/<repo-id>/important-files/`.
- Added `lib/digest-generator.ts` to render `repo-digest.md` with capped sections for metadata, stack, package manager, dependencies, file tree, key files, routes, components/services, data models, auth, AI features, tests, docs, and risks.
- Updated `lib/repo-analyzer.ts` so a completed analysis now includes JSON artifacts, important-file chunks, and the repo digest path in `analysis.artifacts`.
- Added local fixture tests for digest generation, file tree truncation, chunk selection, and sensitive-file exclusion/redaction.
- Ran `npm test`; all Phase 1 through Phase 4 utility tests passed.
- Started Phase 5 AI Analysis Layer from `BUILD.md` and PRD sections 8.6 through 8.10 plus the prompting standards.
- Added `lib/ai-provider.ts` with a model-agnostic provider interface, fetch-based OpenAI chat completions implementation, JSON-mode support, and provider factory.
- Added `lib/agent-prompt-templates.ts` with Repo Summary, User Intent, Feature Inventory, Cross-Repo Comparison, and Best Practice Audit prompts, exported TypeScript output types, and runtime schema descriptors.
- Added `lib/schema-validator.ts` to validate AI outputs for required fields, primitive types, arrays, records, and enum values with clear path-based error messages.
- Added `lib/agent-runner.ts` to run each agent through an AI provider, validate structured output, and retry failed schema validations with corrective feedback.
- Added Phase 5 tests for provider behavior, schema validation failures, retry behavior, and all agent runner helpers using fixture JSON only.
- Started Phase 6 Merge Plan UI from `BUILD.md` and PRD sections 8.12, 8.13, and 23.5.
- Added `lib/merge-planner.ts` to combine saved AI analysis artifacts into a structured merge plan with base repo selection, keep/adapt/rewrite/discard/create-new decisions, conflicts, risks, milestones, source paths, target paths, reasons, and confidence scores.
- Added `lib/build-planner.ts` to convert merge decisions into ordered build tasks with dependency-aware topological sorting, related files, and test requirements.
- Added `components/merge-plan-view.tsx` for the merge plan review screen with base repo rationale, grouped decision cards, warning-styled conflicts/risks, and approval gating until analysis is complete.
- Added `GET /api/projects/[id]/plan` to return or generate a merge plan from saved analysis artifacts and `POST /api/projects/[id]/plan/approve` to mark the current plan approved.
- Added Phase 6 planner tests for base repo selection, decision resolution, task generation, dependency ordering, missing dependencies, and cycle detection using fixture data only.
- Ran `npm test`; all Phase 1 through Phase 6 tests passed.
- Started Phase 7 Build Engine from `BUILD.md` and PRD sections 16, 28, and 31.
- Added `lib/file-copier.ts` for filtered base repo copying, decision-based keep/adapt file copying, import/path adaptation, safe target path resolution, and fresh file scaffolding.
- Added `lib/doc-generator.ts` to generate the required markdown documentation pack: `README.md`, `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `MERGE_PLAN.md`, `DECISIONS.md`, `TESTING.md`, `DEVLOG.md`, and `AGENT_HANDOFF.md`.
- Added `lib/build-engine.ts` to create a fresh final project directory, copy the selected base repo, apply merge decisions, merge `package.json` and `requirements.txt`, create test scaffolds, write a build task log, and return a structured `BuildResult`.
- Added build status storage helpers in `server/projects.ts` and `POST`/`GET /api/projects/[id]/build` for approved-plan build execution and status retrieval.
- Added Phase 7 tests for file copying/adaptation, documentation generation, and full build orchestration using local temp-directory fixtures only.
