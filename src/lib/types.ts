export type StudentLevel = "beginner" | "intermediate" | "advanced";
export type StudentAttitude = "shy" | "smart-but-lazy" | "anxious" | "argumentative";
export type StudentConfidence = "low" | "medium" | "high";
export type StudentEmotion = "calm" | "anxious" | "resistant" | "self-conscious" | "confident";
export type ErrorPattern = "grammar" | "pronunciation" | "vocabulary" | "meaning" | "organization";
export type SessionScenario = "daily talk" | "interview" | "opinion" | "storytelling" | "debate";
export type SessionStatus = "draft" | "active" | "completed";
export type TurnSpeaker = "student" | "teacher" | "system";
export type TurnSource = "human" | "simulator" | "extractor" | "proxy";
export type TeachingActionTag =
  | "reassure"
  | "correct"
  | "pressure"
  | "diagnose"
  | "retry"
  | "example_first"
  | "meaning_first"
  | "grammar_first"
  | "narrow_scope"
  | "push_precision";
export type PersonaLayer = "style" | "decision" | "value" | "boundary";
export type SessionRuleStatus = "candidate" | "accepted" | "rejected" | "observed";
export type RuleStatus = SessionRuleStatus;
export type RuleLifecycleState = "candidate" | "emerging" | "accepted" | "stable" | "challenged" | "contradicted" | "deprecated" | "invalidated" | "rejected";
export type HypothesisRuleStatus = "candidate" | "testing" | "emerging" | "accepted" | "fading" | "superseded" | "rejected" | "replaced";
export type HypothesisSourceType = "contradiction" | "review_signal" | "session_pattern";
export type RuleCompetitionGroupStatus = "open" | "settled" | "contested";
export type ReviewDiffLabel =
  | "more_like_me"
  | "not_like_me"
  | "style_similar_decision_different"
  | "decision_similar_style_different"
  | "totally_off";
export type ReviewStatus = "new" | "reviewed" | "written_back";
export type ReviewSignalType = "decision_correction" | "style_correction" | "boundary_correction";
export type ReviewSignalStatus = "new" | "applied" | "ignored";
export type BehaviorPatternId =
  | "reassurance_before_correction"
  | "retry_before_explanation"
  | "meaning_before_grammar"
  | "strict_escalation_after_repeated_same_error"
  | "diagnose_confidence_before_correcting";
export type RuleEvidenceType = "support" | "challenge" | "review_correction";
export type ReviewSignalApplicationAction = "support_existing_rule" | "challenge_existing_rule" | "spawn_candidate_seed" | "no_effect";
export type RuleContradictionSourceType = "session_judgment" | "review_signal";
export type RuleContradictionType = "behavior_conflict" | "boundary_violation" | "decision_mismatch" | "style_mismatch";
export type RuleContradictionSeverity = "low" | "medium" | "high";
export type RulePerformanceOutcome = "win" | "loss" | "support" | "challenge" | "idle";
export type RuleTemporalTrend = "rising" | "stable" | "fading" | "volatile";
export type RuleEcologyStatus = "dominant" | "fragile" | "contested" | "fading";
export type CompetitionGroupEcologyLockStatus = "unlocked" | "locked" | "breaking";
export type CompetitionGroupEcologyClass = "stable" | "pressured" | "contested" | "turnover";
export type RecoveryMode = "stalled" | "slow" | "recovering" | "stabilized";
export type RuleDecayReason = "idle_decay" | "momentum_loss" | "dominance_break";
export type RuleDecaySeverity = "low" | "medium" | "high";
export type RuleDecayPath = "idle" | "support_loss" | "displacement";
export type LayeredPressureMemory = {
  challengerPressure: number;
  contradictionShock: number;
  reviewShock: number;
  turnoverStress: number;
};

export type CalibrationScope = "global" | "sentence" | "phrase";

export type SeverityEvidence = {
  category: "decision" | "priority" | "style" | "boundary";
  evidenceType:
    | "teacher_boundary_conflict"
    | "teacher_decision_conflict"
    | "public_humiliation_signal"
    | "direct_correction_before_safety"
    | "priority_order_conflict"
    | "meaning_first_violation"
    | "face_saving_violation"
    | "student_state_mismatch";
  weight: number;
  explanation: string;
};

