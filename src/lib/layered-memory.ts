import { LAYERED_MEMORY_THRESHOLDS, MEMORY_PENALTY_THRESHOLDS } from "@/lib/memory-thresholds";
import type { LayeredPressureMemory } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export type LayeredPressureMemoryEventType = "challengerPressure" | "contradictionShock" | "reviewShock" | "turnoverStress";

export type LayeredPressureMemoryEvent = {
  type: LayeredPressureMemoryEventType;
  intensity: number;
};

export function emptyLayeredPressureMemory(): LayeredPressureMemory {
  return {
    challengerPressure: 0,
    contradictionShock: 0,
    reviewShock: 0,
    turnoverStress: 0
  };
}

function updateSlot(previous: number, intensity: number, config: { gain: number; carry: number; decay: number }) {
  if (intensity <= 0) {
    return clamp(previous * config.decay, 0, 100);
  }
  return clamp(previous * config.carry + intensity * config.gain, 0, 100);
}

export function updateLayeredPressureMemory(previous: LayeredPressureMemory | undefined, events: LayeredPressureMemoryEvent[]) {
  const base = previous ?? emptyLayeredPressureMemory();
  const grouped = events.reduce<Record<LayeredPressureMemoryEventType, number>>(
    (acc, event) => {
      acc[event.type] += Math.max(0, event.intensity);
      return acc;
    },
    {
      challengerPressure: 0,
      contradictionShock: 0,
      reviewShock: 0,
      turnoverStress: 0
    }
  );

  return {
    challengerPressure: updateSlot(base.challengerPressure, grouped.challengerPressure, LAYERED_MEMORY_THRESHOLDS.challenger),
    contradictionShock: updateSlot(base.contradictionShock, grouped.contradictionShock, LAYERED_MEMORY_THRESHOLDS.contradiction),
    reviewShock: updateSlot(base.reviewShock, grouped.reviewShock, LAYERED_MEMORY_THRESHOLDS.review),
    turnoverStress: updateSlot(base.turnoverStress, grouped.turnoverStress, LAYERED_MEMORY_THRESHOLDS.turnover)
  };
}

export function aggregateLayeredPressureMemory(memory: LayeredPressureMemory | undefined) {
  const base = memory ?? emptyLayeredPressureMemory();
  return clamp(
    base.challengerPressure * LAYERED_MEMORY_THRESHOLDS.challenger.weight +
      base.contradictionShock * LAYERED_MEMORY_THRESHOLDS.contradiction.weight +
      base.reviewShock * LAYERED_MEMORY_THRESHOLDS.review.weight +
      base.turnoverStress * LAYERED_MEMORY_THRESHOLDS.turnover.weight,
    0,
    100
  );
}

export function describeLayeredPressureMemory(memory: LayeredPressureMemory | undefined) {
  const base = memory ?? emptyLayeredPressureMemory();
  return {
    challengerPressure: base.challengerPressure,
    contradictionShock: base.contradictionShock,
    reviewShock: base.reviewShock,
    turnoverStress: base.turnoverStress,
    total: aggregateLayeredPressureMemory(base),
    summary: `Chal ${Math.round(base.challengerPressure)} / Con ${Math.round(base.contradictionShock)} / Rev ${Math.round(base.reviewShock)} / Turn ${Math.round(base.turnoverStress)}`
  };
}

export function layeredMemoryBias(memory: LayeredPressureMemory | undefined) {
  const base = memory ?? emptyLayeredPressureMemory();
  return clamp(
    aggregateLayeredPressureMemory(base) +
      base.reviewShock * 0.18 +
      base.contradictionShock * 0.14 +
      base.turnoverStress * 0.16 +
      base.challengerPressure * 0.1,
    0,
    100
  );
}

export function layeredMemoryStage(memory: LayeredPressureMemory | undefined) {
  const base = memory ?? emptyLayeredPressureMemory();
  const aggregate = aggregateLayeredPressureMemory(base);
  if (aggregate >= MEMORY_PENALTY_THRESHOLDS.severeMemory || base.turnoverStress >= 40) return "severe";
  if (aggregate >= MEMORY_PENALTY_THRESHOLDS.highMemory || base.reviewShock >= 30) return "high";
  if (aggregate >= MEMORY_PENALTY_THRESHOLDS.mediumMemory) return "medium";
  return "low";
}
