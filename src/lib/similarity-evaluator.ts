import type { SessionScenario, StudentTemplate } from "@/lib/types";

export type SimilarityStudentProfile = Pick<StudentTemplate, "name" | "defaultLevel" | "defaultAttitude" | "defaultConfidence" | "defaultEmotion" | "defaultErrorPattern">;

export type SimilarityContext = {
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: SessionScenario | string;
  teacherResponse: string;
  proxyResponse: string;
};

export type SimilarityScore = {
  overall: number;
  decision: number;
  priority: number;
  style: number;
  boundary: number;
  reasoningMatch: number;
  explain: string;
};

export type ResponseSignals = {
  text: string;
  normalized: string;
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  lengthScore: number;
  reassurance: number;
  pressure: number;
  correction: number;
  diagnosis: number;
  example: number;
  retry: number;
  release: number;
  meaning: number;
  precision: number;
  agency: number;
  boundaryProtect: number;
  boundaryHarsh: number;
  warmth: number;
  directness: number;
  hedging: number;
  reasoning: number;
  sequence: number;
  decisionMode: string;
  priorityMode: string;
  styleMode: string;
  boundaryMode: string;
  reasoningMode: string;
};

export type SimilarityAnalysis = {
  teacherSignals: ResponseSignals;
  proxySignals: ResponseSignals;
  dimensionScores: Omit<SimilarityScore, "overall" | "explain">;
  overallWeights: Record<"decision" | "priority" | "style" | "boundary" | "reasoningMatch", number>;
  explain: string;
};

const DECISION_PHRASES = {
  reassurance: ["don't worry", "good start", "nice start", "that's okay", "keep going", "we can", "together", "calm", "reassure", "safe"],
  pressure: ["give me", "one concrete", "push", "pressure", "be precise", "keep it moving", "do not", "don't let", "stay with", "connect it"],
  correction: ["wrong", "correct", "grammar", "past tense", "refine", "fix", "revise", "must", "should", "replace"],
  diagnosis: ["diagnose", "figure out", "what's making", "confidence", "anxiety", "blocker", "why", "before correcting"],
  example: ["for example", "for instance", "example", "concrete", "specific", "one more example"],
  retry: ["try again", "another attempt", "one more", "say it again", "repeat", "retry"],
  release: ["move on", "let's move on", "skip", "next question", "move ahead", "release"],
  agency: ["you can", "your turn", "one more", "keep speaking", "continue", "try"]
} as const;

const PRIORITY_PHRASES = {
  meaning: ["meaning", "main idea", "point", "message", "clarity", "understand"],
  precision: ["precision", "precise", "grammar", "correct", "exact", "accurate", "tense", "syntax"],
  agency: ["agency", "retry", "practice", "one more", "next step", "attempt"],
  boundary: ["face", "humiliation", "sarcasm", "public", "respect", "supportive", "safe", "embarrass"]
} as const;

const STYLE_PHRASES = {
  warmth: ["good", "nice", "great", "that's okay", "well done", "you're doing", "together", "supportive", "gentle"],
  directness: ["too vague", "wrong", "must", "need to", "do this", "answer with", "be precise", "stop", "focus"],
  hedging: ["maybe", "perhaps", "could", "might", "kind of", "sort of", "a bit"],
  harshness: ["obvious", "clearly", "wrong", "bad", "not like that", "move on", "just", "no"],
  brevity: ["okay", "fine", "short", "brief"]
} as const;

const BOUNDARY_PHRASES = {
  protect: ["don't worry", "good start", "that's okay", "we can", "together", "keep speaking", "safe", "supportive", "face-saving"],
  expose: ["wrong", "obviously", "you should know", "public", "sarcasm", "humiliate", "embarrass", "too obvious"],
  respectful: ["respect", "careful", "gentle", "kind", "quietly", "privately"],
  pressure: ["pressure", "strict", "push", "demand", "challenge", "force"]
} as const;

