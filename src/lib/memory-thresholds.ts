export const LAYERED_MEMORY_THRESHOLDS = {
  challenger: {
    gain: 0.26,
    carry: 0.82,
    decay: 0.9,
    weight: 0.28
  },
  contradiction: {
    gain: 0.32,
    carry: 0.88,
    decay: 0.93,
    weight: 0.3
  },
  review: {
    gain: 0.38,
    carry: 0.94,
    decay: 0.965,
    weight: 0.23
  },
  turnover: {
    gain: 0.3,
    carry: 0.91,
    decay: 0.94,
    weight: 0.19
  }
} as const;

export const NONLINEAR_RECOVERY_THRESHOLDS = {
  stalledCooldownLevel: 66,
  slowCooldownLevel: 44,
  recoveringCooldownLevel: 22,
  stabilizedCooldownLevel: 10,
  stalledRecoveryCap: 0.2,
  slowRecoveryCap: 0.48,
  recoveringRecoveryCap: 0.8,
  stabilizedRecoveryCap: 1,
  reviewShockDrag: 1.28,
  contradictionShockDrag: 1.08,
  challengerShockDrag: 0.98,
  turnoverShockDrag: 1.2,
  reviewRecoveryDelay: 1.35,
  contradictionRecoveryDelay: 1.18,
  challengerRecoveryDelay: 1.02,
  turnoverRecoveryDelay: 1.26
} as const;

export const MEMORY_PENALTY_THRESHOLDS = {
  lowMemory: 14,
  mediumMemory: 26,
  highMemory: 42,
  severeMemory: 58
} as const;