export type PrecisionSeverityResult = {
  category: "decision" | "priority" | "style" | "boundary";
  severity: "low" | "medium" | "high";
  score: number;
  evidence: SeverityEvidence[];
};

export type SegmentCorrectionIntent = {
  segmentId: string;
  category: "decision" | "priority" | "style" | "boundary";
  correctionIntent: "protect" | "soften" | "reframe" | "reorder" | "rewrite";
  reason: string;
};

export type RoutingConflictSignal = {
  signalType:
    | "teacher_direction_conflict"
    | "mixed_content_conflict"
    | "high_similarity_wrong_reasoning"
    | "adversarial_politeness_mask"
    | "long_text_multi_intent_conflict"
    | "student_state_priority_conflict";
  category: "decision" | "priority" | "style" | "boundary";
  severity: "low" | "medium" | "high";
  score: number;
  explanation: string;
};

export type CalibratedConflictSignal = {
  signalType:
    | "teacher_direction_conflict"
    | "mixed_content_conflict"
    | "high_similarity_wrong_reasoning"
    | "adversarial_politeness_mask"
    | "long_text_multi_intent_conflict"
    | "student_state_priority_conflict";
  category: "decision" | "priority" | "style" | "boundary";
  recallScore: number;
  calibrationScore: number;
  finalScore: number;
  severity: "low" | "medium" | "high";
  scope: "global" | "segment" | "local_cluster";
  explanation: string;
  evidence: string[];
};

export type SignalCalibrationTrace = {
  signalType: string;
  rawScore: number;
  boostedBy: string[];
  reducedBy: string[];
  finalScore: number;
  rationale: string;
};

export type DirectionConflictProbe = {
  teacherCoreDirection: string;
  proxyCoreDirection: string;
  conflictDetected: boolean;
  confidence: number;
  explanation: string;
};

export type LongTextScopeSplit = {
  globalSignals: CalibratedConflictSignal[];
  localClusterSignals: Array<{
    clusterId: string;
    segmentIds: string[];
    dominantSignal: string;
    strength: number;
  }>;
};

export type RoutingDecision = {
  reviewCaseId: string;
  finalMode: "skip" | "light_touch" | "targeted" | "full_correction";
  shouldOverrideGuard: boolean;
  overrideReason?: string;
  protectedSegments: string[];
  editableSegments: string[];
  targetedCategories: Array<"decision" | "priority" | "style" | "boundary">;
  conflictSignals: RoutingConflictSignal[];
  rationale: string;
};

export type SegmentPriority = {
  segmentId: string;
  editPriority: number;
  preservePriority: number;
  dominantCategory: "decision" | "priority" | "style" | "boundary";
  reason: string;
};

export type ReactionBand =
  | "skip"
  | "guarded_targeted"
  | "partial_targeted"
  | "cluster_targeted"
  | "bounded_full"
  | "full_correction";

export type ReactionControlDecision = {
  reviewCaseId: string;
  band: ReactionBand;
  reason: string;
  capped: boolean;
  capReason?: string;
  protectedBySafetyLoop: boolean;
};

export type ReactionConstraint = {
  maxEditableSegments?: number;
  allowGlobalRewrite: boolean;
  forceLocalOnly: boolean;
  preserveHighPrioritySegments: boolean;
};

export type ReactionEditBudget = {
  maxEdits: number;
  editableSegments: string[];
};

export type MicroEditOpportunity = {
  segmentId: string;
  type:
    | "tone_soften"
    | "boundary_soften"
    | "instruction_reorder"
    | "redundancy_cleanup"
    | "clarity_improve";
  expectedGain: number;
  riskLevel: "low" | "medium";
  reason: string;
};

export type MicroEditROI = {
  segmentId: string;
  type:
    | "tone_soften"
    | "boundary_soften"
    | "instruction_reorder"
    | "redundancy_cleanup"
    | "clarity_improve";
  expectedSimilarityGain: number;
  expectedNaturalnessGain: number;
  riskPenalty: number;
  budgetCost: number;
  roiScore: number;
  rationale: string;
};

