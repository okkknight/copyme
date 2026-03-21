# CopyMe Project Context

Last verified: 2026-03-21

CopyMe is a desktop-first Persona Training Workbench focused on capturing and reproducing teacher persona decision patterns.

This file is the fastest entry point for a new agent or a new chat session.
If you only read one document first, read this one.

## Current Product State

- Next.js 14 + TypeScript + Tailwind CSS frontend MVP
- Shared Zustand store with localStorage persistence
- 5 primary pages:
  - Dashboard
  - Training Studio
  - Sessions
  - Persona Model
  - Proxy Review
- Mock data is fully local and deterministic
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

## Verified Commands

- `npm run build`
- `npm run dev`

## Current Runtime Notes

- The app uses a `ClientOnly` gate around pages that read from the shared store to avoid hydration and snapshot loops.
- The browser console is clean except for harmless static asset warnings if the dev server is stale; the current setup has been verified after a clean restart.
- The app has a custom icon at `src/app/icon.svg`.

## Working Rules For Future Agents

- Do not collapse the app into a generic chat interface.
- Preserve the distinction between sessions, rules, persona model, and proxy review.
- Keep all state traceable to sessions.
- Prefer explicit docs and shared state over page-local hidden logic.
- Use this file as the source of truth; avoid reviving split docs unless the project grows enough to justify them again.
