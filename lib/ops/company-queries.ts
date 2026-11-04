"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { newRequestId, opsFetch, OpsError } from "./client";
import type {
  AddPersonAnswer,
  AddPersonBody,
  AdjustPointsAnswer,
  AdjustPointsBody,
  ChangeDirectorAnswer,
  ChangeDirectorBody,
  CompanyCard,
  CreateCompanyAnswer,
  CreateCompanyBody,
  DeleteTaskAnswer,
  DeleteTaskBody,
  DrainAnswer,
  Footprint,
  PersonLoginAnswer,
  PersonLoginBody,
  PurgeAnswer,
  PurgeBody,
  RevokeSessionsAnswer,
  RevokeSessionsBody,
  TaskLookupAnswer,
  TaskLookupBody,
  UpdateCompanyAnswer,
  UpdateCompanyBody,
  UpdatePersonAnswer,
  UpdatePersonBody,
  UpdateTaskAnswer,
  UpdateTaskBody,
  WipeAnswer,
  WipeBody,
} from "./contract";

/**
 * The company card's reads and writes (D-157, tasks/029), all through `opsFetch`. The console's
 * QueryClient is its own, so «everything is stale» after a write means the card, the footprint,
 * the registry and the journal of this console, and nothing of a company's session. Each body
 * carries the id of one attempt: a screen takes it when its dialog opens (`newRequestId`), so a
 * repeat of the same attempt is the same action.
 */

const API = "/api/ops";

const companyKey = (id: string) => ["ops", "company", id] as const;
export const companyCardKey = (id: string) => [...companyKey(id), "card"] as const;
export const footprintKey = (id: string) => [...companyKey(id), "footprint"] as const;

/** An answer of the server is final; only a lost one is worth asking again. */
const retryLost = (count: number, error: unknown) => !(error instanceof OpsError) && count < 2;

/** `enabled: false` after the purge: nobody is left to ask about. */
export function useCompanyCard(id: string, enabled = true) {
  return useQuery({
    queryKey: companyCardKey(id),
    queryFn: () => opsFetch<CompanyCard>(`${API}/companies/${id}`),
    enabled,
    retry: retryLost,
    staleTime: 15_000,
  });
}

export function useFootprint(id: string, enabled = true) {
  return useQuery({
    queryKey: footprintKey(id),
    queryFn: () => opsFetch<Footprint>(`${API}/companies/${id}/footprint`),
    enabled,
    retry: retryLost,
    staleTime: 0,
  });
}

function useWrite<Vars, Answer>(mutationFn: (vars: Vars) => Promise<Answer>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries() });
}

export function useCreateCompany() {
  return useWrite((body: CreateCompanyBody) => opsFetch<CreateCompanyAnswer>(`${API}/companies`, { body }));
}

export function useUpdateCompany(id: string) {
  return useWrite((body: UpdateCompanyBody) => opsFetch<UpdateCompanyAnswer>(`${API}/companies/${id}`, { method: "PATCH", body }));
}

export function useAddPerson(id: string) {
  return useWrite((body: AddPersonBody) => opsFetch<AddPersonAnswer>(`${API}/companies/${id}/people`, { body }));
}

export function useUpdatePerson() {
  return useWrite(({ personId, body }: { personId: string; body: UpdatePersonBody }) =>
    opsFetch<UpdatePersonAnswer>(`${API}/people/${personId}`, { method: "PATCH", body }),
  );
}

export function useIssueCode() {
  return useWrite(({ personId, body }: { personId: string; body: PersonLoginBody }) =>
    opsFetch<PersonLoginAnswer>(`${API}/people/${personId}/login-code`, { body }),
  );
}

export function useRevokeSessions() {
  return useWrite(({ personId, body }: { personId: string; body: RevokeSessionsBody }) =>
    opsFetch<RevokeSessionsAnswer>(`${API}/people/${personId}/sessions`, { body }),
  );
}

export function useAdjustPoints() {
  return useWrite(({ personId, body }: { personId: string; body: AdjustPointsBody }) =>
    opsFetch<AdjustPointsAnswer>(`${API}/people/${personId}/points`, { body }),
  );
}

export function useChangeDirector(id: string) {
  return useWrite((body: ChangeDirectorBody) => opsFetch<ChangeDirectorAnswer>(`${API}/companies/${id}/director`, { body }));
}

/** A task is shown from the answer only: `gcTime: 0` keeps it out of any cache. */
export function useTaskLookup(id: string) {
  return useMutation({
    mutationFn: (body: TaskLookupBody) => opsFetch<TaskLookupAnswer>(`${API}/companies/${id}/task-lookup`, { body }),
    gcTime: 0,
  });
}

export function useUpdateTask() {
  return useWrite(({ taskId, body }: { taskId: string; body: UpdateTaskBody }) =>
    opsFetch<UpdateTaskAnswer>(`${API}/tasks/${taskId}`, { method: "PATCH", body }),
  );
}

export function useDeleteTask() {
  return useWrite(({ taskId, body }: { taskId: string; body: DeleteTaskBody }) =>
    opsFetch<DeleteTaskAnswer>(`${API}/tasks/${taskId}/delete`, { body }),
  );
}

export function useWipe(id: string) {
  return useWrite((body: WipeBody) => opsFetch<WipeAnswer>(`${API}/companies/${id}/wipe`, { body }));
}

/**
 * The company is gone: `onGone` lets the screen stop asking about it in the same breath, its reads
 * are dropped so nothing asks a 404, and the rest of the console is told.
 */
export function usePurge(id: string, onGone: (answer: PurgeAnswer) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurgeBody) => opsFetch<PurgeAnswer>(`${API}/companies/${id}/purge`, { body }),
    onSuccess: async (answer) => {
      onGone(answer);
      await queryClient.cancelQueries({ queryKey: companyKey(id) });
      queryClient.removeQueries({ queryKey: companyKey(id) });
      void queryClient.invalidateQueries();
    },
  });
}

export function useDrain() {
  return useWrite<void, DrainAnswer>(() => opsFetch<DrainAnswer>(`${API}/storage/drain`, { method: "POST" }));
}

/**
 * The id of one attempt on a form that stays on screen: the same values are the same attempt,
 * changed values are a new one, so an answer lost on the way never turns into another action
 * and a corrected form is never answered with the old result.
 */
export function useAttemptId() {
  const attempt = useRef<{ key: string; id: string } | null>(null);
  return (values: unknown): string => {
    const key = JSON.stringify(values);
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() };
    return attempt.current.id;
  };
}