export type MicroEditSelectionResult = {
  selected: MicroEditROI[];
  rejected: MicroEditROI[];
  totalExpectedSimilarityGain: number;
  totalExpectedNaturalnessGain: number;
  budgetUsed: number;
  rationale: string;
};

export type EditBudgetPolicy = {
  maxBudget: number;
  preferSimilarityGain: boolean;
  preferNaturalnessGain: boolean;
  maxEdits: number;
};

export type MicroEditPlan = {
  reviewCaseId: string;
  selectedEdits: MicroEditOpportunity[];
  totalExpectedGain: number;
  safe: boolean;
  scoredEdits?: MicroEditROI[];
  selectionResult?: MicroEditSelectionResult;
  editBudgetPolicy?: EditBudgetPolicy;
};

export type MicroEditResult = {
  applied: boolean;
  gainEstimated: number;
  gainActual?: number;
};

export type ResponsePolishPlan = {
  reviewCaseId: string;
  shouldPolish: boolean;
  issues: Array<"duplicate_punctuation" | "transition_gap" | "duplicate_phrase" | "awkward_join" | "tone_mismatch">;
  preservedSegments: string[];
  editedSegments: string[];
  transitionTargets: Array<{
    fromSegmentId: string;
    toSegmentId: string;
    reason: string;
  }>;
};

export type NaturalnessScore = {
  fluency: number;
  coherence: number;
  redundancy: number;
  toneNaturalness: number;
  overall: number;
};

export type PolishResult = {
  beforeText: string;
  afterText: string;
  naturalnessBefore: NaturalnessScore;
  naturalnessAfter: NaturalnessScore;
  improved: boolean;
};

export type CalibrationPlan = {
  reviewCaseId: string;
  shouldApply: boolean;
  mode: "skip" | "light_touch" | "targeted" | "full_correction";
  protectedSegments: string[];
  editableSegments: string[];
  targetedCategories: Array<"decision" | "priority" | "style" | "boundary">;
  actions: ProxyCalibrationAction[];
  reason: string;
  precisionSeverities?: PrecisionSeverityResult[];
  segmentCorrectionIntents?: SegmentCorrectionIntent[];
  routingDecision?: RoutingDecision;
  conflictSignals?: RoutingConflictSignal[];
  calibratedConflictSignals?: CalibratedConflictSignal[];
  signalCalibrationTraces?: SignalCalibrationTrace[];
  directionProbe?: DirectionConflictProbe;
  longTextScopeSplit?: LongTextScopeSplit;
  segmentPriorities?: SegmentPriority[];
  reactionDecision?: ReactionControlDecision;
  reactionConstraint?: ReactionConstraint;
  reactionBand?: ReactionBand;
  reactionSafetyReason?: string;
  editBudget?: ReactionEditBudget;
  microEditOpportunities?: MicroEditOpportunity[];
  microEditROIs?: MicroEditROI[];
  microEditSelectionResult?: MicroEditSelectionResult;
  microEditPlan?: MicroEditPlan;
  microEditResult?: MicroEditResult;
  editBudgetPolicy?: EditBudgetPolicy;
};

export type SegmentDiff = {
  segmentId: string;
  originalText: string;
  category: "decision" | "priority" | "style" | "boundary";
  severity: "low" | "medium" | "high";
  shouldEdit: boolean;
  suggestedAction: "keep" | "soften" | "reorder" | "rewrite" | "reframe";
};

export type PrecisionRegressionResult = {
  beforeScore: import("@/lib/similarity-evaluator").SimilarityScore;
  afterScore: import("@/lib/similarity-evaluator").SimilarityScore;
  delta: number;
  improved: boolean;
  guarded: boolean;
  calibrationMode: "skip" | "light_touch" | "targeted" | "full_correction";
  protectedSegmentCount: number;
  editedSegmentCount: number;
};

export type ProxyCalibrationAction = {
  action: "strengthen" | "weaken" | "adjust_priority" | "adjust_boundary" | "adjust_style";
  magnitude: number;
  reason: string;
};

