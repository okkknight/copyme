import { generateHypotheses } from "@/lib/hypothesis-generation";
import { buildRuleCompetitionGroups } from "@/lib/rule-competition-groups";
import { evaluateRuleReplacement } from "@/lib/rule-replacement";
import {
  evaluateHypothesisTemporalLifecycle
} from "@/lib/rule-temporal";
import type {
  AppState,
  HypothesisRule,
  PersonaRule,
  RuleCompetitionGroup,
  RulePerformanceRecord,
  RuleReplacementRecord,
  RuleTemporalStats,
  CompetitionRoundRecord
} from "@/lib/types";

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

export type EvolutionArtifacts = {
  hypothesisRules: HypothesisRule[];
  ruleCompetitionGroups: RuleCompetitionGroup[];
  ruleReplacementRecords: RuleReplacementRecord[];
  rules: PersonaRule[];
};

export function buildEvolutionArtifacts(
  state: Pick<
    AppState,
    | "rules"
    | "sessions"
    | "sessionRuleJudgments"
    | "ruleEvidences"
    | "ruleAggregateStats"
  | "ruleCompetitionStats"
  | "ruleEcologyStats"
  | "ruleContradictions"
  | "reviewSignals"
  | "reviewSignalApplications"
  | "proxyReviewCases"
  | "ruleTemporalStats"
  | "competitionRoundRecords"
  | "rulePerformanceRecords"
  | "competitionGroupEcology"
  >
): EvolutionArtifacts {
  const hypothesisRules = uniqueById(
    generateHypotheses({
      contradictions: state.ruleContradictions,
      rules: state.rules,
      sessions: state.sessions,
      reviewSignals: state.reviewSignals,
      reviewSignalApplications: state.reviewSignalApplications,
      proxyReviewCases: state.proxyReviewCases
    })
  );

  const { groups, candidateScores } = buildRuleCompetitionGroups({
    rules: state.rules,
    hypothesisRules,
    aggregateStats: state.ruleAggregateStats,
    competitionStats: state.ruleCompetitionStats,
    contradictions: state.ruleContradictions,
    evidences: state.ruleEvidences,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: state.reviewSignalApplications,
    temporalStats: state.ruleTemporalStats ?? [],
    ecologyStats: state.ruleEcologyStats ?? [],
    competitionGroupEcology: state.competitionGroupEcology ?? []
  });

  const replacementResult = evaluateRuleReplacement({
    rules: state.rules,
    hypothesisRules,
    groups,
    candidateScores,
    aggregateStats: state.ruleAggregateStats,
    competitionStats: state.ruleCompetitionStats,
    contradictions: state.ruleContradictions,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: state.reviewSignalApplications,
    temporalStats: state.ruleTemporalStats ?? [],
    competitionRoundRecords: state.competitionRoundRecords ?? [],
    ecologyStats: state.ruleEcologyStats ?? [],
    competitionGroupEcology: state.competitionGroupEcology ?? []
  });

  const temporalByRuleId = new Map((state.ruleTemporalStats ?? []).map((stats) => [stats.ruleId, stats]));
  const hypStatusAdjusted = replacementResult.hypothesisRules.map((hypothesis) => {
    const temporalStats = temporalByRuleId.get(hypothesis.id);
    return {
      ...hypothesis,
      status: evaluateHypothesisTemporalLifecycle(
        hypothesis,
        temporalStats,
        state.competitionRoundRecords ?? [],
        replacementResult.ruleReplacementRecords,
        replacementResult.ruleCompetitionGroups
      )
    };
  });

  return {
    hypothesisRules: hypStatusAdjusted,
    ruleCompetitionGroups: replacementResult.ruleCompetitionGroups,
    ruleReplacementRecords: replacementResult.ruleReplacementRecords,
    rules: replacementResult.rules
  };
}
