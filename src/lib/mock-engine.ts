import type { Session, SimulatedStudentProfile, TeachingActionTag, Turn } from "@/lib/types";

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function makeTurnId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function inferTeachingActions(text: string): TeachingActionTag[] {
  const lowered = text.toLowerCase();
  const actions = new Set<TeachingActionTag>();

  if (/(don't worry|do not worry|take your time|it's okay|its okay)/.test(lowered)) actions.add("reassure");
  if (/(core idea|main idea|meaning first|focus on the message)/.test(lowered)) actions.add("meaning_first");
  if (/(one more|try again|say it again|another attempt|retry)/.test(lowered)) actions.add("retry");
  if (/(for example|example|concrete example)/.test(lowered)) actions.add("example_first");
  if (/(grammar|tense|correct|correction|fix)/.test(lowered)) actions.add("grammar_first");
  if (/(why|precision|specific|vague|clarity|finish the point)/.test(lowered)) actions.add("push_precision");
  if (/(narrow|one point|one reason|single example)/.test(lowered)) actions.add("narrow_scope");
  if (/(pressure|strict|must|need to)/.test(lowered)) actions.add("pressure");
  if (/(diagnose|what is the issue|is it language|is it confidence)/.test(lowered)) actions.add("diagnose");
  if (/(correct|fix it|that is wrong)/.test(lowered)) actions.add("correct");

  return Array.from(actions);
}

function fallbackPool(profile: SimulatedStudentProfile) {
  const { config } = profile;

  if (config.attitude === "argumentative") {
    return [
      "I disagree a little, but I can give one reason.",
      "Why is that the rule? I want the logic behind it.",
      "I still think there is a better way to say it."
    ];
  }

  if (config.emotion === "anxious" || config.confidence === "low") {
    return [
      "Sorry, let me try again more carefully.",
      "I think I need one more hint to answer that.",
      "I'm not sure, but I want to keep trying."
    ];
  }

  if (config.attitude === "smart-but-lazy") {
    return [
      "Okay, but can we keep it short?",
      "I know the idea, I just need one concrete point.",
      "Fair enough, but I do not want to overdo it."
    ];
  }

  if (config.attitude === "shy") {
    return [
      "I want to say the main idea first.",
      "Can I try one more time?",
      "I think my answer is a bit too short."
    ];
  }

  return [
    "Okay, I will try again.",
    "I think I can make it clearer.",
    "Let me add one more detail."
  ];
}

function pickFromPool(profile: SimulatedStudentProfile, teacherText: string, sessionId: string, round: number, poolOverride?: string[]) {
  const lowered = teacherText.toLowerCase();
  let pool = poolOverride ?? fallbackPool(profile);
  const { config } = profile;

  if (/(core idea|main idea|meaning first|focus on the message)/.test(lowered)) {
    pool = [
      "I want to say the main point is that practice helps me speak more clearly.",
      "The meaning is that I can explain the idea first and polish later.",
      "So the message is clear, even if the grammar is not perfect yet."
    ];
  } else if (/(don't worry|do not worry|take your time|it's okay|its okay)/.test(lowered)) {
    pool = config.confidence === "low"
      ? [
          "Okay, that makes me feel calmer. I can keep going.",
          "Thanks. I can try a longer answer now.",
          "Alright, I will speak more confidently."
        ]
      : [
          "Thanks, I can keep going.",
          "Okay, I will try to explain it more clearly.",
          "Alright, that helps."
        ];
  } else if (/(one more|try again|say it again|another attempt|retry)/.test(lowered)) {
    pool = config.attitude === "smart-but-lazy"
      ? [
          "Okay, one more time. I can do better.",
          "Let me say it again in a clearer way.",
          "Fine, I will give the full version."
        ]
      : [
          "I will try again with a full sentence.",
          "Okay, one more time. I can do better.",
          "Let me say it again in a clearer way."
        ];
  } else if (/(for example|example|concrete example)/.test(lowered)) {
    pool = [
      "For example, when I have a fixed schedule, I stop wasting time.",
      "For example, if the rules are clear, I can follow them more easily.",
      "For example, I understand faster when the answer is concrete."
    ];
  } else if (/(why|precision|specific|vague|clarity|finish the point)/.test(lowered)) {
    pool = config.attitude === "argumentative"
      ? [
          "Because the point becomes clearer when I make one reason specific.",
          "I can be more precise if you want the logic step by step.",
          "The idea is stronger when I connect it to one concrete consequence."
        ]
      : [
          "Because the point becomes clearer when I make one reason specific.",
          "I can be more precise if you want the logic step by step.",
          "The idea is stronger when I connect it to one concrete consequence."
        ];
  }

  const index = hashString(`${sessionId}:${round}:${teacherText}:${config.attitude}:${config.confidence}:${config.errorPattern}`) % pool.length;
  return pool[index];
}

function buildRuleTriggers(profile: SimulatedStudentProfile, teacherText: string, replyText: string, teacherActions: TeachingActionTag[]) {
  const triggers = new Set<string>();
  const loweredTeacher = teacherText.toLowerCase();
  const loweredReply = replyText.toLowerCase();

  if (teacherActions.includes("meaning_first") || /(core idea|main idea|meaning first|focus on the message)/.test(loweredTeacher)) triggers.add("meaning-before-grammar");
  if (teacherActions.includes("reassure") || /(don't worry|do not worry|take your time|it's okay|its okay)/.test(loweredTeacher)) triggers.add("reassurance-before-correction");
  if (teacherActions.includes("retry") || /(one more|try again|say it again|another attempt|retry)/.test(loweredTeacher)) triggers.add("retry-before-explanation");
  if (teacherActions.includes("example_first") || /(for example|example|concrete example)/.test(loweredTeacher)) triggers.add("example-first");
  if (teacherActions.includes("push_precision") || /(why|precision|specific|vague|clarity|finish the point)/.test(loweredTeacher)) triggers.add("push-precision");
  if (profile.config.emotion === "anxious") triggers.add("face-saving");
  if (profile.config.attitude === "argumentative") triggers.add("boundary-test");
  if (/(full sentence|longer answer|clearer way)/.test(loweredReply)) triggers.add("student-expansion");
  if (/(sorry|apologize|carefully|not sure)/.test(loweredReply)) triggers.add("hesitation");

  return Array.from(triggers);
}