export type ProxyCalibrationState = {
  id: string;
  sourceReviewCaseId: string;
  targetRuleIds: string[];
  actions: ProxyCalibrationAction[];
  calibrationMode?: CalibrationPlan["mode"];
  calibrationScope?: CalibrationScope;
  protectedSegments?: string[];
  editableSegments?: string[];
  segmentDiffs?: SegmentDiff[];
  precisionSeverities?: PrecisionSeverityResult[];
  segmentCorrectionIntents?: SegmentCorrectionIntent[];
  routingDecision?: RoutingDecision;
  conflictSignals?: RoutingConflictSignal[];
  calibratedConflictSignals?: CalibratedConflictSignal[];
  signalCalibrationTraces?: SignalCalibrationTrace[];
  directionProbe?: DirectionConflictProbe;
  longTextScopeSplit?: LongTextScopeSplit;
  segmentPriorities?: SegmentPriority[];
  reactionDecision?: ReactionControlDecision;
  reactionConstraint?: ReactionConstraint;
  reactionBand?: ReactionBand;
  reactionSafetyReason?: string;
  editBudget?: ReactionEditBudget;
  microEditOpportunities?: MicroEditOpportunity[];
  microEditROIs?: MicroEditROI[];
  microEditSelectionResult?: MicroEditSelectionResult;
  microEditPlan?: MicroEditPlan;
  microEditResult?: MicroEditResult;
  editBudgetPolicy?: EditBudgetPolicy;
  planReason?: string;
  createdAt: string;
  updatedAt?: string;
};

export type FullFixtureRegressionVerdict = "improved" | "stable" | "degraded";

export type FullFixtureRegressionEdit = {
  type: string;
  roiScore: number;
  expectedGain: number;
};

export type FullFixtureRegressionCaseResult = {
  caseId: string;
  fixtureFamily: "review" | "ood";
  similarityBefore: number;
  similarityAfter: number;
  delta: number;
  routingDecision: string;
  override: boolean;
  reactionBand: ReactionBand;
  reactionCap: boolean;
  safetyTriggered: boolean;
  selectedEdits: FullFixtureRegressionEdit[];
  rejectedEditsCount: number;
  budgetUsed: number;
  maxBudget: number;
  finalVerdict: FullFixtureRegressionVerdict;
  previousDelta?: number;
  change?: number;
};

export type FullFixtureRegressionComparisonRow = {
  caseId: string;
  previousDelta: number;
  currentDelta: number;
  change: number;
};

export type FullFixtureRegressionSummary = {
  reviewPassRate: number;
  reviewAverageDelta: number;
  oodStrictSuccessRate: number;
  oodAverageDelta: number;
  totalAverageDelta: number;
  improvedCount: number;
  stableCount: number;
  degradedCount: number;
  avgSelectedEditsPerCase: number;
  avgRejectedEditsPerCase: number;
  noOpCount: number;
};

export type FullFixtureRegressionReport = {
  baselineVersion: "v1";
  generatedAt: string;
  regressionPath: string;
  baselineSource: "generated" | "existing";
  fixtureCount: number;
  cases: FullFixtureRegressionCaseResult[];
  summary: FullFixtureRegressionSummary;
  comparisonRows: FullFixtureRegressionComparisonRow[];
  previousBaselineGeneratedAt?: string;
};

export type WritebackDecision = {
  shouldWriteBack: boolean;
  reason: "near_perfect_guard" | "low_confidence_diff" | "real_correction_needed";
  blockedCategories?: string[];
};

export type StudentTemplate = {
  id: string;
  templateId?: string;
  name: string;
  defaultLevel: StudentLevel;
  defaultAttitude: StudentAttitude;
  defaultConfidence: StudentConfidence;
  defaultEmotion: StudentEmotion;
  defaultErrorPattern: ErrorPattern;
  defaultScenarioGoal: SessionScenario;
  summary: string;
  accentNote: string;
  failureMode: string;
  defaultTags?: string[];
  teachingHints?: string[];
};

export type StudentProfile = StudentTemplate;

export type StudentConfig = {
  templateId?: string;
  level: StudentLevel;
  attitude: StudentAttitude;
  confidence: StudentConfidence;
  emotion: StudentEmotion;
  errorPattern: ErrorPattern;
  scenarioGoal: SessionScenario;
};

