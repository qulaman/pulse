"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type Person = Database["public"]["Tables"]["profiles"]["Row"];
export type Role = Database["public"]["Enums"]["user_role"];
export type Availability = Database["public"]["Enums"]["availability_t"];

export const ROLE_LABEL: Record<Role, string> = {
  director: "Директор",
  manager: "Руководитель",
  employee: "Сотрудник",
  shopkeeper: "Завхоз магазина",
  secretary: "Секретарь",
  tv: "ТВ-экран",
};

/** What a role means in one line — the role picker says it under the name (D-104). */
export const ROLE_ABOUT: Record<Role, string> = {
  employee: "Получает задачи и отчитывается",
  manager: "Как сотрудник, и видит задачи своих людей",
  secretary: "Заявки директора, настройки и команда",
  shopkeeper: "Выдаёт награды из магазина",
  director: "Раздаёт задачи и принимает работу",
  tv: "Экран на стене — только показывает",
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  active: "На месте",
  vacation: "В отпуске",
  sick: "На больничном",
};

export const peopleKeys = {
  all: ["people"] as const,
  one: (id: string) => ["people", id] as const,
};

/** Everybody in the company, inactive last — RLS shows the director the whole roster. */
export function usePeople() {
  return useQuery({
    queryKey: peopleKeys.all,
    queryFn: async (): Promise<Person[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("is_active", { ascending: false })
        .order("full_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export type PersonMessage = Database["public"]["Tables"]["task_messages"]["Row"] & {
  task: { id: string; title: string } | null;
};

/** The last things this person said in task threads — the director's «Что писал». */
export function usePersonMessages(id: string) {
  return useQuery({
    queryKey: ["people", id, "messages"],
    queryFn: async (): Promise<PersonMessage[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("task_messages")
        .select("*, task:tasks!task_messages_task_id_fkey(id, title)")
        .eq("sender_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PersonMessage[];
    },
  });
}

export function usePerson(id: string) {
  return useQuery({
    queryKey: peopleKeys.one(id),
    queryFn: async (): Promise<Person> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export type PersonPatch = Partial<
  Pick<Person, "full_name" | "position" | "role" | "aliases" | "manager_id" | "availability" | "is_active">
>;

/**
 * Direct update under RLS: the director and secretary policies plus trg_profiles_guard
 * decide what is allowed (D-104). A row the caller may not touch is filtered out silently,
 * so the updated ids come back and an empty answer is a refusal, not a «Сохранил».
 */
export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PersonPatch }) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("not_permitted");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      toast("Сохранил");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      toast(
        message.includes("forbidden_field_update")
          ? "Это поле менять нельзя"
          : message.includes("not_permitted")
            ? "Эту карточку тебе менять нельзя"
            : "Не получилось сохранить",
      );
    },
  });
}

export type NewPerson = {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  position?: string;
  aliases?: string[];
  manager_id?: string | null;
};

/** Creating a login is a server job (service role): POST /api/people. */
export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewPerson): Promise<{ id: string }> => {
      const res = await fetch("/api/people", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { code?: string; message_ru?: string } };
      if (!res.ok || !body.id) throw new Error(body.error?.message_ru ?? "Не получилось создать");
      return { id: body.id };
    },
    // no toast on success: the screen hands the login over in a sheet that says it
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
    onError: (error) => toast(error instanceof Error ? error.message : "Не получилось создать"),
  });
}

/** Reads `{ error: { message_ru } }` of a failed API call (BACKEND §0), or the fallback. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message_ru?: string } };
  return new Error(body.error?.message_ru ?? fallback);
}

export type PersonLogin = { email: string | null; last_sign_in_at: string | null };

/** The email a person signs in with and their last sign-in — for whoever may reset it (D-104). */
export function usePersonLogin(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["people", id, "login"],
    enabled,
    queryFn: async (): Promise<PersonLogin> => {
      const res = await fetch(`/api/people/${id}/login`, { credentials: "include" });
      if (!res.ok) throw await failure(res, "Не удалось прочитать вход");
      return (await res.json()) as PersonLogin;
    },
  });
}

/** A new password set by the director or the secretary; the caller shows it once. */
export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await fetch(`/api/people/${id}/password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw await failure(res, "Не получилось сменить пароль");
    },
  });
}

/** Fixes the login email typed wrong at creation. */
export function useChangeLoginEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }): Promise<string> => {
      const res = await fetch(`/api/people/${id}/login`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw await failure(res, "Не получилось сменить почту");
      return ((await res.json()) as { email: string }).email;
    },
    onSuccess: (email, { id }) => {
      queryClient.setQueryData<PersonLogin>(["people", id, "login"], (old) => ({ last_sign_in_at: null, ...old, email }));
    },
  });
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}
