"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { opsFetch } from "./client";
import type { AuditAnswer, CompaniesAnswer, MeAnswer, OperatorsAnswer } from "./contract";

/** The console's cache lives in its own QueryClient (OpsProviders): nothing here is kept on the device. */
export const opsKeys = {
  all: ["ops"] as const,
  me: () => [...opsKeys.all, "me"] as const,
  companies: () => [...opsKeys.all, "companies"] as const,
  audit: (company: string | null) => [...opsKeys.all, "audit", company] as const,
  /** Every view of the journal, filtered or not: what an action invalidates. */
  auditAll: () => [...opsKeys.all, "audit"] as const,
  operators: () => [...opsKeys.all, "operators"] as const,
};

export function useMe() {
  return useQuery({ queryKey: opsKeys.me(), queryFn: () => opsFetch<MeAnswer>("/api/ops/me") });
}

/** A minute: the registry is what is watched while something burns; a hidden tab does not ask. */
export const LIVE_MS = 60_000;

export function useCompanies() {
  return useQuery({
    queryKey: opsKeys.companies(),
    queryFn: () => opsFetch<CompaniesAnswer>("/api/ops/companies"),
    select: (answer) => answer.companies,
    refetchInterval: LIVE_MS,
  });
}

function auditPath(before: number | null, company: string | null): string {
  const query = new URLSearchParams();
  if (before !== null) query.set("before", String(before));
  if (company) query.set("company", company);
  const search = query.toString();
  return search ? `/api/ops/audit?${search}` : "/api/ops/audit";
}

/** The journal page by page: every page starts before the last id of the one above it. */
export function useAudit(company: string | null) {
  return useInfiniteQuery({
    queryKey: opsKeys.audit(company),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => opsFetch<AuditAnswer>(auditPath(pageParam, company)),
    getNextPageParam: (last) => last.next_before,
  });
}

export function useOperators() {
  return useQuery({
    queryKey: opsKeys.operators(),
    queryFn: () => opsFetch<OperatorsAnswer>("/api/ops/operators"),
    select: (answer) => answer.operators,
  });
}
