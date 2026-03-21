"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildInitialAppState } from "@/data/mock";
import { buildTeacherTurn, createOpeningStudentTurn, generateStudentReply } from "@/lib/mock-engine";
import { extractSessionInsights, type ExtractedRuleBlueprint } from "@/lib/extractor";
import {
  computePersonaModelSummary,
  deriveSessionKeyMoments,
  deriveSessionRoundCount,
  deriveSessionRuleBuckets,
  selectPersonaModelSummary
} from "@/lib/selectors";
import type {
  AppState,
  PersonaRule,
  ProxyReviewCase,
  ReviewDiffLabel,
  RuleStatus,
  Session,
  SessionStatus,
  StudentProfile,
  Turn
} from "@/lib/types";

const STORAGE_KEY = "copyme-workbench-state-v2";
const storage = typeof window !== "undefined" ? createJSONStorage(() => window.localStorage) : undefined;

type StoreActions = {
  startSession: (studentTemplateId: string) => void;
  appendTeacherTurn: (sessionId: string, text: string) => void;
  appendStudentTurn: (sessionId: string, text: string, options?: Partial<Omit<Turn, "id" | "speaker" | "text" | "round" | "timestamp">>) => void;
  completeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  acceptRule: (ruleId: string, sessionId?: string) => void;
  rejectRule: (ruleId: string, sessionId?: string) => void;
  observeRule: (ruleId: string, sessionId?: string) => void;
  selectReviewLabel: (caseId: string, label: ReviewDiffLabel) => void;
  writeReviewFeedbackBack: (caseId: string) => void;
  selectSession: (sessionId: string) => void;
  selectProxyReviewCase: (caseId: string) => void;
  selectStudentTemplate: (studentTemplateId: string) => void;
  setTrainingDraft: (draft: string) => void;
  setSessionFilterStudentType: (value: string) => void;
  setSessionRuleStatusFilter: (value: AppState["sessionRuleStatusFilter"]) => void;
  setProxyReviewFeedbackDraft: (value: string) => void;
  resetMockState: () => void;
};

export type CopymeStore = AppState & StoreActions;

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeState(state: AppState): AppState {
  const sessions = state.sessions.map((session) => {
    const keyMoments = deriveSessionKeyMoments(session);
    const buckets = deriveSessionRuleBuckets(session, state.rules);
    return {
      ...session,
      acceptedRuleIds: buckets.acceptedRuleIds,
      rejectedRuleIds: buckets.rejectedRuleIds,
      pendingRuleIds: buckets.pendingRuleIds,
      keyMoments,
      roundCount: deriveSessionRoundCount(session),
      hasKeyMoments: keyMoments.length > 0
    };
  });

  return {
    ...state,
    sessions,
    personaModel: computePersonaModelSummary({ rules: state.rules, sessions })
  };
}

function resolveProfile(state: AppState, sessionOrTemplateId: string) {
  return (
    state.studentTemplates.find((template) => template.id === sessionOrTemplateId || template.templateId === sessionOrTemplateId) ??
    state.studentTemplates[0]
  );
}

function upsertRuleBlueprints(state: AppState, blueprints: ExtractedRuleBlueprint[], sessionId: string) {
  const nextRules = [...state.rules];

  for (const blueprint of blueprints) {
    const index = nextRules.findIndex((rule) => rule.id === blueprint.id);
    if (index >= 0) {
      const current = nextRules[index];
      const sourceSessionIds = unique([...current.sourceSessionIds, ...blueprint.sourceSessionIds, sessionId]);
      const nextStatus: RuleStatus = current.status === "accepted" || current.status === "rejected" ? current.status : blueprint.status === "candidate" ? current.status : blueprint.status;

      nextRules[index] = {
        ...current,
        text: blueprint.text,
        layer: blueprint.layer,
        confidence: Math.max(current.confidence, blueprint.confidence),
        sourceSessionIds,
        evidence: blueprint.evidence || current.evidence,
        status: nextStatus,
        updatedAt: nowIso(),
        lastObservedInSessionId: sessionId
      };
      continue;
    }

    nextRules.push({
      ...blueprint,
      sourceSessionIds: unique([...blueprint.sourceSessionIds, sessionId]),
      status: "candidate",
      createdAt: blueprint.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      lastObservedInSessionId: sessionId
    });
  }

  return nextRules;
}

function createSessionCandidateBlueprints(session: Session, profile: StudentProfile, rules: PersonaRule[]) {
  return extractSessionInsights(session, profile, rules).candidateBlueprints;
}

