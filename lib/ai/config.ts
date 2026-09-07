/**
 * Name-matching thresholds (docs/AI.md §5, D-16): configuration, never hardcoded
 * at the call site — overridden per company via company.settings.matching.
 */
export interface MatchingConfig {
  autoThreshold: number;
  minGap: number;
  ambiguousThreshold: number;
  modelConfidenceYellow: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  autoThreshold: 0.45,
  minGap: 0.15,
  ambiguousThreshold: 0.3,
  modelConfidenceYellow: 0.8,
};

export function resolveMatchingConfig(overrides?: Partial<MatchingConfig>): MatchingConfig {
  return { ...DEFAULT_MATCHING_CONFIG, ...overrides };
}