const REASONING_PHRASES = {
  connectors: ["because", "so", "therefore", "since", "if", "then", "instead", "for example", "first", "next", "after that"],
  scaffolding: ["step", "first", "then", "after that", "finally", "start with", "move to"],
  explanation: ["why", "how", "what this means", "here's", "that means"]
} as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function clampPercent(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseHits(text: string, phrases: readonly string[]) {
  const normalized = normalizeText(text);
  let hits = 0;
  for (const phrase of phrases) {
    if (!phrase) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i");
    if (pattern.test(normalized)) hits += 1;
  }
  return hits;
}

function scorePhrases(text: string, phrases: readonly string[]) {
  return clamp(phraseHits(text, phrases) / 2.5);
}

function countSentences(text: string) {
  const parts = text
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length || 1;
}

function summarizeStudentProfile(profile?: SimilarityStudentProfile | string) {
  if (!profile) return "unknown student";
  if (typeof profile === "string") return profile;
  return [profile.name, profile.defaultLevel, profile.defaultAttitude, profile.defaultConfidence, profile.defaultEmotion, profile.defaultErrorPattern].filter(Boolean).join(" / ");
}

function deriveContextWeights(profile?: SimilarityStudentProfile | string, scenario?: SessionScenario | string) {
  const scenarioText = typeof scenario === "string" ? scenario.toLowerCase() : scenario ? String(scenario).toLowerCase() : "";
  const profileText = normalizeText(summarizeStudentProfile(profile));

  const weights = {
    decision: 0.38,
    priority: 0.2,
    style: 0.14,
    boundary: 0.16,
    reasoningMatch: 0.12
  };

  if (scenarioText.includes("interview")) {
    weights.decision += 0.02;
    weights.boundary += 0.03;
    weights.style += 0.02;
    weights.priority -= 0.04;
  } else if (scenarioText.includes("debate") || scenarioText.includes("opinion")) {
    weights.decision += 0.03;
    weights.priority += 0.03;
    weights.reasoningMatch += 0.02;
    weights.style -= 0.04;
  } else if (scenarioText.includes("story")) {
    weights.style += 0.05;
    weights.reasoningMatch += 0.02;
    weights.priority -= 0.04;
  } else if (scenarioText.includes("daily")) {
    weights.style += 0.03;
    weights.boundary += 0.01;
    weights.reasoningMatch -= 0.02;
  }

  if (profileText.includes("anxious") || profileText.includes("shy") || profileText.includes("low confidence") || profileText.includes("self conscious")) {
    weights.boundary += 0.04;
    weights.style += 0.03;
    weights.priority -= 0.04;
  }

  if (profileText.includes("argumentative") || profileText.includes("smart but lazy") || profileText.includes("high confidence")) {
    weights.decision += 0.03;
    weights.priority += 0.03;
    weights.boundary -= 0.02;
    weights.style -= 0.02;
  }

  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total])) as Record<"decision" | "priority" | "style" | "boundary" | "reasoningMatch", number>;
}

function compareVector(teacher: Record<string, number>, proxy: Record<string, number>, weights: Record<string, number>) {
  const keys = Object.keys(weights);
  const weightSum = keys.reduce((sum, key) => sum + weights[key], 0);
  const distance = keys.reduce((sum, key) => sum + Math.abs((teacher[key] ?? 0) - (proxy[key] ?? 0)) * weights[key], 0);
  return clamp(1 - distance / Math.max(weightSum, 0.0001));
}

function classifyDecisionMode(signals: ResponseSignals) {
  const modes: Array<[string, number]> = [
    ["reassurance_first", signals.reassurance * 1.15 + signals.warmth * 0.4],
    ["diagnosis_first", signals.diagnosis * 1.15 + signals.reasoning * 0.3],
    ["pressure_first", signals.pressure * 1.2 + signals.directness * 0.25],
    ["correction_first", signals.correction * 1.1 + signals.precision * 0.2],
    ["example_first", signals.example * 1.15 + signals.sequence * 0.2],
    ["retry_first", signals.retry * 1.15 + signals.agency * 0.15],
    ["release_first", signals.release * 1.1],
    ["balanced", 0.5 + signals.reasoning * 0.15]
  ];
  return modes.sort((left, right) => right[1] - left[1])[0][0];
}

