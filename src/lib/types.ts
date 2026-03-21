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
export type RuleStatus = "candidate" | "accepted" | "rejected" | "observed";
export type ReviewDiffLabel =
  | "more_like_me"
  | "not_like_me"
  | "style_similar_decision_different"
  | "decision_similar_style_different"
  | "totally_off";
export type ReviewStatus = "new" | "reviewed" | "written_back";

export type StudentProfile = {
  id: string;
  templateId: string;
  name: string;
  level: StudentLevel;
  attitude: StudentAttitude;
  confidence: StudentConfidence;
  emotion: StudentEmotion;
  errorPattern: ErrorPattern;
  scenarioGoal: SessionScenario;
  summary: string;
  accentNote: string;
  failureMode: string;
  defaultTags?: string[];
  teachingHints?: string[];
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

export type Session = {
  id: string;
  title: string;
  date?: string;
  studentType: string;
  studentProfileId: string;
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
  confidence: number;
  sourceSessionIds: string[];
  evidence: string;
  status: RuleStatus;
  createdAt: string;
  updatedAt?: string;
  lastObservedInSessionId?: string;
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
};

export type ProxyReviewCase = {
  id: string;
  modelVersion: string;
  studentTemplateId: string;
  studentTemplateName: string;
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

export type AppState = {
  studentTemplates: StudentProfile[];
  sessions: Session[];
  rules: PersonaRule[];
  personaModel: PersonaModel;
  proxyReviewCases: ProxyReviewCase[];
  activeSessionId?: string;
  selectedSessionId?: string;
  selectedProxyReviewCaseId?: string;
  selectedStudentTemplateId?: string;
  trainingDraft: string;
  sessionFilterStudentType: string;
  sessionRuleStatusFilter: "all" | RuleStatus;
  proxyReviewFeedbackDraft: string;
};
