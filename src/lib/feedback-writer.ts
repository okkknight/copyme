import type { PersonaRule } from "@/lib/types";
import type { SimilarityDiff } from "@/lib/diff-analyzer";

export type FeedbackWriteback = {
  targetRuleIds: string[];
  action: "strengthen" | "weaken" | "create_new_rule" | "adjust_priority" | "adjust_boundary";
  reason: string;
  expectedImpact: string;
};

export type RuleLike = Pick<PersonaRule, "id" | "text" | "layer" | "topicKey"> & {
  status?: string;
};

type WritebackInput = {
  diff: SimilarityDiff;
  catalog?: RuleLike[];
};

const CATEGORY_KEYWORDS: Record<SimilarityDiff["category"], string[]> = {
  decision: ["meaning", "retry", "diagnose", "pressure", "example", "reassure", "correct", "grammar", "continue", "delay"],
  priority: ["meaning", "precision", "agency", "boundary", "retry", "main idea", "next step"],
  style: ["warm", "direct", "reassure", "short", "concise", "collaborative", "tone", "example"],
  boundary: ["face", "safe", "respect", "supportive", "humiliation", "sarcasm", "public", "boundary"]
};

const CATEGORY_LAYER_PREFERENCE: Record<SimilarityDiff["category"], string[]> = {
  decision: ["decision", "value"],
  priority: ["decision", "value", "boundary"],
  style: ["style"],
  boundary: ["boundary"]
};

const CATEGORY_ACTION: Record<SimilarityDiff["category"], FeedbackWriteback["action"]> = {
  decision: "adjust_priority",
  priority: "adjust_priority",
  style: "strengthen",
  boundary: "adjust_boundary"
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function scoreRuleMatch(rule: RuleLike, category: SimilarityDiff["category"], diff: SimilarityDiff) {
  const normalizedText = normalizeText(rule.text);
  const normalizedTopic = normalizeText(rule.topicKey ?? "");
  const keywords = CATEGORY_KEYWORDS[category];
  let score = 0;

  if (CATEGORY_LAYER_PREFERENCE[category].includes(normalizeText(rule.layer ?? ""))) {
    score += 3;
  }

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalizedText.includes(normalizedKeyword) || normalizedTopic.includes(normalizedKeyword)) {
      score += 1.5;
    }
  }

  if (diff.reason === "rule_conflict") score += 0.75;
  if (diff.reason === "rule_missing") score += 0.5;
  if (diff.reason === "rule_weight_issue") score += 0.25;
  if (rule.status === "accepted") score += 0.5;
  if (rule.status === "emerging") score += 0.25;

  return score;
}

