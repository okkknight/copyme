import type { SimulatedStudentProfile, StudentConfig, StudentTemplate } from "@/lib/types";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function confidenceScore(confidence: StudentConfig["confidence"]) {
  if (confidence === "low") return 0.86;
  if (confidence === "medium") return 0.52;
  return 0.2;
}

function challengeScore(attitude: StudentConfig["attitude"], confidence: StudentConfig["confidence"]) {
  const base = attitude === "argumentative" ? 0.88 : attitude === "smart-but-lazy" ? 0.58 : attitude === "anxious" ? 0.22 : 0.36;
  const bonus = confidence === "high" ? 0.12 : confidence === "medium" ? 0.05 : -0.03;
  return Math.max(0.08, Math.min(0.98, base + bonus));
}

function buildSummary(template: StudentTemplate, config: StudentConfig) {
  const mood =
    config.attitude === "argumentative"
      ? "pushes back and tests boundaries"
      : config.attitude === "smart-but-lazy"
        ? "tries to compress the task into the shortest acceptable answer"
        : config.attitude === "anxious"
          ? "worries about getting corrected too early"
          : "stays cautious and low-visibility";

  const levelSignal =
    config.level === "beginner"
      ? "needs explicit scaffolding"
      : config.level === "intermediate"
        ? "handles familiar prompts but can wobble under pressure"
        : "can reason, but still shows persona-specific shortcuts";

  return `${template.summary} The current config makes the student ${mood}; at ${config.level} level the learner ${levelSignal}.`;
}

function buildResponseStyle(config: StudentConfig) {
  const parts = [
    config.attitude === "shy" ? "short and hedged" : config.attitude === "anxious" ? "careful and self-monitoring" : config.attitude === "argumentative" ? "pushback-heavy and argumentative" : "efficient and slightly dismissive",
    config.confidence === "low" ? "with noticeable hesitation" : config.confidence === "medium" ? "with occasional pauses" : "with minimal hesitation",
    config.errorPattern === "meaning" ? "while preserving meaning over form" : config.errorPattern === "grammar" ? "while slipping on form under pressure" : "with selective shortcutting"
  ];

  return unique(parts).join(", ");
}

function buildHesitationStyle(config: StudentConfig) {
  if (config.confidence === "low" || config.attitude === "anxious") {
    return "Starts with apology, self-correction, or a request for reassurance before attempting the answer.";
  }
  if (config.attitude === "argumentative") {
    return "Hesitation shows up as resistance, not silence; the student challenges the prompt before complying.";
  }
  if (config.attitude === "smart-but-lazy") {
    return "Hesitation is strategic: the student stalls just enough to avoid full effort.";
  }
  return "Hesitates only when the prompt becomes too specific or the teacher pushes for precision.";
}

function buildLikelyMistakeModes(config: StudentConfig) {
  const modes = new Set<string>();

  if (config.level === "beginner") modes.add("broken sentence");
  if (config.errorPattern === "grammar") modes.add("tense drift");
  if (config.errorPattern === "meaning") modes.add("concept missing");
  if (config.errorPattern === "pronunciation") modes.add("sound substitution");
  if (config.errorPattern === "vocabulary") modes.add("word search");
  if (config.errorPattern === "organization") modes.add("half-structured answer");
  if (config.attitude === "smart-but-lazy") modes.add("shortcut answer");
  if (config.attitude === "anxious") modes.add("freeze under pressure");
  if (config.attitude === "argumentative") modes.add("side-argument");
  if (config.confidence === "low") modes.add("apologetic self-correction");

  return Array.from(modes);
}

function buildGeneratedTags(template: StudentTemplate, config: StudentConfig) {
  return unique([
    ...(template.defaultTags ?? []),
    config.attitude,
    config.confidence,
    config.emotion,
    config.errorPattern,
    config.scenarioGoal,
    config.templateId ? `template:${config.templateId}` : "",
    config.attitude === "anxious" ? "hesitant" : "",
    config.attitude === "argumentative" ? "boundary-test" : "",
    config.attitude === "smart-but-lazy" ? "shortcut-prone" : "",
    config.confidence === "low" ? "face-saving" : "",
    config.errorPattern === "meaning" ? "meaning-gap" : ""
  ]);
}

export function buildStudentConfigFromTemplate(template: StudentTemplate, overrides: Partial<StudentConfig> = {}): StudentConfig {
  return {
    templateId: template.id,
    level: overrides.level ?? template.defaultLevel,
    attitude: overrides.attitude ?? template.defaultAttitude,
    confidence: overrides.confidence ?? template.defaultConfidence,
    emotion: overrides.emotion ?? template.defaultEmotion,
    errorPattern: overrides.errorPattern ?? template.defaultErrorPattern,
    scenarioGoal: overrides.scenarioGoal ?? template.defaultScenarioGoal
  };
}

export function buildSimulatedStudentProfile(template: StudentTemplate, config: StudentConfig): SimulatedStudentProfile {
  return {
    id: `sim-${template.id}-${config.level}-${config.attitude}-${config.confidence}-${config.emotion}-${config.errorPattern}-${config.scenarioGoal}`,
    templateId: template.id,
    config,
    summary: buildSummary(template, config),
    responseStyle: buildResponseStyle(config),
    hesitationStyle: buildHesitationStyle(config),
    likelyMistakeModes: buildLikelyMistakeModes(config),
    faceSavingTendency: confidenceScore(config.confidence),
    challengeTendency: challengeScore(config.attitude, config.confidence),
    generatedTags: buildGeneratedTags(template, config)
  };
}