function classifyPriorityMode(signals: ResponseSignals) {
  const modes: Array<[string, number]> = [
    ["meaning_first", signals.meaning * 1.15 + signals.agency * 0.2],
    ["precision_first", signals.precision * 1.2 + signals.correction * 0.2],
    ["boundary_first", signals.boundaryProtect * 1.15 + signals.warmth * 0.1],
    ["agency_first", signals.agency * 1.1 + signals.retry * 0.2],
    ["mixed", 0.45]
  ];
  return modes.sort((left, right) => right[1] - left[1])[0][0];
}

function classifyStyleMode(signals: ResponseSignals) {
  const harshness = Math.max(0, signals.directness + signals.correction + signals.pressure - signals.warmth - signals.hedging) * 0.18;
  const modes: Array<[string, number]> = [
    ["warm_supportive", signals.warmth * 1.2 + signals.boundaryProtect * 0.15],
    ["direct_strict", signals.directness * 1.1 + signals.correction * 0.15 + signals.pressure * 0.15],
    ["hedged", signals.hedging * 1.15],
    ["terse", signals.lengthScore * 0.7 + signals.directness * 0.2 + harshness],
    ["balanced", 0.45]
  ];
  return modes.sort((left, right) => right[1] - left[1])[0][0];
}

function classifyBoundaryMode(signals: ResponseSignals) {
  const modes: Array<[string, number]> = [
    ["face_saving", signals.boundaryProtect * 1.25 + signals.warmth * 0.2],
    ["respectful", signals.boundaryProtect * 0.85 + signals.reasoning * 0.15],
    ["direct_boundary", signals.boundaryProtect * 0.7 + signals.directness * 0.45 + signals.pressure * 0.2],
    ["harsh", signals.boundaryHarsh * 1.15 + signals.directness * 0.2 - signals.warmth * 0.15],
    ["neutral", 0.4]
  ];
  return modes.sort((left, right) => right[1] - left[1])[0][0];
}

function classifyReasoningMode(signals: ResponseSignals) {
  const modes: Array<[string, number]> = [
    ["scaffolded", signals.sequence * 1.1 + signals.reasoning * 0.3],
    ["analytical", signals.reasoning * 1.15 + signals.directness * 0.15],
    ["brief", signals.lengthScore * 0.8],
    ["mixed", 0.45]
  ];
  return modes.sort((left, right) => right[1] - left[1])[0][0];
}

function buildSignals(text: string): ResponseSignals {
  const normalized = normalizeText(text);
  const tokens = normalized ? normalized.split(" ") : [];
  const wordCount = tokens.length;
  const sentenceCount = countSentences(text);
  const avgSentenceLength = wordCount / sentenceCount;
  const lengthScore = clamp(1 - Math.abs(wordCount - 32) / 32);

  const signals: Omit<ResponseSignals, "decisionMode" | "priorityMode" | "styleMode" | "boundaryMode" | "reasoningMode"> = {
    text,
    normalized,
    wordCount,
    sentenceCount,
    avgSentenceLength,
    lengthScore,
    reassurance: scorePhrases(text, DECISION_PHRASES.reassurance),
    pressure: scorePhrases(text, DECISION_PHRASES.pressure),
    correction: scorePhrases(text, DECISION_PHRASES.correction),
    diagnosis: scorePhrases(text, DECISION_PHRASES.diagnosis),
    example: scorePhrases(text, DECISION_PHRASES.example),
    retry: scorePhrases(text, DECISION_PHRASES.retry),
    release: scorePhrases(text, DECISION_PHRASES.release),
    meaning: scorePhrases(text, PRIORITY_PHRASES.meaning),
    precision: scorePhrases(text, PRIORITY_PHRASES.precision),
    agency: scorePhrases(text, PRIORITY_PHRASES.agency),
    boundaryProtect: scorePhrases(text, BOUNDARY_PHRASES.protect),
    boundaryHarsh: scorePhrases(text, BOUNDARY_PHRASES.expose) + scorePhrases(text, BOUNDARY_PHRASES.pressure) * 0.5,
    warmth: scorePhrases(text, STYLE_PHRASES.warmth),
    directness: scorePhrases(text, STYLE_PHRASES.directness),
    hedging: scorePhrases(text, STYLE_PHRASES.hedging),
    reasoning: scorePhrases(text, REASONING_PHRASES.connectors) + scorePhrases(text, REASONING_PHRASES.explanation) * 0.5,
    sequence: scorePhrases(text, REASONING_PHRASES.scaffolding)
  };

  return {
    ...signals,
    decisionMode: "",
    priorityMode: "",
    styleMode: "",
    boundaryMode: "",
    reasoningMode: ""
  } satisfies ResponseSignals;
}

