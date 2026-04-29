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
