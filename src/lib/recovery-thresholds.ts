export const PRESSURE_MEMORY_THRESHOLDS = {
  carry: 0.74,
  gain: 0.24,
  decay: 0.88,
  memoryWeight: 0.22,
  pressureFloor: 16,
  highMemory: 42,
  pressureResistanceWeight: 0.16
} as const;

export const COOLDOWN_THRESHOLDS = {
  carry: 0.78,
  decay: 0.9,
  baseShock: 10,
  turnoverShock: 6,
  lockBreakShock: 12,
  incumbentChallengeShock: 8,
  recoveryLockedMax: 20,
  stableMax: 18,
  pressuredMin: 24,
  breakingMin: 34,
  recoveryProgressStable: 0.68
} as const;

export const RECOVERY_GROUP_THRESHOLDS = {
  pressuredPressureMemory: 20,
  pressuredCooldownLevel: 18,
  stablePressureMemory: 16,
  stableCooldownLevel: 14,
  turnoverCooldownLevel: 34,
  recoveryProgressThreshold: 0.62
} as const;

