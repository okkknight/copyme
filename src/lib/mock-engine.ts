import type { StudentProfile, TeachingActionTag, Turn } from "@/lib/types";

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

function fallbackPool(profile: StudentProfile) {
  if (profile.attitude === "argumentative") {
    return [
      "I disagree a little, but I can give one reason.",
      "Why is that the rule? I want the logic behind it.",
      "I still think there is a better way to say it."
    ];
  }

  if (profile.emotion === "anxious") {
    return [
      "Sorry, let me try again more carefully.",
      "I think I need one more hint to answer that.",
      "I'm not sure, but I want to keep trying."
    ];
  }

  if (profile.attitude === "smart-but-lazy") {
    return [
      "Okay, but can we keep it short?",
      "I know the idea, I just need one concrete point.",
      "Fair enough, but I do not want to overdo it."
    ];
  }

  if (profile.attitude === "shy") {
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

function pickFromPool(profile: StudentProfile, teacherText: string, sessionId: string, round: number) {
  const lowered = teacherText.toLowerCase();
  let pool = fallbackPool(profile);

  if (/(core idea|main idea|meaning first|focus on the message)/.test(lowered)) {
    pool = [
      "I want to say the main point is that practice helps me speak more clearly.",
      "The meaning is that I can explain the idea first and polish later.",
      "So the message is clear, even if the grammar is not perfect yet."
    ];
  } else if (/(don't worry|do not worry|take your time|it's okay|its okay)/.test(lowered)) {
    pool = [
      "Okay, that makes me feel calmer. I can keep going.",
      "Thanks. I can try a longer answer now.",
      "Alright, I will speak more confidently."
    ];
  } else if (/(one more|try again|say it again|another attempt|retry)/.test(lowered)) {
    pool = [
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
    pool = [
      "Because the point becomes clearer when I make one reason specific.",
      "I can be more precise if you want the logic step by step.",
      "The idea is stronger when I connect it to one concrete consequence."
    ];
  }

  const index = hashString(`${sessionId}:${round}:${teacherText}`) % pool.length;
  return pool[index];
}

function buildRuleTriggers(profile: StudentProfile, teacherText: string, replyText: string) {
  const triggers = new Set<string>();
  const loweredTeacher = teacherText.toLowerCase();
  const loweredReply = replyText.toLowerCase();

  if (/(core idea|main idea|meaning first|focus on the message)/.test(loweredTeacher)) triggers.add("meaning-before-grammar");
  if (/(don't worry|do not worry|take your time|it's okay|its okay)/.test(loweredTeacher)) triggers.add("reassurance-before-correction");
  if (/(one more|try again|say it again|another attempt|retry)/.test(loweredTeacher)) triggers.add("retry-before-explanation");
  if (/(for example|example|concrete example)/.test(loweredTeacher)) triggers.add("example-first");
  if (/(why|precision|specific|vague|clarity|finish the point)/.test(loweredTeacher)) triggers.add("push-precision");
  if (profile.emotion === "anxious") triggers.add("face-saving");
  if (profile.attitude === "argumentative") triggers.add("boundary-setting");
  if (/(full sentence|longer answer|clearer way)/.test(loweredReply)) triggers.add("student-expansion");

  return Array.from(triggers);
}

export function createOpeningStudentTurn(profile: StudentProfile, sessionId: string): Turn {
  const opener = pickFromPool(profile, profile.summary, sessionId, 1);
  return {
    id: makeTurnId(`${sessionId}-opening`),
    speaker: "student",
    source: "simulator",
    text: opener,
    round: 1,
    tags: profile.defaultTags?.length ? profile.defaultTags : [profile.attitude, profile.errorPattern],
    timestamp: new Date().toISOString(),
    highlighted: true,
    teachingActions: [],
    emotionSignal: [profile.emotion],
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

export function generateStudentReply(profile: StudentProfile, teacherText: string, sessionId: string, round: number): Turn {
  const text = pickFromPool(profile, teacherText, sessionId, round);
  return {
    id: makeTurnId(`student-${round}`),
    speaker: "student",
    source: "simulator",
    text,
    round,
    tags: [profile.attitude, profile.emotion],
    timestamp: new Date().toISOString(),
    highlighted: /important|key|critical/i.test(text),
    teachingActions: [],
    emotionSignal: [profile.emotion],
    ruleTriggers: buildRuleTriggers(profile, teacherText, text)
  };
}
