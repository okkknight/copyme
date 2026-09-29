# CopyMe

A teacher's real method is often invisible: what they do with a nervous beginner, a clever slacker, or someone who keeps making the same mistake. CopyMe is a personal training bench for turning those choices into a teacher agent that can be inspected and improved.

You play yourself. The app plays different kinds of students. Teach them as you normally would, then use the resulting sessions to extract the rules behind your decisions. CopyMe can compare your response with the proxy teacher's response, surface the gap, and feed your correction into the next round. The point is not to imitate a teacher's catchphrases; it is to distill their teaching judgment through a repeatable loop.

## Start with a student

1. Open **Training Studio** and give the student a level, confidence, attitude, and a problem to work through.
2. Run the interaction, then open **Sessions** to see what the teacher did and what that moment says about their habits.
3. Visit **Persona Model** to inspect the growing set of rules and the evidence behind each one.
4. Use **Proxy Review** when you want to put a candidate response next to the teacher's response and say exactly what needs fixing. The repository includes 15 fixed cases for repeatable review.

The Dashboard is the home screen for the work: recent sessions on one side, the current shape of the teacher on the other.

## Run locally

You need Node.js and npm.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:3000>. It runs entirely with the included deterministic simulations, so there is no API key to chase down before you can try it. Use `npm run build` when you want a production build.

## Data and project status

- Workbench state is saved locally in `data/runtime/workbench-state.json`, with a browser-cache fallback. The runtime directory is ignored by Git.
- The 15-fixture Proxy Review baseline is in [`data/regression/regression-baseline-v1.json`](data/regression/regression-baseline-v1.json).
- **Reset Mock State** restores the supplied sample data and UI selections.
- The persistence endpoint is for local or self-hosted use. Add access control before putting it on a shared network.

CopyMe is built with Next.js 14, TypeScript, Tailwind CSS, and Zustand. For the architecture and current development state, see [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md). Contributors can start with the [handoff index](docs/handoff/README.md); the [regression baseline notes](docs/regression/BASELINE_V1.md) explain the fixed review fixtures.

## License

[MIT](LICENSE).
