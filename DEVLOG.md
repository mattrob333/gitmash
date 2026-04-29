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
