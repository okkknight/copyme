# Changelog

This file records the most important project changes for future agent handoff.
Append one entry per meaningful change set.

## 2026-03-21

### Added

- Created a repository-level project context entry point: `PROJECT_CONTEXT.md`
- Added a handoff pack under `docs/handoff/`
- Added `PROJECT_STATUS.md`, `ARCHITECTURE.md`, `KNOWN_ISSUES.md`, `NEXT_STEPS.md`, `DECISIONS.md`, and `FILE_MAP.md`
- Added `src/components/client-only.tsx` to avoid hydration/snapshot loops in store-consuming pages
- Added `src/app/icon.svg` to remove favicon 404 noise
- Linked the handoff docs from `README.md`
- Collapsed the multi-file handoff pack into a compact source-of-truth pair: `PROJECT_CONTEXT.md` and `docs/handoff/CHANGELOG.md`

### Verified

- `npm run build`
- Browser verification on `/` and `/training-studio`
