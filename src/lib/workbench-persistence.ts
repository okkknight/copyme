import type { AppState } from "@/lib/types";

export const WORKBENCH_STATE_API_PATH = "/api/workbench-state";
export const WORKBENCH_STATE_SCHEMA_VERSION = 1;
const WORKBENCH_STATE_SESSION_WEIGHT = 1_000_000_000_000;

export type WorkbenchStateEnvelope = {
  schemaVersion: number;
  savedAt: string;
  state: AppState;
};

export function cloneWorkbenchState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

export function buildWorkbenchStateEnvelope(state: AppState, savedAt = new Date().toISOString()): WorkbenchStateEnvelope {
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    savedAt,
    state: cloneWorkbenchState(state)
  };
}

export function isWorkbenchStateEnvelope(value: unknown): value is WorkbenchStateEnvelope {
  if (!value || typeof value !== "object") return false;

  const next = value as Record<string, unknown>;
  return (
    next.schemaVersion === WORKBENCH_STATE_SCHEMA_VERSION &&
    typeof next.savedAt === "string" &&
    typeof next.state === "object" &&
    next.state !== null
  );
}

export function getWorkbenchStatePriority(state: AppState) {
  const sessionCount = state.sessions?.length ?? 0;
  const timestampCandidates: number[] = [];

  for (const session of state.sessions ?? []) {
    timestampCandidates.push(Date.parse(session.startedAt || "") || 0);
    timestampCandidates.push(Date.parse(session.endedAt || "") || 0);
    for (const turn of session.transcript ?? []) {
      timestampCandidates.push(Date.parse(turn.timestamp || "") || 0);
    }
  }

  for (const rule of state.rules ?? []) {
    timestampCandidates.push(Date.parse(rule.createdAt || "") || 0);
    timestampCandidates.push(Date.parse(rule.updatedAt || "") || 0);
  }

  for (const rule of state.hypothesisRules ?? []) {
    timestampCandidates.push(Date.parse(rule.createdAt || "") || 0);
    timestampCandidates.push(Date.parse(rule.updatedAt || "") || 0);
  }

  for (const stateItem of state.proxyCalibrationStates ?? []) {
    timestampCandidates.push(Date.parse(stateItem.createdAt || "") || 0);
    timestampCandidates.push(Date.parse(stateItem.updatedAt || "") || 0);
  }

  if (state.latestFixtureRegressionReport) {
    timestampCandidates.push(Date.parse(state.latestFixtureRegressionReport.generatedAt || "") || 0);
  }

  const freshestTimestamp = timestampCandidates.reduce((max, current) => Math.max(max, current), 0);
  return sessionCount * WORKBENCH_STATE_SESSION_WEIGHT + freshestTimestamp;
}
