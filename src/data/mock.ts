import type {
  AppState,
  PersonaLayer,
  PersonaRule,
  ProxyReviewCase,
  ReviewDiffLabel,
  RuleStatus,
  Session,
  SessionStatus,
  StudentProfile,
  Turn,
  TurnSource
} from "@/lib/types";
import { computePersonaModelSummary, deriveSessionKeyMoments, deriveSessionRoundCount, deriveSessionRuleBuckets } from "@/lib/selectors";

function iso(date: string) {
  return `${date}T09:00:00+08:00`;
}

function makeTurn(params: {
  id: string;
  speaker: Turn["speaker"];
  source: TurnSource;
  text: string;
  round: number;
  tags?: string[];
  timestamp: string;
  highlighted?: boolean;
  teachingActions?: Turn["teachingActions"];
  emotionSignal?: string[];
  ruleTriggers?: string[];
}): Turn {
  return {
    teachingActions: [],
    emotionSignal: [],
    ruleTriggers: [],
    ...params
  };
}

function makeRule(params: {
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
}): PersonaRule {
  return params;
}

function makeSession(params: Session): Session {
  return params;
}

function finalizeSession(session: Session, rules: PersonaRule[]): Session {
  const buckets = deriveSessionRuleBuckets(session, rules);
  return {
    ...session,
    acceptedRuleIds: buckets.acceptedRuleIds,
    rejectedRuleIds: buckets.rejectedRuleIds,
    pendingRuleIds: buckets.pendingRuleIds,
    keyMoments: deriveSessionKeyMoments(session),
    roundCount: deriveSessionRoundCount(session),
    hasKeyMoments: deriveSessionKeyMoments(session).length > 0
  };
}

export const studentTemplates: StudentProfile[] = [
  {
    id: "student-shy-beginner",
    templateId: "template-shy-beginner",
    name: "Shy Beginner",
    level: "beginner",
    attitude: "shy",
    confidence: "low",
    emotion: "self-conscious",
    errorPattern: "meaning",
    scenarioGoal: "daily talk",
    summary: "Needs reassurance, slow pacing, and help expressing simple meanings without embarrassment.",
    accentNote: "Short answers, lots of pauses, cautious wording.",
    failureMode: "Hides behind one-word replies when unsure.",
    defaultTags: ["face-saving", "low-confidence"],
    teachingHints: ["Start with meaning first", "Avoid public-style correction", "Keep prompts short"]
  },
  {
    id: "student-smart-lazy",
    templateId: "template-smart-lazy",
    name: "Smart But Lazy",
    level: "advanced",
    attitude: "smart-but-lazy",
    confidence: "high",
    emotion: "calm",
    errorPattern: "organization",
    scenarioGoal: "opinion",
    summary: "Understands quickly but avoids full effort and tries to get away with incomplete reasoning.",
    accentNote: "Casual phrasing, terse pushback, occasional overconfidence.",
    failureMode: "Stops after the easiest possible answer.",
    defaultTags: ["shortcut", "high-confidence"],
    teachingHints: ["Push precision", "Do not let them exit early", "Ask for one concrete example"]
  },
  {
    id: "student-anxious-learner",
    templateId: "template-anxious-learner",
    name: "Anxious Learner",
    level: "intermediate",
    attitude: "shy",
    confidence: "low",
    emotion: "anxious",
    errorPattern: "grammar",
    scenarioGoal: "interview",
    summary: "Very sensitive to correction and needs confidence-building before precision.",
    accentNote: "Frequent self-correction, apology-heavy, sensitive to pressure.",
    failureMode: "Freezes when corrected too early.",
    defaultTags: ["anxious", "correction-sensitive"],
    teachingHints: ["Reassure before correcting", "Delay grammar correction", "Use diagnostic questions"]
  },
  {
    id: "student-argumentative",
    templateId: "template-argumentative",
    name: "Argumentative Learner",
    level: "advanced",
    attitude: "argumentative",
    confidence: "high",
    emotion: "resistant",
    errorPattern: "vocabulary",
    scenarioGoal: "debate",
    summary: "Likes to challenge the teacher and test the consistency of explanations.",
    accentNote: "Sharp tone, asks why repeatedly, resists simple commands.",
    failureMode: "Turns correction into a debate.",
    defaultTags: ["pushback", "boundary-test"],
    teachingHints: ["Set boundaries", "Stay concise", "Push reasoning before style"]
  }
];