function attachModeLabels(signals: ResponseSignals): ResponseSignals {
  return {
    ...signals,
    decisionMode: classifyDecisionMode(signals),
    priorityMode: classifyPriorityMode(signals),
    styleMode: classifyStyleMode(signals),
    boundaryMode: classifyBoundaryMode(signals),
    reasoningMode: classifyReasoningMode(signals)
  };
}

function vectorizeDecision(signals: ResponseSignals) {
  return {
    reassurance: signals.reassurance,
    pressure: signals.pressure,
    correction: signals.correction,
    diagnosis: signals.diagnosis,
    example: signals.example,
    retry: signals.retry,
    release: signals.release,
    agency: signals.agency
  };
}

function vectorizePriority(signals: ResponseSignals) {
  return {
    meaning: signals.meaning,
    precision: signals.precision,
    agency: signals.agency,
    boundary: signals.boundaryProtect
  };
}

function vectorizeStyle(signals: ResponseSignals) {
  return {
    warmth: signals.warmth,
    directness: signals.directness,
    hedging: signals.hedging,
    length: signals.lengthScore,
    sentenceCount: clamp(1 - Math.abs(signals.sentenceCount - 2) / 4)
  };
}

function vectorizeBoundary(signals: ResponseSignals) {
  return {
    protect: signals.boundaryProtect,
    harsh: signals.boundaryHarsh,
    warmth: signals.warmth,
    directness: signals.directness
  };
}

function vectorizeReasoning(signals: ResponseSignals) {
  return {
    reasoning: signals.reasoning,
    sequence: signals.sequence,
    example: signals.example,
    sentenceCount: clamp(1 - Math.abs(signals.sentenceCount - 2) / 4)
  };
}

