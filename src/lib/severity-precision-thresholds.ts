export const SEVERITY_PRECISION_THRESHOLDS = {
  category: {
    decision: { high: 68, medium: 42 },
    boundary: { high: 66, medium: 40 },
    priority: { high: 56, medium: 36 },
    style: { high: 52, medium: 32 }
  },
  evidenceWeights: {
    teacher_boundary_conflict: 20,
    teacher_decision_conflict: 18,
    public_humiliation_signal: 30,
    direct_correction_before_safety: 24,
    priority_order_conflict: 18,
    meaning_first_violation: 20,
    face_saving_violation: 22,
    student_state_mismatch: 16
  },
  override: {
    targetedMinimumScore: 52,
    fullCorrectionScore: 82,
    highEvidenceCount: 2
  },
  segmentIntent: {
    protect: 84,
    soften: 55,
    reframe: 48,
    reorder: 46,
    rewrite: 65
  }
} as const;