function findRecentStudentTurn(session: Session) {
  return [...session.transcript].reverse().find((turn) => turn.speaker === "student");
}

function classifyResponseCase(profile: SimulatedStudentProfile, teacherActions: TeachingActionTag[], teacherText: string, session: Session) {
  const lastStudentTurn = findRecentStudentTurn(session);
  const retryRequested = teacherActions.includes("retry");
  const diagnosticPrompt = teacherActions.includes("diagnose");
  const meaningFirst = teacherActions.includes("meaning_first");
  const pressure = teacherActions.includes("pressure") || teacherActions.includes("push_precision");
  const anxious = profile.config.emotion === "anxious" || profile.config.confidence === "low";
  const argumentative = profile.config.attitude === "argumentative";
  const shortcut = profile.config.attitude === "smart-but-lazy";
  const repeatedRetry = Boolean(lastStudentTurn?.ruleTriggers?.includes("retry-before-explanation"));
  const repeatedError = Boolean(lastStudentTurn?.ruleTriggers?.includes(profile.config.errorPattern));

  if (diagnosticPrompt && anxious) {
    return "diagnose_confidence";
  }
  if (retryRequested && repeatedRetry) {
    return "retry_success";
  }
  if (retryRequested && anxious) {
    return "retry_partial";
  }
  if (meaningFirst && profile.config.errorPattern === "meaning") {
    return "meaning_repair";
  }
  if (pressure && (argumentative || shortcut)) {
    return "defensive_or_shortcut";
  }
  if (pressure && repeatedError) {
    return "escalated_precision";
  }
  if (anxious && /wrong|mistake|bad/i.test(teacherText)) {
    return "anxiety_freeze";
  }
  if (shortcut) {
    return "shortcut_answer";
  }
  if (argumentative) {
    return "challenge_response";
  }
  return "improved_answer";
}

export function createOpeningStudentTurn(profile: SimulatedStudentProfile, sessionId: string): Turn {
  const opener = pickFromPool(profile, profile.summary, sessionId, 1);
  return {
    id: makeTurnId(`${sessionId}-opening`),
    speaker: "student",
    source: "simulator",
    text: opener,
    round: 1,
    tags: unique([...profile.generatedTags, profile.config.attitude, profile.config.errorPattern]),
    timestamp: new Date().toISOString(),
    highlighted: true,
    teachingActions: [],
    emotionSignal: [profile.config.emotion],
    ruleTriggers: []
  };
}

export function buildTeacherTurn(text: string, round: number): Turn {
  return {
    id: makeTurnId(`teacher-${round}`),
    speaker: "teacher",
    source: "human",
    text,
    round,
    tags: ["teacher-input"],
    timestamp: new Date().toISOString(),
    highlighted: /important|key|critical|repeat/i.test(text),
    teachingActions: inferTeachingActions(text),
    emotionSignal: [],
    ruleTriggers: []
  };
}

export function generateStudentReply(profile: SimulatedStudentProfile, teacherTurn: Turn, session: Session): Turn {
  const teacherActions = teacherTurn.teachingActions ?? inferTeachingActions(teacherTurn.text);
  const responseCase = classifyResponseCase(profile, teacherActions, teacherTurn.text, session);
  const basePool = pickFromPool(profile, teacherTurn.text, session.id, teacherTurn.round);
  const replyText = basePool;
  const derivedText =
    responseCase === "diagnose_confidence"
      ? "I am nervous, but I can try again if you help me keep it simple."
      : responseCase === "retry_success"
        ? "I will try again with a clearer full sentence now."
        : responseCase === "retry_partial"
          ? "Okay, I will try again, but I might need one more hint."
          : responseCase === "meaning_repair"
            ? "The main idea is that I can explain the point first and fix the grammar later."
            : responseCase === "defensive_or_shortcut"
              ? profile.config.attitude === "argumentative"
                ? "Why do we need to go that way? I think the point is already clear."
                : "I know the idea already, so I do not want to over-explain it."
              : responseCase === "escalated_precision"
                ? "Okay, I will make the point more specific and give one concrete consequence."
                : responseCase === "anxiety_freeze"
                  ? "Sorry, I froze a little. Let me try a simpler sentence."
                  : responseCase === "shortcut_answer"
                    ? "The short answer is that it works because the structure is easy."
                    : responseCase === "challenge_response"
                      ? "I disagree a little, but I can give one reason if that helps."
                      : replyText;

  return {
    id: makeTurnId(`student-${teacherTurn.round}`),
    speaker: "student",
    source: "simulator",
    text: derivedText,
    round: teacherTurn.round,
    tags: unique([
      profile.config.attitude,
      profile.config.emotion,
      profile.config.errorPattern,
      responseCase,
      ...(profile.generatedTags ?? [])
    ]),
    timestamp: new Date().toISOString(),
    highlighted: /important|key|critical/i.test(derivedText),
    teachingActions: [],
    emotionSignal: [profile.config.emotion],
    ruleTriggers: buildRuleTriggers(profile, teacherTurn.text, derivedText, teacherActions)
  };
}