export const rules: PersonaRule[] = [
  makeRule({
    id: "rule-01",
    text: "Starts with meaning before grammar when the student is anxious or low confidence.",
    layer: "decision",
    confidence: 0.93,
    sourceSessionIds: ["S-1001", "S-1003"],
    evidence: "Repeated in sessions with anxious and shy learners.",
    status: "accepted",
    createdAt: iso("2026-03-19"),
    updatedAt: iso("2026-03-21"),
    lastObservedInSessionId: "S-1003"
  }),
  makeRule({
    id: "rule-02",
    text: "Uses short reassurance first, then narrows toward correction.",
    layer: "style",
    confidence: 0.88,
    sourceSessionIds: ["S-1001", "S-1005"],
    evidence: "Observed when students freeze after mistakes.",
    status: "accepted",
    createdAt: iso("2026-03-18"),
    updatedAt: iso("2026-03-21"),
    lastObservedInSessionId: "S-1005"
  }),
  makeRule({
    id: "rule-03",
    text: "Becomes stricter after the same mistake appears twice in one session.",
    layer: "decision",
    confidence: 0.9,
    sourceSessionIds: ["S-1002", "S-1006"],
    evidence: "Evidence from repeated vocabulary and organization errors.",
    status: "candidate",
    createdAt: iso("2026-03-17"),
    lastObservedInSessionId: "S-1006"
  }),
  makeRule({
    id: "rule-04",
    text: "Prefers examples over abstract explanation when the student is stuck.",
    layer: "style",
    confidence: 0.84,
    sourceSessionIds: ["S-1002", "S-1004"],
    evidence: "Examples were used to keep momentum.",
    status: "accepted",
    createdAt: iso("2026-03-16"),
    updatedAt: iso("2026-03-20"),
    lastObservedInSessionId: "S-1004"
  }),
  makeRule({
    id: "rule-05",
    text: "Values continued speaking over perfect accuracy at the beginning of a turn.",
    layer: "value",
    confidence: 0.92,
    sourceSessionIds: ["S-1001", "S-1003", "S-1005"],
    evidence: "Teacher explicitly delayed correction.",
    status: "accepted",
    createdAt: iso("2026-03-15"),
    updatedAt: iso("2026-03-21"),
    lastObservedInSessionId: "S-1005"
  }),
  makeRule({
    id: "rule-06",
    text: "Treats resistant learners with direct challenge rather than extra comfort.",
    layer: "boundary",
    confidence: 0.86,
    sourceSessionIds: ["S-1002", "S-1006"],
    evidence: "The teacher avoids over-encouraging argumentative students.",
    status: "candidate",
    createdAt: iso("2026-03-14"),
    lastObservedInSessionId: "S-1006"
  }),
  makeRule({
    id: "rule-07",
    text: "Checks whether the student problem is language or confidence before correcting.",
    layer: "decision",
    confidence: 0.89,
    sourceSessionIds: ["S-1003", "S-1005"],
    evidence: "Decision logs show diagnostic questions.",
    status: "observed",
    createdAt: iso("2026-03-14"),
    lastObservedInSessionId: "S-1005"
  }),
  makeRule({
    id: "rule-08",
    text: "Uses concise, high-control phrasing in pressure scenarios.",
    layer: "style",
    confidence: 0.82,
    sourceSessionIds: ["S-1002", "S-1006"],
    evidence: "Tone becomes more clipped under debate-like prompts.",
    status: "candidate",
    createdAt: iso("2026-03-13"),
    lastObservedInSessionId: "S-1006"
  }),
  makeRule({
    id: "rule-09",
    text: "Protects student face; avoids public-style humiliation or sarcasm.",
    layer: "boundary",
    confidence: 0.95,
    sourceSessionIds: ["S-1001", "S-1003", "S-1005"],
    evidence: "No humiliation pattern appears in transcripts.",
    status: "accepted",
    createdAt: iso("2026-03-12"),
    updatedAt: iso("2026-03-21"),
    lastObservedInSessionId: "S-1005"
  }),
  makeRule({
    id: "rule-10",
    text: "Reframes mistakes as evidence of what to practice next.",
    layer: "value",
    confidence: 0.87,
    sourceSessionIds: ["S-1001", "S-1004"],
    evidence: "Correction often converted into next-step guidance.",
    status: "observed",
    createdAt: iso("2026-03-12"),
    lastObservedInSessionId: "S-1004"
  }),
  makeRule({
    id: "rule-11",
    text: "Escalates intensity only when the student is over-relying on shortcuts.",
    layer: "decision",
    confidence: 0.8,
    sourceSessionIds: ["S-1002"],
    evidence: "Triggered by the smart-but-lazy template.",
    status: "candidate",
    createdAt: iso("2026-03-11"),
    lastObservedInSessionId: "S-1002"
  }),
  makeRule({
    id: "rule-12",
    text: "Prioritizes student agency by asking for one more attempt before revealing the answer.",
    layer: "value",
    confidence: 0.85,
    sourceSessionIds: ["S-1004", "S-1006"],
    evidence: "The teacher repeatedly asked for a retry.",
    status: "candidate",
    createdAt: iso("2026-03-10"),
    lastObservedInSessionId: "S-1006"
  })
];

