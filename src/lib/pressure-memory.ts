import { aggregateLayeredPressureMemory } from "@/lib/layered-memory";
import { PRESSURE_MEMORY_THRESHOLDS } from "@/lib/recovery-thresholds";
import type { LayeredPressureMemory } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function updatePressureMemory(previousMemory: number, rawPressure: number, eventIntensity = 0) {
  if (rawPressure <= PRESSURE_MEMORY_THRESHOLDS.pressureFloor && eventIntensity <= 0) {
    return clamp(previousMemory * PRESSURE_MEMORY_THRESHOLDS.decay, 0, 100);
  }

  return clamp(previousMemory * PRESSURE_MEMORY_THRESHOLDS.carry + rawPressure * PRESSURE_MEMORY_THRESHOLDS.gain + eventIntensity, 0, 100);
}

export function computePressureMemoryEventIntensity({
  challengerBecameLeader,
  turnoverCounter,
  lockStatusBreaking,
  contradictionPressure,
  reviewShock
}: {
  challengerBecameLeader: boolean;
  turnoverCounter: number;
  lockStatusBreaking: boolean;
  contradictionPressure: number;
  reviewShock: number;
}) {
  return clamp(
    (challengerBecameLeader ? 6 : 0) +
      turnoverCounter * 2.5 +
      (lockStatusBreaking ? 7 : 0) +
      contradictionPressure * 0.45 +
      reviewShock * 0.65,
    0,
    35
  );
}

export function computePressureMemoryBoost(pressureMemory: number | LayeredPressureMemory) {
  const normalized = typeof pressureMemory === "number" ? pressureMemory : aggregateLayeredPressureMemory(pressureMemory);
  return clamp(normalized * PRESSURE_MEMORY_THRESHOLDS.memoryWeight, 0, 24);
}
