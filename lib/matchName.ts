import { resolveMatchingConfig, type MatchingConfig } from "./ai/config";
import { normalize, stem } from "./text/normalize";

export type RosterUser = {
  id: string;
  full_name: string;
  aliases: string[];
  is_active: boolean;
};

export type AssigneeMatch = {
  status: "matched" | "ambiguous" | "unmatched";
  user_id: string | null;
  candidates: { user_id: string; full_name: string; score: number }[];
  flag: "ok" | "check";
};

export interface MatchNameInput {
  assignee_id: string | null;
  assignee_queries: string[];
  assignee_confidence: number;
}

const MAX_CANDIDATES = 3;

function trigrams(value: string): string[] {
  const padded = ` ${value} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}

/** Dice coefficient over the trigram multisets of both strings. */
export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (!left.length || !right.length) return 0;

  const pool = new Map<string, number>();
  for (const t of left) pool.set(t, (pool.get(t) ?? 0) + 1);

  let shared = 0;
  for (const t of right) {
    const left = pool.get(t) ?? 0;
    if (left > 0) {
      pool.set(t, left - 1);
      shared++;
    }
  }
  return (2 * shared) / (left.length + right.length);
}

const isInitial = (token: string) => token.length === 1;

function stemmedTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => (isInitial(token) ? token : stem(token)));
}

/**
 * Spoken initials ("Ерлан Б") are acoustically fragile and semantically decisive:
 * compare them exactly, never by trigrams, and drop a surface whose initial disagrees.
 */
function surfaceScore(queryTokens: string[], surfaceTokens: string[]): number {
  const queryInitials = queryTokens.filter(isInitial);
  const surfaceInitials = surfaceTokens.filter(isInitial);

  if (surfaceInitials.length && queryInitials.length) {
    const agrees = surfaceInitials.every((i) => queryInitials.includes(i));
    if (!agrees) return 0;
  }
  return trigramSimilarity(queryTokens.join(" "), surfaceTokens.join(" "));
}

function userSurfaces(user: RosterUser): string[] {
  return [...new Set([user.full_name, ...user.aliases])];
}

export function matchName(
  input: MatchNameInput,
  roster: RosterUser[],
  cfg: MatchingConfig = resolveMatchingConfig(),
): AssigneeMatch {
  const active = roster.filter((u) => u.is_active);

  // 0. A bare first name shared by several people («Ерлану» with two Erlans) is ambiguous
  // no matter how confidently the model picked one — wrong assignee is the one error we
  // must never make (D-16, STT_GATE §4).
  const bareQuery = stemmedTokens(input.assignee_queries[0] ?? "");
  if (bareQuery.length === 1) {
    const namesakes = active.filter((u) => stemmedTokens(u.full_name)[0] === bareQuery[0]);
    if (namesakes.length >= 2) {
      return {
        status: "ambiguous",
        user_id: null,
        candidates: namesakes
          .slice(0, MAX_CANDIDATES)
          .map((u) => ({ user_id: u.id, full_name: u.full_name, score: 1 })),
        flag: "check",
      };
    }
  }

  // 1. The model's own id, if it points at an active roster member.
  if (input.assignee_id) {
    const user = active.find((u) => u.id === input.assignee_id);
    if (user) {
      return {
        status: "matched",
        user_id: user.id,
        candidates: [{ user_id: user.id, full_name: user.full_name, score: 1 }],
        flag: input.assignee_confidence < cfg.modelConfidenceYellow ? "check" : "ok",
      };
    }
  }

  // 2. Fuzzy fallback on the first verbatim mention.
  const query = input.assignee_queries[0] ?? "";
  const queryTokens = stemmedTokens(query);
  if (!queryTokens.length) {
    return { status: "unmatched", user_id: null, candidates: [], flag: "check" };
  }

  const scored = active
    .map((user) => ({
      user_id: user.id,
      full_name: user.full_name,
      score: Math.max(...userSurfaces(user).map((s) => surfaceScore(queryTokens, stemmedTokens(s)))),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < cfg.ambiguousThreshold) {
    return { status: "unmatched", user_id: null, candidates: [], flag: "check" };
  }

  const candidates = scored
    .filter((c) => c.score >= cfg.ambiguousThreshold)
    .slice(0, MAX_CANDIDATES);
  const gap = best.score - (scored[1]?.score ?? 0);

  // 3. Confident enough and clearly ahead of the runner-up — auto-fill, still a yellow chip.
  if (best.score >= cfg.autoThreshold && gap >= cfg.minGap) {
    return { status: "matched", user_id: best.user_id, candidates, flag: "check" };
  }

  return { status: "ambiguous", user_id: null, candidates, flag: "check" };
}
