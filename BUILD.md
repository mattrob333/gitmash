# GitMash — Build Instructions for Codex

## Overview

GitMash is an AI-powered repo synthesis platform. Users paste 2-3 GitHub repo URLs, describe what they want to preserve from each, and GitMash analyzes, compares, creates a merge plan, builds a unified project with tests/docs/reviews/dev logs, and exports it.

**Domain:** gitmash.com
**Repo:** https://github.com/mattrob333/gitmash

## Build Order (9 Phases)

Build in order. Do not attempt to build everything in one pass. Complete each phase before moving to the next. Every major step updates DEVLOG.md and DECISIONS.md.

### Phase 1: App Scaffold
- Set up Next.js with TypeScript
- Add Tailwind + shadcn/ui + clean component structure
- Create homepage with repo URL inputs (2 required, 1 optional) and natural language brief textarea
- Add project creation API endpoint (POST /api/projects)
- Add basic project status model (Project, SourceRepo)
- Add local workspace folder structure
- Deliverables: app/, components/, lib/, server/, types/, README.md

### Phase 2: Repo Validation & Cloning
- Validate GitHub repo URLs (extract owner/repo from URL)
- Clone public repos into isolated workspace (shallow clone)
- Record: branch, commit SHA, clone status, repo size, detected language
- Error handling for invalid/private/unavailable repos
- Tests: URL parsing, invalid URL rejection, workspace path gen

### Phase 3: File Filtering & Static Analysis
- File tree walker with default exclusion rules (node_modules/, .git/, dist/, etc.)
- Detect project stack (Next.js, Vite, React, Express, FastAPI, etc.)
- Detect package manager (npm, yarn, pnpm, pip, poetry)
- Parse package.json / pyproject.toml
- Detect tests and docs
- Generate: file-tree.json, dependency-analysis.json, route-map.json, component-map.json, risk-report.json
- Tests: exclusion rules, stack detection, file tree gen

### Phase 4: Repo Digest Generation
- Generate repo-digest.md for each repo with sections: metadata, stack, deps, file tree, key source files, routes, API endpoints, components, services, data models, auth, tests, docs, risks
- Generate structured JSON artifacts
- Chunk important source files
- Save under analysis/<repo-id>/
- Tests: digest has expected sections, sensitive files excluded

### Phase 5: AI Analysis Layer
- Create AI provider abstraction (model-agnostic)
- Implement structured prompt templates (schema-validated output)
- Repo Summary Agent — analyzes each repo independently
- User Intent Extraction Agent — converts user brief to structured intent
- Feature Inventory Agent — normalized feature map across repos
- Cross-Repo Comparison Agent — overlap, conflicts, strengths
- Best Practice Audit Agent — security, testing gaps, deprecated deps
- Validate all AI outputs with schemas
- Tests: schema validation, mock AI responses, invalid response handling

### Phase 6: Merge Plan UI
- Display repo summaries, feature matrix, recommended base repo, conflicts
- Display keep/adapt/rewrite/discard/create-new decisions
- Approve plan button
- Tests: plan renders, approval state changes, missing analysis states handled

### Phase 7: Build Engine
- Create final project workspace
- Apply base repo files, copy/adapt selected files per merge plan
- Generate missing scaffold files
- Harmonize dependencies
- Generate docs (README, ARCHITECTURE, PROJECT_SPEC, MERGE_PLAN, DECISIONS, TESTING, DEVLOG, AGENT_HANDOFF)
- Generate tests
- Create build task log
- Tests: output workspace created, docs generated, merge decisions map to files

### Phase 8: Validation & Repair
- Detect available commands (lint, typecheck, test, build)
- Run install, lint, typecheck, tests, build
- Capture output, implement repair loop (max attempts)
- Save failed outputs
- Tests: command detection, test result parsing, repair logging

### Phase 9: Code Review & Final Export
- Code Review Agent — review generated code, architecture alignment, tests, docs
- Generate review markdown files
- Generate KNOWN_ISSUES.md if validation fails
- ZIP export
- Final results screen

## Technology Stack

- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui, TanStack Query
- **Backend API:** Next.js API routes (for MVP) or FastAPI
- **Workers:** Python background workers (for repo analysis)
- **Database:** Postgres or SQLite (MVP)
- **Storage:** Local filesystem (MVP)
- **AI Layer:** Model-agnostic provider abstraction

## Key Principles

1. Never feed entire repos into one giant AI prompt — use layered pipeline
2. Every agent output must be schema-validated
3. Every recommendation must cite source files
4. Every keep/adapt/rewrite decision must include a reason
5. Every major build decision goes in DECISIONS.md
6. Every generated file maps back to a build task
7. Any uncertainty must be explicitly stated
8. Don't pretend tests passed if they weren't run
9. Do NOT execute arbitrary repo code during analysis (security)
10. Do NOT include secrets in prompts, docs, or logs

## Required Final Output

```
final-project/
  README.md
  PROJECT_SPEC.md
  ARCHITECTURE.md
  MERGE_PLAN.md
  DECISIONS.md
  TESTING.md
  DEVLOG.md
  AGENT_HANDOFF.md
  KNOWN_ISSUES.md  (if validation fails)
```

## Build Quality Standards

- Use TypeScript, keep files small and modular
- Add tests for URL parsing, repo validation, workspace path gen, file filtering
- Every major implementation step must update DEVLOG.md
- Every architectural decision must update DECISIONS.md
- Do not skip documentation
- Do not claim a phase is complete unless relevant tests pass
- When uncertain, implement the simplest reliable version and document the tradeoff