function createReviewBlueprints(reviewCase: ProxyReviewCase, label: ReviewDiffLabel, sourceSessionId: string): ExtractedRuleBlueprint[] {
  const baseEvidence = reviewCase.note || reviewCase.prompt;
  const createdAt = nowIso();
  const sessionIds = unique([sourceSessionId]);

  if (label === "more_like_me") {
    return [];
  }

  if (label === "not_like_me") {
    return [
      {
        id: `review-${reviewCase.id}-boundary`,
        text: "Proxy should preserve face-saving and avoid abrupt correction in this scenario.",
        layer: "boundary",
        confidence: 0.8,
        sourceSessionIds: sessionIds,
        evidence: baseEvidence,
        status: "candidate",
        createdAt,
        updatedAt: createdAt,
        lastObservedInSessionId: sourceSessionId
      }
    ];
  }

  if (label === "style_similar_decision_different") {
    return [
      {
        id: `review-${reviewCase.id}-decision`,
        text: "Keep the calm tone, but push for a concrete decision step before moving on.",
        layer: "decision",
        confidence: 0.78,
        sourceSessionIds: sessionIds,
        evidence: baseEvidence,
        status: "candidate",
        createdAt,
        updatedAt: createdAt,
        lastObservedInSessionId: sourceSessionId
      }
    ];
  }

  if (label === "decision_similar_style_different") {
    return [
      {
        id: `review-${reviewCase.id}-style`,
        text: "Preserve the decision path, but match the softer reassurance-first teaching tone.",
        layer: "style",
        confidence: 0.76,
        sourceSessionIds: sessionIds,
        evidence: baseEvidence,
        status: "candidate",
        createdAt,
        updatedAt: createdAt,
        lastObservedInSessionId: sourceSessionId
      }
    ];
  }

  return [
    {
      id: `review-${reviewCase.id}-boundary`,
      text: "Proxy response is too far from the human baseline and must keep both tone and decision aligned.",
      layer: "boundary",
      confidence: 0.74,
      sourceSessionIds: sessionIds,
      evidence: baseEvidence,
      status: "candidate",
      createdAt,
      updatedAt: createdAt,
      lastObservedInSessionId: sourceSessionId
    },
    {
      id: `review-${reviewCase.id}-decision`,
      text: "When the proxy drifts badly, preserve the teacher's decision shape before style polish.",
      layer: "decision",
      confidence: 0.72,
      sourceSessionIds: sessionIds,
      evidence: baseEvidence,
      status: "candidate",
      createdAt,
      updatedAt: createdAt,
      lastObservedInSessionId: sourceSessionId
    }
  ];
}

function getMatchingSourceSession(state: AppState, reviewCase: ProxyReviewCase) {
  return (
    state.sessions.find(
      (session) =>
        session.createdFromTemplateId === reviewCase.studentTemplateId &&
        session.scenario === reviewCase.scenario &&
        session.status !== "draft"
    ) ?? state.sessions[0]
  );
}

function withResetState(): AppState {
  return buildInitialAppState();
}

