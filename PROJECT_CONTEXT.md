# CopyMe Project Context

Last verified: 2026-03-24

CopyMe is a desktop-first Persona Training Workbench focused on capturing and reproducing teacher persona decision patterns.

This file is the fastest entry point for a new agent or a new chat session.
If you only read one document first, read this one.

## Current Product State

- Next.js 14 + TypeScript + Tailwind CSS frontend MVP
- Shared Zustand store with local project-file persistence plus browser-cache fallback
- 5 primary pages:
  - Dashboard
  - Training Studio
  - Sessions
  - Persona Model
  - Proxy Review
- Mock data is fully local and deterministic
- Canonical saved workbench state lives in `data/runtime/workbench-state.json` and is mirrored for the standalone runtime build
- The runtime state directory is gitignored so local training data does not accidentally enter the repository
- The repository now includes 15 fixed Proxy Review fixtures: `review-01` ~ `review-05` and `ood-01` ~ `ood-10`
- A persisted full-fixture regression baseline lives at `data/regression/regression-baseline-v1.json`
- Browser verification has been done against the current implementation

## What This App Is

- A workbench for training a teacher persona through repeated student interactions
- A system for extracting traceable persona rules from sessions
- A structured proxy review lab for comparing human response vs proxy response

## What This App Is Not

- Not a chatbot product
- Not a generic AI assistant
- Not a production backend system
- Not a voice-first product yet

## Where To Start

1. Read [docs/handoff/README.md](docs/handoff/README.md)
2. Read [docs/handoff/CHANGELOG.md](docs/handoff/CHANGELOG.md)

## Current Key Files

- [src/store/use-copyme-store.ts](src/store/use-copyme-store.ts)
- [src/data/mock.ts](src/data/mock.ts)
- [src/lib/types.ts](src/lib/types.ts)
- [src/lib/selectors.ts](src/lib/selectors.ts)
- [src/lib/extractor.ts](src/lib/extractor.ts)
- [src/lib/mock-engine.ts](src/lib/mock-engine.ts)
- [src/components/client-only.tsx](src/components/client-only.tsx)
- [src/components/app-shell.tsx](src/components/app-shell.tsx)
- [src/app/page.tsx](src/app/page.tsx)
- [src/app/training-studio/page.tsx](src/app/training-studio/page.tsx)
- [src/app/sessions/page.tsx](src/app/sessions/page.tsx)
- [src/app/persona-model/page.tsx](src/app/persona-model/page.tsx)
- [src/app/proxy-review/page.tsx](src/app/proxy-review/page.tsx)
- [src/lib/full-fixture-regression.ts](src/lib/full-fixture-regression.ts)
- [data/regression/regression-baseline-v1.json](data/regression/regression-baseline-v1.json)

## Verified Commands

- `npm run build`
- `npm run dev`

## Current Runtime Notes

- The app uses a `ClientOnly` gate around pages that read from the shared store to avoid hydration and snapshot loops.
- The browser console is clean except for harmless static asset warnings if the dev server is stale; the current setup has been verified after a clean restart.
- The app has a custom icon at `src/app/icon.svg`.
- Proxy Review now has a full regression sweep for the 15 fixed fixtures, and the resulting baseline is persisted for future comparisons.
- The persistence API is designed for local/self-hosted workbench use; it is not protected by authentication yet, so do not expose it as a public multi-user endpoint without adding access control.

## Working Rules For Future Agents

- Do not collapse the app into a generic chat interface.
- Preserve the distinction between sessions, rules, persona model, and proxy review.
- Keep all state traceable to sessions.
- Prefer explicit docs and shared state over page-local hidden logic.
- Use this file as the source of truth; avoid reviving split docs unless the project grows enough to justify them again.
- When validating routing, reaction, or ROI changes, compare against the fixed-fixture baseline before making improvement claims.