function buildCategoryExplanation(category: "decision" | "priority" | "style" | "boundary", teacher: ResponseSignals, proxy: ResponseSignals, contextLabel: string) {
  const snippets = {
    decision: {
      teacher: teacher.decisionMode,
      proxy: proxy.decisionMode,
      teacherPhrase: bestSnippet(teacher.text, [DECISION_PHRASES.reassurance, DECISION_PHRASES.pressure, DECISION_PHRASES.correction, DECISION_PHRASES.diagnosis, DECISION_PHRASES.example, DECISION_PHRASES.retry, DECISION_PHRASES.release]),
      proxyPhrase: bestSnippet(proxy.text, [DECISION_PHRASES.reassurance, DECISION_PHRASES.pressure, DECISION_PHRASES.correction, DECISION_PHRASES.diagnosis, DECISION_PHRASES.example, DECISION_PHRASES.retry, DECISION_PHRASES.release])
    },
    priority: {
      teacher: teacher.priorityMode,
      proxy: proxy.priorityMode,
      teacherPhrase: bestSnippet(teacher.text, [PRIORITY_PHRASES.meaning, PRIORITY_PHRASES.precision, PRIORITY_PHRASES.agency, PRIORITY_PHRASES.boundary]),
      proxyPhrase: bestSnippet(proxy.text, [PRIORITY_PHRASES.meaning, PRIORITY_PHRASES.precision, PRIORITY_PHRASES.agency, PRIORITY_PHRASES.boundary])
    },
    style: {
      teacher: teacher.styleMode,
      proxy: proxy.styleMode,
      teacherPhrase: bestSnippet(teacher.text, [STYLE_PHRASES.warmth, STYLE_PHRASES.directness, STYLE_PHRASES.hedging, STYLE_PHRASES.harshness]),
      proxyPhrase: bestSnippet(proxy.text, [STYLE_PHRASES.warmth, STYLE_PHRASES.directness, STYLE_PHRASES.hedging, STYLE_PHRASES.harshness])
    },
    boundary: {
      teacher: teacher.boundaryMode,
      proxy: proxy.boundaryMode,
      teacherPhrase: bestSnippet(teacher.text, [BOUNDARY_PHRASES.protect, BOUNDARY_PHRASES.expose, BOUNDARY_PHRASES.respectful, BOUNDARY_PHRASES.pressure]),
      proxyPhrase: bestSnippet(proxy.text, [BOUNDARY_PHRASES.protect, BOUNDARY_PHRASES.expose, BOUNDARY_PHRASES.respectful, BOUNDARY_PHRASES.pressure])
    }
  }[category];

  return `${contextLabel}: teacher leans ${snippets.teacher.replaceAll("_", " ")}, proxy leans ${snippets.proxy.replaceAll("_", " ")}. Teacher cue "${snippets.teacherPhrase}" vs proxy cue "${snippets.proxyPhrase}".`;
}

function bestSnippet(text: string, phraseGroups: readonly (readonly string[])[]) {
  const normalized = normalizeText(text);
  for (const group of phraseGroups) {
    for (const phrase of group) {
      if (normalized.includes(normalizeText(phrase))) return phrase;
    }
  }
  const sentence = text.split(/[.!?]/g).map((part) => part.trim()).find(Boolean);
  return sentence ? sentence.slice(0, 72) : text.slice(0, 72);
}

function modeMismatch(a: string, b: string) {
  return a !== b && a !== "mixed" && b !== "mixed" && a !== "balanced" && b !== "balanced";
}

function scoreDimension(teacher: Record<string, number>, proxy: Record<string, number>, weights: Record<string, number>) {
  return clampPercent(compareVector(teacher, proxy, weights) * 100);
}

function explanationSummary(input: SimilarityContext, analysis: SimilarityAnalysis) {
  const student = summarizeStudentProfile(input.studentProfile);
  const scenario = typeof input.scenario === "string" ? input.scenario : String(input.scenario ?? "scenario");
  const gapEntries: Array<[string, number]> = [
    ["decision", analysis.dimensionScores.decision],
    ["priority", analysis.dimensionScores.priority],
    ["style", analysis.dimensionScores.style],
    ["boundary", analysis.dimensionScores.boundary],
    ["reasoning", analysis.dimensionScores.reasoningMatch]
  ];
  const [dominantGap, secondaryGap] = gapEntries.sort((left, right) => left[1] - right[1]).slice(0, 2);

  return `Compared against ${student} in ${scenario}: strongest mismatch is ${dominantGap[0]} (${dominantGap[1]}), followed by ${secondaryGap[0]} (${secondaryGap[1]}). Decision still carries the most weight, so changes there move the overall score most.`;
}