function topMatchingRules(category: SimilarityDiff["category"], catalog: RuleLike[] = [], diff: SimilarityDiff) {
  return catalog
    .map((rule) => ({ rule, score: scoreRuleMatch(rule, category, diff) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.rule.id);
}

function buildReason(diff: SimilarityDiff, targets: string[]) {
  const targetText = targets.length ? `targets ${targets.join(", ")}` : "no exact existing rule";
  return `${diff.category} ${diff.severity} gap because ${diff.reason.replaceAll("_", " ")}; ${targetText}. ${diff.explanation}`;
}

function expectedImpactFor(diff: SimilarityDiff, action: FeedbackWriteback["action"]) {
  if (diff.category === "boundary") {
    return action === "adjust_boundary"
      ? "Reduce directness, keep the correction face-saving, and avoid exposing the student too early."
      : "Strengthen the boundary rule so the proxy preserves face before correction."
  }
  if (diff.category === "decision") {
    return action === "adjust_priority"
      ? "Restore the teacher's decision sequence so the proxy delays correction or pressure until the student is ready."
      : "Create a new decision rule that captures the missing teacher move."
  }
  if (diff.category === "priority") {
    return "Rebalance the response toward the teacher's priority layer instead of over-weighting the wrong one."
  }
  return action === "strengthen"
    ? "Preserve the teacher's collaborative tone and reduce the style shift."
    : "Reduce the stylistic drift without changing the decision path.";
}

export function buildFeedbackWriteback({ diff, catalog = [] }: WritebackInput): FeedbackWriteback {
  const targetRuleIds = topMatchingRules(diff.category, catalog, diff);
  const action =
    diff.reason === "rule_missing"
      ? targetRuleIds.length
        ? CATEGORY_ACTION[diff.category]
        : "create_new_rule"
      : diff.reason === "rule_conflict"
        ? diff.category === "style"
          ? "strengthen"
          : diff.category === "boundary"
            ? "adjust_boundary"
            : "weaken"
        : diff.reason === "student_model_error"
          ? diff.category === "boundary"
            ? "adjust_boundary"
            : "adjust_priority"
          : CATEGORY_ACTION[diff.category];

  return {
    targetRuleIds,
    action,
    reason: buildReason(diff, targetRuleIds),
    expectedImpact: expectedImpactFor(diff, action)
  };
}

export function buildFeedbackWritebackPlan(diffs: SimilarityDiff[], catalog: RuleLike[] = []) {
  return diffs.map((diff) => buildFeedbackWriteback({ diff, catalog }));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function replaceAllSafe(text: string, replacements: Array<[RegExp, string]>) {
  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function derivePrefix(writebacks: FeedbackWriteback[]) {
  const parts: string[] = [];
  if (writebacks.some((writeback) => writeback.action === "adjust_boundary" || writeback.action === "strengthen")) {
    parts.push("Let's keep the student speaking and make the correction face-saving.");
  }
  if (writebacks.some((writeback) => writeback.action === "adjust_priority")) {
    parts.push("Focus on the main idea first, then refine details.");
  }
  if (writebacks.some((writeback) => writeback.action === "weaken")) {
    parts.push("Avoid a harsh jump into correction or release.");
  }
  if (writebacks.some((writeback) => writeback.action === "create_new_rule")) {
    parts.push("Capture this as a reusable rule for the next round.");
  }
  return unique(parts).join(" ");
}

export function buildCalibratedProxyResponse(params: {
  proxyResponse: string;
  teacherResponse: string;
  writebacks: FeedbackWriteback[];
  diffs?: SimilarityDiff[];
}) {
  const writebacks = params.writebacks.length ? params.writebacks : [];
  const prefix = derivePrefix(writebacks);
  let output = params.proxyResponse.trim();

  output = replaceAllSafe(output, [
    [/\byour grammar is wrong\b/gi, "That's a good start. Let's refine the grammar together."],
    [/\bplease answer with a full sentence and correct grammar\b/gi, "Nice start. Let's keep the meaning first and refine the grammar together."],
    [/\bgood point\.?\s*let's move on\b/gi, "Good point. Let's stay with one more concrete step."],
    [/\blet's move on\b/gi, "Let's stay with one more concrete step."],
    [/\btry using the past tense before you continue\b/gi, "Try it again in a full sentence, and we'll polish the tense after."],
    [/\byou should know\b/gi, "Let's work through this together."],
    [/\bwrong\b/gi, "not quite there yet"],
    [/\bobviously\b/gi, "let's look at"],
    [/\bjust\b/gi, "simply"],
    [/\bmove on\b/gi, "stay with it a bit longer"]
  ]);

  if (prefix) {
    output = `${prefix} ${output}`.trim();
  }

  if (writebacks.some((writeback) => writeback.action === "adjust_priority")) {
    output = output.replace(/^\s*/, "");
    if (!/main idea|meaning|example|reason/i.test(output)) {
      output = `Focus on the main idea first. ${output}`;
    }
  }

  if (writebacks.some((writeback) => writeback.action === "adjust_boundary" || writeback.action === "strengthen")) {
    if (!/keep speaking|together|good start|nice start|calm/i.test(output)) {
      output = `Let's keep this calm and supportive. ${output}`;
    }
  }

  if (writebacks.some((writeback) => writeback.action === "create_new_rule")) {
    const teacherLead = clampWords(params.teacherResponse, 12);
    output = `${teacherLead}. ${output}`;
  }

  output = output.replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim();
  return output;
}
