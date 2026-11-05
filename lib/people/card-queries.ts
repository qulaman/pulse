"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { AVATAR_BUCKET, avatarPath } from "@/lib/people/avatar";
import type { OpenWork } from "@/lib/people/handover";
import { peopleKeys } from "@/lib/people/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** What stands behind a card: may it be deleted, the person's open work. */
export type Standing = { deletable: boolean; open: OpenWork };

const standingKey = (id: string) => ["people", id, "standing"] as const;

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message_ru?: string } };
  return new Error(body.error?.message_ru ?? fallback);
}

/** `GET /api/people/[id]`, for those who may fire and delete: always read afresh, it decides destructive moves. */
export function useStanding(id: string, enabled: boolean) {
  return useQuery({
    queryKey: standingKey(id),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<Standing> => {
      const res = await fetch(`/api/people/${id}`, { credentials: "include" });
      if (!res.ok) throw await failure(res, "Не удалось прочитать карточку");
      return (await res.json()) as Standing;
    },
  });
}

/**
 * The company's phones, by person. A table of their own: every employee reads `profiles`, only the
 * director, the secretary and the person read this one. No retry and no toast: a card that could
 * not get its phone simply shows none.
 */
export function usePhones() {
  return useQuery({
    queryKey: [...peopleKeys.all, "phones"],
    retry: false,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await createBrowserSupabase().from("profile_phones").select("user_id, phone");
      if (error) throw new Error(error.message);
      return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.phone]));
    },
  });
}

/** Writes or clears a card's phone. Saying it twice changes nothing. */
export function useSavePhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, companyId, phone }: { id: string; companyId: string; phone: string | null }) => {
      const table = createBrowserSupabase().from("profile_phones");
      const { error } = phone ? await table.upsert({ user_id: id, company_id: companyId, phone }) : await table.delete().eq("user_id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...peopleKeys.all, "phones"] }),
    onError: () => toast("Телефон не сохранился, остальное сохранено"),
  });
}

/** After a change of who works here: the roster, the names the parser matches, the card's standing. */
function useRosterRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["roster"] });
  };
}

/**
 * «Уволить» and «Вернуть в команду»: `is_active` under RLS and the guard, as any edit of the card.
 * Firing signs the person out on its own (`trg_profiles_deactivated`). Setting it twice changes
 * nothing. Toasts are the screen's: it knows how the handover went.
 */
export function useSetWorking() {
  const refresh = useRosterRefresh();
  return useMutation({
    mutationFn: async ({ id, working }: { id: string; working: boolean }) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("profiles").update({ is_active: working }).eq("id", id).select("id");
      if (error) {
        console.error("is_active update failed:", error.message);
        throw new Error("Не получилось сохранить — можно ещё раз");
      }
      if (!data?.length) throw new Error("Эту карточку менять нельзя");
    },
    onSuccess: refresh,
  });
}

/** One task to another person: the desk's own «Передать другому» API, `client_request_id` per task. */
export async function reassignTask(taskId: string, assigneeId: string, requestId: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/reassign`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assignee_id: assigneeId, client_request_id: requestId }),
  });
  if (!res.ok) throw await failure(res, "Не получилось передать");
}

/** A card without history goes. A repeat answers success: the card is gone either way. */
export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/people/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw await failure(res, "Не получилось удалить");
    },
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: peopleKeys.one(id) });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
    },
    // a refusal may mean the history has just appeared
    onError: (_error, id) => void queryClient.invalidateQueries({ queryKey: standingKey(id) }),
  });
}

/** What the form holds for the photo: nothing changed, a new square, or none any more. */
export type PhotoDraft = { kind: "same" } | { kind: "new"; blob: Blob; preview: string; key: string } | { kind: "gone" };

/**
 * Applies the form's photo. The file goes straight to Storage under the key fixed when it was
 * chosen — a retry of the same photo finds it there — then the server puts it on the card and
 * removes the previous file: the client has no right to delete in this bucket.
 */
export function useSavePhoto() {
  const refresh = useRosterRefresh();
  return useMutation({
    mutationFn: async ({ id, companyId, photo }: { id: string; companyId: string; photo: PhotoDraft }) => {
      if (photo.kind === "same") return;
      if (photo.kind === "gone") {
        const res = await fetch(`/api/people/${id}/avatar`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw await failure(res, "Не получилось убрать фото");
        return;
      }
      const path = avatarPath(companyId, photo.key);
      const uploaded = await createBrowserSupabase()
        .storage.from(AVATAR_BUCKET)
        // the name is never reused: the file may be cached for good
        .upload(path, photo.blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      if (uploaded.error && !/exists|duplicate/i.test(uploaded.error.message)) throw new Error("Не получилось загрузить фото");
      const res = await fetch(`/api/people/${id}/avatar`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw await failure(res, "Не получилось сохранить фото");
    },
    onSuccess: refresh,
    onError: (error) => toast(error instanceof Error ? error.message : "Не получилось сохранить фото"),
  });
}