export function inspectSimilarity(input: SimilarityContext): SimilarityAnalysis {
  const teacherSignals = attachModeLabels(buildSignals(input.teacherResponse));
  const proxySignals = attachModeLabels(buildSignals(input.proxyResponse));
  const decision = scoreDimension(vectorizeDecision(teacherSignals), vectorizeDecision(proxySignals), {
    reassurance: 0.18,
    pressure: 0.18,
    correction: 0.18,
    diagnosis: 0.14,
    example: 0.12,
    retry: 0.1,
    release: 0.05,
    agency: 0.05
  });
  const priority = scoreDimension(vectorizePriority(teacherSignals), vectorizePriority(proxySignals), {
    meaning: 0.34,
    precision: 0.3,
    agency: 0.18,
    boundary: 0.18
  });
  const style = scoreDimension(vectorizeStyle(teacherSignals), vectorizeStyle(proxySignals), {
    warmth: 0.3,
    directness: 0.28,
    hedging: 0.14,
    length: 0.18,
    sentenceCount: 0.1
  });
  const boundary = scoreDimension(vectorizeBoundary(teacherSignals), vectorizeBoundary(proxySignals), {
    protect: 0.44,
    harsh: 0.22,
    warmth: 0.18,
    directness: 0.16
  });
  const reasoningMatch = scoreDimension(vectorizeReasoning(teacherSignals), vectorizeReasoning(proxySignals), {
    reasoning: 0.34,
    sequence: 0.28,
    example: 0.2,
    sentenceCount: 0.18
  });

  const weights = deriveContextWeights(input.studentProfile, input.scenario);
  const overall = clampPercent(
    decision * weights.decision + priority * weights.priority + style * weights.style + boundary * weights.boundary + reasoningMatch * weights.reasoningMatch
  );
  const analysis: SimilarityAnalysis = {
    teacherSignals,
    proxySignals,
    dimensionScores: {
      decision,
      priority,
      style,
      boundary,
      reasoningMatch
    },
    overallWeights: weights,
    explain: explanationSummary(input, {
      teacherSignals,
      proxySignals,
      dimensionScores: {
        decision,
        priority,
        style,
        boundary,
        reasoningMatch
      },
      overallWeights: weights,
      explain: ""
    })
  };

  return analysis;
}

export function evaluateSimilarityScore(input: SimilarityContext): SimilarityScore {
  const analysis = inspectSimilarity(input);
  const teacher = analysis.teacherSignals;
  const proxy = analysis.proxySignals;

  const decisionModeNote = modeMismatch(teacher.decisionMode, proxy.decisionMode) ? `${teacher.decisionMode} vs ${proxy.decisionMode}` : teacher.decisionMode;
  const priorityModeNote = modeMismatch(teacher.priorityMode, proxy.priorityMode) ? `${teacher.priorityMode} vs ${proxy.priorityMode}` : teacher.priorityMode;
  const styleModeNote = modeMismatch(teacher.styleMode, proxy.styleMode) ? `${teacher.styleMode} vs ${proxy.styleMode}` : teacher.styleMode;
  const boundaryModeNote = modeMismatch(teacher.boundaryMode, proxy.boundaryMode) ? `${teacher.boundaryMode} vs ${proxy.boundaryMode}` : teacher.boundaryMode;

  const explain = [
    `Decision ${analysis.dimensionScores.decision} (${decisionModeNote})`,
    `Priority ${analysis.dimensionScores.priority} (${priorityModeNote})`,
    `Style ${analysis.dimensionScores.style} (${styleModeNote})`,
    `Boundary ${analysis.dimensionScores.boundary} (${boundaryModeNote})`,
    `Reasoning ${analysis.dimensionScores.reasoningMatch} (${teacher.reasoningMode} vs ${proxy.reasoningMode})`,
    analysis.explain
  ].join(" · ");

  return {
    overall: analysis.dimensionScores.decision * analysis.overallWeights.decision + analysis.dimensionScores.priority * analysis.overallWeights.priority + analysis.dimensionScores.style * analysis.overallWeights.style + analysis.dimensionScores.boundary * analysis.overallWeights.boundary + analysis.dimensionScores.reasoningMatch * analysis.overallWeights.reasoningMatch,
    decision: analysis.dimensionScores.decision,
    priority: analysis.dimensionScores.priority,
    style: analysis.dimensionScores.style,
    boundary: analysis.dimensionScores.boundary,
    reasoningMatch: analysis.dimensionScores.reasoningMatch,
    explain
  };
}

export function describeSimilarityComparison(input: SimilarityContext) {
  return inspectSimilarity(input);
}
