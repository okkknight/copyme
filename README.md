# Persona Training Workbench

CopyMe is a desktop-first workbench for training a teacher persona through repeated student interactions. It is designed to capture how a teacher decides, not just how they sound.

The project includes:

- a shared app store for sessions, rules, and proxy review state
- parameter-driven student simulation
- behavior-pattern extraction and session-level judgments
- persona rule competition, contradictions, and evidence tracking
- Proxy Review calibration, reaction control, and micro-edit selection
- local project-file persistence with browser-cache fallback
- a fixed regression baseline for repeatable validation

## Project Context

If you are a new agent or returning later, start here:

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [docs/handoff/README.md](./docs/handoff/README.md)

## What You Get

- Dashboard
- Training Studio
- Sessions
- Persona Model
- Proxy Review
- Shared store with local project-file persistence and browser cache fallback
- Parameter-driven student builder and mock engine
- Behavior-pattern extractor v2
- Session judgments decoupled from global rule state
- Evidence competition, contradictions, lifecycle downgrades, and falsification
- Hypothesis rules, competition groups, and rule replacement records
- Temporal performance records, competition rounds, and explanation ecology
- Stabilization kernel with incumbent/current leader split, dominance lock, effective pressure, turnover, displacement-aware decay, layered memory, and recovery curves
- Review signals and forced correction write-back
- Reset to initial mock state

## Project Status

- The app is a local/self-hosted workbench, not a public multi-user service.
- Canonical workbench state is saved to `data/runtime/workbench-state.json`.
- That runtime directory is intentionally gitignored so your local training state stays private to your machine.
- Proxy Review also ships with a persisted full-fixture regression baseline at `data/regression/regression-baseline-v1.json`.

## Tech

- Next.js 14
- TypeScript
- Tailwind CSS
- Zustand

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Build

```bash
npm run build
```

## Notes

- Core state is persisted locally in `data/runtime/workbench-state.json` and mirrored for the standalone runtime build; the browser cache key is `copyme-workbench-state-v12`.
- `data/runtime/` is intentionally gitignored so local training state stays private to the machine that created it.
- The `/api/workbench-state` endpoint is meant for local/self-hosted use. Do not expose it publicly without adding your own authentication and access controls.
- `Reset Mock State` restores the initial mock dataset and UI selections.
- The current MVP still uses mock data and deterministic rules. No backend or real model calls are included yet.
- Training Studio student parameters now flow into a deterministic simulated student profile.
- Sessions page shows session-specific judgments, evidence chains, and contradiction records, while Persona Model still aggregates accepted global rules and surfaces at-risk rules separately.
- Proxy Review writes correction signals first, then turns them into evidence, contradictions, and candidate seeds when needed.
- Proxy Review now also supports the full U/V/W/Y regression stack over the 15 fixed fixtures (`review-01` ~ `review-05` and `ood-01` ~ `ood-10`), with a persisted baseline at `data/regression/regression-baseline-v1.json`.
- Global rules now have competition stats, lifecycle downgrade paths, replacement protocols, and temporal performance history, so accepted/stable rules can still be challenged, contradicted, deprecated, invalidated, replaced, rising, or fading over time.
- Competition groups now distinguish `incumbent` from `current leader`, apply resistance against raw challenger pressure, track turnover before replacement, and split natural decay from challenger-driven displacement.
- Layered pressure memory keeps challenger / contradiction / review / turnover shocks separate, and recovery now uses nonlinear cooldown stages instead of a single linear reset.
- The latest regression sweep is documented in `docs/regression/BASELINE_V1.md` and can be rerun from Proxy Review with the `Run Full Regression` button.

## License

MIT