export type SimulatedStudentProfile = {
  id: string;
  templateId?: string;
  config: StudentConfig;
  summary: string;
  responseStyle: string;
  hesitationStyle: string;
  likelyMistakeModes: string[];
  faceSavingTendency: number;
  challengeTendency: number;
  generatedTags: string[];
};

export type Turn = {
  id: string;
  speaker: TurnSpeaker;
  source: TurnSource;
  text: string;
  round: number;
  tags?: string[];
  timestamp: string;
  highlighted?: boolean;
  teachingActions?: TeachingActionTag[];
  emotionSignal?: string[];
  ruleTriggers?: string[];
};

export type SessionRuleJudgment = {
  id: string;
  sessionId: string;
  ruleId: string;
  status: RuleStatus;
  confidence: number;
  evidenceTurnIds: string[];
  note?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ReviewSignal = {
  id: string;
  reviewCaseId: string;
  signalType: ReviewSignalType;
  targetLayer: PersonaLayer;
  description: string;
  status: ReviewSignalStatus;
  createdAt: string;
};

export type RuleEvidence = {
  id: string;
  ruleId: string;
  sessionId: string;
  judgmentId?: string;
  judgmentStatus?: RuleStatus;
  reviewSignalId?: string;
  reviewSignalApplicationId?: string;
  turnIds: string[];
  evidenceType: RuleEvidenceType;
  confidenceContribution: number;
  summary: string;
  createdAt: string;
};

export type RuleAggregateStats = {
  ruleId: string;
  supportCount: number;
  challengeCount: number;
  observedCount: number;
  reviewCorrectionCount: number;
  sourceSessionCount: number;
  sourceSessionIds: string[];
  lastSupportedAt?: string;
  lastChallengedAt?: string;
  currentConfidence: number;
  stabilityScore: number;
  latestEvidenceAt?: string;
};

export type ReviewSignalApplication = {
  id: string;
  reviewSignalId: string;
  appliedToRuleIds: string[];
  createdEvidenceIds: string[];
  action: ReviewSignalApplicationAction;
  note: string;
  createdAt: string;
  spawnedCandidateRuleIds?: string[];
  didForceDowngrade?: boolean;
  createdContradictionIds?: string[];
};

export type RuleContradiction = {
  id: string;
  ruleId: string;
  sourceType: RuleContradictionSourceType;
  sourceId: string;
  contradictionType: RuleContradictionType;
  severity: RuleContradictionSeverity;
  summary: string;
  relatedSessionId?: string;
  relatedTurnIds?: string[];
  createdAt: string;
};

export type RuleCompetitionStats = {
  ruleId: string;
  supportWeight: number;
  challengeWeight: number;
  netScore: number;
  contradictionScore: number;
  correctionPressure: number;
  confidenceScore: number;
  survivabilityScore: number;
};

export type RulePerformanceRecord = {
  id: string;
  ruleId: string;
  sessionId: string;
  competitionGroupId?: string;
  outcome: RulePerformanceOutcome;
  scoreDelta: number;
  survivabilityDelta: number;
  confidenceDelta: number;
  reason: string;
  createdAt: string;
};

export type RuleTemporalStats = {
  ruleId: string;
  survivalCount: number;
  failureCount: number;
  supportCount: number;
  challengeCount: number;
  winCount: number;
  lossCount: number;
  idleCount: number;
  recentWinRate: number;
  recentFailureRate: number;
  momentumScore: number;
  volatilityScore: number;
  decayAdjustedScore: number;
  recentWindowSize: number;
  recentSupportCount: number;
  recentChallengeCount: number;
  recentIdleCount: number;
  lastEvaluatedAt?: string;
  lastWinAt?: string;
  lastLossAt?: string;
  trend: RuleTemporalTrend;
};

export type RuleEcologyStats = {
  ruleId: string;
  dominanceSpan: number;
  currentWinStreak: number;
  currentLossStreak: number;
  challengerCount: number;
  challengePressure: number;
  inheritedPressure: number;
  layeredPressureImpact: LayeredPressureMemory;
  recoveryMode: RecoveryMode;
  idleDecayScore: number;
  cooldownPenalty: number;
  recoveryScore: number;
  stabilityPenalty: number;
  dominanceStrength: number;
  hardeningScore: number;
  destabilizationPenalty: number;
  ecologyStatus: RuleEcologyStatus;
  resilienceScore: number;
  isIncumbent: boolean;
  isCurrentLeader: boolean;
  effectivePressure: number;
  resistanceScore: number;
  replacementRisk: number;
  decayPath?: RuleDecayPath;
  lastDominantAt?: string;
  lastChallengedAt?: string;
  lastDecayedAt?: string;
};

export type CompetitionGroupEcology = {
  competitionGroupId: string;
  activeRuleId?: string;
  incumbentRuleId?: string;
  currentLeaderRuleId?: string;
  challengerRuleIds: string[];
  dominanceSpan: number;
  turnoverCounter: number;
  lockStatus: CompetitionGroupEcologyLockStatus;
  effectivePressure: number;
  resistanceScore: number;
  contestIntensity: number;
  stabilityClass: CompetitionGroupEcologyClass;
  replacementRisk: number;
  pressureMemory: number;
  layeredPressureMemory: LayeredPressureMemory;
  recoveryMode: RecoveryMode;
  cooldownLevel: number;
  recoveryProgress: number;
  stabilityInertia: number;
  dominanceConsolidation: number;
  contestDampening: number;
  lastPressureAt?: string;
  lastBreakAt?: string;
  lastRecoveryAt?: string;
  lastStabilizedAt?: string;
  lastContestedAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type RuleDecayRecord = {
  id: string;
  ruleId: string;
  reason: RuleDecayReason;
  decayPath: RuleDecayPath;
  severity: RuleDecaySeverity;
  scoreImpact: number;
  competitionGroupId?: string;
  relatedIncumbentRuleId?: string;
  relatedChallengerRuleId?: string;
  createdAt: string;
};

export type CompetitionRoundRecord = {
  id: string;
  competitionGroupId: string;
  sessionId?: string;
  winnerRuleId?: string;
  loserRuleIds: string[];
  scoreSnapshot: Record<string, number>;
  settled: boolean;
  reason: string;
  createdAt: string;
};

export type Session = {
  id: string;
  title: string;
  date?: string;
  studentType: string;
  studentTemplateId?: string;
  studentProfileId?: string;
  studentConfigSnapshot: StudentConfig;
  simulatedStudentProfile: SimulatedStudentProfile;
  scenario: SessionScenario;
  duration?: string;
  tags: string[];
  hasKeyMoments: boolean;
  summary: string;
  transcript: Turn[];
  candidateRuleIds: string[];
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  createdFromTemplateId?: string;
  roundCount: number;
  keyMoments: string[];
  acceptedRuleIds: string[];
  rejectedRuleIds: string[];
  pendingRuleIds: string[];
};

export type PersonaRule = {
  id: string;
  text: string;
  layer: PersonaLayer;
  topicKey?: string;
  confidence: number;
  baseConfidence?: number;
  sourceSessionIds: string[];
  evidence: string;
  status: RuleLifecycleState;
  createdAt: string;
  updatedAt?: string;
  lastObservedInSessionId?: string;
  competitionGroupId?: string;
  replacedByRuleId?: string;
};

export type HypothesisRule = {
  id: string;
  text: string;
  layer: PersonaLayer;
  topicKey: string;
  sourceType: HypothesisSourceType;
  sourceIds: string[];
  parentRuleIds: string[];
  competingRuleIds: string[];
  status: HypothesisRuleStatus;
  confidence: number;
  createdAt: string;
  updatedAt?: string;
  rationale: string;
  evidenceTurnIds: string[];
  sourceSessionIds: string[];
  competitionGroupId?: string;
  replacedByRuleId?: string;
};

export type RuleCompetitionGroup = {
  id: string;
  layer: PersonaLayer;
  topicKey: string;
  ruleIds: string[];
  activeRuleId?: string;
  status: RuleCompetitionGroupStatus;
  createdAt: string;
  updatedAt?: string;
  winnerRuleId?: string;
  confidenceGap?: number;
  settled?: boolean;
};

export type RuleReplacementRecord = {
  id: string;
  replacedRuleId: string;
  replacementRuleId: string;
  competitionGroupId: string;
  reason: string;
  createdAt: string;
};

export type PersonaModel = {
  version: string;
  updatedAt: string;
  maturity: number;
  sourceSessionIds: string[];
  acceptedRuleIds: string[];
  styleRuleIds: string[];
  decisionRuleIds: string[];
  valueRuleIds: string[];
  boundaryRuleIds: string[];
  reviewSignalAppliedCount: number;
  activeRuleIds: string[];
  atRiskRuleIds: string[];
  hypothesisRuleIds: string[];
  competitionGroupIds: string[];
  replacementRecordIds: string[];
  dominantRuleIds: string[];
  fragileRuleIds: string[];
  contestedRuleIds: string[];
  fadingRuleIds: string[];
  competitionGroupEcologyIds: string[];
  ruleDecayRecordIds: string[];
};

export type ProxyReviewCase = {
  id: string;
  modelVersion: string;
  studentTemplateId: string;
  studentTemplateName: string;
  fixtureFamily?: "review" | "ood";
  riskType?: "mixed" | "boundary" | "long" | "reasoning" | "adversarial";
  expectedTeacherDirection?: string;
  shortFailureDescription?: string;
  feedbackWrittenBack?: boolean;
  scenario: SessionScenario;
  prompt: string;
  yourResponse: string;
  proxyResponse: string;
  note: string;
  diffLabels: ReviewDiffLabel[];
  correctionPoints: string[];
  reviewStatus: ReviewStatus;
  selectedLabel?: ReviewDiffLabel;
  writtenBackRuleIds?: string[];
  createdAt: string;
  updatedAt?: string;
};

export type CandidateRuleSeed = {
  id: string;
  ruleId: string;
  text: string;
  layer: PersonaLayer;
  confidence: number;
  behaviorPatternId: BehaviorPatternId;
  evidenceTurnIds: string[];
  evidenceSummary: string;
  sourceSessionIds: string[];
  status: RuleStatus;
  createdAt: string;
  updatedAt: string;
};

export type ExtractorV2Result = {
  detectedTeachingBehaviors: string[];
  behaviorPatterns: Array<{
    patternId: BehaviorPatternId;
    label: string;
    note: string;
    evidenceTurnIds: string[];
    strength: number;
  }>;
  temporaryStyleNotes: string[];
  temporaryDecisionNotes: string[];
  candidateRuleSeeds: CandidateRuleSeed[];
  evidenceMapping: Record<string, string[]>;
};

export type AppState = {
  studentTemplates: StudentTemplate[];
  currentStudentConfig: StudentConfig;
  activeSimulatedStudentProfile?: SimulatedStudentProfile;
  sessions: Session[];
  sessionRuleJudgments: SessionRuleJudgment[];
  ruleEvidences: RuleEvidence[];
  ruleAggregateStats: RuleAggregateStats[];
  ruleCompetitionStats: RuleCompetitionStats[];
  rulePerformanceRecords: RulePerformanceRecord[];
  ruleTemporalStats: RuleTemporalStats[];
  competitionRoundRecords: CompetitionRoundRecord[];
  ruleEcologyStats: RuleEcologyStats[];
  competitionGroupEcology: CompetitionGroupEcology[];
  ruleDecayRecords: RuleDecayRecord[];
  ruleContradictions: RuleContradiction[];
  reviewSignalApplications: ReviewSignalApplication[];
  rules: PersonaRule[];
  hypothesisRules: HypothesisRule[];
  ruleCompetitionGroups: RuleCompetitionGroup[];
  ruleReplacementRecords: RuleReplacementRecord[];
  reviewSignals: ReviewSignal[];
  personaModel: PersonaModel;
  proxyReviewCases: ProxyReviewCase[];
  proxyCalibrationStates: ProxyCalibrationState[];
  latestFixtureRegressionReport?: FullFixtureRegressionReport;
  activeSessionId?: string;
  selectedSessionId?: string;
  selectedProxyReviewCaseId?: string;
  selectedStudentTemplateId?: string;
  trainingDraft: string;
  sessionFilterStudentType: string;
  sessionRuleStatusFilter: "all" | RuleStatus;
  proxyReviewFeedbackDraft: string;
};
