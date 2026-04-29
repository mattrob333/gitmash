# DECISIONS

## 2026-04-28

- Use Next.js App Router with TypeScript for the MVP because `BUILD.md` names Next.js API routes as the preferred backend option for the initial product.
- Implement shadcn/ui as local component primitives instead of depending on the shadcn CLI. This keeps the scaffold reproducible in restricted environments while preserving the expected component structure.
- Use local filesystem storage for Phase 1 project records and workspace paths. A database is deferred until the data lifecycle needs queries beyond project creation.
- Normalize accepted repository inputs to canonical `https://github.com/<owner>/<repo>` URLs while allowing GitHub HTTPS and SSH forms. Network availability, privacy, and clone checks are deferred to Phase 2.
- Keep file filtering conservative in Phase 1 by excluding common generated, binary, dependency, and secret-bearing files before later analysis phases add richer stack-specific rules.
- Keep project creation stateless in Phase 1 after directory creation. Persisting project records is deferred until the product needs retrieval screens or background worker coordination.
- Use text inputs for repository URLs so the UI accepts both HTTPS and `git@github.com:owner/repo.git` forms that the shared parser supports.
- Use Node's built-in test runner for Phase 1 utility tests. This allows verification in restricted environments before frontend dependencies are installed.
- Treat the extracted `GitMash-PRD.md` as a source reference alongside the PDF when present, because text PRD content is easier to inspect and diff during implementation.

## 2026-04-29

- Validate public repository availability through unauthenticated GitHub API calls before cloning. Private repositories are treated as unavailable for the MVP until OAuth support is added.
- Use shallow `git clone --depth 1` into the project workspace to minimize history intake while preserving enough metadata for branch and commit tracking.
- Keep repo intake security conservative by limiting Phase 2 clone processing to git metadata, filesystem size, manifest reads, and file extension counts. No dependency installation or repository scripts run during intake.
- Store Phase 2 project state in an in-process registry to support the clone status endpoint without introducing a database before the MVP needs durable retrieval.
- Use local git repositories and mocked command runners in tests so validation and clone coverage does not depend on network access or public GitHub availability.
- Implement Phase 3 static analysis as local filesystem scanners that read manifests and source text only. The analyzer never installs dependencies or executes cloned repository code.
- Save Phase 3 artifacts under `analysis/<repo-id>/` as focused JSON files so later digest and AI phases can consume objective facts without rescanning repositories.
- Keep stack, dependency, route, component, and risk detectors heuristic-based for the MVP. The rules favor deterministic, explainable markers over broad parsing that would require additional dependencies.