export const useCopymeStore = create<CopymeStore>()(
  persist(
    (set) => ({
      ...withResetState(),

      startSession(studentTemplateId) {
        set((current) => {
          const template = current.studentTemplates.find((item) => item.id === studentTemplateId) ?? current.studentTemplates[0];
          const sessionId = makeId("session");
          const openingTurn = createOpeningStudentTurn(template, sessionId);
          const session: Session = {
            id: sessionId,
            title: `New session with ${template.name}`,
            date: new Date().toISOString().slice(0, 10),
            studentType: template.name,
            studentProfileId: template.id,
            scenario: template.scenarioGoal,
            duration: "0m",
            tags: template.defaultTags ?? [],
            hasKeyMoments: true,
            summary: template.summary,
            transcript: [openingTurn],
            candidateRuleIds: [],
            status: "active",
            startedAt: nowIso(),
            createdFromTemplateId: template.templateId,
            roundCount: 1,
            keyMoments: [openingTurn.text],
            acceptedRuleIds: [],
            rejectedRuleIds: [],
            pendingRuleIds: []
          };

          const nextState = normalizeState({
            ...current,
            sessions: [session, ...current.sessions],
            activeSessionId: sessionId,
            selectedSessionId: sessionId,
            selectedStudentTemplateId: template.id,
            trainingDraft: ""
          });

          return nextState;
        });
      },

      appendTeacherTurn(sessionId, text) {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session) return current;

          const profile = resolveProfile(current, session.studentProfileId);
          const nextRound = session.roundCount + 1;
          const teacherTurn = buildTeacherTurn(text, nextRound);
          const studentReply = generateStudentReply(profile, text, session.id, nextRound);
          const updatedSession: Session = {
            ...session,
            transcript: [...session.transcript, teacherTurn, studentReply],
            roundCount: nextRound,
            status: session.status === "draft" ? "active" : session.status,
            candidateRuleIds: unique([...session.candidateRuleIds]),
            keyMoments: [...session.keyMoments],
            hasKeyMoments: session.hasKeyMoments
          };

          const extraction = extractSessionInsights(updatedSession, profile, current.rules);
          const nextRules = upsertRuleBlueprints(current, extraction.candidateBlueprints, sessionId);
          const nextSession: Session = {
            ...updatedSession,
            candidateRuleIds: unique([...updatedSession.candidateRuleIds, ...extraction.candidateRuleIds]),
            transcript: updatedSession.transcript
          };
          const sessions = current.sessions.map((item) => (item.id === sessionId ? nextSession : item));

          return normalizeState({
            ...current,
            sessions,
            rules: nextRules,
            activeSessionId: sessionId,
            selectedSessionId: sessionId,
            trainingDraft: ""
          });
        });
      },

      appendStudentTurn(sessionId, text, options) {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session) return current;

          const nextRound = session.roundCount + 1;
          const studentTurn: Turn = {
            id: makeId(`student-${nextRound}`),
            speaker: "student",
            source: options?.source ?? "simulator",
            text,
            round: nextRound,
            tags: options?.tags ?? [],
            timestamp: nowIso(),
            highlighted: options?.highlighted ?? false,
            teachingActions: options?.teachingActions ?? [],
            emotionSignal: options?.emotionSignal ?? [],
            ruleTriggers: options?.ruleTriggers ?? []
          };

          const nextSession = {
            ...session,
            transcript: [...session.transcript, studentTurn],
            roundCount: nextRound,
            candidateRuleIds: unique([...session.candidateRuleIds])
          };

          const sessions = current.sessions.map((item) => (item.id === sessionId ? nextSession : item));
          return normalizeState({ ...current, sessions, selectedSessionId: sessionId });
        });
      },

      completeSession(sessionId) {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session) return current;

          const profile = resolveProfile(current, session.studentProfileId);
          const extraction = createSessionCandidateBlueprints(session, profile, current.rules);
          const nextRules = upsertRuleBlueprints(current, extraction, sessionId);
          const nextSessions = current.sessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  status: "completed" as SessionStatus,
                  endedAt: nowIso(),
                  candidateRuleIds: unique([...item.candidateRuleIds, ...extraction.map((rule) => rule.id)])
                }
              : item
          );

          const nextState = normalizeState({
            ...current,
            sessions: nextSessions,
            rules: nextRules,
            activeSessionId: current.activeSessionId === sessionId ? undefined : current.activeSessionId,
            selectedSessionId: sessionId
          });

          return nextState;
        });
      },

      setActiveSession(sessionId) {
        set((current) => ({
          ...current,
          activeSessionId: sessionId,
          selectedSessionId: sessionId
        }));
      },

      acceptRule(ruleId, sessionId) {
        set((current) => {
          const nextRules = current.rules.map((rule) =>
            rule.id === ruleId
              ? {
                  ...rule,
                  status: "accepted" as RuleStatus,
                  updatedAt: nowIso(),
                  lastObservedInSessionId: sessionId ?? rule.lastObservedInSessionId
                }
              : rule
          );

          return normalizeState({
            ...current,
            rules: nextRules,
            selectedSessionId: sessionId ?? current.selectedSessionId
          });
        });
      },

      rejectRule(ruleId, sessionId) {
        set((current) => {
          const nextRules = current.rules.map((rule) =>
            rule.id === ruleId
              ? {
                  ...rule,
                  status: "rejected" as RuleStatus,
                  updatedAt: nowIso(),
                  lastObservedInSessionId: sessionId ?? rule.lastObservedInSessionId
                }
              : rule
          );

          return normalizeState({
            ...current,
            rules: nextRules,
            selectedSessionId: sessionId ?? current.selectedSessionId
          });
        });
      },

      observeRule(ruleId, sessionId) {
        set((current) => {
          const nextRules = current.rules.map((rule) =>
            rule.id === ruleId && rule.status !== "accepted" && rule.status !== "rejected"
              ? {
                  ...rule,
                  status: "observed" as RuleStatus,
                  updatedAt: nowIso(),
                  lastObservedInSessionId: sessionId ?? rule.lastObservedInSessionId
                }
              : rule
          );

          return normalizeState({
            ...current,
            rules: nextRules,
            selectedSessionId: sessionId ?? current.selectedSessionId
          });
        });
      },

      selectReviewLabel(caseId, label) {
        set((current) => {
          const nextCases = current.proxyReviewCases.map((item) =>
            item.id === caseId
              ? {
                  ...item,
                  selectedLabel: label,
                  reviewStatus: "reviewed" as const,
                  updatedAt: nowIso(),
                  writtenBackRuleIds: undefined
                }
              : item
          );

          return {
            ...current,
            proxyReviewCases: nextCases,
            selectedProxyReviewCaseId: caseId
          };
        });
      },

      writeReviewFeedbackBack(caseId) {
        set((current) => {
          const reviewCase = current.proxyReviewCases.find((item) => item.id === caseId);
          if (!reviewCase) return current;

          const label = reviewCase.selectedLabel ?? "not_like_me";
          const sourceSession = getMatchingSourceSession(current, reviewCase);
          const blueprints = createReviewBlueprints(reviewCase, label, sourceSession.id);
          const nextRules = upsertRuleBlueprints(current, blueprints, sourceSession.id);

          const nextCases = current.proxyReviewCases.map((item) =>
            item.id === caseId
              ? {
                  ...item,
                  reviewStatus: "written_back" as const,
                  updatedAt: nowIso(),
                  writtenBackRuleIds: blueprints.map((rule) => rule.id)
                }
              : item
          );

          return normalizeState({
            ...current,
            proxyReviewCases: nextCases,
            rules: nextRules,
            selectedProxyReviewCaseId: caseId
          });
        });
      },

      selectSession(sessionId) {
        set((current) => ({
          ...current,
          selectedSessionId: sessionId
        }));
      },

      selectProxyReviewCase(caseId) {
        set((current) => ({
          ...current,
          selectedProxyReviewCaseId: caseId
        }));
      },

      selectStudentTemplate(studentTemplateId) {
        set((current) => ({
          ...current,
          selectedStudentTemplateId: studentTemplateId
        }));
      },

      setTrainingDraft(draft) {
        set((current) => ({
          ...current,
          trainingDraft: draft
        }));
      },

      setSessionFilterStudentType(value) {
        set((current) => ({
          ...current,
          sessionFilterStudentType: value
        }));
      },

      setSessionRuleStatusFilter(value) {
        set((current) => ({
          ...current,
          sessionRuleStatusFilter: value
        }));
      },

      setProxyReviewFeedbackDraft(value) {
        set((current) => ({
          ...current,
          proxyReviewFeedbackDraft: value
        }));
      },

      resetMockState() {
        set(() => withResetState());
      }
    }),
    {
      name: STORAGE_KEY,
      storage,
      version: 2,
      migrate: (persistedState, version) => {
        if (version !== 2) {
          return buildInitialAppState();
        }

        const next = persistedState as Partial<AppState> | undefined;
        if (!next || !Array.isArray(next.sessions) || !Array.isArray(next.rules) || !Array.isArray(next.studentTemplates)) {
          return buildInitialAppState();
        }

        return next as AppState;
      },
      partialize: (state) => ({
        studentTemplates: state.studentTemplates,
        sessions: state.sessions,
        rules: state.rules,
        personaModel: state.personaModel,
        proxyReviewCases: state.proxyReviewCases,
        activeSessionId: state.activeSessionId,
        selectedSessionId: state.selectedSessionId,
        selectedProxyReviewCaseId: state.selectedProxyReviewCaseId,
        selectedStudentTemplateId: state.selectedStudentTemplateId,
        trainingDraft: state.trainingDraft,
        sessionFilterStudentType: state.sessionFilterStudentType,
        sessionRuleStatusFilter: state.sessionRuleStatusFilter,
        proxyReviewFeedbackDraft: state.proxyReviewFeedbackDraft
      }),
      merge: (persistedState, currentState) => {
        const next = {
          ...currentState,
          ...(persistedState as Partial<AppState>)
        } as CopymeStore;
        return normalizeState(next) as CopymeStore;
      }
    }
  )
);

export function useWorkbenchState<T>(selector: (state: CopymeStore) => T) {
  return useCopymeStore(selector);
}

export const workbenchSelectors = {
  selectPersonaModelSummary,
  selectAcceptedRules: (state: CopymeStore) => state.rules.filter((rule) => rule.status === "accepted")
};
