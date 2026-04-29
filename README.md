# GitMash

GitMash is an AI-powered repo synthesis platform. Phase 1 establishes the app scaffold, project creation flow, basic data models, and local workspace conventions.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run build
```

## Local Storage

Project data is created under:

- `workspaces/<project-id>/`
- `analysis/<project-id>/`
- `output/<project-id>/`

These folders are local-only and ignored by git except for `.gitkeep` placeholders.
