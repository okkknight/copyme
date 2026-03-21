# Persona Training Workbench

CopyMe is a desktop-first frontend workbench for teacher persona training. This repository now includes a shared app store, mock session engine, rule extraction, and localStorage persistence.

## Project Context

If you are a new agent or returning later, start here:

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [docs/handoff/README.md](./docs/handoff/README.md)

## Included

- Dashboard
- Training Studio
- Sessions
- Persona Model
- Proxy Review
- Shared store with persisted state
- Lightweight mock engine and extractor
- Reset to initial mock state

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

- Core state is stored in `localStorage` under `copyme-workbench-state`.
- `Reset Mock State` restores the initial mock dataset and UI selections.
- The current MVP still uses mock data and deterministic rules. No backend or real model calls are included yet.