const s1001 = finalizeSession(
  makeSession({
    id: "S-1001",
    title: "Warm-up with shy beginner",
    date: "2026-03-21",
    studentType: "Shy Beginner",
    studentProfileId: "student-shy-beginner",
    scenario: "daily talk",
    duration: "12m",
    tags: ["warm-up", "low confidence", "face-saving"],
    hasKeyMoments: true,
    summary: "Teacher slowed the pace, validated partial answers, and delayed grammar correction until the student spoke more freely.",
    transcript: [
      makeTurn({
        id: "S-1001-T1",
        speaker: "student",
        source: "simulator",
        text: "I... like coffee. But maybe not good sentence.",
        round: 1,
        tags: ["hesitation", "grammar"],
        timestamp: "2026-03-21T09:05:00+08:00",
        highlighted: true,
        emotionSignal: ["self-conscious"],
        ruleTriggers: ["face-saving"]
      }),
      makeTurn({
        id: "S-1001-T2",
        speaker: "teacher",
        source: "human",
        text: "That's a good start. Say it again with one full sentence.",
        round: 1,
        tags: ["reassure", "retry"],
        timestamp: "2026-03-21T09:05:20+08:00",
        highlighted: true,
        teachingActions: ["reassure", "retry"],
        ruleTriggers: ["reassurance-before-correction", "retry-before-explanation"]
      }),
      makeTurn({
        id: "S-1001-T3",
        speaker: "student",
        source: "simulator",
        text: "I like coffee in the morning because it helps me wake up.",
        round: 2,
        tags: ["successful-retry"],
        timestamp: "2026-03-21T09:05:50+08:00",
        highlighted: false,
        emotionSignal: ["calm"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1001-T4",
        speaker: "teacher",
        source: "human",
        text: "Much better. The meaning is clear now, and we can polish the grammar after that.",
        round: 2,
        tags: ["meaning-first"],
        timestamp: "2026-03-21T09:06:10+08:00",
        highlighted: false,
        teachingActions: ["meaning_first"],
        ruleTriggers: ["meaning-before-grammar"]
      })
    ],
    candidateRuleIds: ["rule-01", "rule-02", "rule-05", "rule-09", "rule-12"],
    status: "active",
    startedAt: "2026-03-21T09:05:00+08:00",
    createdFromTemplateId: "template-shy-beginner",
    roundCount: 2,
    keyMoments: [
      "That's a good start. Say it again with one full sentence.",
      "Much better. The meaning is clear now, and we can polish the grammar after that."
    ],
    acceptedRuleIds: [],
    rejectedRuleIds: [],
    pendingRuleIds: []
  }),
  rules
);

const s1002 = finalizeSession(
  makeSession({
    id: "S-1002",
    title: "Pressure check with smart but lazy learner",
    date: "2026-03-18",
    studentType: "Smart But Lazy",
    studentProfileId: "student-smart-lazy",
    scenario: "opinion",
    duration: "15m",
    tags: ["pressure", "shortcut", "strict mode"],
    hasKeyMoments: true,
    summary: "Teacher challenged vague answers and pushed for precise reasoning once the student tried to coast.",
    transcript: [
      makeTurn({
        id: "S-1002-T1",
        speaker: "student",
        source: "simulator",
        text: "I think it is obvious. People just need more discipline.",
        round: 1,
        tags: ["overconfident"],
        timestamp: "2026-03-18T09:00:00+08:00",
        highlighted: true,
        emotionSignal: ["calm"],
        ruleTriggers: ["shortcut"]
      }),
      makeTurn({
        id: "S-1002-T2",
        speaker: "teacher",
        source: "human",
        text: "That's too vague. Give me one concrete example.",
        round: 1,
        tags: ["challenge"],
        timestamp: "2026-03-18T09:00:20+08:00",
        highlighted: true,
        teachingActions: ["pressure", "example_first", "push_precision"],
        ruleTriggers: ["push-precision", "example-first"]
      }),
      makeTurn({
        id: "S-1002-T3",
        speaker: "student",
        source: "simulator",
        text: "Like... if the schedule is fixed, people stop making excuses.",
        round: 2,
        tags: ["example"],
        timestamp: "2026-03-18T09:00:50+08:00",
        highlighted: false,
        emotionSignal: ["calm"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1002-T4",
        speaker: "teacher",
        source: "human",
        text: "Better. Now connect that example back to your main point.",
        round: 2,
        tags: ["organization"],
        timestamp: "2026-03-18T09:01:10+08:00",
        highlighted: false,
        teachingActions: ["narrow_scope", "push_precision"],
        ruleTriggers: ["push-precision", "narrow-scope"]
      }),
      makeTurn({
        id: "S-1002-T5",
        speaker: "student",
        source: "simulator",
        text: "Okay, so discipline matters because it reduces excuses and improves follow-through.",
        round: 3,
        tags: ["improved"],
        timestamp: "2026-03-18T09:01:40+08:00",
        highlighted: false,
        emotionSignal: ["confident"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1002-T6",
        speaker: "teacher",
        source: "human",
        text: "Good. That is the level of precision I want here.",
        round: 3,
        tags: ["strict-approval"],
        timestamp: "2026-03-18T09:02:00+08:00",
        highlighted: false,
        teachingActions: ["push_precision"],
        ruleTriggers: ["push-precision"]
      })
    ],
    candidateRuleIds: ["rule-03", "rule-04", "rule-08", "rule-11"],
    status: "completed",
    startedAt: "2026-03-18T09:00:00+08:00",
    endedAt: "2026-03-18T09:15:00+08:00",
    createdFromTemplateId: "template-smart-lazy",
    roundCount: 3,
    keyMoments: [
      "That's too vague. Give me one concrete example.",
      "Better. Now connect that example back to your main point."
    ],
    acceptedRuleIds: [],
    rejectedRuleIds: [],
    pendingRuleIds: []
  }),
  rules
);

const s1003 = finalizeSession(
  makeSession({
    id: "S-1003",
    title: "Interview rehearsal for anxious learner",
    date: "2026-03-17",
    studentType: "Anxious Learner",
    studentProfileId: "student-anxious-learner",
    scenario: "interview",
    duration: "14m",
    tags: ["interview", "confidence", "diagnostic"],
    hasKeyMoments: false,
    summary: "Teacher used diagnostic questions to separate language weakness from performance anxiety and avoided over-correction.",
    transcript: [
      makeTurn({
        id: "S-1003-T1",
        speaker: "student",
        source: "simulator",
        text: "Sorry, I think my answer is wrong again.",
        round: 1,
        tags: ["anxious", "self-correction"],
        timestamp: "2026-03-17T09:00:00+08:00",
        highlighted: true,
        emotionSignal: ["anxious"],
        ruleTriggers: ["face-saving"]
      }),
      makeTurn({
        id: "S-1003-T2",
        speaker: "teacher",
        source: "human",
        text: "Don't worry about perfect grammar yet. Tell me the core idea first.",
        round: 1,
        tags: ["reassure"],
        timestamp: "2026-03-17T09:00:18+08:00",
        highlighted: true,
        teachingActions: ["reassure", "meaning_first"],
        ruleTriggers: ["reassurance-before-correction", "meaning-before-grammar"]
      }),
      makeTurn({
        id: "S-1003-T3",
        speaker: "student",
        source: "simulator",
        text: "I want to say I can work under pressure, but I feel nervous.",
        round: 2,
        tags: ["emotional"],
        timestamp: "2026-03-17T09:00:45+08:00",
        highlighted: false,
        emotionSignal: ["anxious"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1003-T4",
        speaker: "teacher",
        source: "human",
        text: "Good. That nervousness is useful data. Let's work with it instead of hiding it.",
        round: 2,
        tags: ["diagnostic"],
        timestamp: "2026-03-17T09:01:05+08:00",
        highlighted: false,
        teachingActions: ["diagnose"],
        ruleTriggers: ["diagnose"]
      })
    ],
    candidateRuleIds: ["rule-01", "rule-05", "rule-07", "rule-09", "rule-10"],
    status: "completed",
    startedAt: "2026-03-17T09:00:00+08:00",
    endedAt: "2026-03-17T09:14:00+08:00",
    createdFromTemplateId: "template-anxious-learner",
    roundCount: 2,
    keyMoments: [
      "Don't worry about perfect grammar yet. Tell me the core idea first.",
      "Good. That nervousness is useful data."
    ],
    acceptedRuleIds: [],
    rejectedRuleIds: [],
    pendingRuleIds: []
  }),
  rules
);

const s1004 = finalizeSession(
  makeSession({
    id: "S-1004",
    title: "Storytelling session with shy beginner",
    date: "2026-03-16",
    studentType: "Shy Beginner",
    studentProfileId: "student-shy-beginner",
    scenario: "storytelling",
    duration: "11m",
    tags: ["example-driven", "narrative", "retry"],
    hasKeyMoments: true,
    summary: "The teacher repeatedly asked for one more attempt before modeling the answer and used examples to keep the student moving.",
    transcript: [
      makeTurn({
        id: "S-1004-T1",
        speaker: "student",
        source: "simulator",
        text: "Yesterday I go park and see my friend.",
        round: 1,
        tags: ["tense-error"],
        timestamp: "2026-03-16T09:00:00+08:00",
        highlighted: true,
        emotionSignal: ["self-conscious"],
        ruleTriggers: ["grammar"]
      }),
      makeTurn({
        id: "S-1004-T2",
        speaker: "teacher",
        source: "human",
        text: "Try that again, and keep the story moving. One more sentence.",
        round: 1,
        tags: ["retry"],
        timestamp: "2026-03-16T09:00:15+08:00",
        highlighted: true,
        teachingActions: ["retry", "narrow_scope"],
        ruleTriggers: ["retry-before-explanation", "narrow-scope"]
      }),
      makeTurn({
        id: "S-1004-T3",
        speaker: "student",
        source: "simulator",
        text: "Yesterday I went to the park and saw my friend.",
        round: 2,
        tags: ["corrected"],
        timestamp: "2026-03-16T09:00:40+08:00",
        highlighted: false,
        emotionSignal: ["calm"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1004-T4",
        speaker: "teacher",
        source: "human",
        text: "Good. Now add the reason you went there.",
        round: 2,
        tags: ["example"],
        timestamp: "2026-03-16T09:01:00+08:00",
        highlighted: false,
        teachingActions: ["example_first"],
        ruleTriggers: ["example-first"]
      })
    ],
    candidateRuleIds: ["rule-04", "rule-09", "rule-10", "rule-12"],
    status: "completed",
    startedAt: "2026-03-16T09:00:00+08:00",
    endedAt: "2026-03-16T09:11:00+08:00",
    createdFromTemplateId: "template-shy-beginner",
    roundCount: 2,
    keyMoments: [
      "Try that again, and keep the story moving. One more sentence.",
      "Good. Now add the reason you went there."
    ],
    acceptedRuleIds: [],
    rejectedRuleIds: [],
    pendingRuleIds: []
  }),
  rules
);

const s1005 = finalizeSession(
  makeSession({
    id: "S-1005",
    title: "Late-night calm correction loop",
    date: "2026-03-15",
    studentType: "Anxious Learner",
    studentProfileId: "student-anxious-learner",
    scenario: "daily talk",
    duration: "10m",
    tags: ["calm", "face-saving", "loop"],
    hasKeyMoments: false,
    summary: "Teacher relied on reassurance, short prompts, and delayed correction until the student could maintain momentum.",
    transcript: [
      makeTurn({
        id: "S-1005-T1",
        speaker: "student",
        source: "simulator",
        text: "I can answer, but I worry I will make mistakes.",
        round: 1,
        tags: ["low-confidence"],
        timestamp: "2026-03-15T09:00:00+08:00",
        highlighted: true,
        emotionSignal: ["anxious"],
        ruleTriggers: ["face-saving"]
      }),
      makeTurn({
        id: "S-1005-T2",
        speaker: "teacher",
        source: "human",
        text: "That's okay. Focus on the message first.",
        round: 1,
        tags: ["meaning-first"],
        timestamp: "2026-03-15T09:00:20+08:00",
        highlighted: true,
        teachingActions: ["reassure", "meaning_first"],
        ruleTriggers: ["reassurance-before-correction", "meaning-before-grammar"]
      }),
      makeTurn({
        id: "S-1005-T3",
        speaker: "student",
        source: "simulator",
        text: "I want to say I visited my cousin last weekend.",
        round: 2,
        tags: ["progress"],
        timestamp: "2026-03-15T09:00:45+08:00",
        highlighted: false,
        emotionSignal: ["calm"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1005-T4",
        speaker: "teacher",
        source: "human",
        text: "Good. Keep going, and then we can clean up the grammar.",
        round: 2,
        tags: ["delay-correction"],
        timestamp: "2026-03-15T09:01:05+08:00",
        highlighted: false,
        teachingActions: ["meaning_first"],
        ruleTriggers: ["meaning-before-grammar"]
      })
    ],
    candidateRuleIds: ["rule-01", "rule-02", "rule-05", "rule-09", "rule-10"],
    status: "completed",
    startedAt: "2026-03-15T09:00:00+08:00",
    endedAt: "2026-03-15T09:10:00+08:00",
    createdFromTemplateId: "template-anxious-learner",
    roundCount: 2,
    keyMoments: [
      "That's okay. Focus on the message first.",
      "Good. Keep going, and then we can clean up the grammar."
    ],
    acceptedRuleIds: [],
    rejectedRuleIds: [],
    pendingRuleIds: []
  }),
  rules
);

const s1006 = finalizeSession(
  makeSession({
    id: "S-1006",
    title: "Debate drill with argumentative learner",
    date: "2026-03-14",
    studentType: "Argumentative Learner",
    studentProfileId: "student-argumentative",
    scenario: "debate",
    duration: "16m",
    tags: ["debate", "boundary", "strict"],
    hasKeyMoments: true,
    summary: "Teacher stayed firm, avoided getting pulled into side arguments, and insisted on clear reasoning before moving on.",
    transcript: [
      makeTurn({
        id: "S-1006-T1",
        speaker: "student",
        source: "simulator",
        text: "Why do I need this structure? It sounds unnecessary.",
        round: 1,
        tags: ["pushback"],
        timestamp: "2026-03-14T09:00:00+08:00",
        highlighted: true,
        emotionSignal: ["resistant"],
        ruleTriggers: ["boundary-test"]
      }),
      makeTurn({
        id: "S-1006-T2",
        speaker: "teacher",
        source: "human",
        text: "Because your argument is still unclear. First finish the point.",
        round: 1,
        tags: ["firm"],
        timestamp: "2026-03-14T09:00:15+08:00",
        highlighted: true,
        teachingActions: ["pressure", "narrow_scope", "push_precision"],
        ruleTriggers: ["push-precision", "narrow-scope"]
      }),
      makeTurn({
        id: "S-1006-T3",
        speaker: "student",
        source: "simulator",
        text: "Fine, but I think the point is about efficiency.",
        round: 2,
        tags: ["partial-accept"],
        timestamp: "2026-03-14T09:00:40+08:00",
        highlighted: false,
        emotionSignal: ["resistant"],
        ruleTriggers: ["student-expansion"]
      }),
      makeTurn({
        id: "S-1006-T4",
        speaker: "teacher",
        source: "human",
        text: "Good. Now give one reason and one consequence.",
        round: 2,
        tags: ["boundary"],
        timestamp: "2026-03-14T09:01:00+08:00",
        highlighted: false,
        teachingActions: ["narrow_scope", "push_precision"],
        ruleTriggers: ["push-precision", "narrow-scope"]
      })
    ],
    candidateRuleIds: ["rule-03", "rule-06", "rule-08", "rule-11", "rule-12"],
    status: "completed",
    startedAt: "2026-03-14T09:00:00+08:00",
    endedAt: "2026-03-14T09:16:00+08:00",
    createdFromTemplateId: "template-argumentative",
    roundCount: 2,
    keyMoments: [
      "Because your argument is still unclear. First finish the point.",
      "Good. Now give one reason and one consequence."
    ],
    acceptedRuleIds: [],
    rejectedRuleIds: [],
    pendingRuleIds: []
  }),
  rules
);

export const sessions: Session[] = [s1001, s1002, s1003, s1004, s1005, s1006];

export const proxyReviewCases: ProxyReviewCase[] = [
  {
    id: "review-01",
    modelVersion: "v0.3",
    studentTemplateId: "template-anxious-learner",
    studentTemplateName: "Anxious Learner",
    scenario: "interview",
    prompt: "The student froze after a grammar mistake during interview rehearsal.",
    yourResponse: "Don't worry about the grammar yet. Tell me the main idea first, then we can refine it together.",
    proxyResponse: "Your grammar is wrong. Try using the past tense before you continue.",
    note: "Human response prioritizes momentum and face-saving; proxy jumps to direct correction.",
    diffLabels: ["more_like_me", "decision_similar_style_different", "not_like_me"],
    correctionPoints: ["Delay grammar correction", "Use reassurance before precision", "Keep the student speaking"],
    reviewStatus: "new",
    createdAt: "2026-03-21T09:30:00+08:00"
  },
  {
    id: "review-02",
    modelVersion: "v0.3",
    studentTemplateId: "template-smart-lazy",
    studentTemplateName: "Smart But Lazy",
    scenario: "opinion",
    prompt: "The student gave an overconfident, vague answer and tried to end the task early.",
    yourResponse: "That is too broad. Give me one concrete example and connect it to your point.",
    proxyResponse: "Good point. Let's move on.",
    note: "Proxy is too soft and misses the need for pressure and specificity.",
    diffLabels: ["not_like_me", "style_similar_decision_different", "totally_off"],
    correctionPoints: ["Push for one concrete example", "Keep strictness when the student coasts", "Do not release the task too early"],
    reviewStatus: "reviewed",
    selectedLabel: "not_like_me",
    createdAt: "2026-03-21T09:31:00+08:00",
    updatedAt: "2026-03-21T09:35:00+08:00"
  },
  {
    id: "review-03",
    modelVersion: "v0.2",
    studentTemplateId: "template-shy-beginner",
    studentTemplateName: "Shy Beginner",
    scenario: "daily talk",
    prompt: "The student gave a one-word answer and looked hesitant.",
    yourResponse: "Nice start. Say it again in one full sentence, and then we can make it better.",
    proxyResponse: "Please answer with a full sentence and correct grammar.",
    note: "Proxy is technically correct but loses the calm, confidence-building entry point.",
    diffLabels: ["decision_similar_style_different", "not_like_me", "more_like_me"],
    correctionPoints: ["Lead with reassurance", "Use a retry prompt instead of rule-based correction", "Keep meaning first"],
    reviewStatus: "written_back",
    selectedLabel: "decision_similar_style_different",
    writtenBackRuleIds: ["review-feedback-03-decision-style"],
    createdAt: "2026-03-21T09:32:00+08:00",
    updatedAt: "2026-03-21T09:38:00+08:00"
  }
];

export function buildInitialAppState(): AppState {
  const sessionList = sessions.map((session) => finalizeSession(session, rules));
  const nextState: AppState = {
    studentTemplates,
    sessions: sessionList,
    rules,
    personaModel: computePersonaModelSummary({ rules, sessions: sessionList }),
    proxyReviewCases,
    activeSessionId: "S-1001",
    selectedSessionId: "S-1001",
    selectedProxyReviewCaseId: "review-01",
    selectedStudentTemplateId: "student-shy-beginner",
    trainingDraft: "",
    sessionFilterStudentType: "all",
    sessionRuleStatusFilter: "candidate",
    proxyReviewFeedbackDraft: "Ready to review current proxy behavior."
  };

  return nextState;
}
